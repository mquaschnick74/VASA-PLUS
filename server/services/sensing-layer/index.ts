// server/services/sensing-layer/index.ts
// Main Sensing Layer Service - Orchestrates all sensing modules

import { supabase } from '../supabase-service';
import { detectPatterns, detectIBMWithLLM } from './pattern-detection';
import { analyzeRegister } from './register-analysis';
import { mapSymbolic } from './symbolic-mapping';
import { assessMovement } from './movement-assessment';
import { generateGuidance } from './guidance-generator';
import {
  initializeSession,
  getSessionState,
  updateSessionState,
  recordSignificantMoment,
  recordPatternDetected,
  recordSymbolicConnection,
  recordStructuredPattern,
  recordStructuredHistorical,
  recordStructuredConnection,
  isSignificantMoment,
  getSessionSummary,
  clearSession,
  SessionSummary,
  recordStateVector,
  getPreviousVectors,
  recordCSSSignals,
  assessSessionCSSStage,
  getSessionCSSStage,
  computeIBMSignalStrength,
  createIBMCandidate,
  confirmIBMCandidates,
  processIBMAlignment,
  resolveIBMClientInitiated,
  getActiveIBMCandidates
} from './session-state';
import {
  coupleStateVector,
  TherapeuticStateVector
} from './state-vector';
import { persistSessionProfile } from './profile-writer';
import {
  TurnInput,
  UserTherapeuticProfile,
  OrientationStateRegister,
  TherapeuticGuidance,
  SensingLayerOutput,
  UserPattern,
  HistoricalMaterial,
  SymbolicMapping,
  RegisterHistoryEntry,
  CSSHistoryEntry,
  UserPatternRow,
  UserHistoricalMaterialRow,
  SymbolicMappingRow,
  SessionRegisterAnalysisRow,
  SensingLayerOutputRow,
  PatternDetectionResult,
  SymbolicMappingResult,
  RegisterAnalysisResult,
  MovementAssessmentResult,
  PatternType,
  AwarenessLevel,
  SymbolicConnectionType
} from './types';

const profileCache = new Map<string, { profile: UserTherapeuticProfile; loadedAt: number }>();

// NEW: Expose cached profile to silence monitor and other sensing layer services
export function getCachedProfile(callId: string): UserTherapeuticProfile | null {
  const cached = profileCache.get(callId);
  return cached ? cached.profile : null;
}

export class SensingLayerService {
  private static instance: SensingLayerService;

  private constructor() {
    console.log('🧠 [Sensing Layer] Service initialized');
  }

  public static getInstance(): SensingLayerService {
    if (!SensingLayerService.instance) {
      SensingLayerService.instance = new SensingLayerService();
    }
    return SensingLayerService.instance;
  }

