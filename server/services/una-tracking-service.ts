// server/services/una-tracking-service.ts
// UNA (Unary Narrative Architecture) Tracking Service
// Handles narrative coherence tracking separate from CSS/PCA system

import { supabase } from './supabase-service';

export interface UNAMetadata {
  coherence: {
    secondary_matches_real: boolean | null;
    output_status: 'symbolic' | 'imaginary' | 'transitional';
  };
  relational_mode: 'analog' | 'digital' | 'mixed';
  // v1.2: PCP Axis orientation tracking
  pcp_orientation?: {
    toward_digital_pole: boolean;
    toward_analog_pole: boolean;
    balanced: boolean;
  };
  orientation: {
    subject_sensed: boolean;
    gap_detected: boolean;
    form_attended: boolean;
    absence_noted: boolean;
  };
  // v1.2: Wound presentation tracking
  wound_presentation?: {
    defended_against: boolean;
    being_worked_with: boolean;
    reaching_beyond: boolean;
  };
  coherence_notes?: string;
  why_discussion_triggered?: boolean;
  // v1.2: Thend proximity tracking
  thend_proximity?: 'distant' | 'approaching' | 'near' | 'achieved';
  safety: {
    flag: boolean;
    crisis: boolean;
    crisis_action?: string;
  };
}

export interface UNATrackingEntry {
  user_id: string;
  session_id: string;
  exchange_number: number;
  metadata: UNAMetadata;
  user_message_summary?: string;
  agent_response_summary?: string;
}

/**
 * Parse UNA metadata from agent response
 * UNA agents output in format: <speak>...</speak><meta>{...}</meta>
 */
export function parseUNAMetadata(agentOutput: string): { speak: string; meta: UNAMetadata | null } {
  const speakMatch = agentOutput.match(/<speak>([\s\S]*?)<\/speak>/);
  const metaMatch = agentOutput.match(/<meta>([\s\S]*?)<\/meta>/);

  const speak = speakMatch ? speakMatch[1].trim() : agentOutput;
  let meta: UNAMetadata | null = null;

  if (metaMatch) {
    try {
      meta = JSON.parse(metaMatch[1].trim());
    } catch (e) {
      console.error('[UNA] Failed to parse metadata:', e);
    }
  }

  return { speak, meta };
}

/**
 * Store UNA tracking entry in database
 */
export async function storeUNATracking(entry: UNATrackingEntry): Promise<void> {
  try {
    const { error } = await supabase.from('una_narrative_tracking').insert({
      user_id: entry.user_id,
      session_id: entry.session_id,
      exchange_number: entry.exchange_number,
      secondary_matches_real: entry.metadata.coherence.secondary_matches_real,
      output_status: entry.metadata.coherence.output_status,
      relational_mode: entry.metadata.relational_mode,
      subject_sensed: entry.metadata.orientation.subject_sensed,
      gap_detected: entry.metadata.orientation.gap_detected,
      form_attended: entry.metadata.orientation.form_attended,
      absence_noted: entry.metadata.orientation.absence_noted,
      coherence_notes: entry.metadata.coherence_notes,
      why_discussion_triggered: entry.metadata.why_discussion_triggered,
      safety_flag: entry.metadata.safety.flag,
      crisis_detected: entry.metadata.safety.crisis,
      crisis_action_taken: entry.metadata.safety.crisis_action,
      user_message_summary: entry.user_message_summary,
      agent_response_summary: entry.agent_response_summary
    });

    if (error) {
      console.error('[UNA] Failed to store tracking:', error);
    } else {
      console.log(`[UNA] Stored tracking for session ${entry.session_id}, exchange ${entry.exchange_number}`);
    }
  } catch (e) {
    console.error('[UNA] Error storing tracking:', e);
  }
}

/**
 * Check if crisis action is needed
 */
export function checkUNACrisis(metadata: UNAMetadata): { isCrisis: boolean; action: string | null } {
  if (metadata.safety.crisis) {
    return {
      isCrisis: true,
      action: metadata.safety.crisis_action || 'Immediate safety assessment and grounding techniques'
    };
  }
  return { isCrisis: false, action: null };
}

/**
 * Build UNA memory context for returning users
 */
