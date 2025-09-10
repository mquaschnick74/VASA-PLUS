import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, real, jsonb, uuid, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - Updated with enterprise auth fields
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  auth_user_id: uuid("auth_user_id").unique(), // Links to Supabase auth.users
  email: text("email").notNull().unique(),
  first_name: text("first_name"),
  role: text("role").default("client"), // client, therapist, admin
  subscription_type: text("subscription_type").default("free"), // free, premium, enterprise
  subscription_status: text("subscription_status").default("active"), // active, cancelled, expired
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`timezone('utc', now())`),
  updated_at: timestamp("updated_at", { withTimezone: true }).default(sql`timezone('utc', now())`),
});

// Therapeutic sessions table
export const therapeuticSessions = pgTable("therapeutic_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  call_id: text("call_id").notNull().unique(),
  agent_name: text("agent_name").default("Sarah"),
  status: text("status").default("active"),
  start_time: timestamp("start_time", { withTimezone: true }).default(sql`timezone('utc', now())`),
  end_time: timestamp("end_time", { withTimezone: true }),
  duration_seconds: integer("duration_seconds"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`timezone('utc', now())`),
  updated_at: timestamp("updated_at", { withTimezone: true }).default(sql`timezone('utc', now())`),
});

// Therapeutic context table for memory - Extended with CSS tracking
export const therapeuticContext = pgTable("therapeutic_context", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  call_id: text("call_id"),
  context_type: text("context_type").default("session_insight"),
  content: text("content").notNull(),
  css_stage: varchar("css_stage", { length: 50 }),
  pattern_type: varchar("pattern_type", { length: 20 }),
  contradiction_content: text("contradiction_content"),
  confidence: real("confidence").default(0.8),
  importance: integer("importance").default(5),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`timezone('utc', now())`),
});

// Session transcripts table
export const sessionTranscripts = pgTable("session_transcripts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  call_id: text("call_id").notNull(),
  text: text("text").notNull(),
  role: text("role").default("complete"),
  timestamp: timestamp("timestamp", { withTimezone: true }).default(sql`timezone('utc', now())`),
});

// CSS progressions table for tracking stage transitions
export const cssProgressions = pgTable("css_progressions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  call_id: text("call_id").notNull(),
  from_stage: varchar("from_stage", { length: 50 }),
  to_stage: varchar("to_stage", { length: 50 }).notNull(),
  trigger_content: text("trigger_content").notNull(),
  transition_time: timestamp("transition_time", { withTimezone: true }).default(sql`timezone('utc', now())`),
  agent_name: text("agent_name"),
  emotional_intensity: varchar("emotional_intensity", { length: 10 }),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`timezone('utc', now())`),
});

// CSS patterns table for clean pattern storage
export const cssPatterns = pgTable("css_patterns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  call_id: text("call_id").notNull(),
  pattern_type: varchar("pattern_type", { length: 20 }).notNull(), // CVDC, IBM, Thend, CYVC
  content: text("content").notNull(), // Full pattern text
  extracted_contradiction: text("extracted_contradiction"), // For CVDC: "X BUT Y"
  behavioral_gap: text("behavioral_gap"), // For IBM: "want X, do Y"
  css_stage: varchar("css_stage", { length: 50 }),
  confidence: real("confidence"),
  detected_at: timestamp("detected_at"),
  emotional_intensity: varchar("emotional_intensity", { length: 10 }),
  safety_flag: boolean("safety_flag").default(false),
  crisis_flag: boolean("crisis_flag").default(false),
  // Narrative tracking columns
  narrative_fragmentation: real("narrative_fragmentation").default(0),
  symbolic_density: integer("symbolic_density").default(0),
  temporal_orientation: varchar("temporal_orientation", { length: 10 }),
});

// Insert schemas - Updated for enterprise auth
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  first_name: true,
  auth_user_id: true,
  role: true,
});

export const insertTherapeuticSessionSchema = createInsertSchema(therapeuticSessions).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertTherapeuticContextSchema = createInsertSchema(therapeuticContext).omit({
  id: true,
  created_at: true,
});

