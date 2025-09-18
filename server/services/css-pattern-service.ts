// server/services/css-pattern-service.ts
// CSS Pattern Detection Service
// Detects CVDC, IBM, Thend, CYVC patterns in therapeutic conversations

export interface CSSPatterns {
  cvdcPatterns: string[];
  ibmPatterns: string[];
  thendIndicators: string[];
  cyvcPatterns: string[];
  currentStage: string;
}

export type CSSStage = 'pointed_origin' | 'focus_bind' | 'suspension' | 'gesture_toward' | 'completion' | 'terminal';

// Agent response markers to filter out
const AGENT_MARKERS = [
  /What\'s it like/gi,
  /Can you tell me more/gi,
  /How does that feel/gi,
  /I hear you saying/gi,
  /It sounds like/gi,
  /What do you notice/gi,
  /I\'m curious about/gi,
  /Thank you for sharing/gi,
  /That must be/gi,
  /I can imagine/gi
];

/**
 * Extract user statements from a full transcript
 */
function extractUserStatements(transcript: string, debug: boolean = false): string[] {
  // Split by sentences but preserve the full text structure
  const sentences = transcript
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (debug) {
    console.log(`📝 Split into ${sentences.length} sentences`);
  }

  const userStatements: string[] = [];

  for (const sentence of sentences) {
    // Skip if it's likely an agent response
    const isAgentResponse = AGENT_MARKERS.some(marker => 
      marker.test(sentence)
    );

    // Skip questions (likely agent) - but not all questions
    const isQuestion = sentence.trim().endsWith('?') && !sentence.includes('I');

    // Prefer statements starting with "I" (likely user)
    const startsWithI = /^I\s/i.test(sentence.trim());

    // Include if it seems like a user statement
    if (!isAgentResponse && (!isQuestion || startsWithI)) {
      userStatements.push(sentence.trim());
      if (debug) console.log(`✅ User statement: "${sentence.substring(0, 50)}..."`);
    } else if (debug) {
      console.log(`❌ Filtered out: "${sentence.substring(0, 50)}..." (agent:${isAgentResponse}, question:${isQuestion})`);
    }
  }

  if (debug) {
    console.log(`📝 Extracted ${userStatements.length} user statements from ${sentences.length} sentences`);
  }

  return userStatements;
}

/**
 * Detects CSS patterns in therapeutic conversation transcript
 */
export function detectCSSPatterns(transcript: string, debug: boolean = false): CSSPatterns {
  if (!transcript || transcript.trim().length === 0) {
    console.log('⚠️ Empty transcript provided to detectCSSPatterns');
    return {
      cvdcPatterns: [],
      ibmPatterns: [],
      thendIndicators: [],
      cyvcPatterns: [],
      currentStage: 'pointed_origin'
    };
  }

  if (debug) {
    console.log('🔍 Starting CSS pattern detection');
    console.log('📝 Transcript preview:', transcript.substring(0, 150) + '...');
  }

  // Extract user statements (or use full transcript)
  const userStatements = extractUserStatements(transcript, debug);
  const userText = userStatements.join(' ');

  // Also scan full transcript as fallback
  const textToAnalyze = userText || transcript;

  const cvdcMatches = detectCVDC(textToAnalyze);
  const ibmMatches = detectIBM(textToAnalyze);
  const thendIndicators = detectThend(textToAnalyze);
  const cyvcPatterns = detectCYVC(textToAnalyze);

  const currentStage = determineStage(cvdcMatches, ibmMatches, thendIndicators, cyvcPatterns);

  if (debug) {
    console.log(`📊 Pattern Detection Results:
    - CVDC: ${cvdcMatches.length} patterns
    - IBM: ${ibmMatches.length} patterns
    - Thend: ${thendIndicators.length} indicators
    - CYVC: ${cyvcPatterns.length} patterns
    - Stage: ${currentStage}`);
  }

  return {
    cvdcPatterns: cvdcMatches,
    ibmPatterns: ibmMatches,
    thendIndicators: thendIndicators,
    cyvcPatterns: cyvcPatterns,
    currentStage: currentStage
  };
}

/**
 * Detect CVDC (Contradiction) patterns
 */