  /**
   * Main entry point - process a user utterance through the sensing layer
   * Uses in-memory session state to avoid per-turn database writes
   */
  async processUtterance(input: TurnInput): Promise<{
    guidance: TherapeuticGuidance;
    register: RegisterAnalysisResult;
    movement: MovementAssessmentResult;
    stateVector: TherapeuticStateVector;
  }> {
    const startTime = Date.now();
    console.log(`\n🧠 ===== SENSING LAYER PROCESSING =====`);
    console.log(`📝 User: "${input.utterance.substring(0, 100)}..."`);
    console.log(`📊 Session: ${input.sessionId}, Exchange: ${input.exchangeCount}`);

    try {
      // 1. Ensure session state exists (initialize if first turn)
      let sessionState = getSessionState(input.callId);
      if (!sessionState) {
        sessionState = initializeSession(input.callId, input.userId, input.sessionId);
      }

      // 2. Get user profile — cache-first (profile only changes at session end via persistSessionProfile)
      const profileStart = Date.now();
      let profile: UserTherapeuticProfile;
      const cached = profileCache.get(input.callId);
      if (cached) {
        profile = cached.profile;
        console.log(`👤 Profile loaded from CACHE in ${Date.now() - profileStart}ms: ${profile.patterns.length} patterns, ${profile.historicalMaterial.length} historical items`);
      } else {
        profile = await this.getUserProfile(input.userId);
        profileCache.set(input.callId, { profile, loadedAt: Date.now() });
        console.log(`👤 Profile loaded from DB in ${Date.now() - profileStart}ms (now cached): ${profile.patterns.length} patterns, ${profile.historicalMaterial.length} historical items`);
      }

      // 3. Run sensing computations in parallel for speed
      const sensingStart = Date.now();
      const [patterns, register, symbolic, movement, ibmDetection] = await Promise.all([
        detectPatterns(input, profile),
        analyzeRegister(input, profile),
        mapSymbolic(input, profile),
        assessMovement(input, profile),
        detectIBMWithLLM(input)
      ]);
      // ─── IBM Cross-Turn Evaluation ──────────────────────────────────────
      const ibmSignalStrength = computeIBMSignalStrength(
        movement.indicators.resistance,
        movement.indicators.intellectualizing,
        ibmDetection.contradictionStrength
      );
      if (ibmDetection.clientNamed) {
        resolveIBMClientInitiated(input.callId);
      } else if (ibmDetection.behavioralAlignment) {
        processIBMAlignment(
          input.callId,
          ibmSignalStrength,
          register.currentRegister
        );
      } else if (ibmDetection.contradictionStrength > 0) {
        const existingCandidates = getActiveIBMCandidates(input.callId);
        if (existingCandidates.length === 0 && ibmDetection.hypothesis) {
          createIBMCandidate(
            input.callId,
            ibmDetection.hypothesis,
            ibmDetection.statedPosition || '',
            input.exchangeCount,
            ibmSignalStrength,
            ibmDetection.evidence,
            movement.indicators.resistance,
            movement.indicators.intellectualizing
          );
        } else if (existingCandidates.length > 0 && ibmSignalStrength > 0) {
          confirmIBMCandidates(
            input.callId,
            input.exchangeCount,
            ibmSignalStrength,
            ibmDetection.evidence,
            register.currentRegister
          );
        }
      }
      // ─── End IBM Evaluation ─────────────────────────────────────────────

      console.log(`⚡ Sensing computations completed in ${Date.now() - sensingStart}ms`);

      // 3a. Record CSS signals from this utterance
      recordCSSSignals(input.callId, movement.cssSignals);

      // 3b. At milestone exchanges, assess session-level CSS stage from accumulated signals
      if (input.exchangeCount > 0 && input.exchangeCount % 5 === 0) {
        assessSessionCSSStage(input.callId);
      }

      // 3c. Get current session-level CSS stage for state vector coupling
      const { stage: sessionCSSStage } = getSessionCSSStage(input.callId);

      // 4. Couple state vector — apply cross-module dynamics
      const previousVectors = getPreviousVectors(input.callId);
      const stateVector = coupleStateVector(
        patterns, register, symbolic, movement,
        previousVectors, input.exchangeCount, sessionCSSStage
      );

      // 4a. Record state vector in session history
      recordStateVector(input.callId, stateVector);

      // 4b. Build coupled OSR — guidance generator uses coupled scores, not raw
      const coupledOSR: OrientationStateRegister = {
        patterns,
        register: {
          ...register,
          registerDistribution: stateVector.coupled.registerDistribution
        },
        symbolic,
        movement: {
          ...movement,
          indicators: stateVector.coupled.movementIndicators,
          cssStage: stateVector.coupled.cssStage,
          cssStageConfidence: stateVector.coupled.cssStageConfidence
        },
        meta: { stateVector }
      };

      console.log(`📊 OSR Summary (coupled):`);
      console.log(`   - Patterns: ${patterns.activePatterns.length} active, ${patterns.emergingPatterns.length} emerging`);
      console.log(`   - Register: ${register.currentRegister} (stuck: ${register.stucknessScore.toFixed(2)})`);
      console.log(`   - Symbolic: ${symbolic.activeMappings.length} active, activation: ${stateVector.coupled.symbolicActivation.toFixed(2)}`);
      console.log(`   - Movement: ${movement.trajectory}, CSS: ${stateVector.coupled.cssStage} (raw: ${movement.cssStage})`);
      console.log(`   - Momentum: ${stateVector.coupled.therapeuticMomentum.toFixed(2)}, Phase proximity: ${stateVector.coupled.phaseTransitionProximity.toFixed(2)}`);
      console.log(`   - Velocity: deep=${stateVector.velocity.deepeningAcceleration.toFixed(2)}, resist=${stateVector.velocity.resistanceTrajectory.toFixed(2)}, symbolic=${stateVector.velocity.symbolicActivationRate.toFixed(2)}`);

      // 5. Generate therapeutic guidance (using coupled OSR)
      const guidanceStart = Date.now();
      const guidance = await generateGuidance(coupledOSR, input);
      console.log(`🎯 Guidance generated in ${Date.now() - guidanceStart}ms: Posture=${guidance.posture}`);

      // 6. Update in-memory session state (NO database write)
      const previousMovement = sessionState.latestMovement;
      updateSessionState(input.callId, coupledOSR.register, coupledOSR.movement, guidance);

      // 7. Check for significant moments and record them
      const significance = isSignificantMoment(coupledOSR.movement, previousMovement);
      if (significance.isSignificant && significance.type && significance.description) {
        recordSignificantMoment(input.callId, significance.type, significance.description, guidance);
      }

      // 8. Track patterns and connections in memory (not DB)
      for (const pattern of patterns.activePatterns) {
        recordPatternDetected(input.callId, pattern.description);
      }
      for (const mapping of symbolic.activeMappings) {
        // Build connection description from mapping properties
        const connectionDesc = `${mapping.presentPattern} → ${mapping.historicalMaterial} (${mapping.connectionType})`;
        recordSymbolicConnection(input.callId, connectionDesc);
      }

      // 8a. Record STRUCTURED profile data for end-of-call persistence
      //     (These feed into user_patterns, user_historical_material, symbolic_mappings)

      // Active patterns → user_patterns
      for (const pattern of patterns.activePatterns) {
        recordStructuredPattern(input.callId, {
          description: pattern.description,
          patternType: pattern.patternType,
          confidence: pattern.matchConfidence,
          evidence: pattern.utteranceEvidence,
          userExplicitlyIdentified: false
        });
      }

      // Emerging patterns → user_patterns (lower confidence, still worth tracking across sessions)
      for (const emerging of patterns.emergingPatterns) {
        recordStructuredPattern(input.callId, {
          description: emerging.description,
          patternType: emerging.patternType,
          confidence: 0.4,
          evidence: emerging.examples[0] || '',
          userExplicitlyIdentified: false
        });
      }

      // User explicitly identified pattern → user_patterns (flagged as user-recognized)
      // Default patternType is 'cognitive' — DB only allows behavioral/cognitive/relational
      if (patterns.userExplicitIdentification) {
        recordStructuredPattern(input.callId, {
          description: patterns.userExplicitIdentification.inferredPattern,
          patternType: 'cognitive',
          confidence: patterns.userExplicitIdentification.confidence,
          evidence: patterns.userExplicitIdentification.statement,
          userExplicitlyIdentified: true
        });
      }

      // Potential connections → user_historical_material
      for (const conn of symbolic.potentialConnections) {
        const historicalContent = conn.possibleHistoricalLink || '';
        if (conn.confidence > 0.4 && historicalContent) {
          recordStructuredHistorical(input.callId, {
            content: historicalContent,
            relatedFigures: extractFiguresFromText(historicalContent),
            emotionalValence: inferValenceFromConnectionType(conn.connectionType),
            contextNotes: conn.suggestedExploration || '',
            confidence: conn.confidence
          });
        }
      }

      // Active mappings → symbolic_mappings
      // Require BOTH sides to prevent junk rows (symbolic_connection is NOT NULL)
      for (const mapping of symbolic.activeMappings) {
        const presentDesc = mapping.presentPattern || '';
        const historicalDesc = mapping.historicalMaterial || '';
        if (presentDesc && historicalDesc) {
          recordStructuredConnection(input.callId, {
            presentPattern: presentDesc,
            historicalMaterial: historicalDesc,
            connectionType: mapping.connectionType,
            confidence: mapping.currentActivation,
            userAwareness: mapping.userAwareness,
            symbolicConnection: `${presentDesc} → ${historicalDesc}`
          });
        }
      }

      // High-confidence potential connections → symbolic_mappings
      for (const conn of symbolic.potentialConnections) {
        const utterance = conn.utteranceContent || '';
        const historicalLink = conn.possibleHistoricalLink || '';
        if (conn.confidence > 0.5 && utterance && historicalLink) {
          recordStructuredConnection(input.callId, {
            presentPattern: utterance,
            historicalMaterial: historicalLink,
            connectionType: conn.connectionType,
            confidence: conn.confidence,
            userAwareness: 'unconscious',
            symbolicConnection: `${utterance} → ${historicalLink}`
          });
        }
      }

      // 9. Only write to DB on significant moments (optional - for real-time alerts)
      if (significance.isSignificant && (significance.type === 'flooding' || significance.type === 'breakthrough')) {
        // These are high-priority moments worth tracking immediately
        this.storeSignificantMoment(input, significance.type!, significance.description!, guidance).catch(err => {
          console.error('❌ [Sensing Layer] Failed to store significant moment:', err);
        });
      }

      const processingTimeMs = Date.now() - startTime;
      console.log(`⏱️ Total processing time: ${processingTimeMs}ms`);
      console.log(`🧠 ===== SENSING LAYER COMPLETE =====\n`);

      return { guidance, register, movement, stateVector };

    } catch (error) {
      console.error('❌ [Sensing Layer] Processing error:', error);

      // Return safe default guidance with fallback register/movement/stateVector
      const fallbackGuidance: TherapeuticGuidance = {
        posture: 'hold',
        registerDirection: null,
        strategicDirection: 'Stay present and follow the user\'s lead.',
        avoidances: [],
        framing: null,
        urgency: 'low',
        confidence: 0.3
      };
      const fallbackRegister: RegisterAnalysisResult = {
        currentRegister: 'Imaginary', sessionDominance: 'Imaginary',
        registerDistribution: { Real: 0.2, Imaginary: 0.6, Symbolic: 0.2 },
        stucknessScore: 0.3, fluidityScore: 0.3, registerMovement: 'static',
        indicators: { realIndicators: [], imaginaryIndicators: [], symbolicIndicators: [] }
      };
      const fallbackMovement: MovementAssessmentResult = {
        trajectory: 'holding',
        indicators: { deepening: 0, resistance: 0, integration: 0, flooding: 0, intellectualizing: 0, looping: 0 },
        cssStage: 'pointed_origin', cssStageConfidence: 0.5,
        sessionPosition: 'opening', movementQuality: 'stable',
        anticipation: { phase: 'early_elaboration', proximity: 0.3, signals: [] },
        cssSignals: []
      };
      const fallbackStateVector: TherapeuticStateVector = {
        raw: { patterns: { activePatterns: [], emergingPatterns: [], patternResonance: [], userExplicitIdentification: null }, register: fallbackRegister, symbolic: { activeMappings: [], potentialConnections: [], awarenessShift: null, generativeInsight: { currentElaboration: { topic: '', symbolicWeight: 0, connectedThemes: [] } } }, movement: fallbackMovement },
        coupled: { movementIndicators: { deepening: 0, resistance: 0, integration: 0, flooding: 0, intellectualizing: 0, looping: 0 }, registerDistribution: { Real: 0.2, Imaginary: 0.6, Symbolic: 0.2 }, cssStage: 'pointed_origin', cssStageConfidence: 0.5, symbolicActivation: 0.06, therapeuticMomentum: 0, phaseTransitionProximity: 0.3 },
        velocity: { registerShiftRate: 0, deepeningAcceleration: 0, resistanceTrajectory: 0, symbolicActivationRate: 0 },
        exchangeNumber: 0, timestamp: new Date()
      };
      return { guidance: fallbackGuidance, register: fallbackRegister, movement: fallbackMovement, stateVector: fallbackStateVector };
    }
  }

