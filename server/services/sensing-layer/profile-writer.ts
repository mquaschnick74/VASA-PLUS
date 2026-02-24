// server/services/sensing-layer/profile-writer.ts
// Persists accumulated session profile data to user_patterns,
// user_historical_material, and symbolic_mappings tables.
// Called at end-of-call from finalizeSession().

import { supabase } from '../supabase-service';
import {
  SessionPatternRecord,
  SessionHistoricalRecord,
  SessionSymbolicRecord,
  UserPatternRow
} from './types';

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
  for (const word of words1) {
    if (words2.has(word)) overlap++;
  }

  return (2 * overlap) / (words1.size + words2.size);
}

const DEDUP_THRESHOLD = 0.6;
const FK_MATCH_THRESHOLD = 0.5;

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
  symbolicConnections: SessionSymbolicRecord[]
): Promise<void> {
  const startTime = Date.now();

  console.log(`💾 [Profile Writer] Persisting profile for user ${userId}:`);
  console.log(`   Patterns: ${patterns.length}, Historical: ${historicalMaterial.length}, Connections: ${symbolicConnections.length}`);

  if (patterns.length === 0 && historicalMaterial.length === 0 && symbolicConnections.length === 0) {
    console.log(`💾 [Profile Writer] Nothing to persist — skipping`);
    return;
  }

  try {
    const patternIdMap = await persistPatterns(userId, patterns);
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
        // Clone examples array before mutating to avoid shared-reference bugs
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

  console.log(`💾 [Profile Writer] Patterns: ${idMap.size} persisted (from ${sessionPatterns.length} session patterns, against ${existing.length} existing)`);
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

        // Keep existing valence if non-empty, otherwise use session value
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

          // Set recognized_at when progressing to recognized and it wasn't set before
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

  // Normalized exact match first
  for (const [key, uuid] of idMap) {
    if (normalizeText(key) === desc) return uuid;
  }

  // Fuzzy match
  let bestId: string | null = null;
  let bestSimilarity = 0;

  for (const [key, uuid] of idMap) {
    const similarity = calculateStemmedSimilarity(desc, key);
    if (similarity > FK_MATCH_THRESHOLD && similarity > bestSimilarity) {
      bestId = uuid;
      bestSimilarity = similarity;
    }
  }

  return bestId;
}
