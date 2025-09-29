// Updated schema.ts with correct ID relationships
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, real, jsonb, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - PRIMARY IDENTITY TABLE
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  first_name: text("first_name"),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`timezone('utc', now())`),
  updated_at: timestamp("updated_at", { withTimezone: true }).default(sql`timezone('utc', now())`),
  auth_user_id: uuid("auth_user_id"), // Only for Supabase auth
  role: text("role").default("client"),
  subscription_type: text("subscription_type").default("free"),
  subscription_status: text("subscription_status").default("active"),
});

// User profiles table - FIXED to use users.id
export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().references(() => users.id, { onDelete: "cascade" }), // FIXED: References users.id
  email: varchar("email").notNull(),
  full_name: varchar("full_name"),
  user_type: varchar("user_type").default('individual'), // 'individual', 'therapist', 'client'
  invited_by: uuid("invited_by").references(() => users.id), // FIXED: References users.id
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Subscriptions table - FIXED to reference users.id
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // FIXED: Added reference
  subscription_tier: varchar("subscription_tier").notNull(),
  subscription_status: varchar("subscription_status").notNull(),
  plan_type: varchar("plan_type").notNull(),
  trial_ends_at: timestamp("trial_ends_at"),
  trial_minutes_limit: integer("trial_minutes_limit").default(45),
  usage_minutes_limit: integer("usage_minutes_limit"),
  usage_minutes_used: integer("usage_minutes_used").default(0),
  client_limit: integer("client_limit").default(0),
  clients_used: integer("clients_used").default(0),
  stripe_customer_id: varchar("stripe_customer_id"),
  stripe_subscription_id: varchar("stripe_subscription_id"),
  current_period_end: timestamp("current_period_end"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Usage sessions tracking - FIXED to reference users.id
export const usageSessions = pgTable("usage_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // FIXED
  therapeutic_session_id: uuid("therapeutic_session_id").references(() => therapeuticSessions.id),
  duration_minutes: integer("duration_minutes").notNull(),
  vapi_call_id: varchar("vapi_call_id"),
  session_date: timestamp("session_date").defaultNow(),
  created_at: timestamp("created_at").defaultNow(),
});

// Therapist-client relationships - FIXED to reference users.id
export const therapistClientRelationships = pgTable("therapist_client_relationships", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  therapist_id: uuid("therapist_id").notNull().references(() => users.id, { onDelete: "cascade" }), // FIXED
  client_id: uuid("client_id").notNull().references(() => users.id, { onDelete: "cascade" }), // FIXED
  invitation_id: uuid("invitation_id").references(() => therapistInvitations.id),
  status: varchar("status").default('active'),
  created_at: timestamp("created_at").defaultNow(),
});

// Therapist invitations - FIXED to reference users.id
export const therapistInvitations = pgTable("therapist_invitations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  therapist_id: uuid("therapist_id").notNull().references(() => users.id, { onDelete: "cascade" }), // FIXED
  client_email: varchar("client_email").notNull(),
  invitation_token: varchar("invitation_token").notNull(),
  magic_token: varchar("magic_token"),
  status: varchar("status").default('pending'),
  personal_message: text("personal_message"),
  sent_at: timestamp("sent_at").defaultNow(),
  accepted_at: timestamp("accepted_at"),
  expires_at: timestamp("expires_at").notNull(),
});

// Therapeutic sessions table - NO CHANGES
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

// Therapeutic context table - NO CHANGES
export const therapeuticContext = pgTable("therapeutic_context", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  call_id: text("call_id"),
  context_type: text("context_type").default("session_insight"),
  content: text("content").notNull(),
  css_stage: text("css_stage"),
  pattern_type: text("pattern_type"),
  contradiction_content: text("contradiction_content"),
  confidence: real("confidence").default(0.8),
  importance: integer("importance").default(5),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`timezone('utc', now())`),
});

// Session transcripts table - NO CHANGES
export const sessionTranscripts = pgTable("session_transcripts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  call_id: text("call_id").notNull(),
  text: text("text").notNull(),
  role: text("role").default("complete"),
  timestamp: timestamp("timestamp", { withTimezone: true }).default(sql`timezone('utc', now())`),
});

