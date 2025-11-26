// Assistant Output Parser - Full PCA Metadata Support
// Handles complete clinical tracking while maintaining natural speech

export interface ParsedOutput {
  speak: string;
  meta: {
    phase?: 'narrative_development' | 'css_active' | 'crisis_intervention';
    session_type?: 'first' | 'returning';
    dominant_modality?: 'auditory' | 'visual' | 'kinesthetic' | 'undetermined';
    register_balance?: 'symbolic_dominant' | 'imaginary_dominant' | 'real_dominant' | 'balanced' | 'undetermined';
    register?: 'symbolic' | 'imaginary' | 'real' | 'mixed'; // Keep for backwards compatibility
    readiness?: {
      feels_heard: boolean;
      patterns_visible: boolean;
      contradictions_emerged: boolean;
      trust_established: boolean;
      user_questioning_patterns: boolean;
    };
    css?: {
      stage: string;
      evidence: string[];
      integration_quality?: 'cvdc_visible' | 'holding_contradiction' | 'thend_emerging' | 'cyvc_achieved';
    };
    detected_patterns?: {
      cvdc: string[];
      ibm: string[];
      thend: string[];
      cyvc: string[];
    };
    themes?: string[];
    trauma_indicators?: {
      complexity: 'traditional' | 'complex' | 'undetermined';
      narrative_breakdown_points: string[];
    };
    safety?: {
      flag: boolean;
      crisis: boolean;
    };
  } | null;
}

export function parseAssistantOutput(text: string): ParsedOutput {
  // Extract speak content (what the user hears)
  const speakMatch = /<speak>([\s\S]*?)<\/speak>/m.exec(text);
  const speak = speakMatch?.[1]?.trim() || text;

  // Extract meta content (clinical tracking)
  const metaMatch = /<meta>([\s\S]*?)<\/meta>/m.exec(text);
  const metaRaw = metaMatch?.[1]?.trim();

  let meta: ParsedOutput['meta'] = null;

  if (metaRaw) {
    try {
      meta = JSON.parse(metaRaw);
    } catch (e) {
      console.warn('Failed to parse meta JSON:', e);
      // If parse fails, try to extract what we can
      meta = {
        phase: 'narrative_development',
        css: { stage: 'not_started', evidence: [], integration_quality: 'cvdc_visible' }
      };
    }
  }

  return {
    speak,
    meta
  };
}

// Helper to extract and validate CSS stage
export function extractCSSStage(meta: ParsedOutput['meta']): string | null {
  const validStages = [
    'not_started',
    'pointed_origin', 
    'focus_bind', 
    'suspension', 
    'gesture_toward', 
    'completion', 
    'terminal'
  ];

  if (meta?.css?.stage) {
    const stageLower = meta.css.stage.toLowerCase();
    if (validStages.includes(stageLower)) {
      return stageLower;
    }
  }

  return null;
}

// Helper to check if safety intervention needed
export function needsSafetyIntervention(meta: ParsedOutput['meta']): boolean {
  if (!meta?.safety) return false;

  return meta.safety.flag === true || meta.safety.crisis === true;
}

// Helper to extract register dominance
export function extractRegister(meta: ParsedOutput['meta']): string | null {
  const validRegisters = ['symbolic', 'imaginary', 'real', 'mixed'];

  if (meta?.register && validRegisters.includes(meta.register)) {
    return meta.register;
  }

  return null;
}

// Helper to get identified patterns
export function extractPatterns(meta: ParsedOutput['meta']): {
  cvdc: string[];
  ibm: string[];
  thend: string[];
  cyvc: string[];
} {
  return {
    cvdc: meta?.detected_patterns?.cvdc || [],
    ibm: meta?.detected_patterns?.ibm || [],
    thend: meta?.detected_patterns?.thend || [],
    cyvc: meta?.detected_patterns?.cyvc || []
  };
}

// Helper to assess session progress
export function getSessionProgress(meta: ParsedOutput['meta']): {
  phase: string;
  readinessScore: number;
  dominantModality: string;
} {
  if (!meta) return { phase: 'unknown', readinessScore: 0, dominantModality: 'undetermined' };

  const readinessScore = meta.readiness
    ? Object.values(meta.readiness).filter(Boolean).length
    : 0;

  return {
    phase: meta.phase || 'narrative_development',
    readinessScore,
    dominantModality: meta.dominant_modality || 'undetermined'
  };
}

// Helper to determine if ready for CSS work
export function isReadyForCSSWork(meta: ParsedOutput['meta']): boolean {
  if (!meta?.readiness) return false;
  const r = meta.readiness;
  // Require feels_heard AND patterns_visible, plus at least 3 of 5 total criteria
  const criteriaCount = [
    r.feels_heard,
    r.patterns_visible,
    r.contradictions_emerged,
    r.trust_established,
    r.user_questioning_patterns
  ].filter(Boolean).length;

  return r.feels_heard && r.patterns_visible && criteriaCount >= 3;
}

// Map integration_quality to numeric confidence for backwards compatibility
export function getIntegrationQuality(meta: ParsedOutput['meta']): string {
  return meta?.css?.integration_quality ?? 'cvdc_visible';
}

export function integrationQualityToConfidence(quality: string): number {
  switch (quality) {
    case 'cyvc_achieved': return 1.0;
    case 'thend_emerging': return 0.75;
    case 'holding_contradiction': return 0.5;
    case 'cvdc_visible': return 0.25;
    default: return 0.25;
  }
}

// Helper to check if in crisis state
export function isInCrisis(meta: ParsedOutput['meta']): boolean {
  return meta?.safety?.crisis === true;
}