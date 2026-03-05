// server/routes/chat-routes.ts
// Text-to-text chat endpoint for VASA

import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabase } from '../services/supabase-service';
import { buildMemoryContext } from '../services/memory-service';
import { detectCSSPatterns, assessPatternConfidence } from '../services/css-pattern-service';
import { generateEnhancedSessionSummary } from '../services/summary-service';
import OpenAI from 'openai';
import { sensingLayer } from '../services/sensing-layer';
import { formatGuidanceAsSystemMessage, formatEnhancedGuidanceAsSystemMessage } from '../services/sensing-layer/guidance-injector';
import { EnhancedTherapeuticGuidance } from '../services/sensing-layer/types';
import { extractAndStoreFragments } from '../services/sensing-layer/fragment-extractor';

const router = Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Validate OpenAI API key on startup
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ [CHAT] OPENAI_API_KEY is not set in environment variables');
}

// Get agent configuration from client (we'll import dynamically)
interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  model: {
    model: string;
    temperature: number;
  };
}

// Helper function to build system prompt for text chat
function buildChatSystemPrompt(
  agentSystemPrompt: string,
  userContext: any,
  firstName: string
): string {
  let systemPrompt = `TEXT CHAT MODE:
This is a text-based conversation. Respond naturally and therapeutically.
Keep responses concise but meaningful (2-4 paragraphs maximum for text readability).
Use the user's name (${firstName}) naturally but not excessively.

${agentSystemPrompt}`;

  // Add memory context if available
  const hasMemory = userContext?.memoryContext && userContext.memoryContext.length > 50;

  if (userContext?.shouldReferenceLastSession && userContext?.lastSessionSummary) {
    systemPrompt += `\n\n===== LAST SESSION CONTEXT =====
${userContext.lastSessionSummary}

Continue the therapeutic narrative naturally.
===== END LAST SESSION =====\n`;
  }

  if (hasMemory) {
    systemPrompt += `\n\n===== PREVIOUS SESSION HISTORY =====
${userContext.memoryContext}
===== END HISTORY =====

IMPORTANT: Reference the above context naturally when relevant.
Do not make up or hallucinate details not mentioned above.`;
  } else if (!userContext?.lastSessionSummary) {
    systemPrompt += '\n\nThis is your first interaction with this user. Get to know them gently.';
  }

  return systemPrompt;
}

