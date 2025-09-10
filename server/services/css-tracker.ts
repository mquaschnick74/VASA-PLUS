/**
 * CSS (Conversational State Sensing) Tracker Module
 * Unified pipeline for pattern detection, normalization, aggregation, and persistence
 */

import { createHash } from 'crypto';
import { 
  PatternCategory, 
  CSSStage, 
  EmotionalIntensity,
  PatternEvent, 
  CriticalLifeEvent,
  CSSSessionState,
  StageTransitionRule,
  PatternDetectionResult
} from '../../shared/schema';
import { detectEnhancedCSSPatterns } from './css-pattern-service';
import { detectLiteraryPatterns, normalizeLiteraryPatterns, shouldActivateZhanna } from './literary-patterns';
import { supabase } from './supabase-service';

// Stage transition rules with hysteresis
const STAGE_TRANSITION_RULES: StageTransitionRule[] = [
  // Safety/Crisis always takes priority
  {
    from: CSSStage.POINTED_ORIGIN,
    to: CSSStage.FOCUS_BIND,
    requiredEvidence: 2,
    dwellTime: 10,
    priority: 10,
    condition: (state) => state.hasWarningFlags || state.emotionalIntensity === 'critical'
  },
  // Grief patterns fast-track to suspension
  {
    from: CSSStage.POINTED_ORIGIN,
    to: CSSStage.SUSPENSION,
    requiredEvidence: 1,
    dwellTime: 5,
    priority: 9,
    condition: (state) => state.patternCounts[PatternCategory.GRIEF] > 0
  },
  // Normal progression: pointed_origin -> focus_bind
  {
    from: CSSStage.POINTED_ORIGIN,
    to: CSSStage.FOCUS_BIND,
    requiredEvidence: 3,
    dwellTime: 30,
    priority: 5,
    condition: (state) => 
      state.patternCounts[PatternCategory.CVDC] >= 2 || 
      state.patternCounts[PatternCategory.IBM] >= 2
  },
  // focus_bind -> suspension
  {
    from: CSSStage.FOCUS_BIND,
    to: CSSStage.SUSPENSION,
    requiredEvidence: 4,
    dwellTime: 60,
    priority: 5,
    condition: (state) => 
      state.patternCounts[PatternCategory.CVDC] >= 3 && 
      state.patternCounts[PatternCategory.IBM] >= 2
  },
  // suspension -> gesture_toward
  {
    from: CSSStage.SUSPENSION,
    to: CSSStage.GESTURE_TOWARD,
    requiredEvidence: 2,
    dwellTime: 45,
    priority: 5,
    condition: (state) => state.patternCounts[PatternCategory.THEND] >= 1
  },
  // gesture_toward -> completion
  {
    from: CSSStage.GESTURE_TOWARD,
    to: CSSStage.COMPLETION,
    requiredEvidence: 3,
    dwellTime: 60,
    priority: 5,
    condition: (state) => 
      state.patternCounts[PatternCategory.THEND] >= 2 || 
      state.patternCounts[PatternCategory.CYVC] >= 2
  },
  // completion -> terminal
  {
    from: CSSStage.COMPLETION,
    to: CSSStage.TERMINAL,
    requiredEvidence: 2,
    dwellTime: 90,
    priority: 5,
    condition: (state) => state.patternCounts[PatternCategory.CYVC] >= 3
  }
];

// Pattern priority hierarchy for triage
const PATTERN_PRIORITY: Record<PatternCategory, number> = {
  [PatternCategory.SAFETY]: 100,
  [PatternCategory.GRIEF]: 90,
  [PatternCategory.SPIRITUAL_CRISIS]: 88,     // Loss of meaning - needs grounding
  [PatternCategory.MORAL_TORMENT]: 85,        // High priority - severe distress
  [PatternCategory.AMBITION_GUILT]: 83,       // Macbeth cycle - somatic symptoms
  [PatternCategory.SOMATIC]: 80,
  [PatternCategory.DOUBLE_CONSCIOUSNESS]: 75, // Split psyche - contradictions
  [PatternCategory.CVDC]: 70,
  [PatternCategory.IBM]: 70,
  [PatternCategory.IDENTITY_CRISIS]: 68,      // Hamlet paralysis
  [PatternCategory.EXISTENTIAL]: 65,          // Existential crisis
  [PatternCategory.AUTHENTIC_LIVING]: 63,     // Ivan Ilyich - wasted life
  [PatternCategory.EPISTEMIC_DOUBT]: 62,      // Deep confusion
  [PatternCategory.KAFKA_ALIENATION]: 60,     // Alienation
  [PatternCategory.THEND]: 60,
  [PatternCategory.SELF_DECEPTION]: 58,       // Austen - false beliefs
  [PatternCategory.SOCIAL_MASKING]: 55,       // Identity issues
  [PatternCategory.TRANSFORMATION_ARC]: 53,   // Ready for change
  [PatternCategory.CYVC]: 50,
  [PatternCategory.REDEMPTION_SEEKING]: 48,   // Seeking transformation
  [PatternCategory.VIRTUE_SEEKING]: 45,       // Philosophical exploration
  [PatternCategory.APORIA]: 43,               // Productive confusion
  [PatternCategory.NARRATIVE]: 40
};

