import type { TherapeuticGuidance, RegisterAnalysisResult, MovementAssessmentResult } from './sensing-layer/types';
import type { TherapeuticStateVector } from './sensing-layer/state-vector';
import type { ResonanceResult } from './sensing-layer/narrative-web';

export interface OrchestrationDecision {
  mode: 'observe' | 'clarify' | 'deepen' | 'support' | 'stabilize';
  depth: 'surface' | 'moderate' | 'deep';
  narrativeFocus: 'none' | 'light' | 'active';
  hypothesisHandling: 'implicit' | 'cautious' | 'explicit';
  pacing: 'steady' | 'slowed';
  reason: string;
}

interface UNAInput {
  guidance: TherapeuticGuidance;
  register: RegisterAnalysisResult;
  movement: MovementAssessmentResult;
  stateVector: TherapeuticStateVector;
  resonance?: ResonanceResult | null;
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

  if (flooding >= 0.65 || input.guidance.urgency === 'immediate') {
    return {
      mode: 'stabilize',
      depth: 'surface',
      narrativeFocus: resonanceActive ? 'light' : 'none',
      hypothesisHandling: 'cautious',
      pacing: 'slowed',
      reason: 'high_flooding_or_immediate_urgency',
    };
  }

  if (stuckness >= 0.7 && flooding < 0.45) {
    return {
      mode: input.register.currentRegister === 'Imaginary' ? 'clarify' : 'support',
      depth: 'surface',
      narrativeFocus: resonanceActive ? 'light' : 'none',
      hypothesisHandling: ibmHeavy ? 'cautious' : 'implicit',
      pacing: 'steady',
      reason: 'high_stuckness_low_flooding',
    };
  }

  if ((deepening >= 0.55 || integration >= 0.55 || momentum >= 0.45) && flooding < 0.55) {
    return {
      mode: resonanceActive ? 'deepen' : 'clarify',
      depth: deepening >= 0.7 || integration >= 0.7 ? 'deep' : 'moderate',
      narrativeFocus: resonanceActive ? 'active' : 'light',
      hypothesisHandling: ibmHeavy ? 'cautious' : 'implicit',
      pacing: 'steady',
      reason: 'movement_signal_or_resonance_supports_depth',
    };
  }

  return {
    mode: 'observe',
    depth: 'moderate',
    narrativeFocus: resonanceActive ? 'light' : 'none',
    hypothesisHandling: ibmHeavy ? 'cautious' : 'implicit',
    pacing: 'steady',
    reason: 'default_observational_or_mixed_state',
  };
}
