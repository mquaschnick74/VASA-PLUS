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
// Made more flexible - punctuation now optional
const CVDC_PATTERNS = [
  /I want[^.!?]*but[^.!?]*/gi,
  /part of me[^.!?]*while another part[^.!?]*/gi,
  /I feel[^.!?]*and[^.!?]*at the same time/gi,
  /I love[^.!?]*but[^.!?]*/gi,
  /I need[^.!?]*but[^.!?]*/gi,
  /I should[^.!?]*but[^.!?]*/gi,
  /on one hand[^.!?]*on the other hand/gi,
  /I believe[^.!?]*yet[^.!?]*/gi,
  /I think[^.!?]*but[^.!?]*/gi
];

// IBM (Incoherent Behavioral Manifestation) patterns
// Removed strict punctuation requirement
const IBM_PATTERNS = [
  /I should[^.!?]*but I don't/gi,
  /I need to[^.!?]*but I can't/gi,
  /I keep doing[^.!?]*even though/gi,
  /I know I should[^.!?]*but/gi,
  /I try to[^.!?]*but/gi,
  /I want to stop[^.!?]*but/gi,
  /I tell myself[^.!?]*but then/gi,
  /I plan to[^.!?]*but/gi,
  /I always[^.!?]*even when/gi,
  /out of control[^.!?]*unable to/gi, // Added pattern for Sept 7 match
  /can't[^.!?]*even though I want/gi,
  /unable to[^.!?]*despite/gi
];

// Thend (Integration/Both-And) indicators
// More flexible patterns for integration moments
const THEND_PATTERNS = [
  /I realize both/gi,
  /maybe they're both/gi,
  /I can see how both/gi,
  /both[^.!?]*are true/gi,
  /it's not either[^.!?]*or[^.!?]*it's both/gi,
  /they can coexist/gi,
  /I don't have to choose between/gi,
  /both sides[^.!?]*make sense/gi,
  /I can hold both/gi,
  /there's truth in both/gi,
  /I'm recognizing/gi,  // Added for Sept 8 conversation
  /I realize now/gi,
  /I'm doing better at/gi,
  /I see how/gi,
  /starting to see/gi
];

// CYVC (Contextual Yield/Variation Choice) patterns
const CYVC_PATTERNS = [
  /sometimes I[^.!?]*other times I/gi,
  /it depends on/gi,
  /I can choose when to/gi,
  /in some situations[^.!?]*in others/gi,
  /I decide based on/gi,
  /I adapt[^.!?]*depending on/gi,
  /I vary[^.!?]*according to/gi,
  /I switch between[^.!?]*when/gi,
  /I'm flexible about/gi,
  /I calibrate[^.!?]*based on/gi,
  /don't get as[^.!?]*anymore/gi  // Pattern for reduced reactivity
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
  /I'm curious about/gi,
  /Jordan,/gi,  // Agent often addresses user by name
  /good to talk with you/gi,
  /I've been thinking about/gi
];

/**
 * Extracts likely user statements from a conversation transcript
 * Now with debug logging and less aggressive filtering
 */
export function extractUserStatements(transcript: string, debug: boolean = false): string[] {
  if (!transcript || transcript.trim().length === 0) {
    return [];
  }

  // For debugging - analyze the full transcript first
  if (debug) {
    console.log('📝 Raw transcript length:', transcript.length);
    console.log('📝 First 200 chars:', transcript.substring(0, 200));
  }

  // Option 1: Return full transcript for analysis (less filtering)
  // This ensures we don't miss patterns due to aggressive filtering
  const USE_FULL_TRANSCRIPT = true;
  
  if (USE_FULL_TRANSCRIPT) {
    if (debug) console.log('🔍 Using FULL transcript for pattern detection');
    return [transcript];
  }

  // Option 2: Original filtering logic (kept for reference)
  // Split into sentences and clean up
  const sentences = transcript
    .split(/[.!?]+/)
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
 * Now with debug logging and improved detection
 */
export function detectCSSPatterns(transcript: string, debug: boolean = true): CSSPatterns {
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

  if (debug) {
    console.log('📝 Text to analyze length:', userText.length);
  }

  // Detect CVDC patterns (contradictions)
  const cvdcPatterns: string[] = [];
  for (const pattern of CVDC_PATTERNS) {
    const matches = userText.match(pattern);
    if (matches) {
      cvdcPatterns.push(...matches.map(match => match.trim()));
      if (debug) console.log(`✅ CVDC match: "${matches[0].substring(0, 50)}..."`);
    }
  }

  // Detect IBM patterns (behavioral incoherence)
  const ibmPatterns: string[] = [];
  for (const pattern of IBM_PATTERNS) {
    const matches = userText.match(pattern);
    if (matches) {
      ibmPatterns.push(...matches.map(match => match.trim()));
      if (debug) console.log(`✅ IBM match: "${matches[0].substring(0, 50)}..."`);
    }
  }

  // Detect Thend indicators (integration)
  const thendIndicators: string[] = [];
  for (const pattern of THEND_PATTERNS) {
    const matches = userText.match(pattern);
    if (matches) {
      thendIndicators.push(...matches.map(match => match.trim()));
      if (debug) console.log(`✅ Thend match: "${matches[0].substring(0, 50)}..."`);
    }
  }

  // Detect CYVC patterns (contextual choice)
  const cyvcPatterns: string[] = [];
  for (const pattern of CYVC_PATTERNS) {
    const matches = userText.match(pattern);
    if (matches) {
      cyvcPatterns.push(...matches.map(match => match.trim()));
      if (debug) console.log(`✅ CYVC match: "${matches[0].substring(0, 50)}..."`);
    }
  }

  // Determine current stage
  const currentStage = identifyCurrentStage({
    cvdcPatterns,
    ibmPatterns,
    thendIndicators,
    cyvcPatterns
  });

  if (debug) {
    console.log('📊 Pattern Detection Summary:');
    console.log(`  - CVDC patterns: ${cvdcPatterns.length}`);
    console.log(`  - IBM patterns: ${ibmPatterns.length}`);
    console.log(`  - Thend indicators: ${thendIndicators.length}`);
    console.log(`  - CYVC patterns: ${cyvcPatterns.length}`);
    console.log(`  - Detected stage: ${currentStage}`);
  }

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
 * Enhanced logic for better stage detection
 */
export function identifyCurrentStage(patterns: Omit<CSSPatterns, 'currentStage'>): CSSStage {
  const { cvdcPatterns, ibmPatterns, thendIndicators, cyvcPatterns } = patterns;

  // Count pattern occurrences
  const cvdcCount = cvdcPatterns.length;
  const ibmCount = ibmPatterns.length;
  const thendCount = thendIndicators.length;
  const cyvcCount = cyvcPatterns.length;

  console.log(`🎯 Stage identification: CVDC=${cvdcCount}, IBM=${ibmCount}, Thend=${thendCount}, CYVC=${cyvcCount}`);

  // Stage identification logic - ordered by progression
  if (cyvcCount > 0 && thendCount > 0) {
    // Terminal: Shows both integration and contextual choice
    return 'terminal';
  }

  if (cyvcCount > 0) {
    // Completion: User shows contextual choice/variation
    return 'completion';
  }

  if (thendCount > 0 && (cvdcCount > 0 || ibmCount > 0)) {
    // Gesture toward: Integration WITH awareness of contradictions
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