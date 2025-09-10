// Enhanced Orchestration Service - CSS tracking with agent orchestration
import { 
  detectEnhancedCSSPatterns, 
  assessPatternConfidence,
  isSafeToSwitch,
  getTherapeuticPriority,
  type CSSPatterns,
  type CSSStage
} from './css-pattern-service';
import { supabase } from './supabase-service';
import { storeSessionContext } from './memory-service';
import { processTranscriptEvent, flushAndCleanup } from './css-tracker';
import { PatternCategory, CSSStage as UnifiedCSSStage, EmotionalIntensity } from '../../shared/schema';
import { parseAssistantOutput, extractCSSStage, needsSafetyIntervention, extractRegister } from '../utils/parseAssistantOutput';

// Pattern guidance interface for real-time awareness
interface PatternGuidance {
  pattern: string;
  count: number;
  suggestion: string;
  priority: 'low' | 'medium' | 'high';
}

interface SessionState {
  userId: string;
  callId: string;
  agentName: string;
  currentCSSStage: string;
  sessionStartTime: Date;
  processedTranscripts: Set<string>; // Track processed transcript hashes
}

// Enhanced session state with orchestration
interface EnhancedSessionState extends SessionState {
  agentSwitches: Array<{
    timestamp: Date;
    fromAgent: string;
    toAgent: string;
    reason: string;
  }>;
  suggestedAgent: string | null;
  // SEPARATE COOLDOWN TIMERS
  lastAgentSwitchTime: Date | null;  // For agent methodology changes (120s cooldown)
  lastGuidanceTime: Date | null;     // For pattern acknowledgment (5-10s cooldown)
  lastSuggestionTime: Date | null;   // Deprecated - kept for backward compatibility
  // NEW: Enhanced pattern tracking
  emotionalIntensity: 'low' | 'medium' | 'high' | 'critical';
  hasActiveWarnings: boolean;
  lastPatternAnalysis: Date | null;
  recentPatternCounts: {
    cvdc: number;
    ibm: number;
    thend: number;
    cyvc: number;
    grief: number;
    somatic?: number;
  };
  // NEW: Real-time guidance tracking
  guidanceApplied: string[];
  naturalGuidance: string[];  // Natural language guidance for current patterns
}

// Two-tier cache system with enhanced state
const activeSessions = new Map<string, EnhancedSessionState>();
const checkedSessions = new Set<string>(); // Track which sessions we've already checked in DB
const initializationLocks = new Map<string, Promise<EnhancedSessionState | null>>(); // Prevent race conditions

// Map temporary IDs to real call IDs
const tempIdMapping = new Map<string, string>();

// Cleanup stale sessions every 30 minutes
setInterval(() => {
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  const staleCallIds: string[] = [];
  
  activeSessions.forEach((session, callId) => {
    if (session.sessionStartTime.getTime() < twoHoursAgo) {
      staleCallIds.push(callId);
    }
  });
  
  staleCallIds.forEach(callId => {
    console.log(`🧹 Cleaning up stale session: ${callId}`);
    activeSessions.delete(callId);
    checkedSessions.delete(callId);
  });
}, 30 * 60 * 1000);

/**
 * Ensures a session exists, initializing if necessary
 * Handles server restarts and missing call-started events efficiently
 */
export async function ensureSession(
  callId: string,
  userId?: string,
  agentName?: string
): Promise<EnhancedSessionState | null> {
  // Fast path: already active
  if (activeSessions.has(callId)) {
    return activeSessions.get(callId)!;
  }
  
  // If initialization is already in progress, wait for it
  if (initializationLocks.has(callId)) {
    return await initializationLocks.get(callId)!;
  }
  
  // Start initialization with lock
  const initPromise = ensureSessionInternal(callId, userId, agentName);
  initializationLocks.set(callId, initPromise);
  
  try {
    const result = await initPromise;
    return result;
  } finally {
    initializationLocks.delete(callId);
  }
}

async function ensureSessionInternal(
  callId: string,
  userId?: string,
  agentName?: string
): Promise<EnhancedSessionState | null> {
  // Avoid repeated DB checks for non-existent sessions
  if (checkedSessions.has(callId)) {
    console.log(`⚠️ Session ${callId} already checked, not found in DB`);
    return null;
  }
  
  // Mark as checked
  checkedSessions.add(callId);
  
  // Check database once
  const { data: existing } = await supabase
    .from('therapeutic_sessions')
    .select('user_id, agent_name, start_time')
    .eq('call_id', callId)
    .single();
  
  if (existing) {
    console.log(`♻️ Restored session from DB: ${callId}`);
    // Restore to active sessions with enhanced state
    const session: EnhancedSessionState = {
      userId: existing.user_id,
      callId,
      agentName: existing.agent_name,
      currentCSSStage: 'pointed_origin',
      sessionStartTime: new Date(existing.start_time),
      processedTranscripts: new Set(),
      agentSwitches: [],
      suggestedAgent: null,
      lastAgentSwitchTime: null,
      lastGuidanceTime: null,
      lastSuggestionTime: null,
      // NEW fields
      emotionalIntensity: 'low',
      hasActiveWarnings: false,
      lastPatternAnalysis: null,
      recentPatternCounts: {
        cvdc: 0,
        ibm: 0,
        thend: 0,
        cyvc: 0,
        grief: 0,
        somatic: 0
      },
      guidanceApplied: [],
      naturalGuidance: []
    };
    activeSessions.set(callId, session);
    return session;
  }
  
  // Need userId to create new session
  if (!userId) {
    console.warn(`❌ Cannot create session ${callId}: no userId provided`);
    return null;
  }
  
  // Initialize new session
  console.log(`🆕 Creating new session: ${callId}`);
  return await initializeSession(userId, callId, agentName || 'sarah');
}

export async function initializeSession(
  userId: string,
  callId: string,
  agentName: string
): Promise<EnhancedSessionState> {
  const session: EnhancedSessionState = {
    userId,
    callId,
    agentName,
    currentCSSStage: 'pointed_origin',
    sessionStartTime: new Date(),
    processedTranscripts: new Set(),
    agentSwitches: [],
    suggestedAgent: null,
    lastAgentSwitchTime: null,
    lastGuidanceTime: null,
    lastSuggestionTime: null,
    // NEW fields
    emotionalIntensity: 'low',
    hasActiveWarnings: false,
    lastPatternAnalysis: null,
    recentPatternCounts: {
      cvdc: 0,
      ibm: 0,
      thend: 0,
      cyvc: 0,
      grief: 0,
      somatic: 0
    },
    guidanceApplied: [],
    naturalGuidance: []
  };

  activeSessions.set(callId, session);
  checkedSessions.add(callId); // Mark as checked/exists

  await supabase
    .from('therapeutic_sessions')
    .upsert({
      call_id: callId,
      user_id: userId,
      agent_name: agentName,
      status: 'active',
      start_time: new Date().toISOString()
    });

  console.log(`✅ Session initialized: ${callId} for user ${userId}`);
  return session;
}