  /**
   * Fast path — heuristic-only sensing (~16ms)
   * Runs register analysis + movement assessment only (no LLM calls).
   * Used by the custom-LLM route for same-turn guidance injection.
   */
  async processFastUtterance(input: TurnInput): Promise<{
    guidance: TherapeuticGuidance;
    register: RegisterAnalysisResult;
    movement: MovementAssessmentResult;
    stateVector: TherapeuticStateVector;
  }> {
    const fastStart = Date.now();

    // Load profile from cache only — never DB on fast path
    let profile: UserTherapeuticProfile;
    const cached = profileCache.get(input.callId);
    if (cached) {
      profile = cached.profile;
    } else {
      // Cache miss on fast path — return minimal fallback immediately
      console.warn(`⚡ [FAST] Cache miss for call ${input.callId} — returning default guidance`);
      const fallbackGuidance: TherapeuticGuidance = {
        posture: 'wait_and_track',
        registerDirection: null,
        strategicDirection: '',
        avoidances: [],
        framing: null,
        urgency: 'low',
        confidence: 0.3
      };
      return {
        guidance: fallbackGuidance,
        register: { currentRegister: 'Imaginary', sessionDominance: 'Imaginary', registerDistribution: { Real: 0.2, Imaginary: 0.6, Symbolic: 0.2 }, stucknessScore: 0.3, fluidityScore: 0.3, registerMovement: 'static', indicators: { realIndicators: [], imaginaryIndicators: [], symbolicIndicators: [] } },
        movement: { trajectory: 'holding', indicators: { deepening: 0, resistance: 0, integration: 0, flooding: 0, intellectualizing: 0, looping: 0 }, cssStage: 'pointed_origin', cssStageConfidence: 0.5, sessionPosition: 'opening', movementQuality: 'stable', anticipation: { phase: 'early_elaboration', proximity: 0.3, signals: [] }, cssSignals: [] },
        stateVector: { raw: { patterns: { activePatterns: [], emergingPatterns: [], patternResonance: [], userExplicitIdentification: null }, register: { currentRegister: 'Imaginary', sessionDominance: 'Imaginary', registerDistribution: { Real: 0.2, Imaginary: 0.6, Symbolic: 0.2 }, stucknessScore: 0.3, fluidityScore: 0.3, registerMovement: 'static', indicators: { realIndicators: [], imaginaryIndicators: [], symbolicIndicators: [] } }, symbolic: { activeMappings: [], potentialConnections: [], awarenessShift: null, generativeInsight: { currentElaboration: { topic: '', symbolicWeight: 0, connectedThemes: [] } } }, movement: { trajectory: 'holding', indicators: { deepening: 0, resistance: 0, integration: 0, flooding: 0, intellectualizing: 0, looping: 0 }, cssStage: 'pointed_origin', cssStageConfidence: 0.5, sessionPosition: 'opening', movementQuality: 'stable', anticipation: { phase: 'early_elaboration', proximity: 0.3, signals: [] }, cssSignals: [] } }, coupled: { movementIndicators: { deepening: 0, resistance: 0, integration: 0, flooding: 0, intellectualizing: 0, looping: 0 }, registerDistribution: { Real: 0.2, Imaginary: 0.6, Symbolic: 0.2 }, cssStage: 'pointed_origin', cssStageConfidence: 0.5, symbolicActivation: 0.06, therapeuticMomentum: 0, phaseTransitionProximity: 0.3 }, velocity: { registerShiftRate: 0, deepeningAcceleration: 0, resistanceTrajectory: 0, symbolicActivationRate: 0 }, exchangeNumber: 0, timestamp: new Date() }
      };
    }

    // Empty defaults for LLM modules — not run on fast path
    const emptyPatterns: PatternDetectionResult = {
      activePatterns: [],
      emergingPatterns: [],
      patternResonance: [],
      userExplicitIdentification: null
    };

    const emptySymbolic: SymbolicMappingResult = {
      activeMappings: [],
      potentialConnections: [],
      awarenessShift: null,
      generativeInsight: {
        currentElaboration: {
          topic: '',
          symbolicWeight: 0,
          connectedThemes: []
        }
      }
    };

    // Run only heuristic modules — no LLM calls
    const [register, movement] = await Promise.all([
      analyzeRegister(input, profile),
      assessMovement(input, profile)
    ]);

    // Couple state vector with empty pattern/symbolic inputs
    const stateVector = coupleStateVector(
      emptyPatterns,
      register,
      emptySymbolic,
      movement,
      [], // no previous vectors on fast path
      input.exchangeCount,
      profile.cssHistory?.[0]?.stage ?? 'pointed_origin'
    );

    // Assemble minimal OSR for guidance generation
    const fastOSR: OrientationStateRegister = {
      patterns: emptyPatterns,
      register: {
        ...register,
        registerDistribution: stateVector.coupled.registerDistribution
      },
      symbolic: emptySymbolic,
      movement: {
        ...movement,
        cssStage: stateVector.coupled.cssStage,
        cssStageConfidence: stateVector.coupled.cssStageConfidence
      },
      meta: { stateVector }
    };

    const guidance = await generateGuidance(fastOSR, input);
    console.log(`⚡ [FAST] Sensing complete in ${Date.now() - fastStart}ms: posture=${guidance.posture}`);
    return {
      guidance,
      register,
      movement,
      stateVector
    };
  }

