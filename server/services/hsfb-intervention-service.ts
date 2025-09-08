// HSFB Intervention Service
// Handles grounding interventions and tracks effectiveness

import { supabase } from './supabase-service';
import { DistressAssessment } from './distress-detection-service';

export interface HSFBIntervention {
  id?: string;
  userId: string;
  callId: string;
  agentName: string;
  triggerType: 'distress_detected' | 'user_requested' | 'agent_suggested';
  preAssessment: DistressAssessment;
  postAssessment?: DistressAssessment;
  interventionPrompt: string;
  startTime: Date;
  endTime?: Date;
  modalityFocus: 'hearing' | 'seeing' | 'feeling' | 'breathing';
  effectiveness?: number;
  cssStage?: string;
}

// HSFB prompts by distress category
const HSFB_PROMPTS = {
  panic: {
    modality: 'breathing' as const,
    prompt: `I notice you're experiencing some intense sensations right now. Let's pause together and focus on your breathing. 
             Place one hand on your chest and one on your stomach. We'll breathe slowly together - 
             in through your nose for 4 counts, feeling your stomach expand... hold for 2... 
             and out through your mouth for 6, letting your stomach gently fall.`
  },

  dissociation: {
    modality: 'feeling' as const,
    prompt: `I can see things feel disconnected right now. Let's ground together. 
             Can you tell me 5 things you can see around you? Now 4 things you can touch? 
             3 things you can hear? 2 things you can smell? And 1 thing you can taste? 
             This helps bring us back to the present moment.`
  },

  fragmentation: {
    modality: 'hearing' as const,
    prompt: `Your thoughts seem to be moving very quickly. Let's slow down together. 
             First, let's take three deep breaths. Now, can you describe what you're 
             hearing right now - both outside sounds and any internal dialogue? 
             We'll work with one thought at a time.`
  },

  overwhelm: {
    modality: 'seeing' as const,
    prompt: `Everything feels like too much right now. Let's create some space. 
             Close your eyes if that feels comfortable. Imagine you're looking at all 
             these feelings from a distance, like clouds passing in the sky. 
             They're there, but you don't have to hold them all at once.`
  },

  somatic: {
    modality: 'breathing' as const,
    prompt: `Your body is telling us something important. Let's listen together. 
             Starting at the top of your head, slowly scan down through your body. 
             Where do you notice tension? Where do you notice ease? 
             Let's breathe into the tense areas, imagining the breath bringing softness.`
  }
};

/**
 * Start HSFB intervention
 */
export async function startHSFBIntervention(
  userId: string,
  callId: string,
  agentName: string,
  assessment: DistressAssessment,
  triggerContent: string,
  cssStage?: string
): Promise<HSFBIntervention | null> {
  try {
    const promptConfig = HSFB_PROMPTS[assessment.category as keyof typeof HSFB_PROMPTS] || HSFB_PROMPTS.fragmentation;

    // Store intervention in database
    const { data, error } = await supabase
      .from('hsfb_interventions')
      .insert({
        user_id: userId,
        call_id: callId,
        agent_name: agentName,
        trigger_type: 'distress_detected',
        trigger_content: triggerContent.substring(0, 200),
        distress_level_pre: assessment.level,
        distress_category: assessment.category,
        intervention_prompt: promptConfig.prompt,
        modality_focus: promptConfig.modality,
        css_stage_at_intervention: cssStage || 'unknown'
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to start HSFB intervention:', error);
      return null;
    }

    console.log(`🌬️ HSFB Intervention started: ${data.id}`);
    console.log(`  Distress: ${assessment.level}/10 (${assessment.category})`);
    console.log(`  Modality: ${promptConfig.modality}`);

    return {
      id: data.id,
      userId,
      callId,
      agentName,
      triggerType: 'distress_detected',
      preAssessment: assessment,
      interventionPrompt: promptConfig.prompt,
      startTime: new Date(),
      modalityFocus: promptConfig.modality,
      cssStage: cssStage
    };

  } catch (error) {
    console.error('Error starting HSFB intervention:', error);
    return null;
  }
}

/**
 * Complete HSFB intervention
 */
export async function completeHSFBIntervention(
  interventionId: string,
  postAssessment: DistressAssessment,
  userResponse: string,
  duration: number
): Promise<number> {
  try {
    // Calculate effectiveness
    const effectiveness = calculateEffectiveness(postAssessment.level);

    // Update database
    const { error } = await supabase
      .from('hsfb_interventions')
      .update({
        distress_level_post: postAssessment.level,
        user_response: userResponse.substring(0, 500),
        duration_seconds: duration,
        effectiveness_score: effectiveness,
        completed_at: new Date().toISOString()
      })
      .eq('id', interventionId);

    if (error) {
      console.error('Failed to complete HSFB intervention:', error);
      return 0;
    }

    console.log(`✅ HSFB Intervention completed: ${interventionId}`);
    console.log(`  Post-distress: ${postAssessment.level}/10`);
    console.log(`  Effectiveness: ${effectiveness}/10`);

    return effectiveness;

  } catch (error) {
    console.error('Error completing HSFB intervention:', error);
    return 0;
  }
}

/**
 * Get recent interventions for user
 */
export async function getRecentInterventions(
  userId: string,
  limit: number = 5
): Promise<any[]> {
  const { data, error } = await supabase
    .from('hsfb_interventions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get recent interventions:', error);
    return [];
  }

  return data || [];
}

