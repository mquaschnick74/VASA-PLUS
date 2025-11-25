// server/services/user-analysis-service.ts
// Unified service for running all analysis types: session_summary, intent_analysis, concept_insights, pca_master

import { supabase } from './supabase-service';
import {
  SESSION_SUMMARY_PROMPT,
  INTENT_ANALYSIS_PROMPT,
  CONCEPT_INSIGHTS_PROMPT
} from '../prompts/user-analysis-prompts';
import { STREAMLINED_ANALYSIS_PROMPT } from '../prompts/master-pc-analyst';

// Types
type AnalysisType = 'session_summary' | 'intent_analysis' | 'concept_insights' | 'pca_master';

interface TranscriptData {
  call_id: string;
  text: string;
  created_at: string;
  duration_seconds: number;
  agent_name?: string;
}

interface AnalysisResult {
  analysisType: AnalysisType;
  content?: string;        // User-visible content (ephemeral - not stored)
  message?: string;        // Confirmation message for pca_master
}

interface SessionInfo {
  callId: string;
  date: string;
  agentName: string;
  durationMinutes: number;
}

export class UserAnalysisService {

  /**
   * Main entry point - run analysis based on type
   */
  async runAnalysis(
    userId: string,
    analysisType: AnalysisType,
    sessionIds?: string[],
    sessionCount?: number
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    console.log(`🔍 Starting ${analysisType} analysis for user ${userId}`);

    // 1. Fetch transcripts based on type
    const transcripts = await this.fetchTranscripts(
      userId,
      analysisType,
      sessionIds,
      sessionCount
    );

    if (transcripts.length === 0) {
      throw new Error('No transcripts available for analysis');
    }

    console.log(`📄 Fetched ${transcripts.length} transcripts for analysis`);

    // 2. Get appropriate prompt
    const prompt = this.buildPrompt(analysisType, transcripts);

    // 3. Call OpenAI
    const response = await this.callOpenAI(prompt, analysisType);

    const processingTime = Date.now() - startTime;
    console.log(`✅ ${analysisType} analysis completed in ${processingTime}ms`);

    // 4. For pca_master, store to therapeutic_context for agent injection
    if (analysisType === 'pca_master') {
      await this.storePCATherapeuticContext(userId, response.content);

      return {
        analysisType,
        message: 'Analysis complete. Advanced insights are now enhancing your future sessions.'
      };
    }

    // 5. For user-visible types, return content directly (ephemeral - not stored)
    return {
      analysisType,
      content: response.content
    };
  }

  /**
   * Get list of sessions available for analysis
   */
  async getAvailableSessions(userId: string): Promise<SessionInfo[]> {
    // Get sessions that have transcripts
    const { data: sessions, error } = await supabase
      .from('therapeutic_sessions')
      .select('call_id, created_at, agent_name, duration_seconds')
      .eq('user_id', userId)
      .not('duration_seconds', 'is', null)
      .gt('duration_seconds', 60) // At least 1 minute
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching sessions:', error);
      throw new Error('Failed to fetch sessions');
    }

    if (!sessions || sessions.length === 0) {
      return [];
    }

    // Check which sessions have transcripts
    const callIds = sessions.map(s => s.call_id);
    const { data: transcriptCounts } = await supabase
      .from('session_transcripts')
      .select('call_id')
      .in('call_id', callIds);

    const sessionsWithTranscripts = new Set(transcriptCounts?.map(t => t.call_id) || []);