export async function buildUNAMemoryContext(userId: string): Promise<string> {
  try {
    // Get recent UNA sessions
    const { data: summaries, error } = await supabase
      .from('una_session_summaries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3);

    if (error || !summaries || summaries.length === 0) {
      return '';
    }

    let context = '===== UNA SESSION HISTORY =====\n';

    for (const summary of summaries) {
      context += `\nSession (${new Date(summary.created_at).toLocaleDateString()}):\n`;
      context += `- Dominant pattern: ${summary.dominant_pattern}\n`;
      context += `- Symbolic coherence: ${summary.symbolic_percentage}%\n`;

      if (summary.narrative_themes && summary.narrative_themes.length > 0) {
        context += `- Key themes: ${summary.narrative_themes.join(', ')}\n`;
      }

      if (summary.why_discussions && summary.why_discussions.length > 0) {
        context += `- WHY discussions: ${summary.why_discussions.join('; ')}\n`;
      }

      if (summary.continuation_notes) {
        context += `- Notes for continuation: ${summary.continuation_notes}\n`;
      }

      if (summary.crisis_occurred) {
        context += `- CRISIS HISTORY: ${summary.crisis_resolution}\n`;
      }
    }

    context += '===== END UNA HISTORY =====';

    return context;
  } catch (e) {
    console.error('[UNA] Error building memory context:', e);
    return '';
  }
}

/**
 * Generate end-of-session summary for UNA
 */
export async function generateUNASessionSummary(
  userId: string,
  sessionId: string
): Promise<void> {
  try {
    // Get all tracking entries for this session
    const { data: entries, error } = await supabase
      .from('una_narrative_tracking')
      .select('*')
      .eq('session_id', sessionId)
      .order('exchange_number', { ascending: true });

    if (error || !entries || entries.length === 0) {
      console.log('[UNA] No tracking entries for session summary');
      return;
    }

    // Calculate summary metrics
    const symbolicCount = entries.filter(e => e.output_status === 'symbolic').length;
    const symbolicPercentage = (symbolicCount / entries.length) * 100;

    const matchingCount = entries.filter(e => e.secondary_matches_real === true).length;
    const mismatchingCount = entries.filter(e => e.secondary_matches_real === false).length;

    let dominantPattern: string;
    if (matchingCount > mismatchingCount * 1.5) {
      dominantPattern = 'matching';
    } else if (mismatchingCount > matchingCount * 1.5) {
      dominantPattern = 'mismatching';
    } else if (symbolicPercentage > 60) {
      dominantPattern = 'transitional';
    } else {
      dominantPattern = 'mixed';
    }

    // Extract themes and WHY discussions from notes
    const themes: string[] = [];
    const whyDiscussions: string[] = [];
    let crisisOccurred = false;
    let crisisResolution = '';

    for (const entry of entries) {
      if (entry.coherence_notes) {
        themes.push(entry.coherence_notes);
      }
      if (entry.why_discussion_triggered && entry.agent_response_summary) {
        whyDiscussions.push(entry.agent_response_summary);
      }
      if (entry.crisis_detected) {
        crisisOccurred = true;
        if (entry.crisis_action_taken) {
          crisisResolution = entry.crisis_action_taken;
        }
      }
    }

    // Store summary
    const { error: insertError } = await supabase.from('una_session_summaries').insert({
      user_id: userId,
      session_id: sessionId,
      dominant_pattern: dominantPattern,
      symbolic_percentage: symbolicPercentage,
      narrative_themes: themes.slice(0, 5),  // Keep top 5 themes
      why_discussions: whyDiscussions.slice(0, 3),  // Keep top 3 WHY discussions
      continuation_notes: `Session showed ${dominantPattern} pattern with ${symbolicPercentage.toFixed(0)}% symbolic coherence.`,
      crisis_occurred: crisisOccurred,
      crisis_resolution: crisisResolution
    });

    if (insertError) {
      console.error('[UNA] Failed to store session summary:', insertError);
    } else {
      console.log(`[UNA] Session summary stored for session ${sessionId}`);
    }
  } catch (e) {
    console.error('[UNA] Error generating session summary:', e);
  }
}

/**
 * Get the therapeutic session ID from call_id
 */
export async function getTherapeuticSessionId(callId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('therapeutic_sessions')
      .select('id')
      .eq('call_id', callId)
      .single();

    if (error || !data) {
      console.error('[UNA] Could not find therapeutic session for call:', callId);
      return null;
    }

    return data.id;
  } catch (e) {
    console.error('[UNA] Error getting therapeutic session ID:', e);
    return null;
  }
}
