// Enhanced CSS Pattern Detection Service - Streamlined Version
// Adds intensity scoring and safety detection without complexity explosion

export interface CSSPatterns {
  cvdcPatterns: PatternMatch[];
  ibmPatterns: PatternMatch[];
  thendIndicators: PatternMatch[];
  cyvcPatterns: PatternMatch[];
  currentStage: CSSStage;
  hasWarningFlags: boolean;
  emotionalIntensity: 'low' | 'medium' | 'high' | 'critical';
}

export interface PatternMatch {
  text: string;
  intensity: 'low' | 'medium' | 'high';
  hasWarningFlag: boolean;
}

export type CSSStage = 
  | 'pointed_origin'
  | 'focus_bind' 
  | 'suspension'
  | 'gesture_toward'
  | 'completion'
  | 'terminal';

// Safety warning patterns - CRITICAL
const WARNING_PATTERNS = [
  /kill myself/gi,
  /end it all/gi,
  /not worth living/gi,
  /better off dead/gi,
  /want to die/gi,
  /can't go on/gi,
  /no point in living/gi,
  /hurt myself/gi,
  /self.?harm/gi,
  /suicid/gi
];

// Intensity boosters (check within 50 chars of pattern)
const INTENSITY_BOOSTERS = [
  'really', 'totally', 'completely', 'absolutely', 'desperate',
  'need', 'must', 'have to', 'can\'t stand', 'killing me',
  'so much', 'extremely', 'unbearable', 'overwhelming'
];

// Intensity diminishers (check within 50 chars of pattern)
const INTENSITY_DIMINISHERS = [
  'maybe', 'kind of', 'sort of', 'a little', 'somewhat',
  'might', 'possibly', 'probably', 'sometimes', 'occasionally'
];

// CVDC patterns with simplified intensity
const CVDC_PATTERNS = [
  /I want[^.!?]*but[^.!?]*/gi,
  /part of me[^.!?]*while another part[^.!?]*/gi,
  /I feel[^.!?]*and[^.!?]*at the same time/gi,
  /I love[^.!?]*but[^.!?]*/gi,
  /I need[^.!?]*but[^.!?]*/gi,
  /I should[^.!?]*but[^.!?]*/gi,
  /on one hand[^.!?]*on the other hand/gi,
  /I believe[^.!?]*yet[^.!?]*/gi,
  /I think[^.!?]*but[^.!?]*/gi,
  /torn between/gi,

  // Self-worth patterns (Frank's patterns)
  /sorry(?:\s+I'm|\s+if|\s+for)?/gi,
  /I'm sorry/gi,
  /apologize/gi,
  /my fault/gi,
  /I'm bothering/gi,
  /taking up (your )?space/gi,
  /wasting (your )?time/gi,
  /I'm useless/gi,
  /I'm worthless/gi,
  /I don't deserve/gi,
  /I'm a burden/gi
];

// IBM patterns
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
  /out of control[^.!?]*unable to/gi,
  /can't[^.!?]*even though I want/gi,
  /unable to[^.!?]*despite/gi,

  // Executive dysfunction patterns
  /can't make myself/gi,
  /can't focus/gi,
  /can't do anything/gi,
  /haven't showered/gi,
  /apartment'?s a mess/gi,
  /room'?s a mess/gi,
  /no energy/gi,
  /exhausted but can't sleep/gi
];

// Thend patterns
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
  /I'm recognizing/gi,
  /I realize now/gi,
  /I'm doing better at/gi,
  /I see how/gi,
  /starting to see/gi,
  /something'?s? shift/gi,
  /feels different now/gi,
  /a bit better/gi
];

// CYVC patterns
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
  /don't get as[^.!?]*anymore/gi
];