export const insertSessionTranscriptSchema = createInsertSchema(sessionTranscripts).omit({
  id: true,
  timestamp: true,
});

export const insertCssProgressionSchema = createInsertSchema(cssProgressions).omit({
  id: true,
  created_at: true,
});

export const insertCssPatternsSchema = createInsertSchema(cssPatterns).omit({
  id: true,
  detected_at: true,
});

// ===== CSS TRACKING ARCHITECTURE TYPES =====

// Pattern Categories Enum
export enum PatternCategory {
  CVDC = 'CVDC',        // Constant Variably Determined Contradiction
  IBM = 'IBM',          // Intention-Behavior Mismatch
  THEND = 'THEND',      // Therapeutic Ending
  CYVC = 'CYVC',        // Constant Yet Variable Conclusion
  GRIEF = 'GRIEF',      // Grief and Loss Patterns
  SOMATIC = 'SOMATIC',  // Somatic/Body Patterns
  SAFETY = 'SAFETY',    // Safety/Crisis Patterns
  NARRATIVE = 'NARRATIVE', // Narrative Fragmentation
  // Literary Psychological Patterns
  EXISTENTIAL = 'EXISTENTIAL',       // Existential Crisis - Camus/Sartre
  MORAL_TORMENT = 'MORAL_TORMENT',   // Moral Torment - Dostoevsky
  EPISTEMIC_DOUBT = 'EPISTEMIC_DOUBT', // Epistemic Doubt - Hume/Descartes
  KAFKA_ALIENATION = 'KAFKA_ALIENATION', // Alienation - Kafka
  SOCIAL_MASKING = 'SOCIAL_MASKING',    // Social Masking - Pessoa
  // Additional Literary Patterns
  DOUBLE_CONSCIOUSNESS = 'DOUBLE_CONSCIOUSNESS', // Split psyche - Dostoevsky
  REDEMPTION_SEEKING = 'REDEMPTION_SEEKING',     // Transformation through suffering
  SPIRITUAL_CRISIS = 'SPIRITUAL_CRISIS',         // Brothers Karamazov themes
  APORIA = 'APORIA',                             // Socratic productive confusion
  VIRTUE_SEEKING = 'VIRTUE_SEEKING',             // Socratic ethical exploration
  TRANSFORMATION_ARC = 'TRANSFORMATION_ARC',     // Scrooge/redemption patterns
  AUTHENTIC_LIVING = 'AUTHENTIC_LIVING',         // Tolstoy's Ivan Ilyich themes
  IDENTITY_CRISIS = 'IDENTITY_CRISIS',           // Hamlet themes
  AMBITION_GUILT = 'AMBITION_GUILT',             // Macbeth themes
  SELF_DECEPTION = 'SELF_DECEPTION'              // Austen themes
}

// CSS Stage Enum with transitions
export enum CSSStage {
  POINTED_ORIGIN = 'pointed_origin',
  FOCUS_BIND = 'focus_bind',
  SUSPENSION = 'suspension',
  GESTURE_TOWARD = 'gesture_toward',
  COMPLETION = 'completion',
  TERMINAL = 'terminal'
}

// Emotional Intensity Levels
export type EmotionalIntensity = 'low' | 'medium' | 'high' | 'critical';

// Pattern Event - Unified model for all pattern detections
export interface PatternEvent {
  category: PatternCategory;
  text: string;
  intensity: EmotionalIntensity;
  confidence: number;
  timestamp: Date;
  source: 'heuristic' | 'assistant_meta' | 'combined';
  metadata?: {
    contradiction?: string;      // For CVDC
    behaviorGap?: string;        // For IBM
    somaticLocation?: string;    // For SOMATIC
    petName?: string;           // For GRIEF
    narrativeFragmentation?: number;
    symbolicDensity?: number;
    temporalOrientation?: 'past' | 'present' | 'future';
  };
  hasWarningFlag?: boolean;
  contentHash?: string;
}