/**
 * Check if user had recent successful intervention
 */
export async function hadRecentSuccessfulIntervention(
  userId: string,
  withinMinutes: number = 30
): Promise<boolean> {
  const cutoffTime = new Date(Date.now() - withinMinutes * 60000).toISOString();

  const { data, error } = await supabase
    .from('hsfb_interventions')
    .select('effectiveness_score')
    .eq('user_id', userId)
    .gte('created_at', cutoffTime)
    .gte('effectiveness_score', 7)
    .limit(1);

  return !error && data && data.length > 0;
}

/**
 * Calculate intervention effectiveness
 */
function calculateEffectiveness(postDistressLevel: number): number {
  // Simple effectiveness: lower post-distress = higher effectiveness
  return Math.max(1, Math.min(10, 10 - postDistressLevel));
}

/**
 * Get intervention statistics for user
 */
export async function getUserInterventionStats(userId: string): Promise<{
  totalInterventions: number;
  averageEffectiveness: number;
  mostCommonCategory: string;
  preferredModality: string;
}> {
  const { data, error } = await supabase
    .from('hsfb_interventions')
    .select('effectiveness_score, distress_category, modality_focus')
    .eq('user_id', userId);

  if (error || !data || data.length === 0) {
    return {
      totalInterventions: 0,
      averageEffectiveness: 0,
      mostCommonCategory: 'unknown',
      preferredModality: 'breathing'
    };
  }

  // Calculate stats
  const totalInterventions = data.length;
  const avgEffectiveness = data.reduce((sum, i) => sum + (i.effectiveness_score || 0), 0) / totalInterventions;

  // Find most common category
  const categoryCounts: Record<string, number> = {};
  data.forEach(i => {
    if (i.distress_category) {
      categoryCounts[i.distress_category] = (categoryCounts[i.distress_category] || 0) + 1;
    }
  });
  const mostCommonCategory = Object.entries(categoryCounts)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';

  // Find most effective modality
  const modalityEffectiveness: Record<string, number[]> = {};
  data.forEach(i => {
    if (i.modality_focus && i.effectiveness_score) {
      if (!modalityEffectiveness[i.modality_focus]) {
        modalityEffectiveness[i.modality_focus] = [];
      }
      modalityEffectiveness[i.modality_focus].push(i.effectiveness_score);
    }
  });

  const preferredModality = Object.entries(modalityEffectiveness)
    .map(([modality, scores]) => ({
      modality,
      avgScore: scores.reduce((a, b) => a + b, 0) / scores.length
    }))
    .sort((a, b) => b.avgScore - a.avgScore)[0]?.modality || 'breathing';

  return {
    totalInterventions,
    averageEffectiveness: Math.round(avgEffectiveness * 10) / 10,
    mostCommonCategory,
    preferredModality
  };
}

/**
 * Generate intervention response for VAPI
 */
export function generateInterventionResponse(intervention: HSFBIntervention): any {
  return {
    action: 'trigger_hsfb',
    intervention: {
      id: intervention.id,
      prompt: intervention.interventionPrompt,
      modality: intervention.modalityFocus,
      distressLevel: intervention.preAssessment.level,
      category: intervention.preAssessment.category
    }
  };
}