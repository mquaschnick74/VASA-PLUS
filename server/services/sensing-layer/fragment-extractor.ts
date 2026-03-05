// server/services/sensing-layer/fragment-extractor.ts
// Post-session processor: extracts therapeutically significant narrative fragments
// from a completed session transcript and stores them in the narrative_fragments table.
// Also detects resonance links to existing fragments from prior sessions.

import Anthropic from '@anthropic-ai/sdk';
import { generateEmbedding } from './narrative-web';
import { supabase } from '../supabase-service';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const EXTRACTION_TIMEOUT_MS = 30000;
const MAX_FRAGMENTS_PER_SESSION = 8;
const RESONANCE_SIMILARITY_THRESHOLD = 0.55;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExtractedFragment {
  fragment_type: 'story' | 'event' | 'relationship_dynamic' | 'emotional_disclosure' | 'contradiction' | 'behavioral_pattern' | 'somatic_marker' | 'metaphor' | 'explicit_insight';
  content_summary: string;
  characters: string[];
  content_domain: 'romantic' | 'professional' | 'family' | 'friendship' | 'self_concept' | 'business' | 'somatic' | 'existential';
  register_signature: {
    dominant: string;
    stuckness?: number;
    shifts?: Array<{ from: string; to: string; at_content: string }>;
  };
  emotional_markers: Array<{ emotion: string; intensity: number; context: string }>;
  structural_patterns: string[];
  investment_signals: string[];
  css_stage_at_disclosure?: string;
}

interface TranscriptMessage {
  role: string;
  message?: string;
  content?: string;
  text?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeTranscript(transcript: string | TranscriptMessage[]): TranscriptMessage[] {
  if (typeof transcript === 'string') {
    const messages: TranscriptMessage[] = [];
    // Split on "AI:" and "User:" prefixes
    const parts = transcript.split(/(?=(?:AI|User):)/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('AI:')) {
        messages.push({ role: 'assistant', content: trimmed.slice(3).trim() });
      } else if (trimmed.startsWith('User:')) {
        messages.push({ role: 'user', content: trimmed.slice(5).trim() });
      }
    }
    return messages;
  }

  // Already an array — normalize content field, exclude system messages
    return transcript
      .filter((item) => item.role !== 'system')
      .map((item) => ({
        role: item.role,
        content: item.content || item.message || item.text || '',
      }));
  }

  function formatTranscriptForClaude(messages: TranscriptMessage[]): string {
  return messages
    .map((m, i) => {
      const role = m.role === 'assistant' ? 'Therapist' : 'User';
      const content = m.content || m.message || m.text || '';
      return `[${i}] ${role}: ${content}`;
    })
    .join('\n');
}

// ─── Claude Extraction ───────────────────────────────────────────────────────