    return sessions
      .filter(s => sessionsWithTranscripts.has(s.call_id))
      .map(s => ({
        callId: s.call_id,
        date: s.created_at,
        agentName: s.agent_name || 'Sarah',
        durationMinutes: Math.round((s.duration_seconds || 0) / 60)
      }));
  }

  /**
   * Fetch transcripts based on analysis type and selection
   */
  private async fetchTranscripts(
    userId: string,
    analysisType: AnalysisType,
    sessionIds?: string[],
    sessionCount?: number
  ): Promise<TranscriptData[]> {

    if (analysisType === 'intent_analysis' || analysisType === 'concept_insights') {
      // Single session - must have sessionIds with exactly 1 entry
      if (!sessionIds || sessionIds.length !== 1) {
        throw new Error('Intent and Concept analysis require exactly one session');
      }
      return this.fetchTranscriptsByCallIds(userId, sessionIds);
    }

    // Multi-session (summary, pca_master) - use sessionCount
    const count = Math.min(Math.max(sessionCount || 3, 1), 5); // Clamp 1-5
    return this.fetchRecentTranscripts(userId, count);
  }

  /**
   * Fetch transcripts by specific call IDs
   */
  private async fetchTranscriptsByCallIds(
    userId: string,
    callIds: string[]
  ): Promise<TranscriptData[]> {
    // Get session metadata
    const { data: sessions, error: sessionsError } = await supabase
      .from('therapeutic_sessions')
      .select('call_id, duration_seconds, created_at, agent_name')
      .eq('user_id', userId)
      .in('call_id', callIds);

    if (sessionsError || !sessions) {
      throw new Error('Failed to fetch session data');
    }

    // Get transcripts
    const { data: transcripts, error: transcriptsError } = await supabase
      .from('session_transcripts')
      .select('call_id, text, timestamp')
      .eq('user_id', userId)
      .in('call_id', callIds)
      .order('timestamp', { ascending: true });

    if (transcriptsError) {
      throw new Error('Failed to fetch transcripts');
    }

    // Group transcripts by call_id
    const transcriptsByCallId = new Map<string, string>();
    transcripts?.forEach(t => {
      const existing = transcriptsByCallId.get(t.call_id) || '';
      transcriptsByCallId.set(t.call_id, existing + t.text + '\n');
    });

    // Build result
    return sessions.map(session => ({
      call_id: session.call_id,
      text: transcriptsByCallId.get(session.call_id) || '',
      created_at: session.created_at,
      duration_seconds: session.duration_seconds || 0,
      agent_name: session.agent_name
    })).filter(t => t.text.length > 0);
  }

  /**
   * Fetch most recent transcripts
   */
  private async fetchRecentTranscripts(
    userId: string,
    limit: number
  ): Promise<TranscriptData[]> {
    // First, get the recent sessions
    const { data: sessions, error: sessionsError } = await supabase
      .from('therapeutic_sessions')
      .select('call_id, duration_seconds, created_at, agent_name')
      .eq('user_id', userId)
      .not('duration_seconds', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      throw new Error('Failed to fetch sessions');
    }

    if (!sessions || sessions.length === 0) {
      return [];
    }

    // Get transcripts for these sessions
    const callIds = sessions.map(s => s.call_id);
    const { data: transcripts, error: transcriptsError } = await supabase
      .from('session_transcripts')
      .select('call_id, text, timestamp')
      .eq('user_id', userId)
      .in('call_id', callIds)
      .order('timestamp', { ascending: true });

    if (transcriptsError) {
      console.error('Error fetching transcripts:', transcriptsError);
      throw new Error('Failed to fetch transcripts');
    }

    // Group transcripts by call_id
    const transcriptsByCallId = new Map<string, string>();
    transcripts?.forEach(t => {
      const existing = transcriptsByCallId.get(t.call_id) || '';
      transcriptsByCallId.set(t.call_id, existing + t.text + '\n');
    });

    // Build final transcript data
    const result: TranscriptData[] = sessions.map(session => ({
      call_id: session.call_id,
      text: transcriptsByCallId.get(session.call_id) || '',
      created_at: session.created_at,
      duration_seconds: session.duration_seconds || 0,
      agent_name: session.agent_name
    })).filter(t => t.text.length > 0);

    return result;
  }

  /**
   * Format transcripts for prompt
   */
  private formatTranscripts(transcripts: TranscriptData[]): string {
    return transcripts
      .map((t, i) => `
SESSION ${i + 1} (${new Date(t.created_at).toLocaleDateString()})
Therapist: ${t.agent_name || 'Sarah'}
Duration: ${Math.round(t.duration_seconds / 60)} minutes

TRANSCRIPT:
${t.text}
      `)
      .join('\n---NEXT SESSION---\n');
  }

  /**
   * Build prompt with transcripts
   */
  private buildPrompt(analysisType: AnalysisType, transcripts: TranscriptData[]): string {
    const formattedTranscripts = this.formatTranscripts(transcripts);

    let basePrompt: string;
    switch (analysisType) {
      case 'session_summary':
        basePrompt = SESSION_SUMMARY_PROMPT;
        break;
      case 'intent_analysis':
        basePrompt = INTENT_ANALYSIS_PROMPT;
        break;
      case 'concept_insights':
        basePrompt = CONCEPT_INSIGHTS_PROMPT;
        break;
      case 'pca_master':
        basePrompt = STREAMLINED_ANALYSIS_PROMPT;
        break;
      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);
    }

    // Replace placeholder with transcripts
    return basePrompt
      .replace('[TRANSCRIPTS GO HERE]', formattedTranscripts)
      .replace('[TRANSCRIPT GO HERE]', formattedTranscripts);
  }

  /**
   * Call OpenAI with appropriate settings per analysis type
   */
  private async callOpenAI(prompt: string, analysisType: AnalysisType): Promise<any> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

    // Adjust token limits based on analysis type
    const maxTokens = analysisType === 'pca_master' ? 4000 : 2000;

    // Use gpt-4o-mini for user-facing (cheaper, still good)
    // Use gpt-3.5-turbo-16k for pca_master (needs longer context)
    const model = analysisType === 'pca_master'
      ? 'gpt-3.5-turbo-16k'
      : 'gpt-4o-mini';

    // Trim prompt if it's too long
    const maxPromptLength = analysisType === 'pca_master' ? 30000 : 15000;
    const trimmedPrompt = prompt.length > maxPromptLength
      ? prompt.substring(0, maxPromptLength) + '\n\n[Content truncated due to length. Please provide analysis based on available content.]'
      : prompt;

    console.log(`🤖 Calling OpenAI ${model} for ${analysisType}...`);
    console.log(`📝 Prompt length: ${trimmedPrompt.length} chars`);

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: this.getSystemMessage(analysisType) },
        { role: 'user', content: trimmedPrompt }
      ],
      max_tokens: maxTokens,
      temperature: 0.3
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const totalTokens = data.usage?.total_tokens || 0;
    console.log(`✅ OpenAI API call successful (${totalTokens} tokens)`);

    return {
      content: data.choices[0].message.content,
      usage: data.usage
    };
  }

  /**
   * Get system message based on analysis type
   */
  private getSystemMessage(analysisType: AnalysisType): string {
    switch (analysisType) {
      case 'session_summary':
        return 'You are a skilled session analyst creating clear, accessible clinical summaries. Write for someone with no clinical training. Never use jargon. Use "Client" instead of actual names for privacy.';
      case 'intent_analysis':
        return 'You are a communication dynamics analyst examining what participants were trying to accomplish in conversation. Be insightful but accessible. Use "Client" instead of actual names for privacy.';
      case 'concept_insights':
        return 'You are a therapeutic insight extractor identifying the single most significant concept from a session. Make it practical and memorable. Use "Client" instead of actual names for privacy.';
      case 'pca_master':
        return 'You are a Master-level PsychoContextual Analyst specializing in Pure Contextual Perception (PCP). Provide thorough analysis following the PCA/PCP framework.';
      default:
        return 'You are a helpful assistant.';
    }
  }

  /**
   * Store PCA therapeutic context for agent injection (pca_master only)
   */
  private async storePCATherapeuticContext(userId: string, fullResponse: string): Promise<void> {
    // Extract OUTPUT 2 (therapeutic context) from PCA response
    const contextMatch = fullResponse.match(
      /===== THERAPEUTIC CONTEXT:[\s\S]*?===== END CONTEXT =====/
    );
    const therapeuticContext = contextMatch?.[0] || fullResponse.substring(0, 2000);

    // Extract CSS stage
    const cssStageMatch = fullResponse.match(/CURRENT CSS STAGE:\s*([^\n]+)/i);
    const cssStage = cssStageMatch?.[1]?.trim().toLowerCase() || 'unknown';

    const { error } = await supabase.from('therapeutic_context').insert({
      user_id: userId,
      context_type: 'comprehensive_clinical_context',
      content: therapeuticContext,
      css_stage: cssStage,
      confidence: 0.85,
      importance: 10 // High importance for master analysis
    });

    if (error) {
      console.error('❌ Error storing therapeutic context:', error);
      // Don't throw - the main analysis was stored successfully
    } else {
      console.log(`💾 Stored PCA therapeutic context for agent injection`);
    }
  }
}

// Export for lazy loading
export default UserAnalysisService;
