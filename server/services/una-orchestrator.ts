import type { TherapeuticGuidance, RegisterAnalysisResult, MovementAssessmentResult } from './sensing-layer/types';
import type { TherapeuticStateVector } from './sensing-layer/state-vector';
import type { ResonanceResult } from './sensing-layer/narrative-web';

export interface OrchestrationDecision {
  mode: 'observe' | 'clarify' | 'deepen' | 'support' | 'stabilize' | 'hold_frame';
  depth: 'surface' | 'moderate' | 'deep';
  narrativeFocus: 'none' | 'light' | 'active';
  hypothesisHandling: 'implicit' | 'cautious' | 'explicit' | 'tracked';
  pacing: 'steady' | 'slowed';
  silenceFocus: 'none' | 'watch' | 'active';
  responseInitiation: 'normal' | 'gentle';
  speakerMode: 'mathew' | 'una' | 'supportive' | 'clarifying' | 'marcus';
  turnType: 'normal' | 'silence_reengagement';
  reason: string;
}

export interface UNASilenceSignal {
  durationSeconds: number;
  eventCount: number;
  register: 'real' | 'imaginary' | 'symbolic' | 'unknown';
  repeatedExtendedPause: boolean;
}

interface UNAInput {
  guidance: TherapeuticGuidance;
  register: RegisterAnalysisResult;
  movement: MovementAssessmentResult;
  stateVector: TherapeuticStateVector;
  resonance?: ResonanceResult | null;
  silence?: UNASilenceSignal | null;
  clientMetaInstruction?: boolean;
}

export function decideUNAOrchestration(input: UNAInput): OrchestrationDecision {
  const flooding = input.movement.indicators.flooding;
  const stuckness = input.register.stucknessScore;
  const resistance = input.movement.indicators.resistance;
  const deepening = input.movement.indicators.deepening;
  const integration = input.movement.indicators.integration;
  const looping = input.movement.indicators.looping;
  const momentum = input.stateVector.coupled.therapeuticMomentum;
  const resonanceStrength = input.resonance
    ? Math.max(...input.resonance.activeLinks.map((link) => link.strength), 0)
    : 0;
  const resonanceActive = Boolean(
    input.resonance && (input.resonance.isConstellationActive || resonanceStrength >= 0.55)
  );
  const ibmHeavy = resistance >= 0.55 || input.movement.indicators.intellectualizing >= 0.55 || looping >= 0.6;
  const silence = input.silence ?? null;
  // Silence signal is only treated as active
  // if the current utterance is short enough
  // to plausibly be a silence response.
  // Utterances over 30 chars indicate the
  // user has spoken substantively — the
  // silence signal is stale and must be
  // discarded from orchestration logic.
  const utteranceLength =
    (input.stateVector as any)?.lastUtteranceLength ?? 0;
  const silencePresent =
    Boolean(silence) && utteranceLength <= 30;
  const silenceDuration = silence?.durationSeconds ?? 0;
  const silenceWatch = silencePresent && (silenceDuration >= 18 || (silence?.eventCount ?? 0) >= 2);
  const symbolicOrImaginarySilence = silencePresent && (silence?.register === 'symbolic' || silence?.register === 'imaginary');
  const silenceActive = silencePresent && (silence?.repeatedExtendedPause === true || (silenceDuration >= 30 && symbolicOrImaginarySilence));
  const silenceFocus: OrchestrationDecision['silenceFocus'] = silenceActive ? 'active' : silenceWatch ? 'watch' : 'none';
  const responseInitiation: OrchestrationDecision['responseInitiation'] = silenceActive ? 'gentle' : 'normal';
  const turnType: OrchestrationDecision['turnType'] = silencePresent ? 'silence_reengagement' : 'normal';

// Frame-hold condition.
  // The client is presenting material while
  // simultaneously foreclosing interpretive
  // engagement with it. This is a structural
  // situation detected semantically by a
  // dedicated Haiku call on the fast path —
  // not a behavioral pattern requiring
  // accumulation across turns.
  // The meta-instruction is itself the clinical
  // material. It must not be honored as a
  // directive about how the work proceeds.
  // Stuckness threshold is not applied here:
  // the semantic flag is sufficient on its own
  // when register is Imaginary.
  if (
    input.clientMetaInstruction === true &&
    input.register.currentRegister === 'Imaginary'
  ) {
    return {
      mode: 'hold_frame',
      depth: 'moderate',
      narrativeFocus: 'none',
      hypothesisHandling: 'tracked',
      pacing: 'steady',
      silenceFocus: silenceFocus,
      responseInitiation: responseInitiation,
      speakerMode: 'marcus',
      turnType: turnType,
      reason: 'client_meta_instruction_frame_hold',
    };
  }

  if (flooding >= 0.65 || input.guidance.urgency === 'immediate') {
    return {
      mode: 'stabilize',
      depth: 'surface',
      narrativeFocus: resonanceActive ? 'light' : 'none',
      hypothesisHandling: 'cautious',
      pacing: silencePresent ? 'slowed' : 'steady',
      silenceFocus,
      responseInitiation: silencePresent ? 'gentle' : 'normal',
      speakerMode: 'supportive',
      turnType,
      reason: silencePresent
        ? 'high_flooding_with_silence_or_immediate_urgency'
        : 'high_flooding_or_immediate_urgency',
    };
  }

  if (stuckness >= 0.7 && flooding < 0.45) {
    return {
      mode: input.register.currentRegister === 'Imaginary' ? 'clarify' : 'support',
      depth: 'surface',
      narrativeFocus: resonanceActive ? 'light' : 'none',
      hypothesisHandling: ibmHeavy ? 'cautious' : 'implicit',
      pacing: 'steady',
      silenceFocus,
      responseInitiation,
      speakerMode: 'clarifying',
      turnType,
      reason: silenceActive ? 'high_stuckness_low_flooding_with_silence' : 'high_stuckness_low_flooding',
    };
  }

  if ((deepening >= 0.55 || integration >= 0.55 || momentum >= 0.45) && flooding < 0.55) {
    return {
      mode: resonanceActive ? 'deepen' : 'clarify',
      depth: deepening >= 0.7 || integration >= 0.7 ? 'deep' : 'moderate',
      narrativeFocus: resonanceActive ? 'active' : 'light',
      hypothesisHandling: ibmHeavy ? 'cautious' : 'implicit',
      pacing: silencePresent && flooding >= 0.45 ? 'slowed' : 'steady',
      silenceFocus,
      responseInitiation,
      speakerMode: 'una',
      turnType,
      reason: silenceActive
        ? 'movement_signal_or_resonance_with_active_silence'
        : 'movement_signal_or_resonance_supports_depth',
    };
  }

  return {
    mode: silencePresent && (flooding >= 0.45 || input.guidance.urgency === 'high') ? 'support' : 'observe',
    depth: 'moderate',
    narrativeFocus: resonanceActive ? 'light' : 'none',
    hypothesisHandling: ibmHeavy ? 'cautious' : 'implicit',
    pacing: silencePresent && flooding >= 0.45 ? 'slowed' : 'steady',
    silenceFocus,
    responseInitiation,
    speakerMode: 'mathew',
    turnType,
    reason: silencePresent ? 'default_with_silence_signal' : 'default_observational_or_mixed_state',
  };
}