export async function getSession(callId: string): Promise<EnhancedSessionState | undefined> {
  return activeSessions.get(callId);
}

export async function processTranscript(
  callId: string,
  transcript: string,
  role: string,
  userId?: string,
  agentName?: string
): Promise<void> {
  // Try to ensure session exists (defensive programming)
  let session = activeSessions.get(callId);
  
  if (!session && userId) {
    console.log(`🔧 Auto-initializing session from processTranscript for ${callId}`);
    const ensuredSession = await ensureSession(callId, userId, agentName);
    session = ensuredSession || undefined;
  }
  
  if (!session) {
    console.log(`⚠️ Cannot process transcript: no session for ${callId}`);
    return;
  }
  
  // Handle assistant messages with new speak/meta parsing
  if (role === 'assistant') {
    const parsed = parseAssistantOutput(transcript);
    
    // Extract CSS stage from metadata if available
    const metaStage = extractCSSStage(parsed.meta);
    if (metaStage && metaStage !== 'NONE') {
      session.currentCSSStage = metaStage.toLowerCase();
      console.log(`📊 Assistant meta CSS stage: ${metaStage}`);
    }
    
    // Store metadata in database if present
    if (parsed.meta) {
      await supabase
        .from('css_patterns')
        .insert({
          call_id: callId,
          stage: parsed.meta.css?.stage || 'NONE',
          register: parsed.meta.register || 'undetermined',
          confidence: parsed.meta.css?.confidence || 0,
          safety_flag: parsed.meta.safety?.flag || false,
          crisis_flag: parsed.meta.safety?.crisis || false,
          hsfb_invoked: parsed.meta.hsfb?.invoked || false,
          detected_at: new Date().toISOString()
        });
        
      // Check for safety interventions
      if (needsSafetyIntervention(parsed.meta)) {
        console.log(`🚨 Safety intervention triggered: ${parsed.meta.safety?.reason}`);
        // TODO: Trigger safety protocol workflow
      }
    }
    
    // Don't store assistant transcripts individually
    return;
  }
  
  // Process user transcripts as before
  if (role !== 'user') {
    return;
  }

  // Check if we've already processed this exact transcript
  const transcriptHash = Buffer.from(transcript).toString('base64').substring(0, 50);
  if (session.processedTranscripts.has(transcriptHash)) {
    console.log(`⏭️ Skipping duplicate transcript for ${callId}`);
    return;
  }
  session.processedTranscripts.add(transcriptHash);

  // Don't store individual transcripts - only detect patterns
  // Full transcript will be stored at end-of-call
  
  // Use unified CSS tracker pipeline for real-time processing
  const result = await processTranscriptEvent(
    session.userId,
    callId,
    transcript,
    'user'
  );
  
  // Also use old detection for compatibility
  const patterns = detectEnhancedCSSPatterns(transcript, false);
  
  // Log detected patterns for debugging
  const totalPatterns = patterns.cvdcPatterns.length + patterns.ibmPatterns.length + 
                        patterns.thendIndicators.length + patterns.cyvcPatterns.length + 
                        (patterns.somaticPatterns?.length || 0) + (patterns.griefPatterns?.length || 0);
  
  const literaryPatternCount = Object.entries(result.sessionState.patternCounts)
    .filter(([key, count]) => ['EXISTENTIAL', 'MORAL_TORMENT', 'EPISTEMIC_DOUBT', 'KAFKA_ALIENATION', 'SOCIAL_MASKING'].includes(key))
    .reduce((sum, [_, count]) => sum + count, 0);
  
  if (totalPatterns > 0 || literaryPatternCount > 0 || (patterns.narrativeFragmentation && patterns.narrativeFragmentation > 0)) {
    console.log(`📊 Patterns detected in transcript:`);
    console.log(`   Core: CVDC=${patterns.cvdcPatterns.length}, IBM=${patterns.ibmPatterns.length}, Thend=${patterns.thendIndicators.length}, CYVC=${patterns.cyvcPatterns.length}`);
    console.log(`   Somatic: ${patterns.somaticPatterns?.length || 0}, Grief: ${patterns.griefPatterns?.length || 0}`);
    console.log(`   Literary: EXISTENTIAL=${result.sessionState.patternCounts[PatternCategory.EXISTENTIAL]}, MORAL_TORMENT=${result.sessionState.patternCounts[PatternCategory.MORAL_TORMENT]}, EPISTEMIC=${result.sessionState.patternCounts[PatternCategory.EPISTEMIC_DOUBT]}`);
    console.log(`   Suggested Agent: ${result.suggestedAgent || 'None'}`);
    console.log(`   Distress: ${patterns.distressLevel || 0}`);
    console.log(`   📖 Narrative: Fragmentation=${patterns.narrativeFragmentation || 0}, Density=${patterns.symbolicDensity || 0}, Orientation=${patterns.temporalOrientation || 'present'}`);
  }
  
  // Update session with suggested agent from unified tracker
  if (result.suggestedAgent) {
    session.suggestedAgent = result.suggestedAgent;
    session.lastSuggestionTime = new Date();
  }
  
  // Store high narrative fragmentation as context
  if (patterns.narrativeFragmentation && patterns.narrativeFragmentation > 6) {
    await supabase
      .from('therapeutic_context')
      .insert({
        user_id: session.userId,
        call_id: callId,
        context_type: 'narrative_marker',
        content: `High narrative fragmentation detected: ${patterns.narrativeFragmentation}/10`,
        importance: patterns.narrativeFragmentation,
        pattern_type: 'NARRATIVE_FRAGMENTATION'
      });
  }
  
  // Update session with enhanced data including narrative metrics
  session.emotionalIntensity = patterns.emotionalIntensity;
  session.hasActiveWarnings = patterns.hasWarningFlags;
  session.lastPatternAnalysis = new Date();
  
  // Store narrative metrics in session
  (session as any).narrativeFragmentation = patterns.narrativeFragmentation || 0;
  (session as any).symbolicDensity = patterns.symbolicDensity || 0;
  (session as any).temporalOrientation = patterns.temporalOrientation || 'present';
  
  // Update pattern counts
  session.recentPatternCounts = {
    cvdc: patterns.cvdcPatterns.length,
    ibm: patterns.ibmPatterns.length,
    thend: patterns.thendIndicators.length,
    cyvc: patterns.cyvcPatterns.length,
    grief: patterns.griefPatterns?.length || 0,
    somatic: patterns.somaticPatterns?.length || 0
  };

  // Handle critical situations
  if (patterns.hasWarningFlags) {
    console.log(`🚨 CRITICAL: Warning flags detected for ${callId}`);
    await handleCriticalSituation(session, patterns);
  }

  // CSS stage progression tracking
  if (patterns.currentStage !== session.currentCSSStage) {
    console.log(`🎯 CSS Stage progression: ${session.currentCSSStage} → ${patterns.currentStage}`);
    
    const previousStage = session.currentCSSStage;
    session.currentCSSStage = patterns.currentStage;

    await supabase
      .from('css_progressions')
      .insert({
        user_id: session.userId,
        call_id: callId,
        from_stage: previousStage,
        to_stage: patterns.currentStage,
        trigger_content: transcript.substring(0, 200),
        agent_name: session.agentName,
        emotional_intensity: patterns.emotionalIntensity // NEW field
      });
  }

  await storeCSSPatternsEnhanced(session, patterns);
  
  // Enhanced orchestration analysis
  await analyzeForOrchestrationEnhanced(session, transcript, patterns);
}

