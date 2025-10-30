// Location: server/services/pca-master-analyst-service.ts

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from './supabase-service';
import { buildStreamlinedAnalysisPrompt } from '../prompts/master-pc-analyst';

interface TranscriptData {
  call_id: string;
  text: string;
  created_at: string;
  duration_seconds: number;
}

interface ParsedAnalysisResult {
  fullAnalysis: string;
  therapeuticContext: string;
  currentCssStage: string;
  primaryCvdc: any;
  registerDominance: string;
  safetyAssessment: string;
  confidence: number;
}

export class PCAMasterAnalystService {
  private anthropic: Anthropic | null = null;

  constructor() {
    // Lazy initialization - don't create Anthropic client until first use
    // This allows Replit Secrets to be injected before the service is actually used
  }

  /**
   * Ensure the Anthropic client is initialized (lazy initialization)
   */
  private ensureInitialized() {
    if (this.anthropic) return;

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.error('❌ MISSING ANTHROPIC_API_KEY - Add to your Replit Secrets or .env file');
      throw new Error('Missing ANTHROPIC_API_KEY');
    }

    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });

    console.log('✅ PCA Master Analyst service initialized');
  }

  /**
   * Main entry point: Performs PCA master analysis on recent transcripts
   */
  async performAnalysis(
    userId: string,
    sessionCount: number = 3
  ): Promise<{
    analysisId: string;
    currentCssStage: string;
    safetyAssessment: string;
    registerDominance: string;
  }> {
    this.ensureInitialized(); // Initialize on first use
    const startTime = Date.now();

    try {
      console.log(`🔍 Starting PCA analysis for user ${userId}, analyzing ${sessionCount} sessions`);

      // 1. Check for recent analysis (avoid duplicates within 24 hours)
      const recentAnalysis = await this.checkRecentAnalysis(userId);
      if (recentAnalysis) {
        console.log(`✅ Recent analysis found (${recentAnalysis.analysis_id}), returning cached result`);
        return {
          analysisId: recentAnalysis.analysis_id,
          currentCssStage: recentAnalysis.current_css_stage || 'unknown',
          safetyAssessment: recentAnalysis.safety_assessment || 'unknown',
          registerDominance: recentAnalysis.register_dominance || 'mixed'
        };
      }

      // 2. Fetch recent transcripts
      const transcripts = await this.fetchTranscripts(userId, sessionCount);

      if (transcripts.length === 0) {
        throw new Error('No transcripts available for analysis');
      }

      // 3. Get user name for personalization
      const userName = await this.getUserName(userId);

      // 4. Build the prompt
      const prompt = buildStreamlinedAnalysisPrompt(transcripts, userName);

      // 5. Call Claude API
      console.log(`🤖 Calling Claude API for analysis...`);
      const claudeResponse = await this.callClaudeAPI(prompt);

      // 6. Parse response
      const parsed = this.parseClaudeResponse(claudeResponse);

      // 7. Generate analysis ID
      const analysisId = `pca_${userId}_${Date.now()}`;

      // 8. Store comprehensive analysis in pca_master_analysis table
      await this.storeComprehensiveAnalysis({
        userId,
        analysisId,
        transcripts,
        ...parsed,
        apiTokensUsed: claudeResponse.usage?.total_tokens || 0,
        processingTimeMs: Date.now() - startTime
      });

      // 9. Store therapeutic context for VASA agent
      await this.storeTherapeuticContext(userId, analysisId, parsed);

      const processingTime = Date.now() - startTime;
      console.log(`✅ PCA analysis completed in ${processingTime}ms`);
      console.log(`   - CSS Stage: ${parsed.currentCssStage}`);
      console.log(`   - Safety: ${parsed.safetyAssessment}`);
      console.log(`   - Register: ${parsed.registerDominance}`);

      return {
        analysisId,
        currentCssStage: parsed.currentCssStage,
        safetyAssessment: parsed.safetyAssessment,
        registerDominance: parsed.registerDominance
      };

    } catch (error) {
      console.error('❌ PCA analysis failed:', error);
      throw error;
    }
  }

  /**
   * Check if user has recent analysis (within 24 hours)
   */
  private async checkRecentAnalysis(userId: string): Promise<any | null> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('pca_master_analysis')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', oneDayAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error checking recent analysis:', error);
      return null;
    }

    return data && data.length > 0 ? data[0] : null;
  }

  /**
   * Fetch recent transcripts for analysis
   */
  private async fetchTranscripts(
    userId: string,
    limit: number
  ): Promise<TranscriptData[]> {
    // First, get the recent sessions
    const { data: sessions, error: sessionsError } = await supabase
      .from('therapeutic_sessions')
      .select('call_id, duration_seconds, created_at')
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
      duration_seconds: session.duration_seconds || 0
    })).filter(t => t.text.length > 0);

    console.log(`📄 Fetched ${result.length} transcripts for analysis`);
    return result;
  }

  /**
   * Get user's first name
   */
  private async getUserName(userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('users')
      .select('first_name')
      .eq('id', userId)
      .single();

    if (error || !data) {
      console.warn('Could not fetch user name, using default');
      return 'the client';
    }

    return data.first_name || 'the client';
  }

  /**
   * Call Claude API with the analysis prompt
   */
  private async callClaudeAPI(prompt: string): Promise<any> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized');
    }

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 10000, // Increased for dual output
        temperature: 0.3, // Lower temp for consistency
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const totalTokens = (response.usage as any)?.input_tokens + (response.usage as any)?.output_tokens || 0;
      console.log(`✅ Claude API call successful (${totalTokens} tokens)`);
      return response;

    } catch (error: any) {
      console.error('❌ Claude API error:', error.message);
      throw new Error(`Failed to analyze transcripts: ${error.message}`);
    }
  }

  /**
   * Parse Claude's response to extract both outputs and structured data
   */
  private parseClaudeResponse(response: any): ParsedAnalysisResult {
    const content = response.content[0].text;

    // Extract comprehensive analysis (OUTPUT 1)
    const analysisMatch = content.match(
      /OUTPUT 1: COMPREHENSIVE PCA\/PCP ANALYSIS\s*([\s\S]*?)(?=OUTPUT 2:|===== THERAPEUTIC CONTEXT:|$)/i
    );
    const fullAnalysis = analysisMatch?.[1]?.trim() || content;

    // Extract VASA context (OUTPUT 2)
    const contextMatch = content.match(
      /===== THERAPEUTIC CONTEXT:[\s\S]*?===== END CONTEXT =====/
    );
    const therapeuticContext = contextMatch?.[0] || '';

    // Extract structured data from DATABASE INTEGRATION VALUES section
    const dbSection = content.match(
      /DATABASE INTEGRATION VALUES[\s\S]*$/i
    )?.[0] || '';

    // Extract CSS stage
    const cssStageMatch = dbSection.match(/current_css_stage:\s*"([^"]+)"/i) ||
                          content.match(/CURRENT CSS STAGE:\s*([^\n]+)/i);
    const currentCssStage = cssStageMatch?.[1]?.trim().toLowerCase() || 'unknown';

    // Extract register dominance
    const registerMatch = dbSection.match(/register_dominance:\s*"([^"]+)"/i) ||
                          content.match(/PERCEPTUAL STRUCTURE:\s*([^\n]+)/i);
    const registerDominance = registerMatch?.[1]?.trim().toLowerCase() || 'mixed';

    // Extract safety assessment
    const safetyMatch = dbSection.match(/safety_assessment:\s*"([^"]+)"/i) ||
                       content.match(/SAFETY STATUS:\s*(\w+)/i);
    const safetyAssessment = safetyMatch?.[1]?.trim().toLowerCase() || 'unknown';

    // Extract primary CVDC
    const cvdcMatch = dbSection.match(/primary_cvdc:\s*\{[^}]*"description":\s*"([^"]+)"/i) ||
                      content.match(/Primary CVDC:\s*([^\n]+)/i);
    const primaryCvdc = {
      description: cvdcMatch?.[1]?.trim() || 'Not clearly identified'
    };

    // Extract confidence
    const confidenceMatch = dbSection.match(/confidence:\s*([\d.]+)/i);
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.8;

    return {
      fullAnalysis,
      therapeuticContext,
      currentCssStage,
      primaryCvdc,
      registerDominance,
      safetyAssessment,
      confidence
    };
  }

  /**
   * Store comprehensive analysis in pca_master_analysis table
   */
  private async storeComprehensiveAnalysis(data: {
    userId: string;
    analysisId: string;
    transcripts: TranscriptData[];
    fullAnalysis: string;
    therapeuticContext: string;
    currentCssStage: string;
    primaryCvdc: any;
    registerDominance: string;
    safetyAssessment: string;
    apiTokensUsed: number;
    processingTimeMs: number;
  }): Promise<void> {
    const callIds = data.transcripts.map(t => t.call_id);

    const { error } = await supabase
      .from('pca_master_analysis')
      .insert({
        user_id: data.userId,
        analysis_id: data.analysisId,
        analyzed_sessions: callIds,
        transcript_count: data.transcripts.length,
        full_analysis: data.fullAnalysis,
        therapeutic_context: data.therapeuticContext,
        current_css_stage: data.currentCssStage,
        primary_cvdc: data.primaryCvdc as any,
        register_dominance: data.registerDominance,
        safety_assessment: data.safetyAssessment,
        api_tokens_used: data.apiTokensUsed,
        processing_time_ms: data.processingTimeMs,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() as any // 30 days
      });

    if (error) {
      console.error('Error storing comprehensive analysis:', error);
      throw new Error('Failed to store analysis');
    }

    console.log(`✅ Stored comprehensive analysis: ${data.analysisId}`);
  }

  /**
   * Store therapeutic context for VASA agent use
   */
  private async storeTherapeuticContext(
    userId: string,
    analysisId: string,
    parsed: ParsedAnalysisResult
  ): Promise<void> {
    const { error } = await supabase
      .from('therapeutic_context')
      .insert({
        user_id: userId,
        context_type: 'comprehensive_clinical_context',
        content: parsed.therapeuticContext,
        css_stage: parsed.currentCssStage,
        confidence: parsed.confidence,
        importance: 10 // High importance for master analysis
      });

    if (error) {
      console.error('Error storing therapeutic context:', error);
      throw new Error('Failed to store therapeutic context');
    }

    console.log(`✅ Stored therapeutic context for VASA agent`);
  }

  /**
   * Retrieve a specific analysis by ID
   */
  async getAnalysis(userId: string, analysisId: string): Promise<any> {
    const { data, error } = await supabase
      .from('pca_master_analysis')
      .select('*')
      .eq('user_id', userId)
      .eq('analysis_id', analysisId)
      .single();

    if (error) {
      console.error('Error fetching analysis:', error);
      throw new Error('Analysis not found');
    }

    return data;
  }

  /**
   * Get all analyses for a user
   */
  async getUserAnalyses(userId: string, limit: number = 10): Promise<any[]> {
    const { data, error } = await supabase
      .from('pca_master_analysis')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching user analyses:', error);
      return [];
    }

    return data || [];
  }
}

// Export singleton instance
export const pcaAnalystService = new PCAMasterAnalystService();