// Somatic/distress patterns that suggest need for Zhanna
const SOMATIC_PATTERNS = [
  // Anxiety patterns
  /anxious/gi,
  /anxiety/gi,
  /nervous/gi,
  /worried/gi,
  /stress(ed|ing)/gi,
  /overwhelm(ed|ing)/gi,
  
  // Body escape/dissociation
  /jump out of (my )?body/gi,
  /leave (my )?body/gi,
  /escape (my )?body/gi,
  /out of (my )?body/gi,
  /can't be in (my )?body/gi,
  
  // Physical sensations
  /can't breathe/gi,
  /chest (is |feels )?(tight|heavy)/gi,
  /heart (is )?(racing|pounding|beating)/gi,
  /feel(ing)? dizzy/gi,
  /feel(ing)? unreal/gi,
  /feel(ing)? disconnected/gi,
  /feel(ing)? floating/gi,
  /panic/gi,
  /hyperventilat/gi,
  /can't feel my body/gi,
  /numb/gi,
  /shaking/gi,
  /trembling/gi,
  /frozen/gi,
  /stuck/gi,
  /can't move/gi,
  /overwhelming/gi,
  /body feels/gi,
  /breathing (is |feels )?(hard|difficult)/gi,
  /short of breath/gi,
  
  // Movement impulses
  /want to run/gi,
  /need to escape/gi,
  /want to flee/gi,
  /feet (want|need)/gi,
  /restless/gi,
  /can't sit still/gi
];

// Grief and loss patterns - Critical for detecting pet loss, death, bereavement
const GRIEF_PATTERNS = [
  // Direct mentions of death/dying
  /\b(dying|die|died|death|dead|passing away|passed away)\b/gi,
  /\bnot doing (so )?(well|good)\b/gi,
  /\bgoing to lose\b/gi,
  /\bdon't have (much|long)\b.*\bleft\b/gi,
  /\bend is (near|coming|close)\b/gi,
  /\bsaying goodbye\b/gi,
  /\bfinal (days|weeks|months)\b/gi,
  /\bwon't be (here|around)\b.*\b(much )?longer\b/gi,
  
  // Grief emotions
  /\b(grief|grieving|mourning|bereaved|bereavement)\b/gi,
  /\bheartbroken\b/gi,
  /\bdevastated\b/gi,
  /\bcan't imagine life without\b/gi,
  /\bmiss (them|him|her|my)\b.*\b(so much|terribly)\b/gi,
  /\bgone forever\b/gi,
  /\bnever see.*again\b/gi,
  
  // Pet-specific grief
  /\bput (down|to sleep)\b/gi,
  /\beuthanize\b/gi,
  /\bvet said.*\b(nothing|can't|won't)\b/gi,
  /\b(tumor|cancer|kidney|liver|heart)\b.*\b(failure|disease)\b/gi,
  /\bquality of life\b/gi,
  /\bsuffering\b/gi,
  /\bin pain\b/gi,
  /\bwon't eat\b/gi,
  /\bcan't walk\b/gi,
  
  // Loss and emptiness
  /\bfeel(s)? (so )?empty\b/gi,
  /\bhole in my (heart|life)\b/gi,
  /\bpart of me.*\b(died|dying|gone)\b/gi,
  /\bnothing will.*\bsame\b/gi,
  /\bcan't go on without\b/gi
];