// Local agent suggestion analyzer
function analyzeForAgentSuggestion(transcript: string, currentAgent: string): {
  suggestedAgent: string | null;
  reason: string | null;
  confidence: number;
} {
  const text = transcript.toLowerCase();
  
  // Look for contradiction patterns (suggest Sarah)
  const contradictionPatterns = [
    /part of me.*but.*part/,
    /i want.*but.*i (also|really)/,
    /i love.*but.*i/,
    /on one hand.*on the other/,
    /sometimes.*other times/
  ];
  
  // Look for intention-behavior gaps (suggest Mathew)
  const ibmPatterns = [
    /should.*but.*don't/,
    /want to.*but.*can't/,
    /need to.*but.*haven't/,
    /meant to.*but/,
    /supposed to.*but/
  ];
  
  // Look for philosophical or pattern-seeking (suggest Marcus)
  const marcusPatterns = [
    /why is it that/,
    /pattern.*my life/,
    /always seems to/,
    /every time.*happens/,
    /deeper meaning/
  ];
  
  let sarahScore = 0;
  let mathewScore = 0;
  let marcusScore = 0;
  
  // Score for Sarah
  for (const pattern of contradictionPatterns) {
    if (pattern.test(text)) sarahScore += 2;
  }
  if (text.includes('feel') || text.includes('emotion')) sarahScore += 1;
  if (text.includes('confused') || text.includes('torn')) sarahScore += 1;
  
  // Score for Mathew
  for (const pattern of ibmPatterns) {
    if (pattern.test(text)) mathewScore += 2;
  }
  if (text.includes('procrastin') || text.includes('avoid')) mathewScore += 1;
  if (text.includes('goal') || text.includes('plan')) mathewScore += 1;
  
  // Score for Marcus
  for (const pattern of marcusPatterns) {
    if (pattern.test(text)) marcusScore += 2;
  }
  if (text.includes('meaning') || text.includes('purpose')) marcusScore += 1;
  if (text.includes('pattern') || text.includes('cycle')) marcusScore += 1;
  
  // Determine suggestion
  const scores = {
    sarah: sarahScore,
    mathew: mathewScore,
    marcus: marcusScore
  };
  
  const maxScore = Math.max(sarahScore, mathewScore, marcusScore);
  
  if (maxScore < 2) {
    return { suggestedAgent: null, reason: null, confidence: 0 };
  }
  
  const suggestedAgent = Object.entries(scores)
    .find(([_, score]) => score === maxScore)?.[0] || null;
  
  if (suggestedAgent === currentAgent.toLowerCase()) {
    return { suggestedAgent: null, reason: null, confidence: 0 };
  }
  
  const reasons = {
    sarah: 'Strong contradictory feelings detected',
    mathew: 'Intention-behavior gap identified',
    marcus: 'Pattern-seeking or philosophical exploration'
  };
  
  return {
    suggestedAgent,
    reason: reasons[suggestedAgent as keyof typeof reasons] || null,
    confidence: Math.min(maxScore / 5, 1) // Normalize to 0-1
  };
}

async function analyzeForOrchestration(session: EnhancedSessionState, transcript: string): Promise<void> {
  const now = new Date();
  
  // Respect cooldown period
  if (session.lastSuggestionTime && 
      (now.getTime() - session.lastSuggestionTime.getTime()) < 120000) { // 2 minute cooldown
    return;
  }
  
  const suggestion = analyzeForAgentSuggestion(transcript, session.agentName);
  
  if (suggestion.suggestedAgent && suggestion.confidence > 0.6) {
    console.log(`🔄 Agent suggestion: ${session.agentName} → ${suggestion.suggestedAgent}`);
    console.log(`   Reason: ${suggestion.reason}, Confidence: ${suggestion.confidence}`);
    
    session.suggestedAgent = suggestion.suggestedAgent;
    session.lastSuggestionTime = now;
    
    // Store suggestion in database for tracking
    await supabase
      .from('therapeutic_context')
      .insert({
        user_id: session.userId,
        call_id: session.callId,
        context_type: 'agent_suggestion',
        content: `Agent routing: ${session.agentName} → ${suggestion.suggestedAgent} (${suggestion.reason})`,
        confidence: suggestion.confidence,
        importance: 6
      });
  }
}

