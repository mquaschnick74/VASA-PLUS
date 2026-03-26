// server/services/sensing-layer/arc-tracker.ts
// Therapeutic arc tracker — manages three-tier Thend/CYVC confirmation system
// Reads from and writes to the therapeutic_arc table (one row per user)

import { supabase } from '../supabase-service';
import { detectCSSPatterns } from '../css-pattern-service';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ArcEventStatus = 'none' | 'candidate' | 'confirmed_candidate' | 'confirmed';

export type ActiveArcPosition =
  | 'pre_thend'
  | 'thend_candidate'
  | 'thend_confirmed'
  | 'cyvc_candidate'
  | 'cyvc_confirmed';

export interface ArcPosition {
  activePosition: ActiveArcPosition;
  thendStatus: ArcEventStatus;
  cyvcStatus: ArcEventStatus;
  thendEvidence: string | null;
  cyvcEvidence: string | null;
}

interface ArcRow {
  user_id: string;
  thend_status: ArcEventStatus;
  thend_candidate_session_id: string | null;
  thend_candidate_detection_count: number;
  thend_confirmed_candidate_session_id: string | null;
  thend_confirmation_session_id: string | null;
  thend_first_detected_at: string | null;
  thend_confirmed_at: string | null;
  thend_evidence: string | null;
  cyvc_status: ArcEventStatus;
  cyvc_candidate_session_id: string | null;
  cyvc_candidate_detection_count: number;
  cyvc_confirmed_candidate_session_id: string | null;
  cyvc_confirmation_session_id: string | null;
  cyvc_first_detected_at: string | null;
  cyvc_confirmed_at: string | null;
  cyvc_evidence: string | null;
  active_arc_position: ActiveArcPosition;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function deriveActivePosition(
  thendStatus: ArcEventStatus,
  cyvcStatus: ArcEventStatus
): ActiveArcPosition {
  if (cyvcStatus === 'confirmed') return 'cyvc_confirmed';
  if (cyvcStatus === 'confirmed_candidate' || cyvcStatus === 'candidate') return 'cyvc_candidate';
  if (thendStatus === 'confirmed') return 'thend_confirmed';
  if (thendStatus === 'confirmed_candidate' || thendStatus === 'candidate') return 'thend_candidate';
  return 'pre_thend';
}

async function fetchOrCreateArcRow(userId: string): Promise<ArcRow | null> {
  const { data: existing, error: fetchError } = await supabase
    .from('therapeutic_arc')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    // PGRST116 = row not found — all other errors are real
    console.error('🎯 [ArcTracker] Error fetching arc row:', fetchError.message);
    return null;
  }

  if (existing) return existing as ArcRow;

  // Row does not exist — create it
  const { data: created, error: createError } = await supabase
    .from('therapeutic_arc')
    .insert({ user_id: userId })
    .select('*')
    .single();

  if (createError) {
    console.error('🎯 [ArcTracker] Error creating arc row:', createError.message);
    return null;
  }

  return created as ArcRow;
}

// ─── Core update logic ────────────────────────────────────────────────────────

interface ArcUpdateInput {
  userId: string;
  sessionId: string;
  thendDetections: string[];
  cyvcDetections: string[];
}

