// CSS (Conversational State Sensing) Pattern Detection Service
// Analyzes therapeutic conversations for stage progression indicators

export interface CSSPatterns {
  cvdcPatterns: string[];
  ibmPatterns: string[];
  thendIndicators: string[];
  cyvcPatterns: string[];
  currentStage: CSSStage;
}

export type CSSStage = 
  | 'pointed_origin'
  | 'focus_bind' 
  | 'suspension'
  | 'gesture_toward'
  | 'completion'
  | 'terminal';

// CVDC (Contradiction/Value Dissonance Clarification) patterns
const CVDC_PATTERNS = [
  /I want[^.!?]*but[^.!?]*[.!?]/gi,
  /part of me[^.!?]*while another part[^.!?]*[.!?]/gi,
  /I feel[^.!?]*and[^.!?]*at the same time[^.!?]*[.!?]/gi,
  /I love[^.!?]*but[^.!?]*[.!?]/gi,
  /I need[^.!?]*but[^.!?]*[.!?]/gi,
  /I should[^.!?]*but[^.!?]*[.!?]/gi,
  /on one hand[^.!?]*on the other hand[^.!?]*[.!?]/gi,
  /I believe[^.!?]*yet[^.!?]*[.!?]/gi,
  /I think[^.!?]*but[^.!?]*[.!?]/gi
];

// IBM (Incoherent Behavioral Manifestation) patterns
const IBM_PATTERNS = [
  /I should[^.!?]*but I don't[^.!?]*[.!?]/gi,
  /I need to[^.!?]*but I can't[^.!?]*[.!?]/gi,
  /I keep doing[^.!?]*even though[^.!?]*[.!?]/gi,
  /I know I should[^.!?]*but[^.!?]*[.!?]/gi,
  /I try to[^.!?]*but[^.!?]*[.!?]/gi,
  /I want to stop[^.!?]*but[^.!?]*[.!?]/gi,
  /I tell myself[^.!?]*but then[^.!?]*[.!?]/gi,
  /I plan to[^.!?]*but[^.!?]*[.!?]/gi,
  /I always[^.!?]*even when[^.!?]*[.!?]/gi
];

// Thend (Integration/Both-And) indicators
const THEND_PATTERNS = [
  /I realize both[^.!?]*[.!?]/gi,
  /maybe they're both[^.!?]*[.!?]/gi,
  /I can see how both[^.!?]*[.!?]/gi,
  /both[^.!?]*are true[^.!?]*[.!?]/gi,
  /it's not either[^.!?]*or[^.!?]*it's both[^.!?]*[.!?]/gi,
  /they can coexist[^.!?]*[.!?]/gi,
  /I don't have to choose between[^.!?]*[.!?]/gi,
  /both sides[^.!?]*make sense[^.!?]*[.!?]/gi,
  /I can hold both[^.!?]*[.!?]/gi,
  /there's truth in both[^.!?]*[.!?]/gi
];

// CYVC (Contextual Yield/Variation Choice) patterns
const CYVC_PATTERNS = [
  /sometimes I[^.!?]*other times I[^.!?]*[.!?]/gi,
  /it depends on[^.!?]*[.!?]/gi,
  /I can choose when to[^.!?]*[.!?]/gi,
  /in some situations[^.!?]*in others[^.!?]*[.!?]/gi,
  /I decide based on[^.!?]*[.!?]/gi,
  /I adapt[^.!?]*depending on[^.!?]*[.!?]/gi,
  /I vary[^.!?]*according to[^.!?]*[.!?]/gi,
  /I switch between[^.!?]*when[^.!?]*[.!?]/gi,
  /I'm flexible about[^.!?]*[.!?]/gi,
  /I calibrate[^.!?]*based on[^.!?]*[.!?]/gi
];

// Agent response markers to help separate user from agent statements
const AGENT_MARKERS = [
  /I notice/gi,
  /I hear you saying/gi,
  /It sounds like/gi,
  /What I'm hearing/gi,
  /Let me reflect/gi,
  /I wonder if/gi,
  /Can you tell me more/gi,
  /How does that feel/gi,
  /What's coming up for you/gi,
  /I'm curious about/gi
];

/**
 * Extracts likely user statements from a conversation transcript
 * by filtering out probable agent responses
 */