// Session state cache
const sessionStates = new Map<string, CSSSessionState>();

// Batch write queue for persistence
interface WriteQueueItem {
  sessionId: string;
  patterns: PatternEvent[];
  criticalEvents: CriticalLifeEvent[];
  timestamp: Date;
}

const writeQueue: WriteQueueItem[] = [];
let writeTimer: NodeJS.Timeout | null = null;

/**
 * Main entry point for processing transcript events
 */
export async function processTranscriptEvent(
  userId: string,
  callId: string,
  transcript: string,
  role: 'user' | 'assistant',
  metadata?: {
    agentName?: string;
    assistantMeta?: any;
  }
): Promise<PatternDetectionResult> {
  const sessionKey = `${userId}:${callId}`;
  
  // 1. DETECT - Run pattern detection
  const heuristicPatterns = detectEnhancedCSSPatterns(transcript, false);
  const literaryPatternsRaw = detectLiteraryPatterns(transcript, false);
  
  // 2. NORMALIZE - Convert to unified PatternEvent format
  const normalizedPatterns = normalizePatterns(heuristicPatterns, role);
  const literaryPatterns = normalizeLiteraryPatterns(literaryPatternsRaw, transcript);
  
  // Combine all patterns
  normalizedPatterns.push(...literaryPatterns);
  
  // 3. AGGREGATE - Update session state
  const sessionState = aggregatePatterns(sessionKey, normalizedPatterns, userId, callId);
  
  // 4. EVALUATE - Check stage transitions with hysteresis
  evaluateStageTransition(sessionState);
  
  // 5. EXTRACT - Critical life events
  const criticalEvents = extractCriticalEvents(transcript, normalizedPatterns, userId, callId);
  if (criticalEvents.length > 0) {
    sessionState.criticalEvents.push(...criticalEvents);
  }
  
  // 6. PERSIST - Queue for batched writing
  queueForPersistence(sessionKey, normalizedPatterns, criticalEvents);
  
  // 7. NOTIFY - Generate recommendations
  const result: PatternDetectionResult = {
    patterns: normalizedPatterns,
    sessionState,
    suggestedAgent: determineSuggestedAgent(sessionState),
    agentSwitchConfidence: calculateAgentSwitchConfidence(sessionState),
    guidanceRecommendations: generateGuidance(sessionState)
  };
  
  return result;
}

/**
 * Normalize raw patterns to unified PatternEvent format
 */
