// server/routes/chat-routes.ts
// Text-to-text chat endpoint for VASA

import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabase } from '../services/supabase-service';
import { buildMemoryContext } from '../services/memory-service';
import { detectCSSPatterns, assessPatternConfidence } from '../services/css-pattern-service';
import { generateEnhancedSessionSummary } from '../services/summary-service';
import OpenAI from 'openai';

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
    const { sessionId, agentId, agentName, systemPrompt, modelConfig, message } = req.body;

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

    // Get last session summary if available
    const { data: sessions } = await supabase
      .from('therapeutic_sessions')
      .select('session_summary')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    const userContext = {
      memoryContext,
      lastSessionSummary: sessions?.[0]?.session_summary || null,
      shouldReferenceLastSession: !!sessions?.[0]?.session_summary
    };

    // Load conversation history for this specific text session
    console.log('💬 [CHAT] Loading history for session:', sessionId);

    // Build conversation history from session_transcripts table for this session
    const conversationHistory: Array<{ role: 'user' | 'assistant', content: string }> = [];

    const { data: transcripts } = await supabase
      .from('session_transcripts')
      .select('text, role, timestamp')
      .eq('call_id', sessionId)
      .order('timestamp', { ascending: true });

    console.log('💬 [CHAT] Transcript entries found for session:', transcripts?.length || 0);

    if (transcripts && transcripts.length > 0) {
      for (const transcript of transcripts) {
        conversationHistory.push({
          role: transcript.role as 'user' | 'assistant',
          content: transcript.text
        });
      }
    }

    console.log('💬 [CHAT] Conversation history messages:', conversationHistory.length);

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
      ...conversationHistory,  // Include previous messages from this text session
      { role: 'user', content: message }  // Current message
    ];

    console.log('💬 [CHAT] Sending to OpenAI:', {
      systemPrompt: 1,
      historyMessages: conversationHistory.length,
      currentMessage: 1,
      totalMessages: messages.length
    });

    // Call OpenAI with streaming
    const stream = await openai.chat.completions.create({
      model: modelConfig.model,
      messages,
      stream: true,
      temperature: modelConfig.temperature,
      max_tokens: 500 // Limit for text chat (more concise than voice)
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

    // 3. Create therapeutic_sessions entry
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

    // 4. Save complete transcript to session_transcripts (ONE entry with role='complete')
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

    // 5. Detect CSS patterns
    const patterns = detectCSSPatterns(fullTranscript, true);
    const { confidence, reasoning } = assessPatternConfidence(patterns);

    console.log('📊 [CHAT] CSS Analysis:', {
      stage: patterns.currentStage,
      cvdcCount: patterns.cvdcPatterns.length,
      ibmCount: patterns.ibmPatterns.length,
      confidence
    });

    // 6. Store CSS patterns
    await storeCSSPatternsForTextSession(userId, sessionId, patterns, confidence, reasoning);

    // 7. Generate enhanced session summary for continuity
    try {
      await generateEnhancedSessionSummary({
        userId,
        callId: sessionId,
        transcript: fullTranscript,
        cssPatterns: patterns,
        agentName: agentName || 'Assistant',
        duration: durationSeconds
      });
      console.log('📝 [CHAT] Enhanced session summary generated');
    } catch (summaryError) {
      console.error('❌ [CHAT] Failed to generate summary:', summaryError);
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
  for (const thend of patterns.thendPatterns) {
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
    const { error } = await supabase
      .from('css_patterns')
      .insert(patternInserts);

    if (error) {
      console.error('❌ [CHAT] Error storing CSS patterns:', error);
    } else {
      console.log(`✅ [CHAT] Stored ${patternInserts.length} CSS patterns`);
    }
  }
}

export default router;