async function extractFragmentsWithClaude(
  formattedTranscript: string,
  cssStage: string | null
): Promise<ExtractedFragment[]> {
  const prompt = `You are a clinical extraction engine analyzing a psychotherapy session transcript. Your job is to identify the 3-8 most therapeutically significant moments from the USER's speech (not the therapist's).

## What Makes a Moment Significant

Look for moments where the user:
- Makes an emotional disclosure (vulnerability, admission, naming a feeling)
- References a somatic/body experience (tightness, pressure, sensation, embodied metaphor)
- Recognizes a pattern in their own behavior ("I always...", "every time I...")
- Introduces or extends a metaphor or symbolic image (wall, band, hollow space)
- Reveals a relational dynamic (how they relate to a specific person or role)
- Shows contradiction (wanting connection but describing withdrawal)
- Names an explicit insight ("I think the reason is...", "what I'm doing is...")
- Describes a significant life event with emotional investment

## Investment Signals

These indicate the user is genuinely invested in the material (not just answering a question):
- register_shift: User moves from abstract/narrative talk to body/sensation language
- return_to_material: User circles back to something mentioned earlier
- emotional_disproportionality: Emotional intensity doesn't match surface content
- elaboration_without_prompting: User expands on material without being asked
- somatic_emergence: Body sensations arise spontaneously during narrative
- naming_attempt: User tries to label or understand their own experience

## Session Transcript

${formattedTranscript}

## Current CSS Stage: ${cssStage || 'unknown'}

## Output Format

Return ONLY a JSON array (no markdown, no explanation, no preamble). Each element must have this exact structure:

{
  "fragment_type": one of "story" | "event" | "relationship_dynamic" | "emotional_disclosure" | "contradiction" | "behavioral_pattern" | "somatic_marker" | "metaphor" | "explicit_insight",
  "content_summary": "A 1-3 sentence summary capturing the therapeutic essence of this moment. Not raw transcript — distill what matters clinically. Include specific details (names, images, body locations) that the user used.",
  "characters": ["Array", "of", "people", "mentioned"] — use first names or roles (e.g., "mother", "manager"). Empty array if no people referenced.,
  "content_domain": one of "romantic" | "professional" | "family" | "friendship" | "self_concept" | "business" | "somatic" | "existential",
  "register_signature": {
    "dominant": one of "Real" | "Imaginary" | "Symbolic",
    "stuckness": 0.0 to 1.0,
    "shifts": [{"from": "Imaginary", "to": "Real", "at_content": "brief quote of where the shift happened"}] or []
  },
  "emotional_markers": [{"emotion": "name", "intensity": 0.0 to 1.0, "context": "brief context"}],
  "structural_patterns": ["pattern observation 1", "pattern observation 2"] — what you observe structurally, not labels,
  "investment_signals": ["signal_name_1", "signal_name_2"] — from the list above
}

Return between 3 and 8 fragments. Fewer is fine for short sessions. Never fabricate — only extract what's actually in the transcript.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  // Extract text content from response
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    console.error('📦 [FRAGMENTS] No text content in Claude response');
    return [];
  }

  let rawText = textBlock.text.trim();

  // Strip markdown code fences if present
  if (rawText.startsWith('```')) {
    rawText = rawText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  try {
    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed)) {
      console.error('📦 [FRAGMENTS] Claude response is not an array');
      return [];
    }

    // Validate required fields on each element
    const validated = parsed.filter((item: any) => {
      return (
        item.fragment_type &&
        item.content_summary &&
        Array.isArray(item.characters) &&
        item.content_domain &&
        item.register_signature &&
        Array.isArray(item.emotional_markers) &&
        Array.isArray(item.structural_patterns) &&
        Array.isArray(item.investment_signals)
      );
    });

    if (validated.length < parsed.length) {
      console.warn(`📦 [FRAGMENTS] Dropped ${parsed.length - validated.length} invalid fragments`);
    }

    // Truncate if over limit
    const fragments = validated.slice(0, MAX_FRAGMENTS_PER_SESSION) as ExtractedFragment[];

    // Set CSS stage on each fragment
    if (cssStage) {
      for (const f of fragments) {
        f.css_stage_at_disclosure = cssStage;
      }
    }

    return fragments;
  } catch (parseErr) {
    console.error('📦 [FRAGMENTS] Failed to parse Claude response:', parseErr);
    console.error('📦 [FRAGMENTS] Raw text (first 500 chars):', rawText.substring(0, 500));
    return [];
  }
}

// ─── Main Public Function ────────────────────────────────────────────────────

