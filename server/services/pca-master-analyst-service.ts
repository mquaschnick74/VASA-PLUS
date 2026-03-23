// Location: server/services/pca-master-analyst-service.ts

// Using fetch instead of @anthropic-ai/sdk to avoid module resolution issues
// fetch is built into Node.js - no dependencies needed!
import { supabase } from './supabase-service';
import { PCA_ANALYSIS_PROMPT } from '../prompts/pca-depth-analyst.js';
import type { SessionSummary } from './sensing-layer/session-state';
import { shouldRunPCAMasterAnalysis } from './pca-master-trigger';

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
  constructor() {
    // No initialization needed - fetch is built-in!
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
      // Format the transcripts
      const formattedTranscripts = transcripts
        .map((t, i) => `
      SESSION ${i + 1} (${new Date(t.created_at).toLocaleDateString()}):
      Call ID: ${t.call_id}
      Duration: ${t.duration_seconds || 'Unknown'} seconds

      TRANSCRIPT:
      ${t.text}
        `)
        .join('\n---NEXT SESSION---\n');

      // Build the prompt by replacing placeholder
      const prompt = PCA_ANALYSIS_PROMPT.replace(
        '[TRANSCRIPTS GO HERE]',
        formattedTranscripts
      );

      // 5. Call OpenAI API (switched from Claude to use existing working API)
      console.log(`🤖 Calling OpenAI GPT-4 for analysis...`);
      const aiResponse = await this.callOpenAI(prompt);

      // 6. Parse response
      const parsed = this.parseAIResponse(aiResponse);

      // 7. Generate analysis ID
      const analysisId = `pca_${userId}_${Date.now()}`;

      // 8. Store comprehensive analysis in pca_master_analysis table
      await this.storeComprehensiveAnalysis({
        userId,
        analysisId,
        transcripts,
        ...parsed,
        apiTokensUsed: aiResponse.usage?.total_tokens || 0,
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
   * Check if the most recent analysis is still current.
   * Returns the cached analysis row if no new substantive session
   * has completed since it was produced; null otherwise.
   */
  private async checkRecentAnalysis(userId: string): Promise<any | null> {
    const { data: analysisRows, error: analysisError } = await supabase
      .from('pca_master_analysis')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (analysisError) {
      console.error('Error checking recent analysis:', analysisError);
      return null;
    }

    if (!analysisRows || analysisRows.length === 0) {
      return null;
    }

    const lastAnalysis = analysisRows[0];

    const { data: summaryRows, error: summaryError } = await supabase
      .from('therapeutic_context')
      .select('created_at')
      .eq('user_id', userId)
      .eq('context_type', 'call_summary')
      .order('created_at', { ascending: false })
      .limit(1);

    if (summaryError) {
      console.error('Error checking recent call_summary:', summaryError);
      return null;
    }

    if (!summaryRows || summaryRows.length === 0) {
      return lastAnalysis;
    }

    const summaryTime = new Date(summaryRows[0].created_at).getTime();
    const analysisTime = new Date(lastAnalysis.created_at).getTime();

    if (summaryTime > analysisTime) {
      return null;
    }

    return lastAnalysis;
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
   * Call OpenAI API with the analysis prompt using fetch
   * Switched from Anthropic to OpenAI since OpenAI is already working in the system
   */
  private async callOpenAI(prompt: string): Promise<any> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('❌ MISSING OPENAI_API_KEY - Add to your Replit Secrets');
      throw new Error('Missing OPENAI_API_KEY');
    }

    // Log API key info for debugging
    console.log('🔑 API Key exists:', !!apiKey);
    console.log('🔑 API Key prefix:', apiKey.substring(0, 10) + '...');

    // Trim prompt if it's too long (GPT models have context limits)
    // Master PC Analyst prompt + transcripts can be very long
    const maxPromptLength = 30000; // Conservative limit to stay within token bounds
    const trimmedPrompt = prompt.length > maxPromptLength
      ? prompt.substring(0, maxPromptLength) + '\n\n[Content truncated due to length. Please provide analysis based on available content.]'
      : prompt;

    console.log('📝 Original prompt length:', prompt.length, 'characters');
    console.log('📝 Trimmed prompt length:', trimmedPrompt.length, 'characters');

    const requestBody = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a Master-level PsychoContextual Analyst specializing in Pure Contextual Perception (PCP). Provide thorough, insightful analysis following the PCA/PCP framework.'
        },
        {
          role: 'user',
          content: trimmedPrompt
        }
      ],
      max_tokens: 4000, // Leave room in context window
      temperature: 0.3
    };

    console.log('📤 Request model:', requestBody.model);
    console.log('📤 Request max_tokens:', requestBody.max_tokens);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      const responseText = await response.text();
      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        console.error('❌ OpenAI API error response:', responseText);

        // Try to parse error details
        try {
          const errorData = JSON.parse(responseText);
          const errorMessage = errorData.error?.message || responseText;
          console.error('❌ Error details:', errorData);
          throw new Error(`OpenAI API error (${response.status}): ${errorMessage}`);
        } catch (parseError) {
          throw new Error(`OpenAI API error: ${response.status} - ${responseText}`);
        }
      }

      const data = JSON.parse(responseText);
      const totalTokens = data.usage?.total_tokens || 0;
      console.log(`✅ OpenAI API call successful (${totalTokens} tokens)`);
      console.log(`   - Prompt tokens: ${data.usage?.prompt_tokens || 0}`);
      console.log(`   - Completion tokens: ${data.usage?.completion_tokens || 0}`);

      // Return in format compatible with parsing logic
      return {
        content: [{ text: data.choices[0].message.content }],
        usage: {
          total_tokens: data.usage?.total_tokens || 0,
          input_tokens: data.usage?.prompt_tokens || 0,
          output_tokens: data.usage?.completion_tokens || 0
        }
      };

    } catch (error: any) {
      console.error('❌ OpenAI API error:', error.message);
      throw new Error(`Failed to analyze transcripts: ${error.message}`);
    }
  }

  /**
   * Parse AI response (OpenAI/GPT-4) to extract both outputs and structured data
   */
  private parseAIResponse(response: any): ParsedAnalysisResult {
    const content = response.content[0].text;

    // Extract comprehensive analysis (OUTPUT 1)
    const analysisMatch = content.match(
      /OUTPUT 1: COMPREHENSIVE PCA\/PCP ANALYSIS\s*([\s\S]*?)(?=OUTPUT 2:|===== THERAPEUTIC CONTEXT:|$)/i
    );
    const fullAnalysis = analysisMatch?.[1]?.trim() || content;

    // Extract PCA Field Picture (OUTPUT 2)
    const contextMatch = content.match(
      /={5} PCA FIELD PICTURE:[\s\S]*?={5} END FIELD PICTURE ={5}/
    );
    const therapeuticContext = contextMatch?.[0] || '';

    // Extract structured data from DATABASE INTEGRATION VALUES section
    const dbSection = content.match(
      /DATABASE INTEGRATION VALUES[\s\S]*$/i
    )?.[0] || '';

    // Extract CSS stage
    const cssStageMatch = dbSection.match(/current_css_stage:\s*"([^"]+)"/i) ||
                          content.match(/## CSS STAGE:\s*([^\n]+)/i);
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

    console.log('💾 Attempting to store analysis...');
    console.log('   - User ID:', data.userId);
    console.log('   - Analysis ID:', data.analysisId);
    console.log('   - Transcript count:', data.transcripts.length);
    console.log('   - Full analysis length:', data.fullAnalysis.length);
    console.log('   - Therapeutic context length:', data.therapeuticContext.length);

    // Truncate fields to fit database constraints (VARCHAR limits)
    const truncateToLimit = (value: string, limit: number): string => {
      if (!value) return value;
      if (value.length <= limit) return value;
      console.log(`⚠️ Truncating value from ${value.length} to ${limit} chars: "${value}"`);
      return value.substring(0, limit);
    };

    const insertData = {
      user_id: data.userId,
      analysis_id: data.analysisId,
      analyzed_sessions: callIds,
      transcript_count: data.transcripts.length,
      full_analysis: data.fullAnalysis,
      therapeutic_context: data.therapeuticContext,
      current_css_stage: truncateToLimit(data.currentCssStage, 50), // VARCHAR(50)
      primary_cvdc: data.primaryCvdc as any,
      register_dominance: truncateToLimit(data.registerDominance, 20), // VARCHAR(20)
      safety_assessment: truncateToLimit(data.safetyAssessment, 20), // VARCHAR(20)
      api_tokens_used: data.apiTokensUsed,
      processing_time_ms: data.processingTimeMs,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() as any // 30 days
    };

    const { data: insertedData, error } = await supabase
      .from('pca_master_analysis')
      .insert(insertData)
      .select();

    if (error) {
      console.error('❌ Error storing comprehensive analysis:');
      console.error('   - Error code:', error.code);
      console.error('   - Error message:', error.message);
      console.error('   - Error details:', error.details);
      console.error('   - Error hint:', error.hint);
      console.error('   - Full error:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to store analysis: ${error.message} (${error.code})`);
    }

    console.log(`✅ Stored comprehensive analysis: ${data.analysisId}`);
    console.log('   - Inserted data:', insertedData);
  }

  /**
   * Store therapeutic context for VASA agent use
   */
  private async storeTherapeuticContext(
    userId: string,
    analysisId: string,
    parsed: ParsedAnalysisResult
  ): Promise<void> {
    console.log('💾 Attempting to store therapeutic context...');
    console.log('   - User ID:', userId);
    console.log('   - Context length:', parsed.therapeuticContext.length);
    console.log('   - CSS stage:', parsed.currentCssStage);

    const { data: insertedData, error } = await supabase
      .from('therapeutic_context')
      .insert({
        user_id: userId,
        context_type: 'comprehensive_clinical_context',
        content: parsed.therapeuticContext,
        css_stage: parsed.currentCssStage,
        confidence: parsed.confidence,
        importance: 10 // High importance for master analysis
      })
      .select();

    if (error) {
      console.error('❌ Error storing therapeutic context:');
      console.error('   - Error code:', error.code);
      console.error('   - Error message:', error.message);
      console.error('   - Error details:', error.details);
      console.error('   - Error hint:', error.hint);
      console.error('   - Full error:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to store therapeutic context: ${error.message} (${error.code})`);
    }

    console.log(`✅ Stored therapeutic context for VASA agent`);
    console.log('   - Inserted data:', insertedData);
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

// Export the class for on-demand instantiation
// No singleton export to avoid module-load-time initialization issues with Replit Secrets


async function hasRecentPCAMasterAnalysis(userId: string): Promise<boolean> {
  const { data: analysisRows, error: analysisError } = await supabase
    .from('pca_master_analysis')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (analysisError) {
    console.warn(`[PCA MASTER TRIGGER] user=${userId} recent-analysis-check failed: ${analysisError.message}`);
    return false;
  }

  if (!analysisRows || analysisRows.length === 0) {
    return false;
  }

  const { data: summaryRows, error: summaryError } = await supabase
    .from('therapeutic_context')
    .select('created_at')
    .eq('user_id', userId)
    .eq('context_type', 'call_summary')
    .order('created_at', { ascending: false })
    .limit(1);

  if (summaryError) {
    console.warn(`[PCA MASTER TRIGGER] user=${userId} call-summary-check failed: ${summaryError.message}`);
    return false;
  }

  if (!summaryRows || summaryRows.length === 0) {
    return true;
  }

  const summaryTime = new Date(summaryRows[0].created_at).getTime();
  const analysisTime = new Date(analysisRows[0].created_at).getTime();

  return summaryTime <= analysisTime;
}

export async function triggerPCAMasterAnalysisFromFinalize(summary: SessionSummary, sessionCount: number = 3): Promise<void> {
  try {
    const hasRecentAnalysis = await hasRecentPCAMasterAnalysis(summary.userId);

    const decision = shouldRunPCAMasterAnalysis({
      exchangeCount: summary.exchangeCount,
      significantMomentCount: summary.significantMoments.length,
      structuredPatternCount: summary.structuredPatterns.length,
      structuredHistoricalCount: summary.structuredHistorical.length,
      structuredConnectionCount: summary.structuredConnections.length,
      finalCSSStage: summary.finalCSSStage,
      finalCSSStageConfidence: summary.finalCSSStageConfidence,
      hasRecentAnalysis
    });

    console.log(
      `[PCA MASTER TRIGGER] user=${summary.userId} call=${summary.callId} shouldRun=${decision.shouldRun} category=${decision.category} reason=${decision.reason}`
    );

    if (!decision.shouldRun) {
      return;
    }

    const service = new PCAMasterAnalystService();
    void service.performAnalysis(summary.userId, sessionCount).then((result) => {
      console.log(`[PCA MASTER TRIGGER] user=${summary.userId} analysis completed analysisId=${result.analysisId}`);
    }).catch((error: any) => {
      console.error(`[PCA MASTER TRIGGER] user=${summary.userId} analysis failed: ${error?.message || error}`);
    });
  } catch (error: any) {
    console.error(`[PCA MASTER TRIGGER] user=${summary.userId} trigger evaluation failed: ${error?.message || error}`);
  }
}