function normalizePatterns(rawPatterns: any, role: 'user' | 'assistant'): PatternEvent[] {
  const normalized: PatternEvent[] = [];
  const timestamp = new Date();
  
  // Helper to create PatternEvent
  const createEvent = (
    category: PatternCategory, 
    pattern: any,
    metadata?: any
  ): PatternEvent => ({
    category,
    text: pattern.text || pattern,
    intensity: pattern.intensity || assessIntensity(pattern.text || pattern),
    confidence: pattern.confidence || 0.7,
    timestamp,
    source: role === 'assistant' ? 'assistant_meta' : 'heuristic',
    metadata,
    hasWarningFlag: pattern.hasWarningFlag || false,
    contentHash: generateContentHash(pattern.text || pattern)
  });
  
  // Process each pattern type
  if (rawPatterns.cvdcPatterns?.length > 0) {
    rawPatterns.cvdcPatterns.forEach((p: any) => {
      normalized.push(createEvent(PatternCategory.CVDC, p, {
        contradiction: p.contradiction || p.text
      }));
    });
  }
  
  if (rawPatterns.ibmPatterns?.length > 0) {
    rawPatterns.ibmPatterns.forEach((p: any) => {
      normalized.push(createEvent(PatternCategory.IBM, p, {
        behaviorGap: p.behaviorGap || p.text
      }));
    });
  }
  
  if (rawPatterns.thendIndicators?.length > 0) {
    rawPatterns.thendIndicators.forEach((p: any) => {
      normalized.push(createEvent(PatternCategory.THEND, p));
    });
  }
  
  if (rawPatterns.cyvcPatterns?.length > 0) {
    rawPatterns.cyvcPatterns.forEach((p: any) => {
      normalized.push(createEvent(PatternCategory.CYVC, p));
    });
  }
  
  if (rawPatterns.griefPatterns?.length > 0) {
    rawPatterns.griefPatterns.forEach((p: any) => {
      const petNameMatch = p.text.match(/\b([A-Z]\w+)\b(?=.*(?:pet|dog|cat|animal))/i);
      normalized.push(createEvent(PatternCategory.GRIEF, p, {
        petName: petNameMatch ? petNameMatch[1] : undefined
      }));
    });
  }
  
  if (rawPatterns.somaticPatterns?.length > 0) {
    rawPatterns.somaticPatterns.forEach((p: any) => {
      normalized.push(createEvent(PatternCategory.SOMATIC, p, {
        somaticLocation: extractBodyLocation(p.text)
      }));
    });
  }
  
  // Add narrative fragmentation as a pattern if high
  if (rawPatterns.narrativeFragmentation && rawPatterns.narrativeFragmentation > 6) {
    normalized.push({
      category: PatternCategory.NARRATIVE,
      text: 'High narrative fragmentation detected',
      intensity: rawPatterns.narrativeFragmentation > 8 ? 'high' : 'medium',
      confidence: 0.8,
      timestamp,
      source: 'heuristic',
      metadata: {
        narrativeFragmentation: rawPatterns.narrativeFragmentation,
        symbolicDensity: rawPatterns.symbolicDensity,
        temporalOrientation: rawPatterns.temporalOrientation
      }
    });
  }
  
  return normalized;
}

/**
 * Aggregate patterns into session state
 */
function aggregatePatterns(
  sessionKey: string,
  patterns: PatternEvent[],
  userId: string,
  callId: string
): CSSSessionState {
  let state = sessionStates.get(sessionKey);
  
  if (!state) {
    // Initialize new session state
    state = {
      currentStage: CSSStage.POINTED_ORIGIN,
      stageEvidenceCount: 0,
      emotionalIntensity: 'low',
      patternCounts: {
        [PatternCategory.CVDC]: 0,
        [PatternCategory.IBM]: 0,
        [PatternCategory.THEND]: 0,
        [PatternCategory.CYVC]: 0,
        [PatternCategory.GRIEF]: 0,
        [PatternCategory.SOMATIC]: 0,
        [PatternCategory.SAFETY]: 0,
        [PatternCategory.NARRATIVE]: 0,
        [PatternCategory.EXISTENTIAL]: 0,
        [PatternCategory.MORAL_TORMENT]: 0,
        [PatternCategory.EPISTEMIC_DOUBT]: 0,
        [PatternCategory.KAFKA_ALIENATION]: 0,
        [PatternCategory.SOCIAL_MASKING]: 0
      },
      recentPatterns: [],
      criticalEvents: [],
      hasWarningFlags: false,
      lastAnalysisTime: new Date()
    };
    sessionStates.set(sessionKey, state);
  }
  
  // Update pattern counts
  patterns.forEach(pattern => {
    state!.patternCounts[pattern.category]++;
    state!.recentPatterns.push(pattern);
    
    // Check for warning flags
    if (pattern.hasWarningFlag) {
      state!.hasWarningFlags = true;
    }
  });
  
  // Keep only recent patterns (last 50)
  if (state.recentPatterns.length > 50) {
    state.recentPatterns = state.recentPatterns.slice(-50);
  }
  
  // Update emotional intensity
  state.emotionalIntensity = calculateEmotionalIntensity(state);
  state.lastAnalysisTime = new Date();
  
  return state;
}

/**
 * Evaluate stage transitions with hysteresis
 */