// Critical Life Event - For storing important life events
export interface CriticalLifeEvent {
  type: 'pet_loss' | 'death' | 'divorce' | 'job_loss' | 'health_crisis' | 'other';
  entityName?: string;  // e.g., "Pickle" for pet
  content: string;
  importance: number;   // 1-10 scale
  detectedAt: Date;
  userId: string;
  callId?: string;
}

// CSS Session State - Enhanced with unified tracking
export interface CSSSessionState {
  currentStage: CSSStage;
  previousStage?: CSSStage;
  stageTransitionTime?: Date;
  stageEvidenceCount: number;  // For hysteresis
  emotionalIntensity: EmotionalIntensity;
  patternCounts: Record<PatternCategory, number>;
  recentPatterns: PatternEvent[];
  criticalEvents: CriticalLifeEvent[];
  hasWarningFlags: boolean;
  lastAnalysisTime: Date;
}

// Stage Transition Rule
export interface StageTransitionRule {
  from: CSSStage;
  to: CSSStage;
  requiredEvidence: number;  // Number of patterns needed
  dwellTime?: number;        // Minimum seconds in stage
  priority: number;          // Higher priority overrides
  condition: (state: CSSSessionState) => boolean;
}

// Pattern Detection Result - What comes from css-pattern-service
export interface PatternDetectionResult {
  patterns: PatternEvent[];
  sessionState: CSSSessionState;
  suggestedAgent?: string;
  agentSwitchConfidence?: number;
  guidanceRecommendations?: string[];
}

// ===== ENTERPRISE AUTH TYPES =====

// User role types for enterprise auth
export type UserRole = 'client' | 'therapist' | 'admin';
export type SubscriptionType = 'free' | 'premium' | 'enterprise';
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired';

// Enhanced User type with enterprise auth fields
export interface EnterpriseUser {
  id: string;
  auth_user_id: string;
  email: string;
  first_name: string | null;
  role: UserRole;
  subscription_type: SubscriptionType;
  subscription_status: SubscriptionStatus;
  created_at: string;
  updated_at: string;
}

// Authentication context interface
export interface AuthContext {
  user: EnterpriseUser | null;
  session: any | null;
  loading: boolean;
  error: string | null;
}

// Session metadata for VAPI integration
export interface SessionMetadata {
  userId: string;           // Supabase auth user ID
  internalUserId: string;   // Internal users table ID
  agentName: string;
  sessionType: 'therapeutic' | 'assessment' | 'crisis';
  userFirstName: string;
  subscriptionType: SubscriptionType;
}

// Types - Updated with enterprise auth
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type TherapeuticSession = typeof therapeuticSessions.$inferSelect;
export type InsertTherapeuticSession = z.infer<typeof insertTherapeuticSessionSchema>;
export type TherapeuticContext = typeof therapeuticContext.$inferSelect;
export type InsertTherapeuticContext = z.infer<typeof insertTherapeuticContextSchema>;
export type SessionTranscript = typeof sessionTranscripts.$inferSelect;
export type InsertSessionTranscript = z.infer<typeof insertSessionTranscriptSchema>;
export type CssProgression = typeof cssProgressions.$inferSelect;
export type InsertCssProgression = z.infer<typeof insertCssProgressionSchema>;
export type CssPattern = typeof cssPatterns.$inferSelect;
export type InsertCssPattern = z.infer<typeof insertCssPatternsSchema>;

// Export enhanced user type
export type { EnterpriseUser };

// Validation schemas for enterprise auth
export const userRoleSchema = z.enum(['client', 'therapist', 'admin']);
export const subscriptionTypeSchema = z.enum(['free', 'premium', 'enterprise']);
export const subscriptionStatusSchema = z.enum(['active', 'cancelled', 'expired']);

// Enhanced insert schema with validation
export const enterpriseUserSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  auth_user_id: z.string().uuid(),
  role: userRoleSchema.default('client'),
  subscription_type: subscriptionTypeSchema.default('free'),
  subscription_status: subscriptionStatusSchema.default('active'),
});