  /**
   * Initialize a new session (call when VAPI call starts)
   * Pre-caches user profile to avoid per-turn DB loads
   */
  async initializeCallSession(callId: string, userId: string, sessionId: string): Promise<void> {
    try {
      const profile = await this.getUserProfile(userId);
      profileCache.set(callId, { profile, loadedAt: Date.now() });
      initializeSession(callId, userId, sessionId, profile.lastCSSStage, profile.lastCSSStageConfidence);
      console.log(`👤 [SENSING] Profile pre-cached for call ${callId}, CSS arc seeded: ${profile.lastCSSStage ?? 'pointed_origin'} (${profile.lastCSSStageConfidence ?? 0.3})`);
    } catch (error) {
      console.error(`❌ [SENSING] Failed to pre-cache profile, initializing with defaults:`, error);
      initializeSession(callId, userId, sessionId);
    }
  }

  /**
   * Finalize session and write summary to database (call when VAPI call ends)
   */
  async finalizeSession(callId: string): Promise<SessionSummary | null> {
    const summary = getSessionSummary(callId);
    if (!summary) {
      console.warn(`⚠️ [Sensing Layer] No session found to finalize for call ${callId}`);
      return null;
    }

    console.log(`📊 [Sensing Layer] Finalizing session for call ${callId}`);
    console.log(`   Exchanges: ${summary.exchangeCount}`);
    console.log(`   Dominant register: ${summary.dominantRegister}`);
    console.log(`   Significant moments: ${summary.significantMoments.length}`);

    try {
      // Write session summary to database
      await this.storeSessionSummary(summary);

      // Persist accumulated profile data to user_patterns, user_historical_material, symbolic_mappings
      if (summary.structuredPatterns.length > 0 || summary.structuredHistorical.length > 0 || summary.structuredConnections.length > 0) {
        console.log(`💾 [Sensing Layer] Persisting user profile data...`);
        await persistSessionProfile(
          summary.userId,
          summary.structuredPatterns,
          summary.structuredHistorical,
          summary.structuredConnections
        );
      }

      // Write CSS arc summary for cross-session continuity
      try {
        await supabase
          .from('therapeutic_context')
          .insert({
            user_id: summary.userId,
            call_id: summary.callId,
            context_type: 'css_arc_summary',
            content: JSON.stringify({
              stage: summary.finalCSSStage,
              confidence: summary.finalCSSStageConfidence
            }),
            confidence: 0.9,
            importance: 9
          });
        console.log(`🎯 [Sensing Layer] CSS arc summary written: ${summary.finalCSSStage} (${summary.finalCSSStageConfidence.toFixed(2)})`);
      } catch (arcError) {
        console.error(`❌ [Sensing Layer] Failed to write CSS arc summary (non-fatal):`, arcError);
      }

      // Clear from memory
      clearSession(callId);
      profileCache.delete(callId);

      return summary;
    } catch (error) {
      console.error('❌ [Sensing Layer] Error finalizing session:', error);
      clearSession(callId); // Still clear memory to avoid leaks
      profileCache.delete(callId);
      return null;
    }
  }

