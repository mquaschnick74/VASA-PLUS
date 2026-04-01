// server/services/sensing-layer/profile-writer.ts
// Persists accumulated session profile data to user_patterns,
// user_historical_material, and symbolic_mappings tables.
// Called at end-of-call from finalizeSession().

import { supabase } from '../supabase-service';
import Anthropic from '@anthropic-ai/sdk';
import {
  SessionPatternRecord,
  SessionHistoricalRecord,
  SessionSymbolicRecord,
  UserPatternRow,
  CVDCSessionContribution,
  UserCVDCState
} from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────
// DB Constraint Mapping Functions
// ─────────────────────────────────────────────

/**
 * Map internal PatternType → DB-allowed values.
 * DB CHECK allows: 'behavioral', 'cognitive', 'relational'
 */
function toDbPatternType(input: string): 'behavioral' | 'cognitive' | 'relational' {
  if (input === 'behavioral') return 'behavioral';
  if (input === 'relational') return 'relational';
  if (input === 'cognitive') return 'cognitive';
  if (input === 'emotional') return 'cognitive';
  if (input === 'avoidance') return 'behavioral';
  if (input === 'protective') return 'behavioral';
  return 'cognitive';
}

/**
 * Map internal AwarenessLevel → DB-allowed values.
 * DB CHECK allows: 'unaware', 'emerging', 'recognized'
 */
function toDbAwareness(input: string): 'unaware' | 'emerging' | 'recognized' {
  if (input === 'recognized' || input === 'conscious') return 'recognized';
  if (input === 'emerging' || input === 'preconscious') return 'emerging';
  return 'unaware';
}

// ─────────────────────────────────────────────
// Stemming & Fuzzy Matching Utilities
// ─────────────────────────────────────────────

const STOP_WORDS = new Set([
  'i', 'me', 'my', 'myself', 'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about',
  'into', 'over', 'after', 'it', 'its', 'this', 'that', 'these', 'those',
  'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then'
]);

function stem(word: string): string {
  if (word.length <= 3) return word;

  const suffixes = [
    'ization', 'isation', 'ational', 'fulness', 'ousness', 'iveness',
    'ically', 'iously', 'lessly', 'ements',
    'ating', 'izing', 'ising', 'iness', 'ously', 'ively', 'ement',
    'antly', 'ently', 'ships', 'ments', 'ional', 'ative', 'istic',
    'tion', 'sion', 'ment', 'ness', 'ance', 'ence', 'able', 'ible',
    'ship', 'ical', 'ally', 'ular',
    'ing', 'ity', 'ous', 'ive', 'ful', 'ism', 'ist', 'ant', 'ent',
    'ial', 'ual', 'ion', 'ory', 'ary',
    'ly', 'ed', 'er', 'es', 'al', 'en'
  ];

  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && (word.length - suffix.length) >= 3) {
      return word.slice(0, -suffix.length);
    }
  }

  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 4) {
    return word.slice(0, -1);
  }

  return word;
}

function extractStemmedKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word))
      .map(word => stem(word))
  );
}

function calculateStemmedSimilarity(text1: string, text2: string): number {
  const words1 = extractStemmedKeywords(text1);
  const words2 = extractStemmedKeywords(text2);

  if (words1.size === 0 || words2.size === 0) return 0;

  let overlap = 0;
  // FIX 1: Array.from() to avoid --downlevelIteration TS error on Set iteration
  for (const word of Array.from(words1)) {
    if (words2.has(word)) overlap++;
  }

  return (2 * overlap) / (words1.size + words2.size);
}

// ─────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────

// FIX 2: Raised from 0.6 → 0.75 to prevent near-duplicate pattern accumulation.
// At 0.6, patterns like "avoidance of silence" and "avoidance of silence and need
// for constant interaction" were creating separate rows. 0.75 requires substantial
// semantic overlap before treating two descriptions as the same pattern.
const DEDUP_THRESHOLD = 0.75;

const FK_MATCH_THRESHOLD = 0.5;

