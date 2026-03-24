// server/services/sensing-layer/field-assessment.ts
// Field assessment types and utilities

import { CSSStage } from './types';

/**
 * Output structure from the field assessment LLM call.
 */
export interface FieldAssessmentOutput {
  register: {
    current: 'Real' | 'Imaginary' | 'Symbolic';
  };
  css_signals: Array<{
    stage: CSSStage;
    confidence: number;
    functional_description: string;
  }>;
  ibm: {
    client_named: boolean;
    behavioral_alignment_strength: number;
    contradiction_present: boolean;
    contradiction_strength: number;
    hypothesis: string;
    stated_position: string;
    evidence: string;
  };
  critical_moment: boolean;
}

/**
 * Default field assessment returned when no prior assessment exists.
 */
export const DEFAULT_FIELD_ASSESSMENT: FieldAssessmentOutput = {
  register: { current: 'Imaginary' },
  css_signals: [],
  ibm: {
    client_named: false,
    behavioral_alignment_strength: 0.5,
    contradiction_present: false,
    contradiction_strength: 0,
    hypothesis: '',
    stated_position: '',
    evidence: '',
  },
  critical_moment: false,
};

/**
 * Build a prior field summary string from an array of past field assessments.
 * Used to inject context into the next field assessment prompt.
 */
export function buildPriorFieldSummary(assessments: FieldAssessmentOutput[]): string {
  if (assessments.length === 0) return 'none';

  return assessments
    .map((a, i) => {
      const cssDesc = a.css_signals.length > 0
        ? a.css_signals.map(s => `${s.stage}(${s.confidence.toFixed(2)})`).join(', ')
        : 'no signals';
      return `[${i + 1}] register=${a.register.current} css=[${cssDesc}] ibm_strength=${a.ibm.contradiction_strength.toFixed(2)} critical=${a.critical_moment}`;
    })
    .join(' | ');
}