  /**
   * Store session summary to database (single write at end of call)
   */
  private async storeSessionSummary(summary: SessionSummary): Promise<void> {
    // 1. Store session register analysis (single row per call)
    const { error: registerError } = await supabase
      .from('session_register_analysis')
      .insert({
        session_id: summary.sessionId,
        call_id: summary.callId,
        user_id: summary.userId,
        dominant_register: summary.dominantRegister,
        fluidity_score: summary.fluidityScore,
        stuckness_score: summary.stucknessScore,
        register_distribution: summary.registerDistribution,
        analysis_notes: JSON.stringify({
          exchangeCount: summary.exchangeCount,
          significantMoments: summary.significantMoments.length,
          patternsDetected: summary.patternsDetected,
          symbolicConnections: summary.symbolicConnections,
          finalCSSStage: summary.finalCSSStage,
          finalMovementQuality: summary.finalMovementQuality,
          duration: new Date(summary.endTime).getTime() - new Date(summary.startTime).getTime(),
          fieldSummary: summary.fieldSummary
        })
      });

    if (registerError) {
      console.error('❌ [Sensing Layer] Error storing register analysis:', registerError);
    } else {
      console.log(`💾 [Sensing Layer] Session summary stored for call ${summary.callId}`);
    }

    // Write session-level CSS stage to css_patterns for longitudinal tracking
    // This is the authoritative record used to populate cssHistory on next session load
    const { error: cssError } = await supabase
      .from('css_patterns')
      .insert({
        user_id: summary.userId,
        call_id: summary.callId,
        pattern_type: summary.finalCSSStage,
        css_stage: summary.finalCSSStage,
        content: JSON.stringify({
          sessionPosition: summary.finalMovementQuality,
          exchangeCount: summary.exchangeCount,
          dominantRegister: summary.dominantRegister,
          cssProgressionDirection: summary.fieldSummary?.cssProgressionDirection ?? 'stable'
        }),
        confidence: 0.7,
        detected_at: summary.endTime.toISOString(),
        register: summary.dominantRegister,
        register_stuckness: summary.stucknessScore,
        safety_flag: false,
        crisis_flag: false,
        hsfb_invoked: false
      });

    if (cssError) {
      console.warn(`⚠️ [Sensing Layer] Could not store CSS stage record:`, cssError.message);
    } else {
      console.log(`🎯 [Sensing Layer] CSS stage persisted: ${summary.finalCSSStage} for ${summary.callId}`);
    }

    // 2. Store significant moments if any (separate table for easy querying)
    if (summary.significantMoments.length > 0) {
      const moments = summary.significantMoments.map(m => ({
        session_id: summary.sessionId,
        call_id: summary.callId,
        user_id: summary.userId,
        exchange_number: m.exchange,
        moment_type: m.type,
        description: m.description,
        guidance: m.guidance || null
      }));

      const { error: momentsError } = await supabase
        .from('significant_moments')
        .insert(moments);

      if (momentsError) {
        // Table might not exist yet - just log and continue
        console.warn(`⚠️ [Sensing Layer] Could not store significant moments:`, momentsError.message);
      }
    }
  }