// FIX 3: Minimum confidence a pattern must have to be written to the DB.
// LLM-detected patterns with confidence < 0.65 are single-utterance observations,
// not clinically meaningful patterns. This eliminates the bulk of noise rows.
const MIN_INSERT_CONFIDENCE = 0.65;

// FIX 4: Maximum patterns persisted per session. Caps the DB write volume.
// Top patterns by confidence are kept; the rest are discarded.
const MAX_PATTERNS_PER_SESSION = 15;

/** Normalize for exact-match attempts (prevents trivial mismatch) */
function normalizeText(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────
// Supabase error logging helper
// ─────────────────────────────────────────────

function logSupabaseError(context: string, error: any): void {
  console.warn(`⚠️ [Profile Writer] ${context}:`, error?.message);
  if (error?.details) console.warn(`   Details: ${error.details}`);
  if (error?.hint) console.warn(`   Hint: ${error.hint}`);
}

// ─────────────────────────────────────────────
// Main Persistence Entry Point
// ─────────────────────────────────────────────

export async function persistSessionProfile(
  userId: string,
  patterns: SessionPatternRecord[],
  historicalMaterial: SessionHistoricalRecord[],
  symbolicConnections: SessionSymbolicRecord[],
  cvdcContribution?: CVDCSessionContribution,
  sessionId?: string,
  narrativeFragmentsSummary?: string
): Promise<void> {
  const startTime = Date.now();

  // FIX 5: Cap and filter session patterns before any DB work.
  // Sort by confidence descending, take top MAX_PATTERNS_PER_SESSION,
  // then discard anything below MIN_INSERT_CONFIDENCE.
  // User-explicitly-identified patterns bypass the confidence floor.
  const filteredPatterns = patterns
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_PATTERNS_PER_SESSION)
    .filter(p => p.userExplicitlyIdentified || p.confidence >= MIN_INSERT_CONFIDENCE);

  console.log(`💾 [Profile Writer] Persisting profile for user ${userId}:`);
  console.log(`   Patterns: ${patterns.length} session → ${filteredPatterns.length} after confidence/cap filter, Historical: ${historicalMaterial.length}, Connections: ${symbolicConnections.length}`);

  // Persist CVDC state unconditionally — domain accumulation and coherence
  // assessment must run even when no behavioral patterns were detected
  if (cvdcContribution && sessionId) {
    try {
      await persistCVDCState(userId, sessionId, cvdcContribution, narrativeFragmentsSummary || '');
    } catch (cvdcError) {
      console.error('❌ [Profile Writer] CVDC persistence failed (non-fatal):', cvdcError);
    }
  }

  if (filteredPatterns.length === 0 && historicalMaterial.length === 0 && symbolicConnections.length === 0) {
    console.log(`💾 [Profile Writer] Nothing else to persist — skipping`);
    return;
  }

  try {
    const patternIdMap = await persistPatterns(userId, filteredPatterns);
    const historicalIdMap = await persistHistoricalMaterial(userId, historicalMaterial);
    await persistSymbolicMappings(userId, symbolicConnections, patternIdMap, historicalIdMap);

    console.log(`💾 [Profile Writer] Done in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('❌ [Profile Writer] Error persisting session profile:', error);
  }
}

// ─────────────────────────────────────────────
// 1. Pattern Persistence
// ─────────────────────────────────────────────

async function persistPatterns(
  userId: string,
  sessionPatterns: SessionPatternRecord[]
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  if (sessionPatterns.length === 0) return idMap;

  const { data: existingRows, error: fetchError } = await supabase
    .from('user_patterns')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true);

  if (fetchError) {
    logSupabaseError('Error fetching existing patterns', fetchError);
    return idMap;
  }

  const existing = (existingRows ?? []) as UserPatternRow[];

  for (const sessionPattern of sessionPatterns) {
    const desc = (sessionPattern.description || '').trim();
    if (!desc) continue;

    try {
      let bestMatch: UserPatternRow | null = null;
      let bestSimilarity = 0;

      for (const row of existing) {
        const similarity = calculateStemmedSimilarity(desc, row.description);
        if (similarity > DEDUP_THRESHOLD && similarity > bestSimilarity) {
          bestMatch = row;
          bestSimilarity = similarity;
        }
      }

      const dbPatternType = toDbPatternType(String(sessionPattern.patternType));

      if (bestMatch) {
        // Update existing match — always allowed regardless of confidence
        const updatedExamples = Array.isArray(bestMatch.examples) ? [...bestMatch.examples] : [];
        const evidence = (sessionPattern.evidence || '').trim();

        if (evidence && !updatedExamples.includes(evidence)) {
          updatedExamples.push(evidence);
          if (updatedExamples.length > 10) {
            updatedExamples.splice(0, updatedExamples.length - 10);
          }
        }

        const { error: updateError } = await supabase
          .from('user_patterns')
          .update({
            occurrences: (bestMatch.occurrences ?? 0) + 1,
            last_observed: new Date().toISOString(),
            examples: updatedExamples,
            user_explicitly_identified:
              Boolean(bestMatch.user_explicitly_identified) || Boolean(sessionPattern.userExplicitlyIdentified),
            pattern_type: dbPatternType
          })
          .eq('id', bestMatch.id);

        if (updateError) {
          logSupabaseError(`Error updating pattern ${bestMatch.id}`, updateError);
        } else {
          console.log(`🔄 [Profile Writer] Updated pattern (${bestSimilarity.toFixed(2)} match): "${bestMatch.description}" → occurrences: ${(bestMatch.occurrences ?? 0) + 1}`);
        }

        idMap.set(desc, bestMatch.id);

      } else {
        // Insert new pattern — confidence already filtered upstream in persistSessionProfile,
        // but explicitly-identified patterns bypass the floor so check once more here.
        if (!sessionPattern.userExplicitlyIdentified && sessionPattern.confidence < MIN_INSERT_CONFIDENCE) {
          console.log(`⏭️ [Profile Writer] Skipped low-confidence pattern (${sessionPattern.confidence.toFixed(2)}): "${desc.substring(0, 60)}"`);
          continue;
        }

        const { data: inserted, error: insertError } = await supabase
          .from('user_patterns')
          .insert({
            user_id: userId,
            description: desc,
            pattern_type: dbPatternType,
            occurrences: 1,
            examples: sessionPattern.evidence ? [sessionPattern.evidence] : [],
            user_explicitly_identified: Boolean(sessionPattern.userExplicitlyIdentified),
            first_detected: new Date().toISOString(),
            last_observed: new Date().toISOString(),
            active: true
          })
          .select('id')
          .single();

        if (insertError) {
          logSupabaseError('Error inserting pattern', insertError);
        } else if (inserted) {
          console.log(`✨ [Profile Writer] New pattern: "${desc}" (${String(sessionPattern.patternType)} → DB: ${dbPatternType})`);
          idMap.set(desc, inserted.id);

          existing.push({
            id: inserted.id,
            user_id: userId,
            description: desc,
            pattern_type: dbPatternType,
            occurrences: 1,
            examples: sessionPattern.evidence ? [sessionPattern.evidence] : [],
            user_explicitly_identified: Boolean(sessionPattern.userExplicitlyIdentified),
            first_detected: new Date().toISOString(),
            last_observed: new Date().toISOString(),
            active: true
          } as UserPatternRow);
        }
      }
    } catch (error) {
      console.error(`❌ [Profile Writer] Error processing pattern "${desc}":`, error);
    }
  }

  console.log(`💾 [Profile Writer] Patterns: ${idMap.size} persisted (from ${sessionPatterns.length} filtered session patterns, against ${existing.length} existing)`);
  return idMap;
}

// ─────────────────────────────────────────────
// 2. Historical Material Persistence
// ─────────────────────────────────────────────

async function persistHistoricalMaterial(
  userId: string,
  sessionMaterial: SessionHistoricalRecord[]
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  if (sessionMaterial.length === 0) return idMap;

  const { data: existingRows, error: fetchError } = await supabase
    .from('user_historical_material')
    .select('*')
    .eq('user_id', userId);

  if (fetchError) {
    logSupabaseError('Error fetching existing historical material', fetchError);
    return idMap;
  }

  const existing = existingRows ?? [];

  for (const sessionItem of sessionMaterial) {
    const content = (sessionItem.content || '').trim();
    if (!content) continue;

    try {
      let bestMatch: any = null;
      let bestSimilarity = 0;

      for (const row of existing) {
        const similarity = calculateStemmedSimilarity(content, row.content);
        if (similarity > DEDUP_THRESHOLD && similarity > bestSimilarity) {
          bestMatch = row;
          bestSimilarity = similarity;
        }
      }

      if (bestMatch) {
        const mergedFigures = Array.from(
          new Set([...(bestMatch.related_figures || []), ...(sessionItem.relatedFigures || [])])
        );

        const nextContext =
          (sessionItem.contextNotes || '').length > (bestMatch.context_notes || '').length
            ? sessionItem.contextNotes
            : bestMatch.context_notes;

        const nextValence =
          (bestMatch.emotional_valence && String(bestMatch.emotional_valence).trim())
            ? bestMatch.emotional_valence
            : sessionItem.emotionalValence;

        const { error: updateError } = await supabase
          .from('user_historical_material')
          .update({
            related_figures: mergedFigures,
            context_notes: nextContext,
            emotional_valence: nextValence
          })
          .eq('id', bestMatch.id);

        if (updateError) {
          logSupabaseError(`Error updating historical material ${bestMatch.id}`, updateError);
        } else {
          console.log(`🔄 [Profile Writer] Updated historical material (${bestSimilarity.toFixed(2)} match): "${String(bestMatch.content).substring(0, 60)}..."`);
        }

        idMap.set(content, bestMatch.id);

      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('user_historical_material')
          .insert({
            user_id: userId,
            content,
            related_figures: sessionItem.relatedFigures || [],
            emotional_valence: sessionItem.emotionalValence,
            context_notes: sessionItem.contextNotes,
            disclosed_date: new Date().toISOString()
          })
          .select('id')
          .single();

        if (insertError) {
          logSupabaseError('Error inserting historical material', insertError);
        } else if (inserted) {
          console.log(`✨ [Profile Writer] New historical material: "${content.substring(0, 60)}..."`);
          idMap.set(content, inserted.id);

          existing.push({
            id: inserted.id,
            user_id: userId,
            content,
            related_figures: sessionItem.relatedFigures || [],
            emotional_valence: sessionItem.emotionalValence,
            context_notes: sessionItem.contextNotes,
            disclosed_date: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error(`❌ [Profile Writer] Error processing historical material "${content.substring(0, 40)}...":`, error);
    }
  }

  console.log(`💾 [Profile Writer] Historical material: ${idMap.size} persisted (from ${sessionMaterial.length} session items)`);
  return idMap;
}

// ─────────────────────────────────────────────
// 3. Symbolic Mappings Persistence
// ─────────────────────────────────────────────

async function persistSymbolicMappings(
  userId: string,
  sessionConnections: SessionSymbolicRecord[],
  patternIdMap: Map<string, string>,
  historicalIdMap: Map<string, string>
): Promise<void> {
  if (sessionConnections.length === 0) return;

  const { data: existingRows, error: fetchError } = await supabase
    .from('symbolic_mappings')
    .select('*')
    .eq('user_id', userId);

  if (fetchError) {
    logSupabaseError('Error fetching existing symbolic mappings', fetchError);
    return;
  }

  const existing = existingRows ?? [];
  let insertedCount = 0;
  let updatedCount = 0;

  for (const sessionConn of sessionConnections) {
    try {
      const symbolicConnection = (sessionConn.symbolicConnection || '').trim();
      if (!symbolicConnection) continue;

      const patternId = resolveForeignKey(sessionConn.presentPattern, patternIdMap);
      const historicalId = resolveForeignKey(sessionConn.historicalMaterial, historicalIdMap);

      const existingMapping = existing.find((row: any) => {
        const connSimilarity = calculateStemmedSimilarity(symbolicConnection, row.symbolic_connection);
        return connSimilarity > DEDUP_THRESHOLD;
      });

      const dbSessionAwareness = toDbAwareness(String(sessionConn.userAwareness));
      const awarenessProgression: Record<string, number> = {
        'unaware': 0, 'emerging': 1, 'recognized': 2
      };

      if (existingMapping) {
        const dbExistingAwareness = toDbAwareness(String(existingMapping.user_awareness));
        const existingLevel = awarenessProgression[dbExistingAwareness] ?? 0;
        const sessionLevel = awarenessProgression[dbSessionAwareness] ?? 0;

        const confidenceImproved = Number(sessionConn.confidence) > Number(existingMapping.confidence);
        const awarenessImproved = sessionLevel > existingLevel;

        if (confidenceImproved || awarenessImproved) {
          const nextAwareness = awarenessImproved ? dbSessionAwareness : dbExistingAwareness;

          const shouldSetRecognizedAt =
            nextAwareness === 'recognized' && !existingMapping.recognized_at;

          const { error: updateError } = await supabase
            .from('symbolic_mappings')
            .update({
              confidence: Math.max(Number(sessionConn.confidence), Number(existingMapping.confidence)),
              user_awareness: nextAwareness,
              user_recognized: nextAwareness === 'recognized',
              present_pattern_id: patternId || existingMapping.present_pattern_id,
              historical_material_id: historicalId || existingMapping.historical_material_id,
              ...(shouldSetRecognizedAt ? { recognized_at: new Date().toISOString() } : {})
            })
            .eq('id', existingMapping.id);

          if (updateError) {
            logSupabaseError(`Error updating symbolic mapping ${existingMapping.id}`, updateError);
          } else {
            updatedCount++;
            console.log(`🔄 [Profile Writer] Updated symbolic mapping: "${String(existingMapping.symbolic_connection).substring(0, 60)}..."`);
          }
        }

      } else {
        const isRecognized = dbSessionAwareness === 'recognized';

        const { error: insertError } = await supabase
          .from('symbolic_mappings')
          .insert({
            user_id: userId,
            present_pattern_id: patternId,
            historical_material_id: historicalId,
            symbolic_connection: symbolicConnection,
            connection_type: sessionConn.connectionType,
            confidence: sessionConn.confidence,
            user_recognized: isRecognized,
            user_awareness: dbSessionAwareness,
            recognized_at: isRecognized ? new Date().toISOString() : null
          });

        if (insertError) {
          logSupabaseError('Error inserting symbolic mapping', insertError);
        } else {
          insertedCount++;
          console.log(`✨ [Profile Writer] New symbolic mapping: "${symbolicConnection.substring(0, 60)}..." (pattern FK: ${patternId ? '✓' : '✗'}, historical FK: ${historicalId ? '✓' : '✗'})`);
        }
      }
    } catch (error) {
      console.error(`❌ [Profile Writer] Error processing symbolic mapping:`, error);
    }
  }

  console.log(`💾 [Profile Writer] Symbolic mappings: ${insertedCount} inserted, ${updatedCount} updated (from ${sessionConnections.length} session connections)`);
}

/**
 * Resolve a description string to a UUID by fuzzy-matching against an ID map.
 * Tries normalized exact match first, then stemmed fuzzy match.
 */
function resolveForeignKey(
  description: string,
  idMap: Map<string, string>
): string | null {
  const desc = normalizeText(description);
  if (!desc || idMap.size === 0) return null;

  // FIX 6: Array.from() to avoid --downlevelIteration TS error on Map iteration
  // Normalized exact match first
  for (const [key, uuid] of Array.from(idMap)) {
    if (normalizeText(key) === desc) return uuid;
  }

  // FIX 7: Array.from() on second Map iteration
  let bestId: string | null = null;
  let bestSimilarity = 0;

  for (const [key, uuid] of Array.from(idMap)) {
    const similarity = calculateStemmedSimilarity(desc, key);
    if (similarity > FK_MATCH_THRESHOLD && similarity > bestSimilarity) {
      bestId = uuid;
      bestSimilarity = similarity;
    }
  }

  return bestId;
}

// ─────────────────────────────────────────────
// 4. CVDC State Persistence
// ─────────────────────────────────────────────

export async function persistCVDCState(
  userId: string,
  sessionId: string,
  contribution: CVDCSessionContribution,
  narrativeFragmentsSummary: string
): Promise<void> {
  const startTime = Date.now();
  console.log(`💾 [CVDC Writer] Persisting CVDC state for user ${userId}`);

  try {
    // Step 5a — Load existing state
    const { data: existingRows, error: fetchError } = await supabase
      .from('user_cvdc_state')
      .select('*')
      .eq('user_id', userId)
      .limit(1);

    if (fetchError) {
      logSupabaseError('Error fetching existing CVDC state', fetchError);
      return;
    }

    const existing: UserCVDCState | null = existingRows?.[0] ?? null;

    // Step 5b — Aggregate domains
    const domainSet = new Set<string>([
      ...contribution.domainsFromPriorSessions,
      ...contribution.domainsOpenedThisSession
    ]);
    const domainsCovered = Array.from(domainSet);

    // Step 5c — Check promotion gate
    let newStatus: 'candidate' | 'articulable' = existing?.status ?? 'candidate';
    let newConfidence: number = existing?.status_confidence ?? 0;
    let crossDomainPattern: string | null = existing?.cross_domain_pattern ?? null;

    if (domainsCovered.length >= 2) {
      try {
        const promotionResponse = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `You are assessing whether a coherent operational pattern of a single underlying psychological mechanism is visible across the following narrative domains from a client's life.

Domains covered: ${JSON.stringify(domainsCovered)}
Narrative material summary: ${narrativeFragmentsSummary}
Prior cross-domain pattern (if exists): ${crossDomainPattern || 'none'}

Assess: Is there a coherent pattern of a single underlying mechanism operating consistently across at least two of these domains?

Respond in JSON only:
{
  "coherent": true | false,
  "confidence": 0.0-1.0,
  "pattern_description": "description of the cross-domain pattern if coherent, null if not"
}`
          }]
        });

        const promotionText = promotionResponse.content[0].type === 'text' ? promotionResponse.content[0].text : '';
        const promotionJson = JSON.parse(promotionText.replace(/```json\n?|\n?```/g, '').trim());

        if (promotionJson.coherent && promotionJson.confidence > 0.6) {
          newStatus = 'articulable';
          newConfidence = promotionJson.confidence;
          crossDomainPattern = promotionJson.pattern_description;
          console.log(`🎯 [CVDC Writer] Promotion to articulable: ${crossDomainPattern} (confidence: ${newConfidence})`);
        } else {
          newStatus = 'candidate';
          newConfidence = promotionJson.confidence || newConfidence;
        }
      } catch (llmError) {
        console.warn(`⚠️ [CVDC Writer] Promotion gate LLM call failed, keeping existing status:`, llmError);
      }
    }

    // Step 5d — Check reversion gate (only if currently articulable)
    if (existing?.status === 'articulable' && contribution.patternContributionsThisSession.length > 0) {
      try {
        const reversionResponse = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `A client has an established cross-domain pattern: "${existing.cross_domain_pattern}"
Current confidence: ${existing.status_confidence}

This session produced new pattern material: ${JSON.stringify(contribution.patternContributionsThisSession)}

Does this new material contradict or undermine the established cross-domain pattern?

Respond in JSON only:
{
  "contradicts": true | false,
  "contradiction_strength": 0.0-1.0
}`
          }]
        });

        const reversionText = reversionResponse.content[0].type === 'text' ? reversionResponse.content[0].text : '';
        const reversionJson = JSON.parse(reversionText.replace(/```json\n?|\n?```/g, '').trim());

        const reversionThreshold = existing.status_confidence * 0.7;
        if (reversionJson.contradicts && reversionJson.contradiction_strength > reversionThreshold) {
          newStatus = 'candidate';
          newConfidence = existing.status_confidence * (1 - reversionJson.contradiction_strength);
          console.log(`⚠️ [CVDC Writer] Reversion to candidate: contradiction strength ${reversionJson.contradiction_strength} exceeded threshold ${reversionThreshold.toFixed(2)}`);
        }
      } catch (llmError) {
        console.warn(`⚠️ [CVDC Writer] Reversion gate LLM call failed, keeping existing status:`, llmError);
      }
    }

    // Step 5e — Generate or refine mechanism_description
    let mechanismDescription: string | null = existing?.mechanism_description ?? null;
    if (domainsCovered.length >= 1) {
      try {
        const mechanismResponse = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          messages: [{
            role: 'user',
            content: `Produce a clinical description of the underlying psychological mechanism operating in this client's life.

Domains covered: ${JSON.stringify(domainsCovered)}
Cross-domain pattern: ${crossDomainPattern || 'not yet established'}
This session's pattern contributions: ${JSON.stringify(contribution.patternContributionsThisSession)}
Prior mechanism description: ${mechanismDescription || 'none — this is the first description'}

${mechanismDescription ? 'Refine the prior description — do not discard it. Integrate new session material.' : 'Produce a first-pass clinical description.'}

Respond with the mechanism description only, no JSON wrapper. Maximum 200 words.`
          }]
        });

        const mechanismText = mechanismResponse.content[0].type === 'text' ? mechanismResponse.content[0].text : '';
        if (mechanismText.trim()) {
          mechanismDescription = mechanismText.trim();
        }
      } catch (llmError) {
        console.warn(`⚠️ [CVDC Writer] Mechanism description LLM call failed, keeping existing:`, llmError);
      }
    }

    // Step 5f — Assess movement_direction (direct logic, no LLM)
    let movementDirection: 'toward_utility' | 'toward_dead_end' | 'undetermined' = 'undetermined';
    if (contribution.breakthroughEventIds.length > 0 && contribution.resistanceAfterNamingCount === 0) {
      movementDirection = 'toward_utility';
    } else if (contribution.resistanceAfterNamingCount >= 2 && contribution.breakthroughEventIds.length === 0) {
      movementDirection = 'toward_dead_end';
    }

    // Step 5g — Upsert
    const now = new Date().toISOString();
    const sessionCount = (existing?.session_count ?? 0) + 1;

    if (existing) {
      const { error: updateError } = await supabase
        .from('user_cvdc_state')
        .update({
          status: newStatus,
          status_confidence: newConfidence,
          domains_covered: domainsCovered,
          cross_domain_pattern: crossDomainPattern,
          mechanism_description: mechanismDescription,
          movement_direction: movementDirection,
          session_count: sessionCount,
          updated_at: now
        })
        .eq('id', existing.id);

      if (updateError) {
        logSupabaseError('Error updating CVDC state', updateError);
      } else {
        console.log(`🔄 [CVDC Writer] Updated: status=${newStatus}, confidence=${newConfidence.toFixed(2)}, domains=${domainsCovered.length}, movement=${movementDirection}`);
      }
    } else {
      const { error: insertError } = await supabase
        .from('user_cvdc_state')
        .insert({
          user_id: userId,
          status: newStatus,
          status_confidence: newConfidence,
          domains_covered: domainsCovered,
          cross_domain_pattern: crossDomainPattern,
          mechanism_description: mechanismDescription,
          movement_direction: movementDirection,
          session_count: sessionCount,
          created_at: now,
          updated_at: now
        });

      if (insertError) {
        logSupabaseError('Error inserting CVDC state', insertError);
      } else {
        console.log(`✨ [CVDC Writer] Created: status=${newStatus}, domains=${domainsCovered.length}`);
      }
    }

    console.log(`💾 [CVDC Writer] Done in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('❌ [CVDC Writer] Error persisting CVDC state:', error);
  }
}