// CSS progressions table - UPDATED with new columns
export const cssProgressions = pgTable("css_progressions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  call_id: text("call_id").notNull(),
  from_stage: varchar("from_stage", { length: 50 }),
  to_stage: varchar("to_stage", { length: 50 }).notNull(),
  trigger_content: text("trigger_content").notNull(),
  transition_time: timestamp("transition_time", { withTimezone: true }).default(sql`timezone('utc', now())`),
  agent_name: text("agent_name"),
  created_at: timestamp("created_at", { withTimezone: true }).default(sql`timezone('utc', now())`),
  emotional_intensity: varchar("emotional_intensity", { length: 10 }),
  // NEW COLUMNS:
  trigger_type: varchar("trigger_type", { length: 20 }), // 'CVDC', 'IBM', 'THEND', 'CYVC'
  confidence: real("confidence"),
  transition_context: jsonb("transition_context"),
});

// CSS patterns table - NO CHANGES but note the valid values
export const cssPatterns = pgTable("css_patterns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  call_id: text("call_id").notNull(),
  pattern_type: varchar("pattern_type", { length: 20 }).notNull(), // CVDC, IBM, THEND, CYVC, STAGE_ASSESSMENT, MOVEMENT, PROCESS
  content: text("content").notNull(),
  extracted_contradiction: text("extracted_contradiction"),
  behavioral_gap: text("behavioral_gap"),
  css_stage: varchar("css_stage", { length: 50 }), // pointed_origin, focus_bind, suspension, gesture_toward, completion, terminal
  confidence: real("confidence"),
  detected_at: timestamp("detected_at", { withTimezone: false }),
  emotional_intensity: varchar("emotional_intensity", { length: 10 }),
  safety_flag: boolean("safety_flag").default(false),
  crisis_flag: boolean("crisis_flag").default(false),
  narrative_fragmentation: real("narrative_fragmentation").default(0),
  symbolic_density: integer("symbolic_density").default(0),
  temporal_orientation: varchar("temporal_orientation", { length: 10 }),
});

// NEW TABLE: Therapeutic movements (separate from CSS stages)
export const therapeuticMovements = pgTable("therapeutic_movements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: varchar("user_id").notNull(), // VARCHAR to match existing data
  call_id: varchar("call_id").notNull(),
  movement_type: varchar("movement_type", { length: 20 }), // 'deepening', 'resistance', 'integration', 'exploration'
  content: text("content"),
  detected_at: timestamp("detected_at", { withTimezone: false }).default(sql`NOW()`),
  created_at: timestamp("created_at", { withTimezone: false }).default(sql`NOW()`),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  first_name: true,
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

// NEW: Insert schema for therapeutic movements
export const insertTherapeuticMovementSchema = createInsertSchema(therapeuticMovements).omit({
  id: true,
  created_at: true,
  detected_at: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type UsageSession = typeof usageSessions.$inferSelect;
export type TherapistClientRelationship = typeof therapistClientRelationships.$inferSelect;
export type TherapistInvitation = typeof therapistInvitations.$inferSelect;
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
// NEW: Type for therapeutic movements
export type TherapeuticMovement = typeof therapeuticMovements.$inferSelect;
export type InsertTherapeuticMovement = z.infer<typeof insertTherapeuticMovementSchema>;

// Valid values for reference (add these as constants)
export const CSS_STAGES = {
  POINTED_ORIGIN: 'pointed_origin',
  FOCUS_BIND: 'focus_bind',
  SUSPENSION: 'suspension',
  GESTURE_TOWARD: 'gesture_toward',
  COMPLETION: 'completion',
  TERMINAL: 'terminal'
} as const;

export const PATTERN_TYPES = {
  CVDC: 'CVDC',
  IBM: 'IBM',
  THEND: 'THEND',
  CYVC: 'CYVC',
  STAGE_ASSESSMENT: 'STAGE_ASSESSMENT',
  MOVEMENT: 'MOVEMENT',
  PROCESS: 'PROCESS'
} as const;

export const MOVEMENT_TYPES = {
  DEEPENING: 'deepening',
  RESISTANCE: 'resistance',
  INTEGRATION: 'integration',
  EXPLORATION: 'exploration'
} as const;

export type CssStage = typeof CSS_STAGES[keyof typeof CSS_STAGES];
export type PatternType = typeof PATTERN_TYPES[keyof typeof PATTERN_TYPES];
export type MovementType = typeof MOVEMENT_TYPES[keyof typeof MOVEMENT_TYPES];