  /**
   * Store a single significant moment immediately (for high-priority events)
   */
  private async storeSignificantMoment(
    input: TurnInput,
    type: string,
    description: string,
    guidance: TherapeuticGuidance
  ): Promise<void> {
    const { error } = await supabase
      .from('significant_moments')
      .insert({
        session_id: input.sessionId,
        call_id: input.callId,
        user_id: input.userId,
        exchange_number: input.exchangeCount,
        moment_type: type,
        description: description,
        guidance: guidance
      });

    if (error) {
      // Table might not exist - silently fail
      console.warn(`⚠️ [Sensing Layer] Could not store significant moment:`, error.message);
    } else {
      console.log(`⭐ [Sensing Layer] Significant moment stored: ${type}`);
    }
  }

  /**
   * Get user's therapeutic profile from database
   */
  private async getUserProfile(userId: string): Promise<UserTherapeuticProfile> {
    console.log(`📥 [Sensing Layer] Loading profile for user: ${userId}`);

    try {
      // Fetch all profile components in parallel
      const [
        patternsResult,
        historicalResult,
        mappingsResult,
        registerResult,
        cssResult,
        lastSessionResult,
        cssArcResult
      ] = await Promise.all([
        supabase
          .from('user_patterns')
          .select('*')
          .eq('user_id', userId)
          .eq('active', true)
          .order('last_observed', { ascending: false })
          .limit(20),

        supabase
          .from('user_historical_material')
          .select('*')
          .eq('user_id', userId)
          .order('disclosed_date', { ascending: false })
          .limit(20),

        supabase
          .from('symbolic_mappings')
          .select('*')
          .eq('user_id', userId)
          .order('confidence', { ascending: false })
          .limit(20),

        supabase
          .from('session_register_analysis')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(50),

        supabase
          .from('css_patterns')
          .select('id, user_id, css_stage, confidence, detected_at, content')
          .eq('user_id', userId)
          .order('detected_at', { ascending: false })
          .limit(20),

        supabase
          .from('therapeutic_context')
          .select('content')
          .eq('user_id', userId)
          .eq('context_type', 'conversational_summary')
          .order('created_at', { ascending: false })
          .limit(1),

        supabase
          .from('therapeutic_context')
          .select('content')
          .eq('user_id', userId)
          .eq('context_type', 'css_arc_summary')
          .order('created_at', { ascending: false })
          .limit(1)
      ]);

      // Transform database rows to domain types
      const patterns = this.transformPatterns(patternsResult.data || []);
      const historicalMaterial = this.transformHistoricalMaterial(historicalResult.data || []);
      const symbolicMappings = this.transformSymbolicMappings(mappingsResult.data || []);
      const registerHistory = this.transformRegisterHistory(registerResult.data || []);
      const cssHistory = this.transformCSSHistory(cssResult.data || []);

      // Parse CSS arc summary from last session
      let lastCSSStage: import('./types').CSSStage | null = null;
      let lastCSSStageConfidence: number | null = null;
      const arcContent = cssArcResult.data?.[0]?.content;
      if (arcContent) {
        try {
          const parsed = typeof arcContent === 'string' ? JSON.parse(arcContent) : arcContent;
          lastCSSStage = parsed.stage ?? null;
          lastCSSStageConfidence = parsed.confidence ?? null;
        } catch {
          console.warn(`⚠️ [Sensing Layer] Could not parse css_arc_summary content`);
        }
      }

      return {
        patterns,
        historicalMaterial,
        symbolicMappings,
        registerHistory,
        cssHistory,
        lastSessionSummary: lastSessionResult.data?.[0]?.content ?? null,
        lastCSSStage,
        lastCSSStageConfidence,
      };

    } catch (error) {
      console.error('❌ [Sensing Layer] Error loading profile:', error);
      // Return empty profile for new users
      return {
        patterns: [],
        historicalMaterial: [],
        symbolicMappings: [],
        registerHistory: [],
        cssHistory: []
      };
    }
  }