export async function extractAndStoreFragments(
  userId: string,
  sessionId: string,
  transcript: string | TranscriptMessage[],
  cssStage?: string | null
): Promise<{ fragmentCount: number; resonanceLinkCount: number }> {
  try {
    const startTime = Date.now();

    // Step 1: Normalize and format transcript
    const normalized = normalizeTranscript(transcript);
    const formattedTranscript = formatTranscriptForClaude(normalized);

    if (formattedTranscript.length < 100) {
      console.log('📦 [FRAGMENTS] Session too short for extraction');
      return { fragmentCount: 0, resonanceLinkCount: 0 };
    }

    // Step 2: Extract fragments via Claude (with timeout)
    let fragments: ExtractedFragment[];
    try {
      fragments = await Promise.race([
        extractFragmentsWithClaude(formattedTranscript, cssStage || null),
        new Promise<ExtractedFragment[]>((_, reject) =>
          setTimeout(() => reject(new Error('Extraction timed out')), EXTRACTION_TIMEOUT_MS)
        ),
      ]);
    } catch (extractErr) {
      console.error('📦 [FRAGMENTS] Extraction failed or timed out:', extractErr);
      return { fragmentCount: 0, resonanceLinkCount: 0 };
    }

    if (fragments.length === 0) {
      console.log('📦 [FRAGMENTS] No fragments extracted');
      return { fragmentCount: 0, resonanceLinkCount: 0 };
    }

    console.log(`📦 [FRAGMENTS] Claude extracted ${fragments.length} fragments for session ${sessionId}`);

    // Step 3: Generate embeddings and store fragments
    const extractionRunId = `extract_${sessionId}_${Date.now()}`;
    const storedFragments: Array<{ id: string; embedding: number[]; fragment: ExtractedFragment }> = [];

    for (const fragment of fragments) {
      const embedding = await generateEmbedding(fragment.content_summary);

      if (!embedding || embedding.length === 0) {
        console.warn('📦 [FRAGMENTS] Embedding generation failed, skipping fragment');
        continue;
      }

      const { data, error } = await supabase
        .from('narrative_fragments')
        .insert({
          user_id: userId,
          session_id: sessionId,
          fragment_type: fragment.fragment_type,
          content_summary: fragment.content_summary,
          characters: fragment.characters,
          content_domain: fragment.content_domain,
          register_signature: fragment.register_signature,
          emotional_markers: fragment.emotional_markers,
          structural_patterns: fragment.structural_patterns,
          investment_signals: fragment.investment_signals,
          css_stage_at_disclosure: fragment.css_stage_at_disclosure || cssStage || null,
          embedding: JSON.stringify(embedding),
          extraction_run_id: extractionRunId,
        })
        .select('id')
        .single();

      if (error) {
        if (error.message?.includes('vector') || error.message?.includes('type')) {
          console.warn('📦 [FRAGMENTS] Vector type casting issue on insert — may need RPC wrapper');
        } else {
          console.error('📦 [FRAGMENTS] Insert error:', error.message);
        }
        continue;
      }

      storedFragments.push({ id: data.id, embedding, fragment });
    }

    console.log(`📦 [FRAGMENTS] Stored ${storedFragments.length}/${fragments.length} fragments`);

    // Step 4: Detect resonance links to existing fragments
    let resonanceLinkCount = 0;

    for (const stored of storedFragments) {
      try {
        const { data: matches } = await supabase.rpc('match_narrative_fragments', {
          p_user_id: userId,
          p_query_embedding: JSON.stringify(stored.embedding),
          p_match_count: 5,
          p_match_threshold: RESONANCE_SIMILARITY_THRESHOLD,
        });

        if (!matches || matches.length === 0) continue;

        // Filter out matches from the current session
        const priorMatches = matches.filter((m: any) => m.session_id !== sessionId);

        for (const match of priorMatches) {
          // Determine resonance type
          let resonanceType: string;
          const sharedCharacters = stored.fragment.characters.some((c: string) =>
            match.characters?.includes(c)
          );

          if (sharedCharacters) {
            resonanceType = 'same_characters';
          } else if (stored.fragment.content_domain !== match.content_domain) {
            resonanceType = 'domain_crossover';
          } else {
            resonanceType = 'structural_pattern_match';
          }

          const { error: linkError } = await supabase.rpc('upsert_resonance_link', {
            p_fragment_a_id: stored.id,
            p_fragment_b_id: match.id,
            p_resonance_type: resonanceType,
            p_strength_delta: match.similarity * 0.3,
            p_session_id: sessionId,
            p_detected_by: 'fragment_extractor',
          });

          if (!linkError) {
            resonanceLinkCount++;
          } else {
            console.error('📦 [FRAGMENTS] Resonance link error:', linkError.message);
          }
        }
      } catch (linkErr) {
        console.error('📦 [FRAGMENTS] Error detecting resonance for fragment:', linkErr);
      }
    }

    console.log(`📦 [FRAGMENTS] Created ${resonanceLinkCount} resonance links`);

    const totalTime = Date.now() - startTime;
    console.log(`📦 [FRAGMENTS] Total extraction time: ${totalTime}ms`);

    return { fragmentCount: storedFragments.length, resonanceLinkCount };
  } catch (error) {
    console.error('❌ [FRAGMENTS] Fatal error in extractAndStoreFragments:', error);
    return { fragmentCount: 0, resonanceLinkCount: 0 };
  }
}
