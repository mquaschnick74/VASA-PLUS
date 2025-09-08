// Distress Detection Service for HSFB Integration
// Detects heightened emotional states requiring grounding interventions

interface DistressPattern {
  pattern: RegExp;
  weight: number;
  category: 'fragmentation' | 'panic' | 'dissociation' | 'overwhelm' | 'somatic';
  description: string;
}

interface DistressAssessment {
  level: number; // 1-10 scale
  category: string;
  triggers: string[];
  requiresGrounding: boolean;
  suggestedModality: 'hearing' | 'seeing' | 'feeling' | 'breathing';
  confidence: number;
  reasoning: string;
}

// Distress pattern definitions with therapeutic categories
const DISTRESS_PATTERNS: DistressPattern[] = [
  // FRAGMENTATION PATTERNS
  {
    pattern: /i\s+(can't|cant|cannot)[\s\w]*?\.{2,}|i\s+just[\s\w]*?\.{2,}/gi,
    weight: 3,
    category: 'fragmentation',
    description: 'Fragmented speech with incomplete thoughts'
  },
  {
    pattern: /nothing\s+(works|helps|matters)|everything\s+is\s+(wrong|broken|falling\s+apart)/gi,
    weight: 4,
    category: 'fragmentation',
    description: 'Global negative assessments'
  },
  {
    pattern: /i\s+don't\s+know\s+what\s+to\s+do|i'm\s+lost|i\s+feel\s+lost/gi,
    weight: 3,
    category: 'fragmentation',
    description: 'Disorientation and confusion'
  },

  // PANIC PATTERNS
  {
    pattern: /can't\s+breathe|cannot\s+breathe|hard\s+to\s+breathe|breathing\s+is\s+hard/gi,
    weight: 5,
    category: 'panic',
    description: 'Breathing difficulty'
  },
  {
    pattern: /heart\s+(racing|pounding|beating\s+fast)|chest\s+(tight|hurts|pain)/gi,
    weight: 5,
    category: 'panic',
    description: 'Cardiac sensations'
  },
  {
    pattern: /going\s+to\s+die|dying|having\s+a\s+heart\s+attack|something\s+is\s+wrong\s+with\s+me/gi,
    weight: 5,
    category: 'panic',
    description: 'Catastrophic thinking'
  },
  {
    pattern: /panic|panicking|freaking\s+out|losing\s+it/gi,
    weight: 4,
    category: 'panic',
    description: 'Direct panic references'
  },

  // DISSOCIATION PATTERNS
  {
    pattern: /not\s+real|doesn't\s+feel\s+real|unreal|like\s+a\s+dream/gi,
    weight: 4,
    category: 'dissociation',
    description: 'Derealization'
  },
  {
    pattern: /floating|outside\s+my\s+body|watching\s+myself|detached|disconnected/gi,
    weight: 4,
    category: 'dissociation',
    description: 'Depersonalization'
  },
  {
    pattern: /numb|can't\s+feel\s+anything|empty|hollow|gone/gi,
    weight: 3,
    category: 'dissociation',
    description: 'Emotional numbing'
  },
  {
    pattern: /spacing\s+out|zoning\s+out|losing\s+time|where\s+am\s+i/gi,
    weight: 4,
    category: 'dissociation',
    description: 'Awareness disruption'
  },

  // OVERWHELM PATTERNS
  {
    pattern: /too\s+much|can't\s+handle|overwhelming|overwhelmed/gi,
    weight: 3,
    category: 'overwhelm',
    description: 'Capacity exceeded'
  },
  {
    pattern: /falling\s+apart|breaking\s+down|can't\s+cope|losing\s+control/gi,
    weight: 4,
    category: 'overwhelm',
    description: 'System breakdown'
  },
  {
    pattern: /everything\s+at\s+once|all\s+at\s+once|bombarded|flooded/gi,
    weight: 3,
    category: 'overwhelm',
    description: 'Sensory overload'
  },
  {
    pattern: /shut\s+down|shutting\s+down|can't\s+think|mind\s+is\s+blank/gi,
    weight: 3,
    category: 'overwhelm',
    description: 'Cognitive shutdown'
  },

  // SOMATIC DISTRESS PATTERNS
  {
    pattern: /shaking|trembling|can't\s+stop\s+shaking/gi,
    weight: 3,
    category: 'somatic',
    description: 'Physical tremors'
  },
  {
    pattern: /dizzy|lightheaded|going\s+to\s+faint|room\s+is\s+spinning/gi,
    weight: 4,
    category: 'somatic',
    description: 'Vestibular symptoms'
  },
  {
    pattern: /sick|nauseous|going\s+to\s+throw\s+up|stomach\s+(hurts|churning)/gi,
    weight: 3,
    category: 'somatic',
    description: 'GI distress'
  },
  {
    pattern: /hot|cold|sweating|freezing|burning/gi,
    weight: 2,
    category: 'somatic',
    description: 'Temperature dysregulation'
  }
];

// Speech pattern indicators of distress
const SPEECH_FRAGMENTATION_INDICATORS = {
  rapidSpeech: /(\b\w+\b\s*){20,}/g, // 20+ words without punctuation
  repetition: /(\b\w+\b)(?:\s+\1){2,}/gi, // Same word repeated 3+ times
  allCaps: /\b[A-Z]{4,}\b/g, // Words in all caps (excluding acronyms)
  excessivePunctuation: /[!?]{3,}/g, // Multiple exclamation/question marks
  incompleteSentences: /\.\.\.|…/g // Trailing off
};

/**
 * Detect distress level in user transcript
 */
export function detectDistressLevel(transcript: string, debug: boolean = false): DistressAssessment {
  if (debug) {
    console.log('\n🚨 === DISTRESS DETECTION ANALYSIS ===');
    console.log('Transcript length:', transcript.length);
  }

  const detectedPatterns: Array<{pattern: DistressPattern, match: string}> = [];
  let totalWeight = 0;
  const categoryScores: Record<string, number> = {
    fragmentation: 0,
    panic: 0,
    dissociation: 0,
    overwhelm: 0,
    somatic: 0
  };

  // Check each distress pattern
  for (const pattern of DISTRESS_PATTERNS) {
    const matches = transcript.match(pattern.pattern);
    if (matches) {
      matches.forEach(match => {
        detectedPatterns.push({ pattern, match });
        totalWeight += pattern.weight;
        categoryScores[pattern.category] += pattern.weight;

        if (debug) {
          console.log(`  ⚠️ Found ${pattern.category}: "${match}" (weight: ${pattern.weight})`);
        }
      });
    }
  }

  // Check speech fragmentation indicators
  let fragmentationBonus = 0;
  const speechIndicators = [];

  if (SPEECH_FRAGMENTATION_INDICATORS.rapidSpeech.test(transcript)) {
    fragmentationBonus += 2;
    speechIndicators.push('rapid speech');
  }
  if (SPEECH_FRAGMENTATION_INDICATORS.repetition.test(transcript)) {
    fragmentationBonus += 2;
    speechIndicators.push('word repetition');
  }
  if (SPEECH_FRAGMENTATION_INDICATORS.allCaps.test(transcript)) {
    fragmentationBonus += 1;
    speechIndicators.push('shouting/emphasis');
  }
  if (SPEECH_FRAGMENTATION_INDICATORS.excessivePunctuation.test(transcript)) {
    fragmentationBonus += 1;
    speechIndicators.push('excessive punctuation');
  }

  const incompleteCount = (transcript.match(SPEECH_FRAGMENTATION_INDICATORS.incompleteSentences) || []).length;
  if (incompleteCount > 2) {
    fragmentationBonus += 2;
    speechIndicators.push('incomplete thoughts');
  }

  totalWeight += fragmentationBonus;
  categoryScores.fragmentation += fragmentationBonus;

  if (debug && speechIndicators.length > 0) {
    console.log(`  🗣️ Speech indicators: ${speechIndicators.join(', ')} (+${fragmentationBonus})`);
  }

  // Calculate distress level (1-10 scale)
  let distressLevel = Math.min(10, Math.ceil(totalWeight / 3));

  // Minimum threshold for detection
  if (totalWeight < 3) {
    distressLevel = 0;
  }

  // Determine primary category
  const primaryCategory = Object.entries(categoryScores)
    .sort(([,a], [,b]) => b - a)[0][0];

  // Determine suggested modality based on category
  const modalityMap: Record<string, 'hearing' | 'seeing' | 'feeling' | 'breathing'> = {
    panic: 'breathing',
    dissociation: 'feeling',
    fragmentation: 'hearing',
    overwhelm: 'seeing',
    somatic: 'breathing'
  };

  // Calculate confidence based on pattern clarity
  const confidence = Math.min(0.95, 0.5 + (detectedPatterns.length * 0.1) + (totalWeight * 0.02));

  // Generate reasoning
  const reasoning = generateDistressReasoning(
    distressLevel,
    primaryCategory,
    detectedPatterns.length,
    speechIndicators
  );

  if (debug) {
    console.log('\n📊 DISTRESS ASSESSMENT:');
    console.log(`  Level: ${distressLevel}/10`);
    console.log(`  Category: ${primaryCategory}`);
    console.log(`  Total weight: ${totalWeight}`);
    console.log(`  Patterns found: ${detectedPatterns.length}`);
    console.log(`  Confidence: ${(confidence * 100).toFixed(1)}%`);
    console.log(`  Grounding needed: ${distressLevel >= 7 ? 'YES' : 'NO'}`);
    console.log('=== END DISTRESS DETECTION ===\n');
  }

  return {
    level: distressLevel,
    category: primaryCategory,
    triggers: detectedPatterns.map(p => p.match).slice(0, 3), // Top 3 triggers
    requiresGrounding: distressLevel >= 7,
    suggestedModality: modalityMap[primaryCategory],
    confidence,
    reasoning
  };
}

/**
 * Generate clinical reasoning for distress assessment
 */
function generateDistressReasoning(
  level: number,
  category: string,
  patternCount: number,
  speechIndicators: string[]
): string {
  if (level === 0) {
    return 'No significant distress indicators detected';
  }

  let reasoning = `Distress level ${level}/10 detected. `;

  // Category-specific reasoning
  const categoryReasons: Record<string, string> = {
    panic: 'User showing acute anxiety symptoms with physiological activation',
    dissociation: 'User experiencing disconnection from reality or self',
    fragmentation: 'User exhibiting cognitive fragmentation and disorganized thinking',
    overwhelm: 'User experiencing system overload and reduced coping capacity',
    somatic: 'User reporting significant physical distress symptoms'
  };

  reasoning += categoryReasons[category] || 'User showing elevated distress';

  if (patternCount > 5) {
    reasoning += ', with multiple converging indicators';
  }

  if (speechIndicators.length > 0) {
    reasoning += ` and speech pattern disruptions (${speechIndicators.join(', ')})`;
  }

  if (level >= 7) {
    reasoning += '. Immediate grounding intervention recommended';
  } else if (level >= 5) {
    reasoning += '. Monitor for escalation';
  }

  return reasoning;
}

/**
 * Determine if HSFB intervention should be triggered
 */
export function shouldTriggerHSFB(
  assessment: DistressAssessment,
  previousAssessments: DistressAssessment[] = []
): boolean {
  // Immediate trigger for high distress
  if (assessment.level >= 7) {
    return true;
  }

  // Trigger if distress is escalating
  if (previousAssessments.length > 0) {
    const lastAssessment = previousAssessments[previousAssessments.length - 1];
    if (assessment.level > lastAssessment.level && assessment.level >= 5) {
      return true;
    }

    // Trigger if sustained moderate distress
    const recentHighDistress = previousAssessments
      .slice(-3)
      .filter(a => a.level >= 5).length;
    if (recentHighDistress >= 2 && assessment.level >= 5) {
      return true;
    }
  }

  // Specific categories that benefit from early intervention
  if (assessment.category === 'dissociation' && assessment.level >= 5) {
    return true;
  }

  if (assessment.category === 'panic' && assessment.level >= 6) {
    return true;
  }

  return false;
}

/**
 * Generate HSFB intervention prompt based on distress type
 */
export function generateHSFBPrompt(assessment: DistressAssessment): string {
  const prompts: Record<string, string> = {
    panic: `I notice you're experiencing some intense sensations right now. Let's pause together and focus on your breathing. 
           Place one hand on your chest and one on your stomach. We'll breathe slowly together - 
           in through your nose for 4 counts, feeling your stomach expand... hold for 2... 
           and out through your mouth for 6, letting your stomach gently fall.`,

    dissociation: `I can see things feel disconnected right now. Let's ground together. 
                   Can you tell me 5 things you can see around you? Now 4 things you can touch? 
                   3 things you can hear? 2 things you can smell? And 1 thing you can taste? 
                   This helps bring us back to the present moment.`,

    fragmentation: `Your thoughts seem to be moving very quickly. Let's slow down together. 
                    First, let's take three deep breaths. Now, can you describe what you're 
                    hearing right now - both outside sounds and any internal dialogue? 
                    We'll work with one thought at a time.`,

    overwhelm: `Everything feels like too much right now. Let's create some space. 
                Close your eyes if that feels comfortable. Imagine you're looking at all 
                these feelings from a distance, like clouds passing in the sky. 
                They're there, but you don't have to hold them all at once.`,

    somatic: `Your body is telling us something important. Let's listen together. 
              Starting at the top of your head, slowly scan down through your body. 
              Where do you notice tension? Where do you notice ease? 
              Let's breathe into the tense areas, imagining the breath bringing softness.`
  };

  return prompts[assessment.category] || prompts.fragmentation;
}

/**
 * Track HSFB intervention results
 */
export interface HSFBIntervention {
  userId: string;
  callId: string;
  triggerType: 'distress_detected' | 'user_requested' | 'agent_suggested';
  preAssessment: DistressAssessment;
  postAssessment?: DistressAssessment;
  interventionPrompt: string;
  startTime: Date;
  endTime?: Date;
  modalityFocus: 'hearing' | 'seeing' | 'feeling' | 'breathing';
  effectiveness?: number; // 1-10 scale
}

/**
 * Calculate intervention effectiveness
 */
export function calculateInterventionEffectiveness(
  preAssessment: DistressAssessment,
  postAssessment: DistressAssessment
): number {
  const levelReduction = preAssessment.level - postAssessment.level;
  const maxPossibleReduction = preAssessment.level - 1;

  if (maxPossibleReduction <= 0) return 10;

  const effectiveness = Math.round((levelReduction / maxPossibleReduction) * 10);
  return Math.max(1, Math.min(10, effectiveness));
}

// Export for testing
export const testExports = {
  DISTRESS_PATTERNS,
  SPEECH_FRAGMENTATION_INDICATORS
};