// Generate natural language guidance from detected patterns
function generateNaturalGuidance(
  patterns: CSSPatterns & { 
    somaticPatterns?: any[];
    griefPatterns?: any[];
    narrativeFragmentation?: number;
    symbolicDensity?: number;
    temporalOrientation?: string;
  },
  patternCounts: { cvdc: number; ibm: number; thend: number; cyvc: number; grief: number; somatic?: number },
  appliedGuidance: string[]
): string[] {
  const guidance: string[] = [];
  const now = Date.now();
  
  // Check for repeated apologies (3+ times)
  if (patternCounts.cvdc >= 3 && !appliedGuidance.includes('apology_pattern')) {
    guidance.push("Notice they've apologized several times - acknowledge this gently and reassure them it's okay");
  }
  
  // Check for contradictory feelings (2+ CVDC patterns)
  if (patternCounts.cvdc >= 2 && !appliedGuidance.includes('contradiction_pattern')) {
    guidance.push("They're expressing conflicting feelings or desires - explore both sides with curiosity");
  }
  
  // Check for intention-behavior gaps
  if (patternCounts.ibm >= 2 && !appliedGuidance.includes('behavior_gap')) {
    guidance.push("Notice the gap between what they want to do and what they're actually doing - explore this gently");
  }
  
  // Check for somatic/physical symptoms
  if ((patternCounts.somatic || 0) >= 1 && !appliedGuidance.includes('somatic_awareness')) {
    guidance.push("They're describing physical sensations - acknowledge how their body is responding to this stress");
  }
  
  // Check for grief/loss patterns
  if (patternCounts.grief >= 1 && !appliedGuidance.includes('grief_support')) {
    guidance.push("They're processing a significant loss - offer deep compassion and space for their grief");
  }
  
  // Check for integration moments (Thend)
  if (patternCounts.thend >= 2 && !appliedGuidance.includes('integration_moment')) {
    guidance.push("Something seems to be shifting for them - support this emerging awareness");
  }
  
  // Check for high narrative fragmentation
  if (patterns.narrativeFragmentation && patterns.narrativeFragmentation >= 7 && !appliedGuidance.includes('fragmentation_support')) {
    guidance.push("Their story feels fragmented or scattered - help them find a thread to follow");
  }
  
  // Check for temporal stuck patterns
  if (patterns.temporalOrientation === 'stuck_past' && !appliedGuidance.includes('temporal_stuck')) {
    guidance.push("They seem stuck in past events - gently bring them to how this affects them now");
  }
  
  // Check for high emotional intensity without somatic awareness
  if (patterns.emotionalIntensity === 'high' && (patternCounts.somatic || 0) === 0 && !appliedGuidance.includes('body_check')) {
    guidance.push("High emotional intensity detected - check in with how they're feeling in their body");
  }
  
  return guidance;
}

// NEW: Enhanced orchestration with safety checks and separate cooldowns
async function analyzeForOrchestrationEnhanced(
  session: EnhancedSessionState,
  transcript: string,
  patterns: CSSPatterns & {
    somaticPatterns?: any[];
    griefPatterns?: any[];
    narrativeFragmentation?: number;
    symbolicDensity?: number;
    temporalOrientation?: string;
  }
): Promise<void> {
  const now = new Date();
  
  // ALWAYS generate guidance (with short 5-second cooldown)
  if (!session.lastGuidanceTime || 
      (now.getTime() - session.lastGuidanceTime.getTime()) > 5000) {
    
    const newGuidance = generateNaturalGuidance(
      patterns,
      session.recentPatternCounts,
      session.guidanceApplied
    );
    
    if (newGuidance.length > 0) {
      session.naturalGuidance = newGuidance;
      session.lastGuidanceTime = now;
      
      // Mark patterns as acknowledged
      if (newGuidance.some(g => g.includes('apologized'))) {
        session.guidanceApplied.push('apology_pattern');
      }
      if (newGuidance.some(g => g.includes('conflicting'))) {
        session.guidanceApplied.push('contradiction_pattern');
      }
      if (newGuidance.some(g => g.includes('gap between'))) {
        session.guidanceApplied.push('behavior_gap');
      }
      if (newGuidance.some(g => g.includes('physical sensations'))) {
        session.guidanceApplied.push('somatic_awareness');
      }
      if (newGuidance.some(g => g.includes('loss'))) {
        session.guidanceApplied.push('grief_support');
      }
      if (newGuidance.some(g => g.includes('shifting'))) {
        session.guidanceApplied.push('integration_moment');
      }
      if (newGuidance.some(g => g.includes('fragmented'))) {
        session.guidanceApplied.push('fragmentation_support');
      }
      if (newGuidance.some(g => g.includes('past events'))) {
        session.guidanceApplied.push('temporal_stuck');
      }
      if (newGuidance.some(g => g.includes('feeling in their body'))) {
        session.guidanceApplied.push('body_check');
      }
      
      console.log(`💡 Generated ${newGuidance.length} natural guidance items`);
    }
  }
  
  // Check if safe to switch agents
  if (!isSafeToSwitch(patterns)) {
    console.log(`🛑 Not safe to switch agents - intensity: ${patterns.emotionalIntensity}`);
    return;
  }
  
  // Respect agent switch cooldown (120 seconds)
  if (session.lastAgentSwitchTime && 
      (now.getTime() - session.lastAgentSwitchTime.getTime()) < 120000) {
    console.log(`⏱️ Agent switch cooldown active, skipping agent suggestion`);
    return;
  }

  // Enhanced agent suggestion logic
  const suggestion = analyzeForAgentSuggestionEnhanced(
    transcript, 
    session.agentName,
    patterns,
    session.recentPatternCounts
  );
  
  // Lowered confidence threshold to 0.6 for more responsive switching
  if (suggestion.suggestedAgent && suggestion.confidence > 0.6) {
    console.log(`🔄 Agent suggestion: ${session.agentName} → ${suggestion.suggestedAgent}`);
    console.log(`   Reason: ${suggestion.reason}, Confidence: ${suggestion.confidence}`);
    
    session.suggestedAgent = suggestion.suggestedAgent;
    session.lastAgentSwitchTime = now;
    session.lastSuggestionTime = now; // Keep for backward compatibility
    
    await supabase
      .from('therapeutic_context')
      .insert({
        user_id: session.userId,
        call_id: session.callId,
        context_type: 'agent_suggestion',
        content: `Agent routing: ${session.agentName} → ${suggestion.suggestedAgent} (${suggestion.reason})`,
        confidence: suggestion.confidence,
        importance: patterns.emotionalIntensity === 'high' ? 8 : 6
      });
  }
}

