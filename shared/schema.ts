// Updated schema.ts with correct ID relationships and ALL timestamps fixed
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

  // NEW: Influencer promo code tracking
  referred_by_promo_code: varchar("referred_by_promo_code", { length: 50 }),
});

// User profiles table - FIXED to use users.id
export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().references(() => users.id, { onDelete: "cascade" }), // FIXED: References users.id
  email: varchar("email").notNull().unique(), // Added unique constraint for data integrity
  full_name: varchar("full_name"),
  user_type: varchar("user_type").default('individual'), // 'individual', 'therapist', 'client'
  invited_by: uuid("invited_by").references(() => users.id), // FIXED: References users.id
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  promo_code: varchar("promo_code", { length: 50 }),
  promo_discount_expires_at: timestamp("promo_discount_expires_at"),
  consent_accepted_at: timestamp("consent_accepted_at", { withTimezone: true }),
});

// Subscriptions table - FIXED to reference users.id
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // FIXED: Added reference
  subscription_tier: varchar("subscription_tier").notNull(),
  subscription_status: varchar("subscription_status").notNull(),
  plan_type: varchar("plan_type").notNull(),
  trial_ends_at: timestamp("trial_ends_at", { withTimezone: true }),
  trial_minutes_limit: integer("trial_minutes_limit").default(45),
  usage_minutes_limit: integer("usage_minutes_limit"),
  usage_minutes_used: integer("usage_minutes_used").default(0),
  client_limit: integer("client_limit").default(0),
  clients_used: integer("clients_used").default(0),
  stripe_customer_id: varchar("stripe_customer_id"),
  stripe_subscription_id: varchar("stripe_subscription_id"),
  current_period_end: timestamp("current_period_end", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Usage sessions tracking - FIXED to reference users.id
export const usageSessions = pgTable("usage_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // FIXED
  therapeutic_session_id: uuid("therapeutic_session_id").references(() => therapeuticSessions.id),
  duration_minutes: integer("duration_minutes").notNull(),
  vapi_call_id: varchar("vapi_call_id"),
  session_date: timestamp("session_date", { withTimezone: true }).defaultNow(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Therapist-client relationships - FIXED to reference users.id
export const therapistClientRelationships = pgTable("therapist_client_relationships", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  therapist_id: uuid("therapist_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  client_id: uuid("client_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  invitation_id: uuid("invitation_id").references(() => therapistInvitations.id),
  status: varchar("status").default('active'),
  session_duration_limit: integer("session_duration_limit").default(900), // ADD THIS LINE (900 = 15 minutes)
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
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
  sent_at: timestamp("sent_at", { withTimezone: true }).defaultNow(),
  accepted_at: timestamp("accepted_at", { withTimezone: true }),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Therapist access logs for compliance and audit trail
export const therapistAccessLogs = pgTable("therapist_access_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  therapist_id: uuid("therapist_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  client_id: uuid("client_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  access_type: varchar("access_type", { length: 50 }).notNull(),
  session_id: uuid("session_id").references(() => therapeuticSessions.id, { onDelete: "set null" }),
  accessed_at: timestamp("accessed_at", { withTimezone: true }).default(sql`timezone('utc', now())`),
  ip_address: varchar("ip_address", { length: 45 }),
  user_agent: varchar("user_agent", { length: 255 }),
});

// Therapeutic sessions table - NO CHANGES
export const therapeuticSessions = pgTable("therapeutic_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  call_id: text("call_id").notNull().unique(),
  agent_name: text("agent_name").default("Sarah"),
  status: text("status").default("active"),
  css_stage: text("css_stage").default("pointed_origin"),
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

// Knowledge Base Documents table
export const knowledgeBaseDocuments = pgTable("knowledge_base_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),

  // Document identification
  document_id: varchar("document_id", { length: 100 }).notNull().unique(),
  document_type: varchar("document_type", { length: 50 }).notNull(), // 'crisis_protocol', 'css_stage_guide', 'pattern_intervention', 'procedural_protocol'

  // Content
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),

  // Metadata for retrieval
  metadata: jsonb("metadata").notNull(), // Stores all the metadata from your seed documents

  // Retrieval optimization
  trigger_keywords: jsonb("trigger_keywords"), // Array of strings for keyword matching
  css_stage: varchar("css_stage", { length: 50 }), // 'pointed_origin', 'focus_bind', etc.
  pattern_type: varchar("pattern_type", { length: 20 }), // 'CVDC', 'IBM', 'THEND', 'CYVC'
  crisis_type: varchar("crisis_type", { length: 50 }), // 'acute_overwhelm', 'dysregulation', 'safety_assessment'

  // Priority and injection rules
  priority: integer("priority").notNull().default(5), // 1-10, higher = more important
  immediate_inject: boolean("immediate_inject").default(false), // Auto-inject for crisis

  // Agent recommendations
  agent_recommendation: varchar("agent_recommendation", { length: 50 }), // 'Sarah', 'Mathew', or null

  // Token management
  token_count: integer("token_count").notNull(),

  // Status
  is_active: boolean("is_active").default(true),

  // Timestamps
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Insert schema
export const insertKnowledgeBaseDocumentSchema = createInsertSchema(knowledgeBaseDocuments).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

// Types
export type KnowledgeBaseDocument = typeof knowledgeBaseDocuments.$inferSelect;
export type InsertKnowledgeBaseDocument = z.infer<typeof insertKnowledgeBaseDocumentSchema>;

// Add these tables to the END of shared/schema.ts (after therapistInvitations)

// Partner organizations table
export const partnerOrganizations = pgTable("partner_organizations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organization_name: varchar("organization_name", { length: 255 }).notNull(),
  organization_type: varchar("organization_type", { length: 50 }).notNull(), // 'practice_management', 'clinic_network', 'ehr_system', 'mental_health_platform'
  contact_email: varchar("contact_email", { length: 255 }).notNull(),
  contact_name: varchar("contact_name", { length: 255 }),
  contact_phone: varchar("contact_phone", { length: 50 }),

  // Partnership status
  partner_status: varchar("partner_status", { length: 50 }).default('prospect'), // 'prospect', 'pilot', 'active', 'suspended', 'churned'
  partner_tier: varchar("partner_tier", { length: 20 }), // 'bronze', 'silver', 'gold', 'platinum'

  // Partnership model
  partnership_model: varchar("partnership_model", { length: 50 }).notNull(), // 'direct_integration', 'referral_advertising', 'white_label'

  // Revenue & equity tracking
  total_revenue_generated: integer("total_revenue_generated").default(0), // Total revenue in cents
  monthly_recurring_revenue: integer("monthly_recurring_revenue").default(0), // MRR in cents
  equity_percentage: real("equity_percentage").default(0), // Percentage (e.g., 0.5 for 0.5%)
  equity_vested_percentage: real("equity_vested_percentage").default(0), // Already vested

  // Dates
  pilot_start_date: timestamp("pilot_start_date", { withTimezone: true }),
  active_since: timestamp("active_since", { withTimezone: true }),
  equity_cliff_date: timestamp("equity_cliff_date", { withTimezone: true }), // 6 months from active_since
  next_vesting_date: timestamp("next_vesting_date", { withTimezone: true }),

  // Settings
  revenue_share_percentage: real("revenue_share_percentage").default(15), // Default 15%
  api_key: varchar("api_key", { length: 100 }).unique(),
  webhook_url: varchar("webhook_url", { length: 500 }),

  // Referral tracking
  referred_by_partner_id: uuid("referred_by_partner_id").references((): any => partnerOrganizations.id),
  referral_level: integer("referral_level").default(0), // 0 = direct, 1 = level 1, 2 = level 2

  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Partner revenue transactions table
export const partnerRevenueTransactions = pgTable("partner_revenue_transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  partner_id: uuid("partner_id").notNull().references(() => partnerOrganizations.id, { onDelete: "cascade" }),

  // Transaction details
  transaction_type: varchar("transaction_type", { length: 50 }).notNull(), // 'subscription', 'usage', 'referral_bonus', 'overage'
  amount_cents: integer("amount_cents").notNull(), // Amount in cents
  currency: varchar("currency", { length: 3 }).default('USD'),

  // Attribution
  therapist_id: uuid("therapist_id").references(() => users.id), // Which therapist generated this revenue
  subscription_id: uuid("subscription_id").references(() => subscriptions.id),
  usage_session_id: uuid("usage_session_id").references(() => usageSessions.id),

  // Partner compensation
  partner_revenue_share_cents: integer("partner_revenue_share_cents"), // What partner earns
  revenue_share_percentage_applied: real("revenue_share_percentage_applied"), // Rate at time of transaction

  // Revenue flow tracking
  paid_to_ivasa: boolean("paid_to_ivasa").default(false),
  paid_to_partner: boolean("paid_to_partner").default(false),

  // Metadata
  transaction_date: timestamp("transaction_date", { withTimezone: true }).defaultNow(),
  billing_period_start: timestamp("billing_period_start", { withTimezone: true }),
  billing_period_end: timestamp("billing_period_end", { withTimezone: true }),

  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Partner metrics snapshots table (for historical tracking)
export const partnerMetricsSnapshots = pgTable("partner_metrics_snapshots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  partner_id: uuid("partner_id").notNull().references(() => partnerOrganizations.id, { onDelete: "cascade" }),

  // Snapshot period
  snapshot_date: timestamp("snapshot_date", { withTimezone: true }).notNull(),
  period_type: varchar("period_type", { length: 20 }).notNull(), // 'daily', 'weekly', 'monthly', 'quarterly'

  // Therapist/client counts
  active_therapists_count: integer("active_therapists_count").default(0),
  active_clients_count: integer("active_clients_count").default(0),
  new_therapists_count: integer("new_therapists_count").default(0),
  churned_therapists_count: integer("churned_therapists_count").default(0),

  // Usage metrics
  total_voice_sessions: integer("total_voice_sessions").default(0),
  total_voice_minutes: integer("total_voice_minutes").default(0),
  average_session_length_minutes: real("average_session_length_minutes"),

  // Revenue metrics
  revenue_generated_cents: integer("revenue_generated_cents").default(0),
  revenue_share_paid_cents: integer("revenue_share_paid_cents").default(0),
  mrr_cents: integer("mrr_cents").default(0), // Monthly recurring revenue
  arr_cents: integer("arr_cents").default(0), // Annual recurring revenue

  // Equity tracking
  equity_percentage_at_snapshot: real("equity_percentage_at_snapshot"),
  equity_vested_percentage_at_snapshot: real("equity_vested_percentage_at_snapshot"),

  // Referral metrics
  referrals_made: integer("referrals_made").default(0),
  referral_revenue_cents: integer("referral_revenue_cents").default(0),

  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Partner users table (for login access to partner portal)
export const partnerUsers = pgTable("partner_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  partner_id: uuid("partner_id").notNull().references(() => partnerOrganizations.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Access control
  role: varchar("role", { length: 50 }).default('viewer'), // 'admin', 'manager', 'viewer'
  permissions: jsonb("permissions"), // JSON array of specific permissions

  // Status
  access_status: varchar("access_status", { length: 20 }).default('active'), // 'active', 'suspended', 'revoked'

  // Audit
  last_login_at: timestamp("last_login_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Partner therapist attribution (which therapists belong to which partner)
export const partnerTherapistAttribution = pgTable("partner_therapist_attribution", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  partner_id: uuid("partner_id").notNull().references(() => partnerOrganizations.id, { onDelete: "cascade" }),
  therapist_id: uuid("therapist_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Attribution details
  attribution_source: varchar("attribution_source", { length: 50 }).notNull(), // 'direct_integration', 'referral_link', 'manual_assignment', 'api_signup'
  attribution_date: timestamp("attribution_date", { withTimezone: true }).defaultNow(),

  // Status
  status: varchar("status", { length: 20 }).default('active'), // 'active', 'inactive', 'churned'

  // Tracking
  signup_url: varchar("signup_url", { length: 500 }), // URL they signed up from (for attribution)
  referral_code: varchar("referral_code", { length: 50 }), // Partner's unique referral code
  utm_source: varchar("utm_source", { length: 100 }),
  utm_campaign: varchar("utm_campaign", { length: 100 }),

  // Lifecycle
  first_session_date: timestamp("first_session_date", { withTimezone: true }),
  last_session_date: timestamp("last_session_date", { withTimezone: true }),
  total_lifetime_revenue_cents: integer("total_lifetime_revenue_cents").default(0),

  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Partner equity vesting schedule
export const partnerEquityVestingSchedule = pgTable("partner_equity_vesting_schedule", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  partner_id: uuid("partner_id").notNull().references(() => partnerOrganizations.id, { onDelete: "cascade" }),

  // Vesting details
  vesting_date: timestamp("vesting_date", { withTimezone: true }).notNull(),
  equity_percentage_vesting: real("equity_percentage_vesting").notNull(), // Amount vesting on this date
  cumulative_vested_percentage: real("cumulative_vested_percentage"), // Total vested after this event

  // Status
  vesting_status: varchar("vesting_status", { length: 20 }).default('pending'), // 'pending', 'vested', 'forfeited', 'accelerated'
  vested_at: timestamp("vested_at", { withTimezone: true }),

  // Performance requirements
  required_monthly_revenue_cents: integer("required_monthly_revenue_cents"), // Must maintain this to vest
  actual_monthly_revenue_cents: integer("actual_monthly_revenue_cents"),
  performance_met: boolean("performance_met"),

  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
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
export type TherapistAccessLog = typeof therapistAccessLogs.$inferSelect;


// ============================================================================
// INFLUENCER TRACKING TABLES
// Add these tables to the END of shared/schema.ts
// ============================================================================

// Influencer profiles table
export const influencerProfiles = pgTable("influencer_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Basic info
  influencer_name: varchar("influencer_name", { length: 255 }).notNull(), // Display name / handle
  platform: varchar("platform", { length: 50 }).notNull(), // 'twitter', 'tiktok', 'instagram', 'youtube', 'linkedin'
  platform_handle: varchar("platform_handle", { length: 255 }).notNull(),
  platform_url: varchar("platform_url", { length: 500 }),

  // Audience metrics
  follower_count: integer("follower_count").default(0),
  follower_count_verified_at: timestamp("follower_count_verified_at", { withTimezone: true }),
  niche: varchar("niche", { length: 100 }), // 'mental_health', 'wellness', 'therapy', 'self_help'

  // Influencer status
  influencer_status: varchar("influencer_status", { length: 50 }).default('prospect'), // 'prospect', 'active', 'suspended', 'churned'
  influencer_tier: varchar("influencer_tier", { length: 20 }), // 'nano', 'micro', 'macro', 'mega'

  // Commission structure
  commission_percentage: real("commission_percentage").default(15), // Default 15%
  equity_percentage: real("equity_percentage").default(0), // Equity grant if applicable
  equity_vested_percentage: real("equity_vested_percentage").default(0),

  // Unique tracking
  unique_promo_code: varchar("unique_promo_code", { length: 50 }).unique(), // e.g., "SARAH15"
  referral_link: varchar("referral_link", { length: 500 }).unique(), // Unique tracking URL
  utm_campaign: varchar("utm_campaign", { length: 100 }),

  // Performance tracking
  total_clicks: integer("total_clicks").default(0),
  total_conversions: integer("total_conversions").default(0),
  conversion_rate: real("conversion_rate").default(0), // Percentage
  total_earnings_cents: integer("total_earnings_cents").default(0),
  total_commission_paid_cents: integer("total_commission_paid_cents").default(0),

  // Referral tracking (sub-influencers they recruit)
  referred_by_influencer_id: uuid("referred_by_influencer_id").references((): any => influencerProfiles.id),
  referral_level: integer("referral_level").default(0), // 0 = direct, 1 = level 1, 2 = level 2

  // Dates
  active_since: timestamp("active_since", { withTimezone: true }),
  equity_cliff_date: timestamp("equity_cliff_date", { withTimezone: true }),
  next_vesting_date: timestamp("next_vesting_date", { withTimezone: true }),

  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Influencer content tracking table
export const influencerContentTracking = pgTable("influencer_content_tracking", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  influencer_id: uuid("influencer_id").notNull().references(() => influencerProfiles.id, { onDelete: "cascade" }),

  // Content details
  content_type: varchar("content_type", { length: 50 }).notNull(), // 'post', 'video', 'story', 'thread', 'reel'
  content_url: varchar("content_url", { length: 500 }),
  post_date: timestamp("post_date", { withTimezone: true }).notNull(),

  // Engagement metrics
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  engagement_rate: real("engagement_rate").default(0), // Percentage

  // Performance tracking
  clicks_generated: integer("clicks_generated").default(0),
  conversions_generated: integer("conversions_generated").default(0),
  revenue_generated_cents: integer("revenue_generated_cents").default(0),
  commission_earned_cents: integer("commission_earned_cents").default(0),

  // Approval status
  approval_status: varchar("approval_status", { length: 20 }).default('pending'), // 'pending', 'approved', 'rejected'
  reviewed_by: uuid("reviewed_by").references(() => users.id),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  rejection_reason: text("rejection_reason"),

  // Metadata
  content_caption: text("content_caption"),
  content_tags: jsonb("content_tags"), // Array of hashtags

  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Influencer conversions table (tracks actual user sign-ups)
export const influencerConversions = pgTable("influencer_conversions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  influencer_id: uuid("influencer_id").notNull().references(() => influencerProfiles.id, { onDelete: "cascade" }),

  // Conversion details
  converted_user_id: uuid("converted_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversion_type: varchar("conversion_type", { length: 50 }).notNull(), // 'trial', 'subscription', 'upgrade'

  // Attribution
  promo_code_used: varchar("promo_code_used", { length: 50 }),
  referral_link_used: varchar("referral_link_used", { length: 500 }),
  utm_source: varchar("utm_source", { length: 100 }),
  utm_medium: varchar("utm_medium", { length: 100 }),
  utm_campaign: varchar("utm_campaign", { length: 100 }),

  // Revenue tracking
  subscription_tier: varchar("subscription_tier", { length: 50 }), // 'trial', 'plus', 'pro'
  initial_revenue_cents: integer("initial_revenue_cents").default(0), // First payment
  lifetime_value_cents: integer("lifetime_value_cents").default(0), // Total revenue from this user

  // Commission tracking
  commission_percentage_applied: real("commission_percentage_applied"),
  total_commission_earned_cents: integer("total_commission_earned_cents").default(0),

  // Status
  conversion_status: varchar("conversion_status", { length: 20 }).default('active'), // 'active', 'churned', 'paused'

  // Dates
  conversion_date: timestamp("conversion_date", { withTimezone: true }).defaultNow(),
  first_payment_date: timestamp("first_payment_date", { withTimezone: true }),
  last_payment_date: timestamp("last_payment_date", { withTimezone: true }),
  churn_date: timestamp("churn_date", { withTimezone: true }),

  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Influencer commission transactions table
export const influencerCommissionTransactions = pgTable("influencer_commission_transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  influencer_id: uuid("influencer_id").notNull().references(() => influencerProfiles.id, { onDelete: "cascade" }),

  // Transaction details
  transaction_type: varchar("transaction_type", { length: 50 }).notNull(), // 'initial_conversion', 'recurring_payment', 'referral_bonus', 'network_bonus'
  amount_cents: integer("amount_cents").notNull(), // Customer payment amount
  currency: varchar("currency", { length: 3 }).default('USD'),

  // Attribution
  conversion_id: uuid("conversion_id").references(() => influencerConversions.id),
  converted_user_id: uuid("converted_user_id").references(() => users.id),
  content_id: uuid("content_id").references(() => influencerContentTracking.id), // Which content drove this

  // Commission calculation
  commission_cents: integer("commission_cents").notNull(), // What influencer earns
  commission_percentage_applied: real("commission_percentage_applied"),

  // Payment status
  paid_to_ivasa: boolean("paid_to_ivasa").default(false),
  paid_to_influencer: boolean("paid_to_influencer").default(false),
  payment_method: varchar("payment_method", { length: 50 }), // 'paypal', 'stripe', 'wire'
  payment_date: timestamp("payment_date", { withTimezone: true }),

  // Metadata
  transaction_date: timestamp("transaction_date", { withTimezone: true }).defaultNow(),
  billing_period_start: timestamp("billing_period_start", { withTimezone: true }),
  billing_period_end: timestamp("billing_period_end", { withTimezone: true }),
  notes: text("notes"),

  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Influencer referrals table (sub-influencers they recruit)
export const influencerReferrals = pgTable("influencer_referrals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  referrer_influencer_id: uuid("referrer_influencer_id").notNull().references(() => influencerProfiles.id, { onDelete: "cascade" }),
  referred_influencer_id: uuid("referred_influencer_id").notNull().references(() => influencerProfiles.id, { onDelete: "cascade" }),

  // Referral details
  referral_level: integer("referral_level").notNull(), // 1 or 2
  referral_status: varchar("referral_status", { length: 20 }).default('pending'), // 'pending', 'active', 'inactive'

  // Bonus tracking
  bonus_percentage: real("bonus_percentage"), // 3% for level 1, 1% for level 2
  total_bonus_earned_cents: integer("total_bonus_earned_cents").default(0),
  equity_bonus_percentage: real("equity_bonus_percentage").default(0), // Additional equity earned

  // Dates
  referral_date: timestamp("referral_date", { withTimezone: true }).defaultNow(),
  activated_date: timestamp("activated_date", { withTimezone: true }),

  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Influencer metrics snapshots table (for historical tracking)
export const influencerMetricsSnapshots = pgTable("influencer_metrics_snapshots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  influencer_id: uuid("influencer_id").notNull().references(() => influencerProfiles.id, { onDelete: "cascade" }),

  // Snapshot period
  snapshot_date: timestamp("snapshot_date", { withTimezone: true }).notNull(),
  period_type: varchar("period_type", { length: 20 }).notNull(), // 'daily', 'weekly', 'monthly', 'quarterly'

  // Audience metrics
  follower_count: integer("follower_count").default(0),
  follower_growth: integer("follower_growth").default(0), // Change from last period

  // Content metrics
  posts_created: integer("posts_created").default(0),
  total_views: integer("total_views").default(0),
  total_engagement: integer("total_engagement").default(0),
  average_engagement_rate: real("average_engagement_rate").default(0),

  // Performance metrics
  total_clicks: integer("total_clicks").default(0),
  total_conversions: integer("total_conversions").default(0),
  conversion_rate: real("conversion_rate").default(0),
  active_subscriptions: integer("active_subscriptions").default(0),
  new_conversions: integer("new_conversions").default(0),
  churned_users: integer("churned_users").default(0),

  // Revenue metrics
  revenue_generated_cents: integer("revenue_generated_cents").default(0),
  commission_earned_cents: integer("commission_earned_cents").default(0),
  referral_bonus_cents: integer("referral_bonus_cents").default(0),
  total_earnings_cents: integer("total_earnings_cents").default(0),

  // Equity tracking
  equity_percentage_at_snapshot: real("equity_percentage_at_snapshot"),
  equity_vested_percentage_at_snapshot: real("equity_vested_percentage_at_snapshot"),

  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Influencer users table (for login access to influencer portal)
export const influencerUsers = pgTable("influencer_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  influencer_id: uuid("influencer_id").notNull().references(() => influencerProfiles.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Access control
  access_status: varchar("access_status", { length: 20 }).default('active'), // 'active', 'suspended', 'revoked'

  // Audit
  last_login_at: timestamp("last_login_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});