// POST /api/chat/send-message - Send a text message and get AI response
router.post('/send-message', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { sessionId, agentId, agentName, systemPrompt, modelConfig, message, conversationHistory } = req.body;

    // Map Supabase auth user ID to VASA platform user ID
    const authUserId = req.user.id; // Supabase auth ID from JWT token

    console.log('💬 [CHAT] Text message received from auth user:', authUserId);
    console.log('🔍 [CHAT] Looking up VASA user ID from auth user ID...');

    // Look up the user in the users table by auth_user_id
    const { data: vasaUser, error: userLookupError } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    console.log('🔍 [CHAT] VASA user lookup result:', {
      found: !!vasaUser,
      vasaUserId: vasaUser?.id,
      authUserId: authUserId,
      email: vasaUser?.email,
      role: vasaUser?.role
    });

    if (userLookupError) {
      console.error('❌ [CHAT] Error looking up VASA user:', userLookupError);
      return res.status(500).send('Database error');
    }

    if (!vasaUser) {
      console.error('❌ [CHAT] No VASA user found for auth user ID:', authUserId);
      return res.status(404).send('User record not found');
    }

    // Use the VASA platform user ID for all subsequent queries
    const userId = vasaUser.id;

    console.log('✅ [CHAT] Mapped auth ID to VASA ID:', {
      authUserId,
      vasaUserId: userId
    });

    // Validate inputs
    if (!message || !agentId || !systemPrompt || !modelConfig || !sessionId) {
      console.error('❌ [CHAT] Missing required fields:', {
        hasMessage: !!message,
        hasAgentId: !!agentId,
        hasSystemPrompt: !!systemPrompt,
        hasModelConfig: !!modelConfig,
        hasSessionId: !!sessionId
      });
      return res.status(400).send('Missing required fields');
    }

    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ [CHAT] OPENAI_API_KEY not configured');
      return res.status(500).send('OpenAI API key not configured');
    }

    // Get user context using VASA platform user ID
    console.log('🔍 [CHAT] Looking up profile for VASA userId:', userId);

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    console.log('🔍 [CHAT] Profile lookup result:', {
      found: !!profile,
      profileId: profile?.id,
      profileEmail: profile?.email,
      error: profileError?.message
    });

    if (profileError) {
      console.error('❌ [CHAT] Database error fetching profile:', profileError);
      return res.status(500).send('Database error');
    }

    if (!profile) {
      console.error('❌ [CHAT] No profile found for VASA user ID:', userId);
      return res.status(404).send('User profile not found');
    }

    const firstName = profile.full_name?.split(' ')[0] || profile.email.split('@')[0];

    // Build memory context
    const memoryContext = await buildMemoryContext(userId);

    // Get last session summary from therapeutic_context (works for both text and voice sessions)
    const { data: contextSummary } = await supabase
      .from('therapeutic_context')
      .select('content, call_id, created_at')
      .eq('user_id', userId)
      .eq('context_type', 'conversational_summary')
      .order('created_at', { ascending: false })
      .limit(1);

    const lastSessionSummary = contextSummary?.[0]?.content || null;

    console.log('📝 [CHAT] Last session summary:', {
      found: !!lastSessionSummary,
      callId: contextSummary?.[0]?.call_id,
      length: lastSessionSummary?.length
    });

    const userContext = {
      memoryContext,
      lastSessionSummary,
      shouldReferenceLastSession: !!lastSessionSummary
    };

    // Use conversation history from frontend (messages kept in memory during session)
    console.log('💬 [CHAT] Received conversation history from frontend');
    const history = conversationHistory || [];
    console.log('💬 [CHAT] History messages:', history.length);

    // Build system prompt with user context
    const fullSystemPrompt = buildChatSystemPrompt(
      systemPrompt,
      userContext,
      firstName
    );

    console.log('🤖 [CHAT] Calling OpenAI with model:', modelConfig.model);

    // Build messages array with conversation history
    const messages: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [
      { role: 'system', content: fullSystemPrompt },
      ...history,  // Include previous messages from this text session
      { role: 'user', content: message }  // Current message
    ];

    console.log('💬 [CHAT] Sending to OpenAI:', {
      systemPrompt: 1,
      historyMessages: history.length,
      currentMessage: 1,
      totalMessages: messages.length
    });

    // SENSING LAYER: Run before OpenAI call so guidance shapes the response
    // Text chat uses synchronous sensing (unlike voice which is async via controlUrl)
    try {
      // Initialize session state on first message of a new text session
      if (history.length === 0) {
        await sensingLayer.initializeCallSession(sessionId, userId, sessionId);
        console.log(`🧠 [CHAT-SENSING] Initialized session state for text session: ${sessionId}`);
      }

      const exchangeCount = Math.floor(history.length / 2); // Each exchange = 1 user + 1 assistant

      const guidance = await sensingLayer.processUtterance({
        utterance: message,
        sessionId,
        callId: sessionId,
        userId,
        exchangeCount,
        conversationHistory: history.map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date().toISOString()
        }))
      });

      console.log(`🧠 [CHAT-SENSING] Guidance generated — Posture: ${guidance.posture}, Urgency: ${guidance.urgency}`);

      // Format guidance using the same formatter as the voice channel
      const isEnhanced = 'anticipationGuidance' in guidance || 'enhancedPosture' in guidance;
      const guidanceText = isEnhanced
        ? formatEnhancedGuidanceAsSystemMessage(guidance as EnhancedTherapeuticGuidance)
        : formatGuidanceAsSystemMessage(guidance);

      // Insert guidance as a system message between the base system prompt and the user message
      // Position: after system prompt [0], before current user message [last]
      messages.splice(messages.length - 1, 0, {
        role: 'system',
        content: guidanceText
      });

      console.log(`🧠 [CHAT-SENSING] Guidance injected into messages array (${messages.length} total messages)`);

    } catch (sensingError: any) {
      // Non-fatal: log and continue. The agent still responds, just without sensing guidance.
      console.error(`⚠️ [CHAT-SENSING] Sensing layer failed (non-fatal, continuing):`, sensingError.message);
    }

    // Call OpenAI with streaming
    const stream = await openai.chat.completions.create({
      model: modelConfig.model,
      messages,
      stream: true,
      temperature: modelConfig.temperature,
      max_completion_tokens: 500 // Limit for text chat (more concise than voice)
    });

    // Set up Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullResponse = '';

    // Stream chunks back to client
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    // Send completion signal
    res.write('data: [DONE]\n\n');
    res.end();

    console.log('✅ [CHAT] Response streamed successfully');

    // DO NOT save to database here - messages stay in memory until session ends

  } catch (error: any) {
    console.error('❌ [CHAT] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });

    // If response hasn't been sent yet, send error
    if (!res.headersSent) {
      res.status(500).send(error.message || 'Failed to process message');
    }
  }
});