  // Transform functions for database rows to domain types

  private transformPatterns(rows: UserPatternRow[]): UserPattern[] {
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      description: row.description,
      patternType: row.pattern_type as PatternType,
      occurrences: row.occurrences,
      examples: row.examples || [],
      userExplicitlyIdentified: row.user_explicitly_identified,
      firstDetected: row.first_detected,
      lastObserved: row.last_observed,
      active: row.active
    }));
  }

  private transformHistoricalMaterial(rows: UserHistoricalMaterialRow[]): HistoricalMaterial[] {
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      content: row.content,
      relatedFigures: row.related_figures || [],
      emotionalValence: row.emotional_valence,
      contextNotes: row.context_notes,
      disclosedDate: row.disclosed_date
    }));
  }

  private transformSymbolicMappings(rows: SymbolicMappingRow[]): SymbolicMapping[] {
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      presentPatternId: row.present_pattern_id,
      historicalMaterialId: row.historical_material_id,
      symbolicConnection: row.symbolic_connection,
      connectionType: row.connection_type as SymbolicConnectionType,
      confidence: row.confidence,
      userRecognized: row.user_recognized,
      userAwareness: row.user_awareness as AwarenessLevel
    }));
  }

  private transformRegisterHistory(rows: SessionRegisterAnalysisRow[]): RegisterHistoryEntry[] {
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      callId: row.call_id,
      userId: row.user_id,
      dominantRegister: row.dominant_register as 'Real' | 'Imaginary' | 'Symbolic',
      fluidityScore: row.fluidity_score,
      stucknessScore: row.stuckness_score,
      registerDistribution: row.register_distribution,
      analysisNotes: row.analysis_notes,
      timestamp: new Date().toISOString() // Default since not in row
    }));
  }

  private transformCSSHistory(rows: any[]): CSSHistoryEntry[] {
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      stage: row.css_stage,
      confidence: row.confidence || 0.5,
      detectedAt: row.detected_at,
      evidence: row.content ? [row.content] : []
    }));
  }
}