export function extractUserStatements(transcript: string): string[] {
  if (!transcript || transcript.trim().length === 0) {
    return [];
  }

  // Split into sentences and clean up
  const sentences = transcript
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10); // Filter out very short fragments

  const userStatements: string[] = [];

  for (const sentence of sentences) {
    // Skip if it's likely an agent response
    const isAgentResponse = AGENT_MARKERS.some(marker => 
      marker.test(sentence)
    );

    // Skip questions (likely agent)
    const isQuestion = sentence.trim().endsWith('?');

    // Prefer statements starting with "I" (likely user)
    const startsWithI = /^I\s/i.test(sentence.trim());

    // Include if it seems like a user statement
    if (!isAgentResponse && !isQuestion && (startsWithI || sentence.length > 20)) {
      userStatements.push(sentence.trim());
    }
  }

  return userStatements;
}

/**
 * Detects CSS patterns in therapeutic conversation transcript
 * Returns exact user quotes that match therapeutic patterns
 */
export function detectCSSPatterns(transcript: string): CSSPatterns {
  if (!transcript || transcript.trim().length === 0) {
    return {
      cvdcPatterns: [],
      ibmPatterns: [],
      thendIndicators: [],
      cyvcPatterns: [],
      currentStage: 'pointed_origin'
    };
  }

  // Extract user statements to focus pattern detection
  const userStatements = extractUserStatements(transcript);
  const userText = userStatements.join(' ');

  // Detect CVDC patterns (contradictions)
  const cvdcPatterns: string[] = [];
  for (const pattern of CVDC_PATTERNS) {
    const matches = userText.match(pattern);
    if (matches) {
      cvdcPatterns.push(...matches.map(match => match.trim()));
    }
  }

  // Detect IBM patterns (behavioral incoherence)
  const ibmPatterns: string[] = [];
  for (const pattern of IBM_PATTERNS) {
    const matches = userText.match(pattern);
    if (matches) {
      ibmPatterns.push(...matches.map(match => match.trim()));
    }
  }

  // Detect Thend indicators (integration)
  const thendIndicators: string[] = [];
  for (const pattern of THEND_PATTERNS) {
    const matches = userText.match(pattern);
    if (matches) {
      thendIndicators.push(...matches.map(match => match.trim()));
    }
  }

  // Detect CYVC patterns (contextual choice)
  const cyvcPatterns: string[] = [];
  for (const pattern of CYVC_PATTERNS) {
    const matches = userText.match(pattern);
    if (matches) {
      cyvcPatterns.push(...matches.map(match => match.trim()));
    }
  }

  // Determine current stage
  const currentStage = identifyCurrentStage({
    cvdcPatterns,
    ibmPatterns,
    thendIndicators,
    cyvcPatterns
  });

  return {
    cvdcPatterns,
    ibmPatterns,
    thendIndicators,
    cyvcPatterns,
    currentStage
  };
}

/**
 * Identifies the most likely CSS stage based on detected patterns
 */
export function identifyCurrentStage(patterns: Omit<CSSPatterns, 'currentStage'>): CSSStage {
  const { cvdcPatterns, ibmPatterns, thendIndicators, cyvcPatterns } = patterns;

  // Count pattern occurrences
  const cvdcCount = cvdcPatterns.length;
  const ibmCount = ibmPatterns.length;
  const thendCount = thendIndicators.length;
  const cyvcCount = cyvcPatterns.length;

  // Stage identification logic
  if (cyvcCount > 0) {
    // Completion: User shows contextual choice/variation
    return 'completion';
  }

  if (thendCount > 0) {
    // Gesture toward: Integration moments present
    return 'gesture_toward';
  }

  if (cvdcCount >= 2 && ibmCount >= 1) {
    // Suspension: Multiple contradictions held without immediate resolution
    return 'suspension';
  }

  if (cvdcCount >= 1 || ibmCount >= 1) {
    // Focus bind: Clear contradiction or behavioral incoherence identified
    return 'focus_bind';
  }

  // Pointed origin: Problem stated but no contradiction patterns identified
  return 'pointed_origin';
}

/**
 * Analyzes pattern progression and confidence scoring
 */
export function assessPatternConfidence(patterns: CSSPatterns): {
  confidence: number;
  reasoning: string;
} {
  const totalPatterns = patterns.cvdcPatterns.length + 
                       patterns.ibmPatterns.length + 
                       patterns.thendIndicators.length + 
                       patterns.cyvcPatterns.length;

  if (totalPatterns === 0) {
    return {
      confidence: 0.3,
      reasoning: 'No clear CSS patterns detected in transcript'
    };
  }

  if (totalPatterns >= 3) {
    return {
      confidence: 0.9,
      reasoning: `Strong evidence with ${totalPatterns} pattern matches`
    };
  }

  if (totalPatterns >= 2) {
    return {
      confidence: 0.7,
      reasoning: `Moderate evidence with ${totalPatterns} pattern matches`
    };
  }

  return {
    confidence: 0.5,
    reasoning: `Limited evidence with ${totalPatterns} pattern match`
  };
}