// POST /api/chat/end-session - Process text session end with therapeutic analysis
router.post('/end-session', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { sessionId, agentName, transcript } = req.body;

    if (!sessionId) {
      console.error('❌ [CHAT] Missing sessionId');
      return res.status(400).send('Missing sessionId');
    }

    if (!transcript || transcript.length === 0) {
      console.log('⚠️ [CHAT] No transcript provided for session');
      return res.status(200).send('Session ended (no transcript to process)');
    }

    // Map Supabase auth user ID to VASA platform user ID
    const authUserId = req.user.id;
    const { data: vasaUser, error: userLookupError } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (userLookupError || !vasaUser) {
      console.error('❌ [CHAT] User lookup failed:', userLookupError);
      return res.status(404).send('User not found');
    }

    const userId = vasaUser.id;

    // SENSING LAYER: Finalize session — writes in-memory state vectors to database
    try {
      const sensingSessionSummary = await sensingLayer.finalizeSession(sessionId);
      if (sensingSessionSummary) {
        console.log(`🧠 [CHAT-SENSING] Session finalized for text session ${sessionId}:`);
        console.log(`   📊 Exchanges: ${sensingSessionSummary.exchangeCount}`);
        console.log(`   📈 Dominant register: ${sensingSessionSummary.dominantRegister}`);
        console.log(`   ⭐ Significant moments: ${sensingSessionSummary.significantMoments.length}`);
        console.log(`   🔄 Patterns detected: ${sensingSessionSummary.patternsDetected.length}`);
      } else {
        console.warn(`⚠️ [CHAT-SENSING] No sensing session state found for ${sessionId} — session may not have used sensing layer`);
      }
    } catch (sensingFinalizeError: any) {
      // Non-fatal: log and continue with CSS pattern storage and summary generation
      console.error(`⚠️ [CHAT-SENSING] Failed to finalize sensing session (non-fatal):`, sensingFinalizeError.message);
    }

    console.log('🏁 [CHAT] Processing text session end:', {
      sessionId,
      userId,
      agentName,
      messageCount: transcript.length
    });

    // 1. Build full transcript for CSS analysis from provided messages
    const fullTranscript = transcript
      .map((t: any) => {
        const speaker = t.role === 'user' ? 'User' : agentName || 'Assistant';
        return `${speaker}: ${t.content}`;
      })
      .join('\n');

    console.log('📝 [CHAT] Full transcript length:', fullTranscript.length);

    // 2. Calculate session duration from timestamps
    const firstTimestamp = new Date(transcript[0].timestamp);
    const lastTimestamp = new Date(transcript[transcript.length - 1].timestamp);
    const durationSeconds = Math.floor((lastTimestamp.getTime() - firstTimestamp.getTime()) / 1000);

    // 3. Create or update therapeutic_sessions entry
    // Check if session already exists (from previous save attempt)
    const { data: existingSession } = await supabase
      .from('therapeutic_sessions')
      .select('id')
      .eq('call_id', sessionId)
      .maybeSingle();

    if (existingSession) {
      console.log('⚠️ [CHAT] Session already exists, skipping insert:', sessionId);
    } else {
      const { error: sessionError } = await supabase
        .from('therapeutic_sessions')
        .insert({
          user_id: userId,
          agent_name: agentName,
          call_id: sessionId,
          status: 'completed',
          start_time: firstTimestamp.toISOString(),
          end_time: lastTimestamp.toISOString(),
          duration_seconds: durationSeconds
        });

      if (sessionError) {
        console.error('❌ [CHAT] Error creating session:', sessionError);
        return res.status(500).send('Failed to create session');
      }
      console.log('✅ [CHAT] Created therapeutic_sessions entry');
    }

    // 4. Save complete transcript to session_transcripts (ONE entry with role='complete')
    // Check if transcript already exists
    const { data: existingTranscript } = await supabase
      .from('session_transcripts')
      .select('id')
      .eq('call_id', sessionId)
      .eq('role', 'complete')
      .maybeSingle();

    if (existingTranscript) {
      console.log('⚠️ [CHAT] Transcript already exists, skipping insert');
    } else {
      const { error: transcriptError } = await supabase
        .from('session_transcripts')
        .insert({
          user_id: userId,
          call_id: sessionId,
          text: fullTranscript,
          role: 'complete',
          timestamp: new Date().toISOString()
        });

      if (transcriptError) {
        console.error('❌ [CHAT] Error saving transcript:', transcriptError);
      } else {
        console.log('✅ [CHAT] Complete transcript saved (one entry)');
      }
    }

    // 5. Detect CSS patterns — use user-only transcript to prevent agent lines
    // from being misclassified as user statements during sentence splitting
    const userOnlyTranscript = transcript
      .filter((t: any) => t.role === 'user')
      .map((t: any) => t.content)
      .join('\n');
    const patterns = detectCSSPatterns(userOnlyTranscript, true);
    const { confidence, reasoning } = assessPatternConfidence(patterns);

    console.log('📊 [CHAT] CSS Analysis:', {
      stage: patterns.currentStage,
      cvdcCount: patterns.cvdcPatterns.length,
      ibmCount: patterns.ibmPatterns.length,
      confidence
    });

    // 6. Store CSS patterns
    await storeCSSPatternsForTextSession(userId, sessionId, patterns, confidence, reasoning);

    // 7. Generate enhanced session summary for continuity (populates therapeutic_context)
    try {
      console.log('🧠 [CHAT] Generating enhanced session summary...');
      await generateEnhancedSessionSummary({
        userId,
        callId: sessionId,
        transcript: fullTranscript,
        cssPatterns: patterns,
        agentName: agentName || 'Assistant',
        duration: durationSeconds
      });
      console.log('✅ [CHAT] Enhanced session summary generated (therapeutic_context populated)');
    } catch (summaryError: any) {
      console.error('❌ [CHAT] Failed to generate summary:', {
        error: summaryError.message,
        stack: summaryError.stack
      });
    }

    // FRAGMENT EXTRACTION: Extract narrative fragments from text session transcript
    // Mirrors the fire-and-forget pattern used in webhook-routes.ts end-of-call-report
    if (fullTranscript && userId) {
      extractAndStoreFragments(userId, sessionId, fullTranscript)
        .then(result => {
          console.log(`📦 [FRAGMENTS] Extraction complete for ${sessionId}: ${result.fragmentCount} fragments, ${result.resonanceLinkCount} resonance links`);
        })
        .catch(err => {
          console.error(`📦 [FRAGMENTS] Extraction failed for ${sessionId}:`, err);
        });
    }

    console.log('✅ [CHAT] Text session processing completed:', sessionId);

    res.status(200).json({
      success: true,
      sessionId,
      cssStage: patterns.currentStage,
      patternsDetected: patterns.cvdcPatterns.length + patterns.ibmPatterns.length,
      transcriptLength: fullTranscript.length,
      duration: durationSeconds
    });

  } catch (error: any) {
    console.error('❌ [CHAT] Error processing session end:', error);
    if (!res.headersSent) {
      res.status(500).send(error.message || 'Failed to process session end');
    }
  }
});