// Enhanced agent suggestion with intensity, distress, and narrative awareness
function analyzeForAgentSuggestionEnhanced(
  transcript: string,
  currentAgent: string,
  patterns: CSSPatterns & { 
    distressLevel?: number; 
    somaticPatterns?: any[];
    narrativeFragmentation?: number;
    symbolicDensity?: number;
    temporalOrientation?: string;
  },
  patternCounts: { cvdc: number; ibm: number; thend: number; cyvc: number; grief: number }
): {
  suggestedAgent: string | null;
  reason: string | null;
  confidence: number;
} {
  // High narrative fragmentation or distress → Zhanna
  const distressLevel = patterns.distressLevel || 0;
  const somaticCount = patterns.somaticPatterns?.length || 0;
  const narrativeFragmentation = patterns.narrativeFragmentation || 0;
  
  // Prioritize Zhanna for high fragmentation or somatic distress
  if ((distressLevel >= 5 || somaticCount >= 1 || narrativeFragmentation >= 7) && 
      currentAgent.toLowerCase() !== 'zhanna') {
    console.log(`🔄 Suggesting Zhanna: distress=${distressLevel}, somatic=${somaticCount}, narrative fragmentation=${narrativeFragmentation}`);
    return {
      suggestedAgent: 'zhanna',
      reason: narrativeFragmentation >= 7 
        ? 'High narrative fragmentation requires grounding' 
        : 'Somatic awareness and grounding needed',
      confidence: 0.9
    };
  }
  
  // If currently with Zhanna, check if stable for handoff
  if (currentAgent.toLowerCase() === 'zhanna' && distressLevel < 5) {
    // Determine next agent based on patterns and narrative state
    const symbolicDensity = patterns.symbolicDensity || 0;
    
    // Marcus for integration and symbolic work
    if (patternCounts.thend >= 2 || symbolicDensity >= 5) {
      return {
        suggestedAgent: 'marcus',
        reason: symbolicDensity >= 5 
          ? 'Rich symbolic content ready for exploration'
          : 'Ready for integration work',
        confidence: 0.8
      };
    }
    // Mathew for behavioral gaps or temporal stuck patterns
    if ((patternCounts.ibm > patternCounts.cvdc && patternCounts.ibm >= 2) || 
        patterns.temporalOrientation === 'stuck_past') {
      return {
        suggestedAgent: 'mathew',
        reason: patterns.temporalOrientation === 'stuck_past'
          ? 'Past narrative patterns need examination' 
          : 'Behavioral patterns to explore',
        confidence: 0.8
      };
    }
    // Sarah for emotional contradictions
    if (patternCounts.cvdc >= 2 || narrativeFragmentation >= 4) {
      return {
        suggestedAgent: 'sarah',
        reason: narrativeFragmentation >= 4
          ? 'Fragmented narrative needs emotional coherence'
          : 'Contradictions to explore',
        confidence: 0.8
      };
    }
  }
  
  // High intensity (but not requiring Zhanna) → Sarah
  if (patterns.emotionalIntensity === 'high' && distressLevel < 7) {
    if (currentAgent.toLowerCase() !== 'sarah') {
      return {
        suggestedAgent: 'sarah',
        reason: 'High emotional intensity requires warm support',
        confidence: 0.85
      };
    }
  }
  
  // Many contradictions or narrative fragmentation → Sarah
  if ((patternCounts.cvdc >= 2 || narrativeFragmentation >= 4) && currentAgent.toLowerCase() !== 'sarah') {
    console.log(`🔄 Suggesting Sarah: cvdc=${patternCounts.cvdc}, fragmentation=${narrativeFragmentation}`);
    return {
      suggestedAgent: 'sarah',
      reason: narrativeFragmentation >= 4
        ? 'Fragmented narrative needs emotional coherence'
        : 'Multiple contradictions need emotional exploration',
      confidence: 0.85
    };
  }
  
  // Behavioral gaps or temporal stuck patterns → Mathew
  if ((patternCounts.ibm >= 1 || patterns.temporalOrientation === 'stuck_past') && 
      currentAgent.toLowerCase() !== 'mathew') {
    console.log(`🔄 Suggesting Mathew: ibm=${patternCounts.ibm}, temporal=${patterns.temporalOrientation}`);
    return {
      suggestedAgent: 'mathew',
      reason: patterns.temporalOrientation === 'stuck_past'
        ? 'Past narrative patterns need analytical examination'
        : 'Intention-behavior gaps need analytical approach',
      confidence: 0.8
    };
  }
  
  // Integration moments or high symbolic density → Marcus
  const symbolicDensity = patterns.symbolicDensity || 0;
  if ((patternCounts.thend >= 1 || symbolicDensity >= 5) && 
      patterns.emotionalIntensity !== 'high' &&
      currentAgent.toLowerCase() !== 'marcus') {
    console.log(`🔄 Suggesting Marcus: thend=${patternCounts.thend}, symbolic=${symbolicDensity}`);
    return {
      suggestedAgent: 'marcus',
      reason: symbolicDensity >= 5
        ? 'Rich symbolic narrative requires philosophical exploration'
        : 'Integration opportunities for pattern recognition',
      confidence: 0.75
    };
  }
  
  // Use original analysis as fallback
  return analyzeForAgentSuggestion(transcript, currentAgent);
}

// Critical situation handler
async function handleCriticalSituation(
  session: EnhancedSessionState,
  patterns: CSSPatterns & { distressLevel?: number }
): Promise<void> {
  // High distress → Zhanna for somatic grounding
  const distressLevel = patterns.distressLevel || 0;
  const targetAgent = distressLevel >= 7 ? 'zhanna' : 'sarah';
  
  if (session.agentName.toLowerCase() !== targetAgent) {
    session.suggestedAgent = targetAgent;
    session.lastSuggestionTime = new Date();
    
    const reason = targetAgent === 'zhanna' 
      ? 'Somatic grounding and breath work needed'
      : 'Emotional support needed';
    
    console.log(`🚨 CRITICAL: Switching to ${targetAgent} - ${reason}`);
    
    await supabase
      .from('therapeutic_context')
      .insert({
        user_id: session.userId,
        call_id: session.callId,
        context_type: 'critical_intervention',
        content: `CRITICAL: ${reason}. Switching to ${targetAgent}.`,
        confidence: 1.0,
        importance: 10 // Maximum importance
      });
  }
  
  // Store critical patterns with high priority
  for (const pattern of patterns.cvdcPatterns) {
    if (pattern.text.toLowerCase().includes('kill') || 
        pattern.text.toLowerCase().includes('hurt') ||
        pattern.text.toLowerCase().includes('end it')) {
      await supabase
        .from('css_patterns')
        .insert({
          user_id: session.userId,
          call_id: session.callId,
          pattern_type: 'CRISIS',
          content: pattern.text,
          css_stage: patterns.currentStage,
          confidence: 1.0,
          detected_at: new Date().toISOString(),
          emotional_intensity: 'critical',
          safety_flag: true,
          crisis_flag: true
        });
    }
  }
}

