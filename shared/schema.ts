import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, real, jsonb, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  first_name: text("first_name"),
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

// Therapeutic context table for memory
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

// Types
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