// Helper function to store CSS patterns for text session
async function storeCSSPatternsForTextSession(
  userId: string,
  sessionId: string,
  patterns: any,
  confidence: number,
  reasoning: string
): Promise<void> {
  const patternInserts = [];

  // Store CVDC patterns
  for (const cvdc of patterns.cvdcPatterns) {
    patternInserts.push({
      user_id: userId,
      call_id: sessionId,
      pattern_type: 'CVDC',
      content: cvdc,
      extracted_contradiction: cvdc.includes('but')
        ? cvdc.split('but').map((s: string) => s.trim()).join(' BUT ')
        : null,
      css_stage: patterns.currentStage,
      confidence: 0.85,
      detected_at: new Date().toISOString()
    });
  }

  // Store IBM patterns
  for (const ibm of patterns.ibmPatterns) {
    patternInserts.push({
      user_id: userId,
      call_id: sessionId,
      pattern_type: 'IBM',
      content: ibm,
      behavioral_gap: ibm,
      css_stage: patterns.currentStage,
      confidence: 0.80,
      detected_at: new Date().toISOString()
    });
  }

  // Store THEND patterns
  for (const thend of patterns.thendIndicators) {
    patternInserts.push({
      user_id: userId,
      call_id: sessionId,
      pattern_type: 'THEND',
      content: thend,
      css_stage: patterns.currentStage,
      confidence: 0.90,
      detected_at: new Date().toISOString()
    });
  }

  // Store CYVC patterns
  for (const cyvc of patterns.cyvcPatterns) {
    patternInserts.push({
      user_id: userId,
      call_id: sessionId,
      pattern_type: 'CYVC',
      content: cyvc,
      css_stage: patterns.currentStage,
      confidence: 0.88,
      detected_at: new Date().toISOString()
    });
  }

  // Store stage assessment
  patternInserts.push({
    user_id: userId,
    call_id: sessionId,
    pattern_type: 'STAGE_ASSESSMENT',
    content: `Stage: ${patterns.currentStage}. ${reasoning}`,
    css_stage: patterns.currentStage,
    confidence: confidence,
    detected_at: new Date().toISOString()
  });

  if (patternInserts.length > 0) {
    console.log(`📊 [CHAT] Attempting to store ${patternInserts.length} CSS patterns...`);
    const { error } = await supabase
      .from('css_patterns')
      .insert(patternInserts);

    if (error) {
      console.error('❌ [CHAT] Error storing CSS patterns:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
    } else {
      console.log(`✅ [CHAT] Successfully stored ${patternInserts.length} CSS patterns to database`);
    }
  } else {
    console.log('⚠️ [CHAT] No CSS patterns detected to store');
  }
}

export default router;
