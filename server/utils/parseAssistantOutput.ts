// Assistant Output Parser - Full PCA Metadata Support
// Handles complete clinical tracking while maintaining natural speech

export interface ParsedOutput {
  speak: string;
  meta: {
    register?: 'symbolic' | 'imaginary' | 'real' | 'mixed';
    css?: {
      stage: 'not_started' | 'pointed_origin' | 'focus_bind' | 'suspension' | 'gesture_toward' | 'completion' | 'terminal';
      evidence: string[];
      confidence: number;
    };
    detected_patterns?: {
      cvdc?: string[];
      ibm?: string[];
      thend?: string[];
      cyvc?: string[];
    };
    themes?: string[];
    safety?: {
      flag: boolean;
      level: 'low' | 'moderate' | 'high' | 'crisis';
      indicators?: string[];
    };
    session?: {
      exchange_count: number;
      narrative_depth: 'building' | 'established' | 'deep';
      rapport: 'forming' | 'solid' | 'strong';
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
        css: { stage: 'not_started', evidence: [], confidence: 0 }
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

  return meta.safety.flag === true || 
         meta.safety.level === 'high' || 
         meta.safety.level === 'crisis';
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
  exchanges: number;
  depth: string;
  rapport: string;
} {
  return {
    exchanges: meta?.session?.exchange_count || 0,
    depth: meta?.session?.narrative_depth || 'building',
    rapport: meta?.session?.rapport || 'forming'
  };
}

// Helper to determine if ready for CSS work
export function isReadyForCSSWork(meta: ParsedOutput['meta']): boolean {
  if (!meta?.session) return false;

  return meta.session.exchange_count >= 15 && 
         meta.session.narrative_depth === 'established' &&
         meta.session.rapport !== 'forming';
}

// Helper to get CSS confidence level
export function getCSSConfidence(meta: ParsedOutput['meta']): number {
  return meta?.css?.confidence || 0;
}

// Helper to get safety level
export function getSafetyLevel(meta: ParsedOutput['meta']): string {
  return meta?.safety?.level || 'low';
}