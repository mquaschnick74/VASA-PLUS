// Utility to parse assistant output with speak/meta tags

export interface ParsedOutput {
  speak: string;
  meta: {
    register?: 'symbolic' | 'imaginary' | 'real' | 'mixed' | 'undetermined';
    css?: {
      stage: 'CVDC' | 'SUSPENSION' | 'THEND' | 'CYVC' | 'NONE';
      evidence: string[];
      confidence: number;
    };
    hsfb?: {
      invoked: boolean;
      mode: 'hearing' | 'seeing' | 'feeling' | 'breathing' | 'sequence' | null;
      reason: 'stuck' | 'user_requested' | 'integration' | null;
    };
    safety?: {
      flag: boolean;
      reason: 'self_harm' | 'harm_to_others' | 'abuse' | 'medical' | null;
      action: 'grounding' | 'activate_protocol' | null;
      crisis: boolean;
    };
  } | null;
}

export function parseAssistantOutput(text: string): ParsedOutput {
  // Extract speak content
  const speakMatch = /<speak>([\s\S]*?)<\/speak>/m.exec(text);
  const speak = speakMatch?.[1]?.trim();
  
  // Extract meta content
  const metaMatch = /<meta>([\s\S]*?)<\/meta>/m.exec(text);
  const metaRaw = metaMatch?.[1]?.trim();
  
  let meta: ParsedOutput['meta'] = null;
  
  // Try to parse meta as JSON
  if (metaRaw) {
    try {
      meta = JSON.parse(metaRaw);
    } catch (e) {
      console.warn('Failed to parse meta JSON:', e);
      meta = null;
    }
  }
  
  // If no speak tag found, treat entire text as speak
  return {
    speak: speak ?? text,
    meta
  };
}

// Helper to validate and extract CSS stage from meta
export function extractCSSStage(meta: ParsedOutput['meta']): string | null {
  if (!meta?.css?.stage) return null;
  
  const validStages = ['CVDC', 'SUSPENSION', 'THEND', 'CYVC', 'NONE'];
  if (validStages.includes(meta.css.stage)) {
    return meta.css.stage;
  }
  
  return null;
}

// Helper to check if safety intervention is needed
export function needsSafetyIntervention(meta: ParsedOutput['meta']): boolean {
  return meta?.safety?.flag === true || meta?.safety?.crisis === true;
}

// Helper to extract register dominance
export function extractRegister(meta: ParsedOutput['meta']): string | null {
  if (!meta?.register) return null;
  
  const validRegisters = ['symbolic', 'imaginary', 'real', 'mixed', 'undetermined'];
  if (validRegisters.includes(meta.register)) {
    return meta.register;
  }
  
  return null;
}