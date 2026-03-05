// server/services/sensing-layer/fast-sense.ts
// Fast-path processor — runs on every user utterance BEFORE the LLM responds.
// Must complete in under 300ms for normal turns.
// No LLM calls — only algorithmic processing and database queries.

import { findResonatingFragments, ResonanceResult } from './narrative-web';
import { getSessionState } from './session-state';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FastSenseResult {
  // Resonance detection from narrative web
  resonance: ResonanceResult;

  // Whether this is a critical moment requiring deep-path processing
  // before the LLM responds (adds 1-3s latency — clinically appropriate pause)
  isCriticalMoment: boolean;
  criticalMomentReason: string | null;

  // Formatted guidance string ready to inject into the system prompt
  guidanceInjection: string;

  // Processing time in ms
  processingTimeMs: number;
}

export interface FastSenseInput {
  userId: string;
  callId: string;
  sessionId: string;
  utterance: string;
  exchangeCount: number;
  agentName: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SOMATIC_INDICATORS = [
  'feel', 'feeling', 'felt', 'body', 'chest', 'stomach', 'tight', 'tense',
  'shaking', 'heart', 'breath', 'breathing', 'heavy', 'weight', 'numb',
  'pain', 'ache', 'sick', 'dizzy', 'cold', 'hot', 'tingling', 'pressure', 'knot',
];

const SELF_IDENTIFICATION_PATTERNS = [
  'i always', 'i never', 'i realize', 'i just realized', 'i keep doing',
  'pattern', 'every time i', 'i notice that i', 'what i\'m doing is',
  'i think the reason', 'it\'s because i',
];

// ─── Main Function ───────────────────────────────────────────────────────────

export async function fastSense(input: FastSenseInput): Promise<FastSenseResult> {
  const startTime = Date.now();

  const emptyResult: FastSenseResult = {
    resonance: {
      matchedFragments: [],
      activeLinks: [],
      constellationFragments: [],
      isConstellationActive: false,
    },
    isCriticalMoment: false,
    criticalMomentReason: null,
    guidanceInjection: '[THERAPEUTIC CONTEXT - INTERNAL SENSING DATA - DO NOT REFERENCE DIRECTLY IN YOUR RESPONSE]\nSensing context unavailable. Follow therapeutic intuition.',
    processingTimeMs: 0,
  };

  try {
    // Step 1: Query narrative web (the only async/potentially slow step)
    const resonance = await findResonatingFragments(input.userId, input.utterance);

    // Step 2: Read previous deep-path results from session state
    const sessionState = getSessionState(input.callId);
    const latestRegister = sessionState?.latestRegister || null;
    const latestMovement = sessionState?.latestMovement || null;

    // Step 3: Detect critical moments
    let isCriticalMoment = false;
    let criticalMomentReason: string | null = null;

    // Check: constellation active with high similarity match
    if (resonance.isConstellationActive) {
      const highSimilarityMatch = resonance.matchedFragments.some(
        (f) => f.similarity !== undefined && f.similarity > 0.7
      );
      if (highSimilarityMatch) {
        isCriticalMoment = true;
        criticalMomentReason = 'Constellation active with high-similarity match (>0.7) — utterance resonates with core meaning-making structure';
      }
    }

    // Check: register shift from Imaginary to Real (somatic indicators)
    if (!isCriticalMoment && latestRegister?.currentRegister === 'Imaginary') {
      const utteranceLower = input.utterance.toLowerCase();
      const hasSomaticLanguage = SOMATIC_INDICATORS.some((word) =>
        utteranceLower.includes(word)
      );
      if (hasSomaticLanguage) {
        isCriticalMoment = true;
        criticalMomentReason = 'Potential register shift from Imaginary to Real — somatic/body language detected';
      }
    }

    // Check: previous movement was deepening with high CSS confidence
    if (!isCriticalMoment && latestMovement) {
      if (latestMovement.trajectory === 'toward_mastery' && latestMovement.cssStageConfidence > 0.7) {
        isCriticalMoment = true;
        criticalMomentReason = 'Deepening trajectory with high CSS confidence — momentum continuing';
      }
    }

    // Check: explicit self-identification language
    if (!isCriticalMoment) {
      const utteranceLower = input.utterance.toLowerCase();
      const hasSelfIdentification = SELF_IDENTIFICATION_PATTERNS.some((phrase) =>
        utteranceLower.includes(phrase)
      );
      if (hasSelfIdentification) {
        isCriticalMoment = true;
        criticalMomentReason = 'Explicit self-identification language detected — user naming their own pattern';
      }
    }

    // Step 4: Format guidance injection
    const guidanceInjection = formatGuidanceInjection(
      resonance,
      latestRegister,
      latestMovement,
      isCriticalMoment,
      criticalMomentReason
    );

    const processingTimeMs = Date.now() - startTime;

    if (isCriticalMoment) {
      console.log(`⚡ [Fast Sense] CRITICAL MOMENT: ${criticalMomentReason} (${processingTimeMs}ms)`);
    }
    console.log(`⚡ [Fast Sense] Completed in ${processingTimeMs}ms — fragments: ${resonance.matchedFragments.length}, critical: ${isCriticalMoment}`);

    return {
      resonance,
      isCriticalMoment,
      criticalMomentReason,
      guidanceInjection,
      processingTimeMs,
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    console.error(`⚡ [Fast Sense] Error after ${processingTimeMs}ms:`, error);
    emptyResult.processingTimeMs = processingTimeMs;
    return emptyResult;
  }
}

// ─── Guidance Formatting ─────────────────────────────────────────────────────

function formatGuidanceInjection(
  resonance: ResonanceResult,
  latestRegister: any | null,
  latestMovement: any | null,
  isCriticalMoment: boolean,
  criticalMomentReason: string | null
): string {
  const lines: string[] = [
    '[THERAPEUTIC CONTEXT - INTERNAL SENSING DATA - DO NOT REFERENCE DIRECTLY IN YOUR RESPONSE]',
  ];

  let hasContext = false;

  // Previous register info
  if (latestRegister) {
    hasContext = true;
    lines.push(`Register: User was in ${latestRegister.currentRegister} register last turn. Stuckness: ${latestRegister.stucknessScore.toFixed(2)}.`);
  }

  // Previous movement info
  if (latestMovement) {
    hasContext = true;
    lines.push(`Movement: ${latestMovement.trajectory}. CSS stage: ${latestMovement.cssStage} (confidence: ${latestMovement.cssStageConfidence.toFixed(2)}).`);
  }

  // Resonance data
  if (resonance.matchedFragments.length > 0) {
    hasContext = true;
    lines.push(`Resonating material (${resonance.matchedFragments.length} fragments matched):`);

    const topFragments = [...resonance.matchedFragments]
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      .slice(0, 5);

    for (const f of topFragments) {
      const sim = f.similarity !== undefined ? f.similarity.toFixed(2) : 'N/A';
      lines.push(`- [${f.fragment_type}] ${f.content_summary} (domain: ${f.content_domain}, similarity: ${sim})`);
    }
  }

  // Constellation active
  if (resonance.isConstellationActive) {
    const n = resonance.constellationFragments.length;
    lines.push(`⚡ CONSTELLATION ACTIVE: Current utterance resonates with a dense cluster of connected material across ${n} fragments. This material is structurally central to this user's meaning-making. Posture: attend carefully, track connections, but do not name the pattern — let it emerge through the user's own narrative.`);
  }

  // Critical moment
  if (isCriticalMoment && criticalMomentReason) {
    lines.push(`⚠️ CRITICAL MOMENT DETECTED: ${criticalMomentReason}. Take a moment before responding. This turn warrants careful, precise engagement.`);
  }

  // No context available
  if (!hasContext && resonance.matchedFragments.length === 0) {
    lines.push('No prior narrative context available. This appears to be an early session. Posture: listen, gather material, build rapport. Do not interpret prematurely.');
  }

  return lines.join('\n');
}
