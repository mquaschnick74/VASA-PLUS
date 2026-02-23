// server/services/sensing-layer/index.ts
// Main Sensing Layer Service - Orchestrates all sensing modules

import { supabase } from '../supabase-service';
import { detectPatterns } from './pattern-detection';
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
  isSignificantMoment,
  getSessionSummary,
  clearSession,
  SessionSummary,
  recordStateVector,
  getPreviousVectors
} from './session-state';
import {
  coupleStateVector,
  TherapeuticStateVector
} from './state-vector';
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
  RegisterAnalysisResult,
  PatternType,
  AwarenessLevel,
  SymbolicConnectionType
} from './types';

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
  async processUtterance(input: TurnInput): Promise<TherapeuticGuidance> {
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

      // 2. Get user profile from database (cached per session ideally)
      const profileStart = Date.now();
      const profile = await this.getUserProfile(input.userId);
      console.log(`👤 Profile loaded in ${Date.now() - profileStart}ms: ${profile.patterns.length} patterns, ${profile.historicalMaterial.length} historical items`);

      // 3. Run sensing computations in parallel for speed
      const sensingStart = Date.now();
      const [patterns, register, symbolic, movement] = await Promise.all([
        detectPatterns(input, profile),
        analyzeRegister(input, profile),
        mapSymbolic(input, profile),
        assessMovement(input, profile)
      ]);
      console.log(`⚡ Sensing computations completed in ${Date.now() - sensingStart}ms`);

      // 4. Couple state vector — apply cross-module dynamics
      const previousVectors = getPreviousVectors(input.callId);
      const stateVector = coupleStateVector(
        patterns, register, symbolic, movement,
        previousVectors, input.exchangeCount
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

      return guidance;

    } catch (error) {
      console.error('❌ [Sensing Layer] Processing error:', error);

      // Return safe default guidance
      return {
        posture: 'hold',
        registerDirection: null,
        strategicDirection: 'Stay present and follow the user\'s lead.',
        avoidances: [],
        framing: null,
        urgency: 'low',
        confidence: 0.3
      };
    }
  }

  /**
   * Initialize a new session (call when VAPI call starts)
   */
  initializeCallSession(callId: string, userId: string, sessionId: string): void {
    initializeSession(callId, userId, sessionId);
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

      // Clear from memory
      clearSession(callId);

      return summary;
    } catch (error) {
      console.error('❌ [Sensing Layer] Error finalizing session:', error);
      clearSession(callId); // Still clear memory to avoid leaks
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
        cssResult
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
          .limit(20)
      ]);

      // Transform database rows to domain types
      const patterns = this.transformPatterns(patternsResult.data || []);
      const historicalMaterial = this.transformHistoricalMaterial(historicalResult.data || []);
      const symbolicMappings = this.transformSymbolicMappings(mappingsResult.data || []);
      const registerHistory = this.transformRegisterHistory(registerResult.data || []);
      const cssHistory = this.transformCSSHistory(cssResult.data || []);

      return {
        patterns,
        historicalMaterial,
        symbolicMappings,
        registerHistory,
        cssHistory
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

// Export types for external use
export * from './types';

// Export session state types and functions
export type { SessionSummary } from './session-state';
export { getSessionState, clearSession } from './session-state';

export type { TherapeuticStateVector, StateVectorHistory } from './state-vector';