// Export singleton instance
export const sensingLayer = SensingLayerService.getInstance();

// ─────────────────────────────────────────────
// Helper functions for structured profile recording
// ─────────────────────────────────────────────

/**
 * Extract figure/person references from historical material text.
 */
function extractFiguresFromText(text: string): string[] {
  const figures: string[] = [];
  const lowerText = text.toLowerCase();

  const figurePatterns: Array<{ regex: RegExp; figure: string }> = [
    { regex: /\b(mother|mom|mama)\b/, figure: 'mother' },
    { regex: /\b(father|dad|papa)\b/, figure: 'father' },
    { regex: /\b(parent|parents)\b/, figure: 'parent' },
    { regex: /\b(sibling|brother|sister)\b/, figure: 'sibling' },
    { regex: /\b(partner|spouse|husband|wife)\b/, figure: 'partner' },
    { regex: /\b(ex|ex-partner|ex-husband|ex-wife)\b/, figure: 'ex-partner' },
    { regex: /\b(boss|manager|supervisor)\b/, figure: 'authority figure' },
    { regex: /\b(teacher|coach|mentor)\b/, figure: 'mentor figure' },
    { regex: /\b(friend|best friend)\b/, figure: 'friend' },
    { regex: /\b(grandparent|grandmother|grandfather|grandma|grandpa)\b/, figure: 'grandparent' },
    { regex: /\b(child|son|daughter|kid)\b/, figure: 'child' },
    { regex: /\b(caregiver|caretaker)\b/, figure: 'caregiver' }
  ];

  for (const { regex, figure } of figurePatterns) {
    if (regex.test(lowerText) && !figures.includes(figure)) {
      figures.push(figure);
    }
  }

  return figures;
}

/**
 * Infer emotional valence from the type of symbolic connection.
 */
function inferValenceFromConnectionType(connectionType: string): string {
  switch (connectionType) {
    case 'figure_substitution':
      return 'complex';
    case 'situation_echo':
      return 'distressing';
    case 'emotional_rhyme':
      return 'resonant';
    case 'behavioral_repetition':
      return 'conflicted';
    default:
      return 'unspecified';
  }
}

// Export types for external use
export * from './types';

// Export session state types and functions
export type { SessionSummary } from './session-state';
export { getSessionState, clearSession } from './session-state';

export type { TherapeuticStateVector, StateVectorHistory } from './state-vector';