async function applyArcUpdate(input: ArcUpdateInput): Promise<void> {
  const { userId, sessionId, thendDetections, cyvcDetections } = input;

  if (thendDetections.length === 0 && cyvcDetections.length === 0) return;

  const row = await fetchOrCreateArcRow(userId);
  if (!row) return;

  const updates: Partial<ArcRow> = {};
  let thendStatus = row.thend_status;
  let cyvcStatus = row.cyvc_status;

  // ── Thend tier logic ──────────────────────────────────────────────────────
  if (thendDetections.length > 0) {
    const evidence = thendDetections[0];

    if (thendStatus === 'none') {
      // Tier 1: first detection ever — write candidate
      thendStatus = 'candidate';
      updates.thend_status = 'candidate';
      updates.thend_candidate_session_id = sessionId;
      updates.thend_candidate_detection_count = thendDetections.length;
      updates.thend_first_detected_at = new Date().toISOString();
      updates.thend_evidence = evidence;
      console.log(`🎯 [ArcTracker] Thend → candidate (session ${sessionId})`);

      // If two detections arrived in this same session, advance to confirmed_candidate
      if (thendDetections.length >= 2) {
        thendStatus = 'confirmed_candidate';
        updates.thend_status = 'confirmed_candidate';
        updates.thend_confirmed_candidate_session_id = sessionId;
        console.log(`🎯 [ArcTracker] Thend → confirmed_candidate (same-session double detection, session ${sessionId})`);
      }

    } else if (thendStatus === 'candidate') {
      const isSameSession = row.thend_candidate_session_id === sessionId;

      if (isSameSession) {
        // Additional detections in the same session that first produced candidate
        const newCount = row.thend_candidate_detection_count + thendDetections.length;
        updates.thend_candidate_detection_count = newCount;
        if (newCount >= 2) {
          thendStatus = 'confirmed_candidate';
          updates.thend_status = 'confirmed_candidate';
          updates.thend_confirmed_candidate_session_id = sessionId;
          console.log(`🎯 [ArcTracker] Thend → confirmed_candidate (same-session accumulated, session ${sessionId})`);
        }
      } else {
        // Different session — cross-session confirmation: advance directly to confirmed
        thendStatus = 'confirmed';
        updates.thend_status = 'confirmed';
        updates.thend_confirmation_session_id = sessionId;
        updates.thend_confirmed_at = new Date().toISOString();
        updates.thend_evidence = evidence;
        console.log(`🎯 [ArcTracker] Thend → CONFIRMED (cross-session, session ${sessionId})`);
      }

    } else if (thendStatus === 'confirmed_candidate') {
      const isSameSession = row.thend_confirmed_candidate_session_id === sessionId;

      if (!isSameSession) {
        // Different session from confirmed_candidate — advance to confirmed
        thendStatus = 'confirmed';
        updates.thend_status = 'confirmed';
        updates.thend_confirmation_session_id = sessionId;
        updates.thend_confirmed_at = new Date().toISOString();
        updates.thend_evidence = evidence;
        console.log(`🎯 [ArcTracker] Thend → CONFIRMED (cross-session from confirmed_candidate, session ${sessionId})`);
      }
      // If same session as confirmed_candidate: already at confirmed_candidate — no change needed
    }
    // If thendStatus === 'confirmed': already at terminal state — no update
  }

  // ── CYVC tier logic ───────────────────────────────────────────────────────
  if (cyvcDetections.length > 0) {
    const evidence = cyvcDetections[0];

    // HARD GATE: CYVC cannot reach 'confirmed' unless Thend is confirmed
    // Candidates and confirmed_candidate are allowed to accumulate.
    // Only the promotion to 'confirmed' is blocked.

    if (cyvcStatus === 'none') {
      cyvcStatus = 'candidate';
      updates.cyvc_status = 'candidate';
      updates.cyvc_candidate_session_id = sessionId;
      updates.cyvc_candidate_detection_count = cyvcDetections.length;
      updates.cyvc_first_detected_at = new Date().toISOString();
      updates.cyvc_evidence = evidence;
      console.log(`🎯 [ArcTracker] CYVC → candidate (session ${sessionId})`);

      if (cyvcDetections.length >= 2) {
        cyvcStatus = 'confirmed_candidate';
        updates.cyvc_status = 'confirmed_candidate';
        updates.cyvc_confirmed_candidate_session_id = sessionId;
        console.log(`🎯 [ArcTracker] CYVC → confirmed_candidate (same-session double detection, session ${sessionId})`);
      }

    } else if (cyvcStatus === 'candidate') {
      const isSameSession = row.cyvc_candidate_session_id === sessionId;

      if (isSameSession) {
        const newCount = row.cyvc_candidate_detection_count + cyvcDetections.length;
        updates.cyvc_candidate_detection_count = newCount;
        if (newCount >= 2) {
          cyvcStatus = 'confirmed_candidate';
          updates.cyvc_status = 'confirmed_candidate';
          updates.cyvc_confirmed_candidate_session_id = sessionId;
          console.log(`🎯 [ArcTracker] CYVC → confirmed_candidate (same-session accumulated, session ${sessionId})`);
        }
      } else {
        // Cross-session detection — check Thend gate before confirming
        if (thendStatus === 'confirmed') {
          cyvcStatus = 'confirmed';
          updates.cyvc_status = 'confirmed';
          updates.cyvc_confirmation_session_id = sessionId;
          updates.cyvc_confirmed_at = new Date().toISOString();
          updates.cyvc_evidence = evidence;
          console.log(`🎯 [ArcTracker] CYVC → CONFIRMED (cross-session, Thend gate passed, session ${sessionId})`);
        } else {
          // Thend not yet confirmed — promote to confirmed_candidate but hold at gate
          cyvcStatus = 'confirmed_candidate';
          updates.cyvc_status = 'confirmed_candidate';
          updates.cyvc_confirmed_candidate_session_id = sessionId;
          console.log(`🎯 [ArcTracker] CYVC → confirmed_candidate (cross-session, Thend gate not yet met, session ${sessionId})`);
        }
      }

    } else if (cyvcStatus === 'confirmed_candidate') {
      const isSameSession = row.cyvc_confirmed_candidate_session_id === sessionId;

      if (!isSameSession && thendStatus === 'confirmed') {
        cyvcStatus = 'confirmed';
        updates.cyvc_status = 'confirmed';
        updates.cyvc_confirmation_session_id = sessionId;
        updates.cyvc_confirmed_at = new Date().toISOString();
        updates.cyvc_evidence = evidence;
        console.log(`🎯 [ArcTracker] CYVC → CONFIRMED (cross-session from confirmed_candidate, Thend gate passed, session ${sessionId})`);
      }
      // If Thend not confirmed or same session: hold
    }
    // If cyvcStatus === 'confirmed': already terminal
  }

  // ── Derive and write active_arc_position ─────────────────────────────────
  updates.active_arc_position = deriveActivePosition(thendStatus, cyvcStatus);

  if (Object.keys(updates).length === 0) return;

  const { error: updateError } = await supabase
    .from('therapeutic_arc')
    .update(updates)
    .eq('user_id', userId);

  if (updateError) {
    console.error('🎯 [ArcTracker] Error writing arc update:', updateError.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called from webhook-routes.ts at end of voice session.
 * Runs detectCSSPatterns on the transcript, then applies arc update logic.
 */
export async function updateArcFromTranscript(
  userId: string,
  sessionId: string,
  transcript: string | any[]
): Promise<void> {
  try {
    // Normalize transcript to string if needed
    let transcriptText: string;
    if (typeof transcript === 'string') {
      transcriptText = transcript;
    } else if (Array.isArray(transcript)) {
      transcriptText = transcript
        .map((m: any) => {
          const role = m.role === 'assistant' ? 'Therapist' : 'User';
          const content = m.content || m.message || m.text || '';
          return `${role}: ${content}`;
        })
        .join('\n');
    } else {
      return;
    }

    if (transcriptText.length < 100) return;

    const patterns = await detectCSSPatterns(transcriptText, false);
    await applyArcUpdate({
      userId,
      sessionId,
      thendDetections: patterns.thendIndicators,
      cyvcDetections: patterns.cyvcPatterns,
    });
  } catch (error) {
    console.error('🎯 [ArcTracker] updateArcFromTranscript error (non-fatal):', error);
  }
}

/**
 * Called from orchestration-service.ts after CSS patterns are already detected.
 * Avoids running detectCSSPatterns a second time.
 */
export async function updateArcFromPatterns(
  userId: string,
  sessionId: string,
  thendDetections: string[],
  cyvcDetections: string[]
): Promise<void> {
  try {
    await applyArcUpdate({ userId, sessionId, thendDetections, cyvcDetections });
  } catch (error) {
    console.error('🎯 [ArcTracker] updateArcFromPatterns error (non-fatal):', error);
  }
}

/**
 * Called from custom-llm-routes.ts at session start.
 * Returns the client's current arc position for injection into the profile block.
 * Returns null if no arc row exists (first session or no detections yet).
 */
export async function getArcPosition(userId: string): Promise<ArcPosition | null> {
  try {
    const { data, error } = await supabase
      .from('therapeutic_arc')
      .select('active_arc_position, thend_status, cyvc_status, thend_evidence, cyvc_evidence')
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;

    return {
      activePosition: data.active_arc_position as ActiveArcPosition,
      thendStatus: data.thend_status as ArcEventStatus,
      cyvcStatus: data.cyvc_status as ArcEventStatus,
      thendEvidence: data.thend_evidence ?? null,
      cyvcEvidence: data.cyvc_evidence ?? null,
    };
  } catch (error) {
    console.error('🎯 [ArcTracker] getArcPosition error (non-fatal):', error);
    return null;
  }
}