// Enhanced CSS pattern storage
// Extract and store critical life events from transcripts
async function extractAndStoreCriticalEvents(
  session: EnhancedSessionState,
  transcript: string,
  patterns: any
): Promise<void> {
  const criticalEvents: Array<{
    type: string;
    content: string;
    importance: number;
  }> = [];
  
  // Check grief patterns specifically
  if (patterns.griefPatterns && patterns.griefPatterns.length > 0) {
    for (const grief of patterns.griefPatterns) {
      // Extract pet names if mentioned
      const petNameMatch = grief.text.match(/\b(\w+)\b.*?(pet|dog|cat|animal)/i) ||
                          grief.text.match(/(pet|dog|cat|animal).*?\b(\w+)\b/i);
      
      if (petNameMatch) {
        const petName = petNameMatch[1] || petNameMatch[2];
        // Check if it's actually a pet name (capitalized, not a common word)
        if (petName && petName[0] === petName[0].toUpperCase() && petName.toLowerCase() !== 'my') {
          criticalEvents.push({
            type: 'pet_loss',
            content: `Pet ${petName} mentioned in context of illness/loss: ${grief.text}`,
            importance: 9
          });
        }
      } else {
        criticalEvents.push({
          type: 'grief_event',
          content: grief.text,
          importance: 8
        });
      }
    }
  }
  
  // Extract specific mentions of "not doing well", "dying", etc.
  const criticalPhrases = [
    /(\w+)\s+(?:isn't|is not|ain't)\s+doing\s+(?:so\s+)?(?:well|good)/gi,
    /my\s+(\w+)\s+is\s+(?:dying|sick|ill)/gi,
    /(\w+)\s+(?:died|passed away)/gi,
    /lost\s+(?:my\s+)?(\w+)/gi
  ];
  
  for (const pattern of criticalPhrases) {
    const matches = transcript.matchAll(pattern);
    for (const match of matches) {
      const subject = match[1];
      if (subject && subject[0] === subject[0].toUpperCase()) {
        criticalEvents.push({
          type: 'critical_event',
          content: match[0],
          importance: 9
        });
      }
    }
  }
  
  // Store critical events in therapeutic context
  for (const event of criticalEvents) {
    await supabase
      .from('therapeutic_context')
      .insert({
        user_id: session.userId,
        call_id: session.callId,
        context_type: event.type,
        content: event.content,
        confidence: 0.9,
        importance: event.importance,
        pattern_type: 'CRITICAL_LIFE_EVENT'
      });
    
    console.log(`💔 Stored critical event: ${event.type} - ${event.content.substring(0, 50)}...`);
  }
  
  // Store high-importance context if grief patterns detected
  if (patterns.griefPatterns && patterns.griefPatterns.length > 0) {
    await storeSessionContext(
      session.userId,
      session.callId,
      `IMPORTANT: User discussed loss/grief. Distress level: ${patterns.distressLevel}. Grief patterns: ${patterns.griefPatterns.length}. Must acknowledge with compassion and specific details.`,
      'critical_context'
    );
  }
}

async function storeCSSPatternsEnhanced(
  session: EnhancedSessionState,
  patterns: CSSPatterns
): Promise<void> {
  const patternInserts = [];
  
  // Store CVDC patterns with intensity
  for (const cvdc of patterns.cvdcPatterns) {
    const intensity = cvdc.text.toLowerCase().includes('sorry') || 
                     cvdc.text.toLowerCase().includes('apologize') ? 
                     (patterns.cvdcPatterns.length > 2 ? 'medium' : 'low') : 
                     patterns.emotionalIntensity;
    
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'CVDC',
      content: cvdc.text,
      css_stage: patterns.currentStage,
      confidence: 0.5 + (patterns.cvdcPatterns.length * 0.15), // Increase confidence with more patterns
      detected_at: new Date().toISOString(),
      emotional_intensity: intensity,
      safety_flag: patterns.hasWarningFlags,
      crisis_flag: false
    });
  }
  
  // Store IBM patterns
  for (const ibm of patterns.ibmPatterns) {
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'IBM',
      content: ibm.text,
      css_stage: patterns.currentStage,
      confidence: 0.5,
      detected_at: new Date().toISOString(),
      emotional_intensity: patterns.emotionalIntensity,
      safety_flag: false,
      crisis_flag: false
    });
  }
  
  // Store Thend indicators
  for (const thend of patterns.thendIndicators) {
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'Thend',
      content: thend.text,
      css_stage: patterns.currentStage,
      confidence: 0.6,
      detected_at: new Date().toISOString(),
      emotional_intensity: patterns.emotionalIntensity,
      safety_flag: false,
      crisis_flag: false
    });
  }
  
  if (patternInserts.length > 0) {
    await supabase.from('css_patterns').insert(patternInserts);
    console.log(`💾 Stored ${patternInserts.length} enhanced CSS patterns`);
  }
}

export async function switchAgent(
  callId: string,
  newAgent: string,
  reason: string = 'manual'
): Promise<boolean> {
  const session = activeSessions.get(callId);
  if (!session) {
    console.log(`❌ Cannot switch agent: session ${callId} not found`);
    return false;
  }

  const previousAgent = session.agentName;
  session.agentName = newAgent;
  session.suggestedAgent = null; // Clear suggestion after switch
  session.agentSwitches.push({
    timestamp: new Date(),
    fromAgent: previousAgent,
    toAgent: newAgent,
    reason
  });

  // Update database
  await supabase
    .from('therapeutic_sessions')
    .update({
      agent_name: newAgent,
      metadata: {
        agentSwitches: session.agentSwitches
      }
    })
    .eq('call_id', callId);

  // Store switch in therapeutic context
  await supabase
    .from('therapeutic_context')
    .insert({
      user_id: session.userId,
      call_id: callId,
      context_type: 'agent_switch',
      content: `Agent switch: ${previousAgent} → ${newAgent} (${reason})`,
      confidence: 1.0,
      importance: 7
    });

  console.log(`✅ Agent switch executed: ${previousAgent} → ${newAgent} (${reason})`);
  return true;
}