// Narrative-specific pattern detection
const NARRATIVE_PATTERNS = {
  STORY_CONTRADICTION: [
    /one part of me (?:says|thinks|believes) (.+) but another (?:says|thinks|believes) (.+)/i,
    /my story (?:says|tells) (.+) but (?:I|my) (.+)/i,
    /I tell myself (.+) but (?:then I|I also) (.+)/i,
    /part of my story (.+) while another part (.+)/i,
    /the story I'm telling (.+) but (.+)/i
  ],
  NARRATIVE_GAP: [
    /the story I tell (?:myself|others) (?:is|isn't) (.+)/i,
    /(?:I|my) narrative (?:doesn't|does not) match (.+)/i,
    /there's a gap between what I (?:say|tell) and (.+)/i,
    /my story says (.+) but my (?:actions|behavior|body) (.+)/i,
    /disconnect between my story and (.+)/i
  ],
  FRAGMENTED_STORY: [
    /(?:I|my story) (?:doesn't|does not) make sense/i,
    /(?:I|it) (?:feels|seems) (?:scattered|fragmented|broken)/i,
    /can't (?:find|create|tell) (?:a|my) (?:coherent|clear) story/i,
    /my narrative is (?:falling apart|broken|shattered)/i,
    /lost the (?:thread|plot) of my (?:story|life)/i
  ],
  DEFENSIVE_NARRATIVE: [
    /that's not (?:my|the) story/i,
    /I'm not that (?:person|story)/i,
    /it wasn't (?:my|the) (?:fault|story)/i,
    /don't want that to be my story/i
  ],
  STUCK_NARRATIVE: [
    /same (?:old )?story/i,
    /stuck in (?:this|the) narrative/i,
    /story never changes/i,
    /always the same (?:ending|pattern|story)/i
  ],
  EMERGING_NARRATIVE: [
    /new story (?:is )?(?:emerging|forming)/i,
    /different narrative/i,
    /story is (?:changing|shifting)/i,
    /rewriting my (?:story|narrative)/i,
    /becoming a different story/i
  ]
};

/**
 * Check for safety warning flags
 */
function checkForWarnings(text: string): boolean {
  return WARNING_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Simple intensity assessment based on context
 */
function assessIntensity(text: string, matchStart: number): 'low' | 'medium' | 'high' {
  // Get context window (50 chars before and after)
  const contextStart = Math.max(0, matchStart - 50);
  const contextEnd = Math.min(text.length, matchStart + 100);
  const context = text.substring(contextStart, contextEnd).toLowerCase();

  // Count boosters and diminishers
  let boosterCount = 0;
  let diminisherCount = 0;

  for (const booster of INTENSITY_BOOSTERS) {
    if (context.includes(booster)) boosterCount++;
  }

  for (const diminisher of INTENSITY_DIMINISHERS) {
    if (context.includes(diminisher)) diminisherCount++;
  }

  // Simple intensity logic
  if (boosterCount >= 2 || context.includes('desperate') || context.includes('unbearable')) {
    return 'high';
  }
  if (diminisherCount >= 2) {
    return 'low';
  }
  if (boosterCount > diminisherCount) {
    return 'medium';
  }

  return 'low';
}

/**
 * Detect patterns with intensity and safety checks
 */
function detectPatternCategory(
  text: string, 
  patterns: RegExp[], 
  debug: boolean = false
): PatternMatch[] {
  const results: PatternMatch[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
      const matchText = match[0].trim();
      const normalizedText = matchText.toLowerCase();

      // Skip duplicates
      if (seen.has(normalizedText)) continue;
      seen.add(normalizedText);

      // Assess intensity and check for warnings
      const intensity = assessIntensity(text, match.index);
      const hasWarningFlag = checkForWarnings(matchText);

      results.push({
        text: matchText,
        intensity,
        hasWarningFlag
      });

      if (debug && hasWarningFlag) {
        console.log(`⚠️ WARNING FLAG in pattern: "${matchText}"`);
      }
    }
  }

  return results;
}

/**
 * Main pattern detection with safety enhancements
 */
/**
 * Calculate symbolic density of content
 */
function calculateSymbolicDensity(content: string): number {
  // Words that indicate high symbolic density
  const symbolicMarkers = [
    'always', 'never', 'everything', 'nothing', 'everyone',
    'can\'t', 'must', 'should', 'have to', 'need to',
    'die', 'kill', 'destroy', 'save', 'rescue',
    'perfect', 'broken', 'ruined', 'forever', 'impossible'
  ];
  
  let density = 0;
  const words = content.toLowerCase().split(/\s+/);
  
  for (const marker of symbolicMarkers) {
    if (words.includes(marker)) density += 2;
  }
  
  return Math.min(density, 10);
}

/**
 * Determine temporal orientation of narrative
 */
function determineTemporalOrientation(content: string): 'past' | 'present' | 'future' {
  const pastMarkers = /(?:was|were|had|used to|before|ago|last|previous|remember|forgot)/i;
  const futureMarkers = /(?:will|going to|gonna|soon|tomorrow|next|later|someday|eventually)/i;
  
  const pastCount = (content.match(pastMarkers) || []).length;
  const futureCount = (content.match(futureMarkers) || []).length;
  
  if (pastCount > futureCount) return 'past';
  if (futureCount > pastCount) return 'future';
  return 'present';
}

/**
 * Calculate narrative fragmentation score
 */
function calculateNarrativeFragmentation(transcript: string, debug: boolean = false): number {
  let fragmentationScore = 0;
  
  // Check for story contradictions
  for (const pattern of NARRATIVE_PATTERNS.STORY_CONTRADICTION) {
    const matches = transcript.match(pattern);
    if (matches) {
      fragmentationScore += 3;
      if (debug) console.log('📖 Story contradiction detected:', matches[0]);
    }
  }
  
  // Check for narrative gaps
  for (const pattern of NARRATIVE_PATTERNS.NARRATIVE_GAP) {
    const matches = transcript.match(pattern);
    if (matches) {
      fragmentationScore += 2;
      if (debug) console.log('📖 Narrative gap detected:', matches[0]);
    }
  }
  
  // Check for fragmented stories
  for (const pattern of NARRATIVE_PATTERNS.FRAGMENTED_STORY) {
    const matches = transcript.match(pattern);
    if (matches) {
      fragmentationScore += 4;
      if (debug) console.log('📖 Fragmented story detected:', matches[0]);
    }
  }
  
  // Check for defensive narratives
  for (const pattern of NARRATIVE_PATTERNS.DEFENSIVE_NARRATIVE) {
    if (pattern.test(transcript)) {
      fragmentationScore += 1;
    }
  }
  
  // Check for stuck narratives
  for (const pattern of NARRATIVE_PATTERNS.STUCK_NARRATIVE) {
    if (pattern.test(transcript)) {
      fragmentationScore += 2;
    }
  }
  
  // Emerging narratives reduce fragmentation
  for (const pattern of NARRATIVE_PATTERNS.EMERGING_NARRATIVE) {
    if (pattern.test(transcript)) {
      fragmentationScore -= 2;
    }
  }
  
  // Cap between 0 and 10
  return Math.max(0, Math.min(fragmentationScore, 10));
}

export function detectEnhancedCSSPatterns(transcript: string, debug: boolean = false): CSSPatterns & { 
  somaticPatterns?: PatternMatch[], 
  griefPatterns?: PatternMatch[],
  distressLevel?: number,
  narrativeFragmentation?: number,
  symbolicDensity?: number,
  temporalOrientation?: 'past' | 'present' | 'future'
} {
  if (!transcript || transcript.trim().length === 0) {
    return {
      cvdcPatterns: [],
      ibmPatterns: [],
      thendIndicators: [],
      cyvcPatterns: [],
      somaticPatterns: [],
      griefPatterns: [],
      currentStage: 'pointed_origin',
      hasWarningFlags: false,
      emotionalIntensity: 'low',
      distressLevel: 0,
      narrativeFragmentation: 0,
      symbolicDensity: 0,
      temporalOrientation: 'present'
    };
  }

  if (debug) {
    console.log('🔍 Enhanced CSS pattern detection starting');
    console.log('📝 Analyzing text length:', transcript.length);
  }

  // Detect patterns with intensity
  const cvdcPatterns = detectPatternCategory(transcript, CVDC_PATTERNS, debug);
  const ibmPatterns = detectPatternCategory(transcript, IBM_PATTERNS, debug);
  const thendIndicators = detectPatternCategory(transcript, THEND_PATTERNS, debug);
  const cyvcPatterns = detectPatternCategory(transcript, CYVC_PATTERNS, debug);
  const somaticPatterns = detectPatternCategory(transcript, SOMATIC_PATTERNS, debug);
  const griefPatterns = detectPatternCategory(transcript, GRIEF_PATTERNS, debug);

  // Check for any warning flags or somatic distress
  const hasWarningFlags = [
    ...cvdcPatterns,
    ...ibmPatterns,
    ...thendIndicators,
    ...cyvcPatterns,
    ...somaticPatterns,
    ...griefPatterns
  ].some(p => p.hasWarningFlag);

  // Assess overall emotional intensity (including grief)
  const emotionalIntensity = assessOverallIntensity(
    cvdcPatterns,
    ibmPatterns,
    thendIndicators,
    cyvcPatterns,
    hasWarningFlags,
    griefPatterns
  );

  // Determine current stage (unchanged logic)
  const currentStage = identifyCurrentStage({
    cvdcPatterns: cvdcPatterns.map(p => p.text),
    ibmPatterns: ibmPatterns.map(p => p.text),
    thendIndicators: thendIndicators.map(p => p.text),
    cyvcPatterns: cyvcPatterns.map(p => p.text)
  });

  // Calculate distress level based on somatic patterns and intensity
  let distressLevel = 0;
  if (somaticPatterns.length > 0) {
    const highSomatic = somaticPatterns.filter(p => p.intensity === 'high').length;
    const medSomatic = somaticPatterns.filter(p => p.intensity === 'medium').length;
    
    if (highSomatic >= 2) distressLevel = 8;
    else if (highSomatic >= 1) distressLevel = 7;
    else if (medSomatic >= 2) distressLevel = 6;
    else if (medSomatic >= 1) distressLevel = 5;
    else distressLevel = 4;
  }
  
  // Grief patterns significantly increase distress
  if (griefPatterns.length > 0) {
    const highGrief = griefPatterns.filter(p => p.intensity === 'high').length;
    const medGrief = griefPatterns.filter(p => p.intensity === 'medium').length;
    
    if (highGrief >= 2) distressLevel = Math.max(distressLevel, 9);
    else if (highGrief >= 1) distressLevel = Math.max(distressLevel, 8);
    else if (medGrief >= 1) distressLevel = Math.max(distressLevel, 7);
    else distressLevel = Math.max(distressLevel, 6);
  }
  
  // Adjust for warning flags
  if (hasWarningFlags) {
    distressLevel = Math.max(distressLevel, 7);
  }
  
  // Calculate narrative metrics
  const narrativeFragmentation = calculateNarrativeFragmentation(transcript, debug);
  const symbolicDensity = calculateSymbolicDensity(transcript);
  const temporalOrientation = determineTemporalOrientation(transcript);
  
  // Adjust distress based on narrative fragmentation
  if (narrativeFragmentation >= 8) {
    distressLevel = Math.max(distressLevel, 7);
  }

  if (debug) {
    console.log('📊 Enhanced Pattern Detection Summary:');
    console.log(`  - CVDC: ${cvdcPatterns.length} patterns`);
    console.log(`  - IBM: ${ibmPatterns.length} patterns`);
    console.log(`  - Thend: ${thendIndicators.length} patterns`);
    console.log(`  - CYVC: ${cyvcPatterns.length} patterns`);
    console.log(`  - Somatic: ${somaticPatterns.length} patterns`);
    console.log(`  - Grief: ${griefPatterns.length} patterns`);
    console.log(`  - Stage: ${currentStage}`);
    console.log(`  - Emotional Intensity: ${emotionalIntensity}`);
    console.log(`  - Distress Level: ${distressLevel}`);
    console.log(`  - Narrative Fragmentation: ${narrativeFragmentation}`);
    console.log(`  - Symbolic Density: ${symbolicDensity}`);
    console.log(`  - Temporal Orientation: ${temporalOrientation}`);
    console.log(`  - Warning Flags: ${hasWarningFlags}`);
  }

  return {
    cvdcPatterns,
    ibmPatterns,
    thendIndicators,
    cyvcPatterns,
    somaticPatterns,
    griefPatterns,
    currentStage,
    hasWarningFlags,
    emotionalIntensity,
    distressLevel,
    narrativeFragmentation,
    symbolicDensity,
    temporalOrientation
  };
}

/**
 * Simple overall intensity assessment
 */
function assessOverallIntensity(
  cvdc: PatternMatch[],
  ibm: PatternMatch[],
  thend: PatternMatch[],
  cyvc: PatternMatch[],
  hasWarnings: boolean,
  grief?: PatternMatch[]
): 'low' | 'medium' | 'high' | 'critical' {
  // Critical if any warnings
  if (hasWarnings) return 'critical';
  
  // Grief patterns automatically elevate intensity
  if (grief && grief.length > 0) {
    const highGrief = grief.filter(p => p.intensity === 'high').length;
    if (highGrief > 0) return 'critical';
    return 'high';
  }

  // Count high intensity patterns
  const allPatterns = [...cvdc, ...ibm, ...thend, ...cyvc];
  const highIntensityCount = allPatterns.filter(p => p.intensity === 'high').length;
  const mediumIntensityCount = allPatterns.filter(p => p.intensity === 'medium').length;

  // Simple thresholds
  if (highIntensityCount >= 3) return 'high';
  if (highIntensityCount >= 1 || mediumIntensityCount >= 3) return 'medium';

  return 'low';
}

/**
 * Original stage identification (preserved)
 */
export function identifyCurrentStage(patterns: {
  cvdcPatterns: string[];
  ibmPatterns: string[];
  thendIndicators: string[];
  cyvcPatterns: string[];
}): CSSStage {
  const { cvdcPatterns, ibmPatterns, thendIndicators, cyvcPatterns } = patterns;

  const cvdcCount = cvdcPatterns.length;
  const ibmCount = ibmPatterns.length;
  const thendCount = thendIndicators.length;
  const cyvcCount = cyvcPatterns.length;

  // Terminal: Shows both integration and contextual choice
  if (cyvcCount > 0 && thendCount > 0) {
    return 'terminal';
  }

  // Completion: User shows contextual choice/variation
  if (cyvcCount > 0) {
    return 'completion';
  }

  // Gesture toward: Integration WITH awareness of contradictions
  if (thendCount > 0 && (cvdcCount > 0 || ibmCount > 0)) {
    return 'gesture_toward';
  }

  // Suspension: Multiple contradictions or integration starting
  if (thendCount > 0 || (cvdcCount >= 2 || ibmCount >= 2)) {
    return 'suspension';
  }

  // Focus bind: Clear contradiction or behavioral gap identified
  if (cvdcCount >= 1 || ibmCount >= 1) {
    return 'focus_bind';
  }

  // Pointed origin: Default/starting stage
  return 'pointed_origin';
}

/**
 * Enhanced confidence assessment with intensity consideration
 */
export function assessPatternConfidence(patterns: CSSPatterns): {
  confidence: number;
  reasoning: string;
} {
  const totalPatterns = patterns.cvdcPatterns.length + 
                       patterns.ibmPatterns.length + 
                       patterns.thendIndicators.length + 
                       patterns.cyvcPatterns.length;

  // Boost confidence for high intensity or warnings
  let confidenceBoost = 0;
  if (patterns.hasWarningFlags) confidenceBoost = 0.3;
  else if (patterns.emotionalIntensity === 'high') confidenceBoost = 0.2;
  else if (patterns.emotionalIntensity === 'medium') confidenceBoost = 0.1;

  if (totalPatterns === 0) {
    return {
      confidence: 0.3,
      reasoning: 'No clear CSS patterns detected'
    };
  }

  if (patterns.hasWarningFlags) {
    return {
      confidence: 0.95,
      reasoning: 'Critical safety concerns detected - immediate attention needed'
    };
  }

  const baseConfidence = Math.min(0.95, 0.3 + (totalPatterns * 0.15));
  const finalConfidence = Math.min(0.95, baseConfidence + confidenceBoost);

  let reasoning = `${totalPatterns} patterns detected`;
  if (patterns.emotionalIntensity !== 'low') {
    reasoning += ` with ${patterns.emotionalIntensity} emotional intensity`;
  }

  return {
    confidence: finalConfidence,
    reasoning
  };
}

/**
 * Check if safe to switch agents
 */
export function isSafeToSwitch(patterns: CSSPatterns): boolean {
  // Never switch during crisis
  if (patterns.hasWarningFlags || patterns.emotionalIntensity === 'critical') {
    return false;
  }

  // Avoid switching during high emotional intensity unless necessary
  if (patterns.emotionalIntensity === 'high') {
    // Could still switch if there's a strong pattern mismatch
    // but generally avoid
    return false;
  }

  return true;
}

/**
 * Get therapeutic recommendations based on patterns
 */
export function getTherapeuticPriority(patterns: CSSPatterns): {
  priority: 'immediate' | 'high' | 'medium' | 'low';
  recommendation: string;
} {
  if (patterns.hasWarningFlags) {
    return {
      priority: 'immediate',
      recommendation: 'Crisis intervention needed - activate safety protocols'
    };
  }

  if (patterns.emotionalIntensity === 'high') {
    return {
      priority: 'high',
      recommendation: 'High emotional activation - provide grounding and stabilization'
    };
  }

  if (patterns.emotionalIntensity === 'medium' && patterns.currentStage === 'suspension') {
    return {
      priority: 'medium',
      recommendation: 'Hold space for contradictions without rushing to resolve'
    };
  }

  return {
    priority: 'low',
    recommendation: 'Continue current therapeutic approach'
  };
}