function evaluateStageTransition(state: CSSSessionState): void {
  const currentTime = new Date();
  
  // Check applicable transition rules
  const applicableRules = STAGE_TRANSITION_RULES
    .filter(rule => rule.from === state.currentStage)
    .sort((a, b) => b.priority - a.priority);
  
  for (const rule of applicableRules) {
    // Check dwell time if we have a transition time
    if (state.stageTransitionTime) {
      const dwellSeconds = (currentTime.getTime() - state.stageTransitionTime.getTime()) / 1000;
      if (rule.dwellTime && dwellSeconds < rule.dwellTime) {
        continue; // Not enough dwell time
      }
    }
    
    // Check if condition is met
    if (rule.condition(state)) {
      state.stageEvidenceCount++;
      
      // Check if we have enough evidence
      if (state.stageEvidenceCount >= rule.requiredEvidence) {
        // Transition!
        console.log(`🎯 CSS Stage transition: ${state.currentStage} → ${rule.to}`);
        state.previousStage = state.currentStage;
        state.currentStage = rule.to;
        state.stageTransitionTime = currentTime;
        state.stageEvidenceCount = 0;
        break;
      }
    }
  }
}

/**
 * Extract critical life events from patterns
 */
function extractCriticalEvents(
  transcript: string,
  patterns: PatternEvent[],
  userId: string,
  callId: string
): CriticalLifeEvent[] {
  const events: CriticalLifeEvent[] = [];
  
  // Check grief patterns for pet names
  patterns
    .filter(p => p.category === PatternCategory.GRIEF)
    .forEach(pattern => {
      if (pattern.metadata?.petName) {
        events.push({
          type: 'pet_loss',
          entityName: pattern.metadata.petName,
          content: pattern.text,
          importance: 9,
          detectedAt: new Date(),
          userId,
          callId
        });
      }
    });
  
  // Check for other critical phrases
  const criticalPhrases = [
    { pattern: /divorce|separated|breaking up/i, type: 'divorce' as const },
    { pattern: /fired|laid off|lost.*job/i, type: 'job_loss' as const },
    { pattern: /diagnosis|cancer|terminal/i, type: 'health_crisis' as const }
  ];
  
  criticalPhrases.forEach(({ pattern, type }) => {
    if (pattern.test(transcript)) {
      const match = transcript.match(pattern);
      if (match) {
        events.push({
          type,
          content: match[0],
          importance: 8,
          detectedAt: new Date(),
          userId,
          callId
        });
      }
    }
  });
  
  return events;
}

/**
 * Queue patterns for batched persistence
 */
function queueForPersistence(
  sessionId: string,
  patterns: PatternEvent[],
  criticalEvents: CriticalLifeEvent[]
): void {
  writeQueue.push({
    sessionId,
    patterns,
    criticalEvents,
    timestamp: new Date()
  });
  
  // Set up batch write timer (write every 10 seconds or 100 patterns)
  if (!writeTimer || writeQueue.length >= 100) {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(flushWriteQueue, 10000);
  }
}

/**
 * Flush write queue to database
 */
async function flushWriteQueue(): Promise<void> {
  if (writeQueue.length === 0) return;
  
  const itemsToWrite = [...writeQueue];
  writeQueue.length = 0;
  
  try {
    // Deduplicate by content hash
    const uniquePatterns = new Map<string, PatternEvent>();
    const uniqueEvents = new Map<string, CriticalLifeEvent>();
    
    itemsToWrite.forEach(item => {
      item.patterns.forEach(p => {
        if (p.contentHash && !uniquePatterns.has(p.contentHash)) {
          uniquePatterns.set(p.contentHash, p);
        }
      });
      
      item.criticalEvents.forEach(e => {
        const key = `${e.type}:${e.entityName || e.content}`;
        if (!uniqueEvents.has(key)) {
          uniqueEvents.set(key, e);
        }
      });
    });
    
    // Batch insert patterns
    if (uniquePatterns.size > 0) {
      // Get userId and callId from the first item's sessionId
      const firstItem = itemsToWrite[0];
      const [userId, callId] = firstItem.sessionId.split(':');
      
      const patternInserts = Array.from(uniquePatterns.values()).map(p => {
        return {
          user_id: userId,
          call_id: callId,
          pattern_type: p.category,
          content: p.text,
          confidence: p.confidence,
          emotional_intensity: p.intensity,
          safety_flag: p.hasWarningFlag || false,
          narrative_fragmentation: p.metadata?.narrativeFragmentation || 0,
          symbolic_density: p.metadata?.symbolicDensity || 0,
          temporal_orientation: p.metadata?.temporalOrientation || 'present',
          detected_at: p.timestamp
        };
      });
      
      await supabase.from('css_patterns').insert(patternInserts);
    }
    
    // Batch insert critical events
    if (uniqueEvents.size > 0) {
      const eventInserts = Array.from(uniqueEvents.values()).map(e => ({
        user_id: e.userId,
        call_id: e.callId,
        context_type: e.type,
        content: `${e.entityName ? `${e.entityName}: ` : ''}${e.content}`,
        importance: e.importance,
        pattern_type: 'CRITICAL_LIFE_EVENT',
        confidence: 0.9
      }));
      
      await supabase.from('therapeutic_context').insert(eventInserts);
    }
    
    console.log(`✅ Flushed ${uniquePatterns.size} patterns and ${uniqueEvents.size} events to database`);
  } catch (error) {
    console.error('Error flushing write queue:', error);
  }
  
  writeTimer = null;
}