// Get current orchestration state with pattern guidance
export function getOrchestrationState(callId: string): {
  currentAgent: string;
  suggestedAgent: string | null;
  agentSwitches: Array<{timestamp: Date; fromAgent: string; toAgent: string; reason: string}>;
  canSwitch: boolean;
  currentCSSStage: string;
  sessionStartTime: Date;
  userId: string;
  // NEW enhanced fields
  emotionalIntensity: 'low' | 'medium' | 'high' | 'critical';
  hasActiveWarnings: boolean;
  patternCounts: { cvdc: number; ibm: number; thend: number; cyvc: number; grief: number };
  therapeuticPriority: { priority: string; recommendation: string };
  // NEW: Pattern guidance fields
  patternGuidance: PatternGuidance[];
  needsGuidanceUpdate: boolean;
  // NEW: Narrative awareness fields
  narrativeMetrics?: {
    fragmentation: number;
    symbolicDensity: number;
    temporalOrientation: string;
    patternsDetected: string[];
  };
} | null {
  // Check if this is a temp ID
  if (callId.startsWith('temp-')) {
    // Look for any session that might match this temp pattern
    for (const [realCallId, session] of activeSessions) {
      // If we find a session for this user around the same time, use it
      if (Math.abs(Date.now() - session.sessionStartTime.getTime()) < 10000) {
        console.log(`📌 Mapping temp ID ${callId} to real session ${realCallId}`);
        tempIdMapping.set(callId, realCallId);
        callId = realCallId; // Use the real ID
        break;
      }
    }
    
    // If still no match, return waiting state
    if (!activeSessions.has(callId)) {
      return {
        waiting: true,
        message: 'Session initializing...'
      } as any;
    }
  }
  
  const session = activeSessions.get(callId);
  if (!session) return null;

  // Get fresh natural language guidance (always check for new patterns)
  const naturalGuidance = session.naturalGuidance || [];
  
  // Convert natural guidance to PatternGuidance format for backward compatibility
  const guidance: PatternGuidance[] = naturalGuidance.map((g, index) => {
    // Determine priority based on content
    let priority: 'low' | 'medium' | 'high' = 'medium';
    if (g.includes('grief') || g.includes('loss') || g.includes('physical sensations')) {
      priority = 'high';
    } else if (g.includes('shifting') || g.includes('emerging')) {
      priority = 'low';
    }
    
    // Extract pattern type from guidance content
    let pattern = 'pattern_detected';
    if (g.includes('apologized')) pattern = 'repeated_apologies';
    else if (g.includes('conflicting')) pattern = 'conflicting_feelings';
    else if (g.includes('gap between')) pattern = 'intention_behavior_gap';
    else if (g.includes('physical')) pattern = 'somatic_awareness';
    else if (g.includes('loss')) pattern = 'grief_processing';
    else if (g.includes('shifting')) pattern = 'integration_moment';
    else if (g.includes('fragmented')) pattern = 'narrative_fragmentation';
    else if (g.includes('past events')) pattern = 'temporal_stuck';
    
    return {
      pattern,
      count: 1,
      suggestion: g,
      priority
    };
  });

  const needsUpdate = guidance.length > 0 && 
    (!session.lastGuidanceTime || 
     (Date.now() - session.lastGuidanceTime.getTime()) > 5000);

  // Get therapeutic priority
  const priority = getTherapeuticPriority({
    cvdcPatterns: [],
    ibmPatterns: [],
    thendIndicators: [],
    cyvcPatterns: [],
    currentStage: session.currentCSSStage as CSSStage,
    hasWarningFlags: session.hasActiveWarnings,
    emotionalIntensity: session.emotionalIntensity
  });

  // Build patterns detected array for narrative phase
  const patternsDetected: string[] = [];
  if (session.recentPatternCounts.cvdc > 0) patternsDetected.push('CVDC');
  if (session.recentPatternCounts.ibm > 0) patternsDetected.push('IBM');
  if (session.recentPatternCounts.thend > 0) patternsDetected.push('Thend');
  if (session.recentPatternCounts.cyvc > 0) patternsDetected.push('CYVC');
  if (session.recentPatternCounts.grief > 0) patternsDetected.push('Grief');

  return {
    currentAgent: session.agentName,
    suggestedAgent: session.suggestedAgent,
    agentSwitches: session.agentSwitches,
    canSwitch: !session.lastAgentSwitchTime || 
                (Date.now() - session.lastAgentSwitchTime.getTime()) > 120000, // 120 second cooldown for agent switches
    currentCSSStage: session.currentCSSStage,
    sessionStartTime: session.sessionStartTime,
    userId: session.userId,
    // Enhanced data
    emotionalIntensity: session.emotionalIntensity,
    hasActiveWarnings: session.hasActiveWarnings,
    patternCounts: session.recentPatternCounts,
    therapeuticPriority: priority,
    // Pattern guidance
    patternGuidance: guidance,
    needsGuidanceUpdate: needsUpdate,
    // Narrative metrics (if available)
    narrativeMetrics: {
      fragmentation: (session as any).narrativeFragmentation || 0,
      symbolicDensity: (session as any).symbolicDensity || 0,
      temporalOrientation: (session as any).temporalOrientation || 'present',
      patternsDetected
    }
  };
}

