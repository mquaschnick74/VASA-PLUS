// server/services/sensing-layer/types.ts
// Type definitions for the Sensing Layer service

/**
 * Input for processing a single turn/utterance
 */
export interface TurnInput {
  utterance: string;
  sessionId: string;
  callId: string;
  userId: string;
  exchangeCount: number;
  conversationHistory: ConversationTurn[];
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

/**
 * Complete therapeutic profile for a user
 */
export interface UserTherapeuticProfile {
  patterns: UserPattern[];
  historicalMaterial: HistoricalMaterial[];
  symbolicMappings: SymbolicMapping[];
  registerHistory: RegisterHistoryEntry[];
  cssHistory: CSSHistoryEntry[];
}

export interface UserPattern {
  id: string;
  userId: string;
  description: string;
  patternType: PatternType;
  occurrences: number;
  examples: string[];
  userExplicitlyIdentified: boolean;
  firstDetected: string;
  lastObserved: string;
  active: boolean;
}

export type PatternType =
  | 'behavioral'      // Repeated actions/behaviors
  | 'cognitive'       // Thought patterns
  | 'relational'      // Relationship dynamics
  | 'emotional'       // Emotional responses
  | 'avoidance'       // Avoidance patterns
  | 'protective';     // Protective/defense mechanisms

export interface HistoricalMaterial {
  id: string;
  userId: string;
  content: string;
  relatedFigures: string[];
  emotionalValence: string;
  contextNotes: string;
  disclosedDate: string;
}

export interface SymbolicMapping {
  id: string;
  userId: string;
  presentPatternId: string;
  historicalMaterialId: string;
  symbolicConnection: string;
  connectionType: SymbolicConnectionType;
  confidence: number;
  userRecognized: boolean;
  userAwareness: AwarenessLevel;
}

export type SymbolicConnectionType =
  | 'figure_substitution'     // Partner → Parent figure
  | 'situation_echo'          // Current conflict → Historical conflict structure
  | 'emotional_rhyme'         // Present feeling → Unprocessed historical feeling
  | 'behavioral_repetition';  // Current action → Learned survival pattern

export type AwarenessLevel = 'unconscious' | 'preconscious' | 'emerging' | 'conscious';

export interface RegisterHistoryEntry {
  id: string;
  sessionId: string;
  callId: string;
  userId: string;
  dominantRegister: Register;
  fluidityScore: number;
  stucknessScore: number;
  registerDistribution: RegisterDistribution;
  analysisNotes: string;
  timestamp: string;
}

export interface CSSHistoryEntry {
  id: string;
  userId: string;
  stage: CSSStage;
  confidence: number;
  detectedAt: string;
  evidence: string[];
}

export type CSSStage =
  | 'pointed_origin'    // Initial engagement
  | 'focus_bind'        // Contradiction identified
  | 'suspension'        // Holding multiple perspectives
  | 'gesture_toward'    // Movement toward integration
  | 'completion'        // Active choice emerging
  | 'terminal';         // Full recursive awareness

/**
 * Pattern Detection Result
 */
export interface PatternDetectionResult {
  activePatterns: DetectedPattern[];
  emergingPatterns: EmergingPattern[];
  patternResonance: PatternResonance[];
  userExplicitIdentification: UserExplicitPattern | null;
}

export interface DetectedPattern {
  patternId: string;
  description: string;
  patternType: PatternType;
  matchConfidence: number;
  utteranceEvidence: string;
  occurrenceCount: number;
}

export interface EmergingPattern {
  description: string;
  patternType: PatternType;
  occurrenceCount: number;  // 1 or 2 - not yet a pattern
  examples: string[];
  potentialSignificance: string;
}

export interface PatternResonance {
  patternId: string;
  resonanceStrength: number;  // 0-1 how strongly this utterance activates the pattern
  resonanceType: 'direct' | 'thematic' | 'emotional' | 'structural';
}

export interface UserExplicitPattern {
  statement: string;
  inferredPattern: string;
  confidence: number;
}

/**
 * Register Analysis Result
 */
export interface RegisterAnalysisResult {
  currentRegister: Register;
  sessionDominance: Register;
  registerDistribution: RegisterDistribution;
  stucknessScore: number;  // 0-1, higher = more stuck
  fluidityScore: number;   // 0-1, higher = moving between registers
  registerMovement: RegisterMovement;
  indicators: RegisterIndicators;
}

export type Register = 'Real' | 'Imaginary' | 'Symbolic';

export interface RegisterDistribution {
  Real: number;      // 0-1
  Imaginary: number; // 0-1
  Symbolic: number;  // 0-1
}

export type RegisterMovement =
  | 'toward_real'       // Moving toward body/sensation
  | 'toward_imaginary'  // Moving toward stories/elaboration
  | 'toward_symbolic'   // Moving toward pattern recognition
  | 'static'            // Not moving
  | 'fluid';            // Healthy movement between all

export interface RegisterIndicators {
  realIndicators: string[];      // Body words, sensations found
  imaginaryIndicators: string[]; // Story markers, what-ifs found
  symbolicIndicators: string[];  // Pattern markers found
}

/**
 * Symbolic Mapping Result
 */
export interface SymbolicMappingResult {
  activeMappings: ActiveSymbolicMapping[];
  potentialConnections: PotentialConnection[];
  awarenessShift: AwarenessShift | null;
}

export interface ActiveSymbolicMapping {
  mappingId: string;
  presentPattern: string;
  historicalMaterial: string;
  connectionType: SymbolicConnectionType;
  currentActivation: number;  // 0-1 how active in this moment
  userAwareness: AwarenessLevel;
}

export interface PotentialConnection {
  utteranceContent: string;
  possibleHistoricalLink: string;
  connectionType: SymbolicConnectionType;
  confidence: number;
  suggestedExploration: string;
}

export interface AwarenessShift {
  mappingId: string;
  fromLevel: AwarenessLevel;
  toLevel: AwarenessLevel;
  evidenceStatement: string;
}

/**
 * Movement Assessment Result
 */
export interface MovementAssessmentResult {
  trajectory: TherapeuticTrajectory;
  indicators: MovementIndicators;
  cssStage: CSSStage;
  cssStageConfidence: number;
  sessionPosition: SessionPosition;
  movementQuality: MovementQuality;
}

export type TherapeuticTrajectory =
  | 'toward_mastery'      // Making progress
  | 'away_from_mastery'   // Retreating/defending
  | 'holding'             // Stable but not moving
  | 'cycling';            // Going in circles

export interface MovementIndicators {
  deepening: number;        // 0-1 going deeper
  resistance: number;       // 0-1 defending
  integration: number;      // 0-1 synthesizing
  flooding: number;         // 0-1 overwhelmed
  intellectualizing: number; // 0-1 in head not body
  looping: number;          // 0-1 repeating patterns
}

export type SessionPosition =
  | 'opening'      // First exchanges
  | 'developing'   // Building theme
  | 'working'      // Deep engagement
  | 'integrating'  // Pulling together
  | 'closing';     // Wrapping up

export interface MovementQuality {
  pace: 'rushed' | 'steady' | 'slow' | 'stuck';
  depth: 'surface' | 'moderate' | 'deep' | 'very_deep';
  coherence: 'fragmented' | 'developing' | 'coherent' | 'integrated';
}

/**
 * Orientation State Register - Complete sensing output
 */
export interface OrientationStateRegister {
  patterns: PatternDetectionResult;
  register: RegisterAnalysisResult;
  symbolic: SymbolicMappingResult;
  movement: MovementAssessmentResult;
}

/**
 * Therapeutic Guidance - Output to voice model
 */
export interface TherapeuticGuidance {
  posture: TherapeuticPosture;
  registerDirection: RegisterDirection | null;
  strategicDirection: string;
  avoidances: string[];
  framing: string | null;
  urgency: GuidanceUrgency;
  confidence: number;
}

export type TherapeuticPosture =
  | 'probe'     // Ask deepening questions
  | 'hold'      // Stay with what's present
  | 'challenge' // Gently confront
  | 'support'   // Validate and encourage
  | 'reflect'   // Mirror back
  | 'silent';   // Allow space

export interface RegisterDirection {
  from: Register;
  toward: Register;
  technique: string;
}

export type GuidanceUrgency = 'low' | 'moderate' | 'high' | 'immediate';

/**
 * Sensing Layer Output - Complete record for storage
 */
export interface SensingLayerOutput {
  id?: string;
  sessionId: string;
  callId: string;
  userId: string;
  exchangeNumber: number;
  userUtterance: string;
  orientationState: OrientationStateRegister;
  therapeuticGuidance: TherapeuticGuidance;
  processingTimeMs: number;
  createdAt?: string;
}

/**
 * Database row types for Supabase
 */
export interface UserPatternRow {
  id: string;
  user_id: string;
  description: string;
  pattern_type: string;
  occurrences: number;
  examples: string[];
  user_explicitly_identified: boolean;
  first_detected: string;
  last_observed: string;
  active: boolean;
}

export interface UserHistoricalMaterialRow {
  id: string;
  user_id: string;
  content: string;
  related_figures: string[];
  emotional_valence: string;
  context_notes: string;
  disclosed_date: string;
}

export interface SymbolicMappingRow {
  id: string;
  user_id: string;
  present_pattern_id: string;
  historical_material_id: string;
  symbolic_connection: string;
  connection_type: string;
  confidence: number;
  user_recognized: boolean;
  user_awareness: string;
}

export interface SessionRegisterAnalysisRow {
  id: string;
  session_id: string;
  call_id: string;
  user_id: string;
  dominant_register: string;
  fluidity_score: number;
  stuckness_score: number;
  register_distribution: RegisterDistribution;
  analysis_notes: string;
}

export interface SensingLayerOutputRow {
  id?: string;
  session_id: string;
  call_id: string;
  user_id: string;
  exchange_number: number;
  user_utterance: string;
  orientation_state: OrientationStateRegister;
  therapeutic_guidance: TherapeuticGuidance;
  processing_time_ms: number;
  created_at?: string;
}