/**
 * Helper functions
 */

function generateContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function assessIntensity(text: string): EmotionalIntensity {
  const highIntensityWords = /dying|death|suicide|crisis|emergency|panic|terror/i;
  const mediumIntensityWords = /anxious|scared|worried|struggling|overwhelmed|confused/i;
  
  if (highIntensityWords.test(text)) return 'high';
  if (mediumIntensityWords.test(text)) return 'medium';
  return 'low';
}

function extractBodyLocation(text: string): string | undefined {
  const bodyParts = /chest|heart|stomach|head|throat|shoulders|back|neck/i;
  const match = text.match(bodyParts);
  return match ? match[0].toLowerCase() : undefined;
}

function calculateEmotionalIntensity(state: CSSSessionState): EmotionalIntensity {
  // Critical if warnings or high grief
  if (state.hasWarningFlags || state.patternCounts[PatternCategory.GRIEF] > 0) {
    return 'critical';
  }
  
  // High if many intense patterns
  const totalHighPatterns = state.recentPatterns.filter(p => 
    p.intensity === 'high' || p.intensity === 'critical'
  ).length;
  
  if (totalHighPatterns >= 5) return 'high';
  if (totalHighPatterns >= 2) return 'medium';
  
  return 'low';
}

function determineSuggestedAgent(state: CSSSessionState): string | undefined {
  // Priority 1: Zhanna for crisis/safety/spiritual crisis
  if (state.hasWarningFlags || 
      state.patternCounts[PatternCategory.SAFETY] > 0 ||
      state.patternCounts[PatternCategory.SPIRITUAL_CRISIS] >= 2 ||
      state.patternCounts[PatternCategory.MORAL_TORMENT] >= 2) {
    return 'zhanna';
  }
  
  // Priority 2: Zhanna for somatic-related patterns (ambition-guilt when somatic symptoms present)
  if (state.patternCounts[PatternCategory.SOMATIC] >= 2 ||
      (state.patternCounts[PatternCategory.AMBITION_GUILT] >= 2 && state.patternCounts[PatternCategory.SOMATIC] > 0)) {
    return 'zhanna';
  }
  
  // Priority 3: Zhanna for other critical literary patterns
  const literaryPatterns = {
    existentialPatterns: Array(state.patternCounts[PatternCategory.EXISTENTIAL]).fill({}),
    moralTormentPatterns: Array(state.patternCounts[PatternCategory.MORAL_TORMENT]).fill({}),
    epistemicPatterns: Array(state.patternCounts[PatternCategory.EPISTEMIC_DOUBT]).fill({}),
    kafkaPatterns: Array(state.patternCounts[PatternCategory.KAFKA_ALIENATION]).fill({}),
    socialMaskingPatterns: Array(state.patternCounts[PatternCategory.SOCIAL_MASKING]).fill({}),
    doubleConsciousnessPatterns: Array(state.patternCounts[PatternCategory.DOUBLE_CONSCIOUSNESS]).fill({}),
    redemptionSeekingPatterns: Array(state.patternCounts[PatternCategory.REDEMPTION_SEEKING]).fill({}),
    spiritualCrisisPatterns: Array(state.patternCounts[PatternCategory.SPIRITUAL_CRISIS]).fill({}),
    aporiaPatterns: Array(state.patternCounts[PatternCategory.APORIA]).fill({}),
    virtueSeekingPatterns: Array(state.patternCounts[PatternCategory.VIRTUE_SEEKING]).fill({}),
    transformationArcPatterns: Array(state.patternCounts[PatternCategory.TRANSFORMATION_ARC]).fill({}),
    authenticLivingPatterns: Array(state.patternCounts[PatternCategory.AUTHENTIC_LIVING]).fill({}),
    identityCrisisPatterns: Array(state.patternCounts[PatternCategory.IDENTITY_CRISIS]).fill({}),
    ambitionGuiltPatterns: Array(state.patternCounts[PatternCategory.AMBITION_GUILT]).fill({}),
    selfDeceptionPatterns: Array(state.patternCounts[PatternCategory.SELF_DECEPTION]).fill({})
  };
  
  // Use the literary patterns module's logic for Zhanna activation
  if (shouldActivateZhanna(literaryPatterns)) {
    return 'zhanna';
  }
  
  // Priority 4: Sarah for contradictions and split psyche
  if (state.patternCounts[PatternCategory.CVDC] >= 3 ||
      state.patternCounts[PatternCategory.DOUBLE_CONSCIOUSNESS] >= 2 ||
      state.patternCounts[PatternCategory.SELF_DECEPTION] >= 2 ||
      (state.patternCounts[PatternCategory.TRANSFORMATION_ARC] >= 2 && 
       state.currentStage === CSSStage.POINTED_ORIGIN)) { // Early resistance phase
    return 'sarah';
  }
  
  // Priority 5: Mathew for analytical patterns
  if (state.patternCounts[PatternCategory.IBM] >= 3 ||
      state.patternCounts[PatternCategory.VIRTUE_SEEKING] >= 2 ||
      (state.patternCounts[PatternCategory.IDENTITY_CRISIS] >= 2 && 
       state.emotionalIntensity !== 'critical') || // Paralysis needs analysis when not in crisis
      (state.patternCounts[PatternCategory.APORIA] >= 2 && 
       state.patternCounts[PatternCategory.EPISTEMIC_DOUBT] > 0)) { // Confusion needs structure
    return 'mathew';
  }
  
  // Priority 6: Marcus for integration and transformation
  if (state.patternCounts[PatternCategory.THEND] >= 2 || 
      state.patternCounts[PatternCategory.CYVC] >= 2 ||
      state.patternCounts[PatternCategory.REDEMPTION_SEEKING] >= 2 ||
      state.patternCounts[PatternCategory.AUTHENTIC_LIVING] >= 2 ||
      (state.patternCounts[PatternCategory.TRANSFORMATION_ARC] >= 2 && 
       state.currentStage !== CSSStage.POINTED_ORIGIN)) { // Integration phase
    return 'marcus';
  }
  
  // Default to Sarah for initial exploration
  if (state.patternCounts[PatternCategory.GRIEF] > 0 ||
      state.emotionalIntensity === 'high') {
    return 'sarah';
  }
  
  return undefined;
}

function calculateAgentSwitchConfidence(state: CSSSessionState): number {
  const maxCount = Math.max(...Object.values(state.patternCounts));
  if (maxCount >= 5) return 0.9;
  if (maxCount >= 3) return 0.7;
  if (maxCount >= 2) return 0.5;
  return 0.3;
}

function generateGuidance(state: CSSSessionState): string[] {
  const guidance: string[] = [];
  
  if (state.patternCounts[PatternCategory.GRIEF] > 0) {
    guidance.push('User experiencing grief/loss. Respond with deep compassion and acknowledge specific names.');
  }
  
  if (state.patternCounts[PatternCategory.CVDC] >= 2) {
    guidance.push('Multiple contradictions detected. Help user hold both truths without resolution.');
  }
  
  if (state.patternCounts[PatternCategory.IBM] >= 2) {
    guidance.push('Intention-behavior gaps present. Explore what prevents desired actions.');
  }
  
  if (state.emotionalIntensity === 'critical') {
    guidance.push('High emotional intensity. Slow down and ensure user feels heard.');
  }
  
  return guidance;
}

// Export for cleanup
export async function flushAndCleanup(): Promise<void> {
  await flushWriteQueue();
  sessionStates.clear();
}