export async function processEndOfCall(
  callId: string,
  fullTranscript?: string,
  summary?: string,
  callMetadata?: any
): Promise<void> {
  let session = activeSessions.get(callId);

  if (!session) {
    const { data: dbSession } = await supabase
      .from('therapeutic_sessions')
      .select('user_id, agent_name')
      .eq('call_id', callId)
      .single();

    if (!dbSession) {
      const userId = callMetadata?.metadata?.userId;
      const agentName = callMetadata?.metadata?.agentName || 'Sarah';

      if (!userId) return;

      let duration = callMetadata?.duration || 60;

      await supabase
        .from('therapeutic_sessions')
        .insert({
          call_id: callId,
          user_id: userId,
          agent_name: agentName,
          status: 'completed',
          start_time: new Date(Date.now() - (duration * 1000)).toISOString(),
          end_time: new Date().toISOString(),
          duration_seconds: duration,
          metadata: callMetadata
        });

      session = {
        userId,
        callId,
        agentName,
        currentCSSStage: 'pointed_origin',
        sessionStartTime: new Date(Date.now() - (duration * 1000)),
        processedTranscripts: new Set(),
        agentSwitches: [],
        suggestedAgent: null,
        lastAgentSwitchTime: null,
        lastGuidanceTime: null,
        lastSuggestionTime: null,
        emotionalIntensity: 'low',
        hasActiveWarnings: false,
        lastPatternAnalysis: null,
        recentPatternCounts: {
          cvdc: 0,
          ibm: 0,
          thend: 0,
          cyvc: 0,
          grief: 0,
          somatic: 0
        },
        guidanceApplied: [],
        naturalGuidance: []
      };
    } else {
      session = {
        userId: dbSession.user_id,
        callId,
        agentName: dbSession.agent_name,
        currentCSSStage: 'pointed_origin',
        sessionStartTime: new Date(),
        processedTranscripts: new Set(),
        agentSwitches: [],
        suggestedAgent: null,
        lastAgentSwitchTime: null,
        lastGuidanceTime: null,
        lastSuggestionTime: null,
        emotionalIntensity: 'low',
        hasActiveWarnings: false,
        lastPatternAnalysis: null,
        recentPatternCounts: {
          cvdc: 0,
          ibm: 0,
          thend: 0,
          cyvc: 0,
          grief: 0,
          somatic: 0
        },
        guidanceApplied: [],
        naturalGuidance: []
      };
    }
  }

  const duration = Math.floor((Date.now() - session.sessionStartTime.getTime()) / 1000);

  await supabase
    .from('therapeutic_sessions')
    .update({
      status: 'completed',
      end_time: new Date().toISOString(),
      duration_seconds: duration,
      metadata: callMetadata
    })
    .eq('call_id', callId);

  if (fullTranscript) {
    await processFullTranscript(session, fullTranscript);
  }

  if (summary) {
    await storeSessionContext(session.userId, callId, summary, 'call_summary');
  }

  // Cleanup from both caches
  activeSessions.delete(callId);
  checkedSessions.delete(callId);
  console.log(`✅ Session completed and cleaned up: ${callId}`);
}

async function processFullTranscript(session: EnhancedSessionState, transcript: string): Promise<void> {
  // Use the unified CSS tracker pipeline which includes literary patterns
  const result = await processTranscriptEvent(
    session.userId,
    session.callId,
    transcript,
    'user'
  );
  
  // Also run the old detection for backward compatibility
  const patterns = detectEnhancedCSSPatterns(transcript, true);
  const { confidence, reasoning } = assessPatternConfidence(patterns);

  console.log(`📊 Full transcript analysis:`);
  console.log(`  CSS Stage: ${patterns.currentStage}`);
  console.log(`  Core Patterns: CVDC=${patterns.cvdcPatterns.length}, IBM=${patterns.ibmPatterns.length}, Grief=${patterns.griefPatterns?.length || 0}`);
  console.log(`  Literary Patterns Detected:`, Object.entries(result.sessionState.patternCounts)
    .filter(([key, count]) => ['EXISTENTIAL', 'MORAL_TORMENT', 'EPISTEMIC_DOUBT', 'KAFKA_ALIENATION', 'SOCIAL_MASKING'].includes(key) && count > 0)
    .map(([key, count]) => `${key}=${count}`)
    .join(', ') || 'None');
  console.log(`  Suggested Agent: ${result.suggestedAgent || 'None'}`);
  console.log(`  Emotional Intensity: ${patterns.emotionalIntensity}`);
  console.log(`  Warning Flags: ${patterns.hasWarningFlags}`);

  // Store the complete transcript (this is the only transcript we store)
  await supabase
    .from('session_transcripts')
    .insert({
      user_id: session.userId,
      call_id: session.callId,
      text: transcript,
      role: 'complete'
    });

  await storeCSSPatternsEnhanced(session, patterns);

  // Extract and store critical life events (pets, deaths, major changes)
  await extractAndStoreCriticalEvents(session, transcript, patterns);

  await supabase
    .from('css_patterns')
    .insert({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'STAGE_ASSESSMENT',
      content: `Stage: ${patterns.currentStage}. ${reasoning}`,
      css_stage: patterns.currentStage,
      confidence: confidence,
      detected_at: new Date().toISOString()
    });
}

async function storeCSSPatterns(session: EnhancedSessionState, patterns: any): Promise<void> {
  const patternInserts = [];

  for (const cvdc of patterns.cvdcPatterns) {
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'CVDC',
      content: cvdc.text,
      extracted_contradiction: cvdc.includes('but') 
        ? cvdc.split('but').map((s: string) => s.trim()).join(' BUT ')
        : cvdc,
      css_stage: patterns.currentStage,
      confidence: patterns.confidence || 0.5,
      detected_at: new Date().toISOString()
    });
  }

  for (const ibm of patterns.ibmPatterns) {
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'IBM',
      content: ibm.text,
      behavioral_gap: ibm,
      css_stage: patterns.currentStage,
      confidence: patterns.confidence || 0.5,
      detected_at: new Date().toISOString()
    });
  }

  for (const thend of patterns.thendIndicators) {
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'Thend',
      content: thend.text,
      css_stage: patterns.currentStage,
      confidence: patterns.confidence || 0.5,
      detected_at: new Date().toISOString()
    });
  }

  for (const cyvc of patterns.cyvcPatterns) {
    patternInserts.push({
      user_id: session.userId,
      call_id: session.callId,
      pattern_type: 'CYVC',
      content: cyvc,
      css_stage: patterns.currentStage,
      confidence: patterns.confidence || 0.5,
      detected_at: new Date().toISOString()
    });
  }

  if (patternInserts.length > 0) {
    await supabase.from('css_patterns').insert(patternInserts);
    console.log(`💾 Stored ${patternInserts.length} CSS patterns`);
  }
}

// NEW: Mark guidance as applied
export async function markGuidanceApplied(callId: string, guidanceKeys: string[]): Promise<void> {
  const session = activeSessions.get(callId);
  if (!session) return;
  
  session.guidanceApplied.push(...guidanceKeys);
  session.lastGuidanceTime = new Date();
}

// Get active call ID for a user
export function getActiveCallIdForUser(userId: string): {
  success: boolean;
  callId?: string;
  agentName?: string;
  cssStage?: string;
} {
  const sessions = Array.from(activeSessions.entries());
  const userSession = sessions.find(([_, session]) => 
    session.userId === userId && 
    (Date.now() - session.sessionStartTime.getTime()) < 60000 // Active within last minute
  );
  
  if (userSession) {
    const [callId, session] = userSession;
    return {
      success: true,
      callId,
      agentName: session.agentName,
      cssStage: session.currentCSSStage
    };
  }
  
  return { success: false };
}