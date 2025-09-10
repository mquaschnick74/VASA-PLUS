/**
 * Literary Psychological Patterns Module
 * Patterns derived from classic literature for enhanced therapeutic detection
 */

import { 
  PatternCategory,
  PatternEvent,
  EmotionalIntensity
} from '../../shared/schema';

// Pattern type for consistency with existing system
export interface PatternMatch {
  pattern: string;
  confidence: number;
  index: number;
}

/**
 * Literary Pattern Arrays
 * Inspired by themes from classic literature
 */

// Existential Crisis - Camus, Sartre themes
export const EXISTENTIAL_CRISIS_PATTERNS = [
  /what('?s| is) the point (of|in)/gi,
  /nothing matters anymore/gi,
  /life has no (meaning|purpose)/gi,
  /why (should I|do I) even (try|bother|care)/gi,
  /everything feels (meaningless|pointless|empty)/gi,
  /I('?m| am) just going through the motions/gi,
  /existence feels (absurd|ridiculous|pointless)/gi,
  /there('?s| is) no reason (to|for)/gi,
  /what('?s| is) it all for/gi,
  /I('?m| am) (questioning|doubting) everything/gi,
  /the (absurdity|meaninglessness) of (it all|life|everything)/gi,
  /I feel like (sisyphus|I'm pushing a boulder)/gi
];

// Moral Torment - Dostoevsky themes
export const MORAL_TORMENT_PATTERNS = [
  /I deserve (this|punishment|suffering|pain)/gi,
  /can('?t| not) forgive myself/gi,
  /I('?m| am) (unforgivable|beyond redemption|damned)/gi,
  /the guilt is (eating|destroying|killing) me/gi,
  /I('?ve| have) done (terrible|unforgivable|horrible) things/gi,
  /I('?m| am) a (bad|terrible|horrible|evil) person/gi,
  /I should('?ve| have) (known|done) better/gi,
  /I('?m| am) (tormented|haunted) by what I('?ve| have) done/gi,
  /my conscience (won't|doesn't) let me rest/gi,
  /I can('?t| not) escape what I('?ve| have) done/gi,
  /the weight of my (sins|guilt|shame)/gi,
  /I('?m| am) (wrestling|struggling) with my conscience/gi
];

// Epistemic Doubt - Hume, Descartes themes
export const EPISTEMIC_DOUBT_PATTERNS = [
  /the more I (learn|know).*the less I (understand|know)/gi,
  /I('?m| am) (questioning|doubting) (reality|everything|my perceptions)/gi,
  /what if (nothing|none of this) is real/gi,
  /how (can|do) I know (anything|what's true)/gi,
  /I can('?t| not) trust my (thoughts|perceptions|senses|mind)/gi,
  /everything I (believed|thought I knew) is (wrong|false|uncertain)/gi,
  /I('?m| am) (lost|drowning) in (uncertainty|doubt)/gi,
  /maybe I('?m| am) (wrong|mistaken) about everything/gi,
  /I don't know what('?s| is) (real|true) anymore/gi,
  /my (mind|thoughts) (betray|trick|deceive) me/gi,
  /I('?m| am) (trapped|stuck) in my own (mind|thoughts)/gi,
  /the ground beneath me (shifts|changes|disappears)/gi
];

// Kafka Alienation themes
export const KAFKA_ALIENATION_PATTERNS = [
  /no one understands what I('?m| am) going through/gi,
  /I('?m| am) (trapped|stuck) in a (system|world) I don('?t| not) understand/gi,
  /everything feels (foreign|alien|strange) to me/gi,
  /I('?m| am) (invisible|unseen|unheard)/gi,
  /the rules (don't|never) make sense/gi,
  /I('?m| am) (lost|drowning) in (bureaucracy|systems|procedures)/gi,
  /I feel like an (outsider|stranger|alien)/gi,
  /I don('?t| not) belong (here|anywhere)/gi,
  /the world is (indifferent|hostile|cold) to me/gi,
  /I('?m| am) (screaming|shouting) but no one hears/gi,
  /everyone else seems to (know|understand) except me/gi,
  /I('?m| am) (transformed|changing) into something I don('?t| not) recognize/gi
];

// Social Masking - Pessoa themes
export const SOCIAL_MASKING_PATTERNS = [
  /I (have to|must) pretend to be/gi,
  /I('?m| am) (wearing|hiding behind) a mask/gi,
  /no one knows the real me/gi,
  /I('?m| am) (performing|acting|playing a role)/gi,
  /I('?ve| have) (different|multiple) (selves|personas|faces)/gi,
  /the person they see isn('?t| is not) (me|real)/gi,
  /I('?m| am) (exhausted|tired) from (pretending|acting|performing)/gi,
  /I (show|present) different versions of myself/gi,
  /I('?m| am) a (fraud|fake|imposter)/gi,
  /I('?ve| have) forgotten who I (really|actually) am/gi,
  /which (self|version|me) is (real|true)/gi,
  /I('?m| am) (fragmented|split|divided) into (pieces|parts)/gi
];

/**
 * Detect a specific category of literary patterns
 */
function detectPatternCategory(
  transcript: string,
  patterns: RegExp[],
  debug: boolean = false
): PatternMatch[] {
  const matches: PatternMatch[] = [];
  
  patterns.forEach((pattern, index) => {
    const match = transcript.match(pattern);
    if (match) {
      matches.push({
        pattern: match[0],
        confidence: 0.8, // Base confidence for literary patterns
        index
      });
      
      if (debug) {
        console.log(`[Literary Pattern] Matched: ${match[0]} (Pattern #${index})`);
      }
    }
  });
  
  return matches;
}

/**
 * Main detection function for all literary patterns
 */
export function detectLiteraryPatterns(
  transcript: string,
  debug: boolean = false
): Record<string, PatternMatch[]> {
  const results = {
    existentialPatterns: detectPatternCategory(transcript, EXISTENTIAL_CRISIS_PATTERNS, debug),
    moralTormentPatterns: detectPatternCategory(transcript, MORAL_TORMENT_PATTERNS, debug),
    epistemicPatterns: detectPatternCategory(transcript, EPISTEMIC_DOUBT_PATTERNS, debug),
    kafkaPatterns: detectPatternCategory(transcript, KAFKA_ALIENATION_PATTERNS, debug),
    socialMaskingPatterns: detectPatternCategory(transcript, SOCIAL_MASKING_PATTERNS, debug)
  };
  
  if (debug) {
    const totalPatterns = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`[Literary Patterns] Total detected: ${totalPatterns}`);
  }
  
  return results;
}

/**
 * Convert literary patterns to normalized PatternEvents
 */
export function normalizeLiteraryPatterns(
  patterns: Record<string, PatternMatch[]>,
  transcript: string
): PatternEvent[] {
  const events: PatternEvent[] = [];
  const timestamp = new Date();
  
  // Process existential patterns
  patterns.existentialPatterns?.forEach(match => {
    events.push({
      category: PatternCategory.EXISTENTIAL,
      text: match.pattern,
      intensity: 'high' as EmotionalIntensity, // Existential crisis usually high intensity
      confidence: match.confidence,
      timestamp,
      source: 'heuristic',
      metadata: {
        narrativeFragmentation: 0.7,
        temporalOrientation: 'present'
      }
    });
  });
  
  // Process moral torment patterns
  patterns.moralTormentPatterns?.forEach(match => {
    events.push({
      category: PatternCategory.MORAL_TORMENT,
      text: match.pattern,
      intensity: 'critical' as EmotionalIntensity, // Moral torment is critical
      confidence: match.confidence,
      timestamp,
      source: 'heuristic',
      metadata: {
        narrativeFragmentation: 0.8,
        temporalOrientation: 'past'
      }
    });
  });
  
  // Process epistemic doubt patterns
  patterns.epistemicPatterns?.forEach(match => {
    events.push({
      category: PatternCategory.EPISTEMIC_DOUBT,
      text: match.pattern,
      intensity: 'high' as EmotionalIntensity,
      confidence: match.confidence,
      timestamp,
      source: 'heuristic',
      metadata: {
        narrativeFragmentation: 0.9,
        symbolicDensity: 8
      }
    });
  });
  
  // Process Kafka alienation patterns
  patterns.kafkaPatterns?.forEach(match => {
    events.push({
      category: PatternCategory.KAFKA_ALIENATION,
      text: match.pattern,
      intensity: 'high' as EmotionalIntensity,
      confidence: match.confidence,
      timestamp,
      source: 'heuristic',
      metadata: {
        narrativeFragmentation: 0.85,
        temporalOrientation: 'present'
      }
    });
  });
  
  // Process social masking patterns
  patterns.socialMaskingPatterns?.forEach(match => {
    events.push({
      category: PatternCategory.SOCIAL_MASKING,
      text: match.pattern,
      intensity: 'medium' as EmotionalIntensity,
      confidence: match.confidence,
      timestamp,
      source: 'heuristic',
      metadata: {
        narrativeFragmentation: 0.75,
        symbolicDensity: 7
      }
    });
  });
  
  return events;
}

/**
 * Determine if literary patterns suggest Zhanna agent activation
 */
export function shouldActivateZhanna(patterns: Record<string, PatternMatch[]>): boolean {
  const existentialCount = patterns.existentialPatterns?.length || 0;
  const moralCount = patterns.moralTormentPatterns?.length || 0;
  const epistemicCount = patterns.epistemicPatterns?.length || 0;
  const kafkaCount = patterns.kafkaPatterns?.length || 0;
  
  // Zhanna triggers on significant literary pattern presence
  return (
    existentialCount >= 3 ||  // Multiple existential patterns
    moralCount >= 2 ||        // Moral torment requires immediate support
    epistemicCount >= 3 ||    // Deep epistemic confusion
    kafkaCount >= 2 ||        // Significant alienation
    (existentialCount + moralCount + epistemicCount + kafkaCount) >= 5  // Combined threshold
  );
}