function detectCVDC(text: string): string[] {
  const patterns = [
    // Core contradiction patterns
    /part of me.{0,50}(?:but|while|yet|however).{0,50}another part/gi,
    /I want.{0,30}but.{0,30}I (?:also want|need|can't)/gi,
    /torn between/gi,
    /both.{0,20}and.{0,20}at the same time/gi,
    /simultaneously/gi,
    /on one hand.{0,50}on the other/gi,

    // Emotional contradictions
    /I feel.{0,30}but.{0,30}I also feel/gi,
    /feeling both/gi,
    /mixed feelings/gi,

    // Enhanced patterns for "empty and heavy" type contradictions
    /empty.{0,20}(?:and|but|yet).{0,20}heavy/gi,
    /hollow.{0,20}(?:and|but|yet).{0,20}full/gi,
    /numb.{0,20}(?:and|but|yet).{0,20}pain/gi,
    /nothing.{0,20}(?:and|but|yet).{0,20}everything/gi
  ];

  const matches: string[] = [];

  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) {
      matches.push(...found.map(m => m.substring(0, 100)));
    }
  }

  return matches;
}

/**
 * Detect IBM (Intention-Behavior Mismatch) patterns
 */
function detectIBM(text: string): string[] {
  const patterns = [
    /I (?:say|tell myself).{0,30}but.{0,30}I (?:do|act|behave)/gi,
    /I know.{0,30}but.{0,30}I still/gi,
    /I should.{0,30}but.{0,30}I/gi,
    /my intention.{0,30}but.{0,30}my action/gi,
    /I try to.{0,30}but.{0,30}end up/gi,
    /I want to.{0,30}but.{0,30}I can't/gi,
    /knowing.{0,30}but.{0,30}doing/gi,
    /gap between.{0,30}(?:intention|what I want).{0,30}(?:action|what I do)/gi
  ];

  const matches: string[] = [];

  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) {
      matches.push(...found.map(m => m.substring(0, 100)));
    }
  }

  return matches;
}

/**
 * Detect Thend (Therapeutic End/Shift) indicators
 */
function detectThend(text: string): string[] {
  const patterns = [
    /something.{0,20}(?:shifted|changed|different)/gi,
    /I (?:realize|understand|see) now/gi,
    /it just (?:clicked|hit me|came together)/gi,
    /suddenly makes sense/gi,
    /I can see.{0,20}differently/gi,
    /perspective.{0,20}shift/gi,
    /new understanding/gi,
    /integration/gi,
    /coming together/gi,
    /I never thought of it that way/gi
  ];

  const matches: string[] = [];

  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) {
      matches.push(...found.map(m => m.substring(0, 100)));
    }
  }

  return matches;
}

/**
 * Detect CYVC (Contextual/Choice) patterns
 */
function detectCYVC(text: string): string[] {
  const patterns = [
    /sometimes.{0,30}other times/gi,
    /depends on.{0,20}(?:context|situation)/gi,
    /I (?:can|could) choose/gi,
    /different in different/gi,
    /flexibility/gi,
    /adaptive/gi,
    /it varies/gi,
    /contextual/gi,
    /I have options/gi
  ];

  const matches: string[] = [];

  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) {
      matches.push(...found.map(m => m.substring(0, 100)));
    }
  }

  return matches;
}

/**
 * Determine CSS stage based on detected patterns
 */
function determineStage(
  cvdcPatterns: string[],
  ibmPatterns: string[],
  thendIndicators: string[],
  cyvcPatterns: string[]
): string {
  const cvdcCount = cvdcPatterns.length;
  const ibmCount = ibmPatterns.length;
  const thendCount = thendIndicators.length;
  const cyvcCount = cyvcPatterns.length;

  // Terminal: Full recursive awareness with contextual flexibility
  if (cyvcCount >= 2 && thendCount >= 1) {
    return 'terminal';
  }

  // Completion: Active choice and flexibility
  if (cyvcCount >= 1) {
    return 'completion';
  }

  // Gesture toward: Integration beginning
  if (thendCount >= 2) {
    return 'gesture_toward';
  }

  if (thendCount > 0) {
    // Suspension to Gesture toward: Pure integration moments
    return 'suspension';
  }

  if (cvdcCount >= 2 || ibmCount >= 2) {
    // Suspension: Multiple contradictions held
    return 'suspension';
  }

  if (cvdcCount >= 1 || ibmCount >= 1) {
    // Focus bind: Clear contradiction identified
    return 'focus_bind';
  }

  // Pointed origin: Default/starting stage
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

  if (totalPatterns >= 5) {
    return {
      confidence: 0.95,
      reasoning: `Very strong evidence with ${totalPatterns} pattern matches`
    };
  }

  if (totalPatterns >= 3) {
    return {
      confidence: 0.85,
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