// server/services/sensing-layer/index.ts
// Main Sensing Layer Service - Orchestrates all sensing modules

import { supabase } from '../supabase-service';
import { detectPatterns } from './pattern-detection';
import { analyzeRegister } from './register-analysis';
import { mapSymbolic } from './symbolic-mapping';
import { assessMovement } from './movement-assessment';
import { generateGuidance } from './guidance-generator';
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
   */
  async processUtterance(input: TurnInput): Promise<TherapeuticGuidance> {
    const startTime = Date.now();
    console.log(`\n🧠 ===== SENSING LAYER PROCESSING =====`);
    console.log(`📝 User: "${input.utterance.substring(0, 100)}..."`);
    console.log(`📊 Session: ${input.sessionId}, Exchange: ${input.exchangeCount}`);

    try {
      // 1. Get user profile from database
      const profile = await this.getUserProfile(input.userId);
      console.log(`👤 Profile loaded: ${profile.patterns.length} patterns, ${profile.historicalMaterial.length} historical items`);

      // 2. Run sensing computations in parallel for speed
      const [patterns, register, symbolic, movement] = await Promise.all([
        detectPatterns(input, profile),
        analyzeRegister(input, profile),
        mapSymbolic(input, profile),
        assessMovement(input, profile)
      ]);

      // 3. Build Orientation State Register
      const osr: OrientationStateRegister = {
        patterns,
        register,
        symbolic,
        movement
      };

      console.log(`📊 OSR Summary:`);
      console.log(`   - Patterns: ${patterns.activePatterns.length} active, ${patterns.emergingPatterns.length} emerging`);
      console.log(`   - Register: ${register.currentRegister} (stuck: ${register.stucknessScore.toFixed(2)})`);
      console.log(`   - Symbolic: ${symbolic.activeMappings.length} active mappings`);
      console.log(`   - Movement: ${movement.trajectory}, CSS: ${movement.cssStage}`);

      // 4. Generate therapeutic guidance
      const guidance = await generateGuidance(osr, input);

      console.log(`🎯 Guidance: Posture=${guidance.posture}, Direction="${guidance.strategicDirection.substring(0, 50)}..."`);

      // 5. Store sensing output for analysis (non-blocking)
      const processingTimeMs = Date.now() - startTime;
      this.storeSensingOutput(input, osr, guidance, processingTimeMs).catch(err => {
        console.error('❌ [Sensing Layer] Failed to store output:', err);
      });

      // 6. Update user profile with new observations (non-blocking)
      this.updateProfile(input.userId, input.sessionId, input.callId, osr, patterns).catch(err => {
        console.error('❌ [Sensing Layer] Failed to update profile:', err);
      });

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

  /**
   * Store sensing output in database
   */
  private async storeSensingOutput(
    input: TurnInput,
    osr: OrientationStateRegister,
    guidance: TherapeuticGuidance,
    processingTimeMs: number
  ): Promise<void> {
    const output: SensingLayerOutputRow = {
      session_id: input.sessionId,
      call_id: input.callId,
      user_id: input.userId,
      exchange_number: input.exchangeCount,
      user_utterance: input.utterance,
      orientation_state: osr,
      therapeutic_guidance: guidance,
      processing_time_ms: processingTimeMs
    };

    const { error } = await supabase
      .from('sensing_layer_outputs')
      .insert(output);

    if (error) {
      console.error('❌ [Sensing Layer] Error storing output:', error);
    } else {
      console.log(`💾 [Sensing Layer] Output stored (${processingTimeMs}ms)`);
    }
  }

  /**
   * Update user profile with new observations
   */
  private async updateProfile(
    userId: string,
    sessionId: string,
    callId: string,
    osr: OrientationStateRegister,
    patterns: PatternDetectionResult
  ): Promise<void> {
    const updates: Promise<void>[] = [];

    // 1. Update/create emerging patterns that hit threshold
    for (const emerging of patterns.emergingPatterns) {
      if (emerging.occurrenceCount >= 3) {
        updates.push(this.createOrUpdatePattern(userId, emerging));
      }
    }

    // 2. Update existing pattern occurrences
    for (const active of patterns.activePatterns) {
      updates.push(this.incrementPatternOccurrence(active.patternId));
    }

    // 3. Store user-identified patterns
    if (patterns.userExplicitIdentification) {
      updates.push(this.storeUserIdentifiedPattern(
        userId,
        patterns.userExplicitIdentification
      ));
    }

    // 4. Store register analysis
    updates.push(this.storeRegisterAnalysis(
      sessionId,
      callId,
      userId,
      osr.register
    ));

    // 5. Update awareness levels if shift detected
    if (osr.symbolic.awarenessShift) {
      updates.push(this.updateAwarenessLevel(
        osr.symbolic.awarenessShift.mappingId,
        osr.symbolic.awarenessShift.toLevel
      ));
    }

    await Promise.all(updates);
    console.log(`📝 [Sensing Layer] Profile updated with ${updates.length} changes`);
  }

  /**
   * Create or update a pattern
   */
  private async createOrUpdatePattern(
    userId: string,
    emerging: { description: string; patternType: PatternType; examples: string[] }
  ): Promise<void> {
    const { error } = await supabase
      .from('user_patterns')
      .upsert({
        user_id: userId,
        description: emerging.description,
        pattern_type: emerging.patternType,
        occurrences: 3,
        examples: emerging.examples,
        user_explicitly_identified: false,
        first_detected: new Date().toISOString(),
        last_observed: new Date().toISOString(),
        active: true
      }, {
        onConflict: 'user_id,description'
      });

    if (error) {
      console.error('❌ [Sensing Layer] Error upserting pattern:', error);
    }
  }

  /**
   * Increment pattern occurrence count
   */
  private async incrementPatternOccurrence(patternId: string): Promise<void> {
    const { error } = await supabase.rpc('increment_pattern_occurrence', {
      pattern_id: patternId
    });

    if (error) {
      // Fallback: fetch and update manually
      const { data } = await supabase
        .from('user_patterns')
        .select('occurrences')
        .eq('id', patternId)
        .single();

      if (data) {
        await supabase
          .from('user_patterns')
          .update({
            occurrences: (data.occurrences || 0) + 1,
            last_observed: new Date().toISOString()
          })
          .eq('id', patternId);
      }
    }
  }

  /**
   * Store a pattern explicitly identified by user
   */
  private async storeUserIdentifiedPattern(
    userId: string,
    identification: { statement: string; inferredPattern: string; confidence: number }
  ): Promise<void> {
    const { error } = await supabase
      .from('user_patterns')
      .insert({
        user_id: userId,
        description: identification.inferredPattern,
        pattern_type: 'behavioral' as PatternType, // Will be refined
        occurrences: 1,
        examples: [identification.statement],
        user_explicitly_identified: true,
        first_detected: new Date().toISOString(),
        last_observed: new Date().toISOString(),
        active: true
      });

    if (error && !error.message?.includes('duplicate')) {
      console.error('❌ [Sensing Layer] Error storing user-identified pattern:', error);
    }
  }

  /**
   * Store register analysis for the session
   */
  private async storeRegisterAnalysis(
    sessionId: string,
    callId: string,
    userId: string,
    register: RegisterAnalysisResult
  ): Promise<void> {
    const { error } = await supabase
      .from('session_register_analysis')
      .insert({
        session_id: sessionId,
        call_id: callId,
        user_id: userId,
        dominant_register: register.currentRegister,
        fluidity_score: register.fluidityScore,
        stuckness_score: register.stucknessScore,
        register_distribution: register.registerDistribution,
        analysis_notes: `Movement: ${register.registerMovement}, Indicators: ${
          register.indicators.realIndicators.length
        }R/${register.indicators.imaginaryIndicators.length}I/${register.indicators.symbolicIndicators.length}S`
      });

    if (error) {
      console.error('❌ [Sensing Layer] Error storing register analysis:', error);
    }
  }

  /**
   * Update awareness level for a symbolic mapping
   */
  private async updateAwarenessLevel(
    mappingId: string,
    newLevel: AwarenessLevel
  ): Promise<void> {
    const { error } = await supabase
      .from('symbolic_mappings')
      .update({
        user_awareness: newLevel,
        user_recognized: newLevel === 'conscious'
      })
      .eq('id', mappingId);

    if (error) {
      console.error('❌ [Sensing Layer] Error updating awareness level:', error);
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
