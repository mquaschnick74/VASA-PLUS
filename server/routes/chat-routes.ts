// server/routes/chat-routes.ts
// Text-to-text chat endpoint for VASA

import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { supabase } from '../services/supabase-service';
import { buildMemoryContext } from '../services/memory-service';
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
    const { agentId, agentName, systemPrompt, modelConfig, message } = req.body;

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
    if (!message || !agentId || !systemPrompt || !modelConfig) {
      console.error('❌ [CHAT] Missing required fields:', {
        hasMessage: !!message,
        hasAgentId: !!agentId,
        hasSystemPrompt: !!systemPrompt,
        hasModelConfig: !!modelConfig
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

    // Build system prompt with user context
    const fullSystemPrompt = buildChatSystemPrompt(
      systemPrompt,
      userContext,
      firstName
    );

    console.log('🤖 [CHAT] Calling OpenAI with model:', modelConfig.model);

    // Call OpenAI with streaming
    const stream = await openai.chat.completions.create({
      model: modelConfig.model,
      messages: [
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: message }
      ],
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

    // Save to database asynchronously (don't block response)
    saveTextInteraction(userId, agentId, agentName, message, fullResponse)
      .catch(err => console.error('❌ [CHAT] Error saving interaction:', err));

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

// Helper function to save text interaction to database
async function saveTextInteraction(
  userId: string,
  agentId: string,
  agentName: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  try {
    // Create a session record for text interaction
    const { error } = await supabase
      .from('therapeutic_sessions')
      .insert({
        user_id: userId,
        agent_name: agentName,
        call_id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        status: 'completed',
        interaction_type: 'text', // Mark as text interaction
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        duration_seconds: 0, // No duration for text
        transcript: JSON.stringify({
          exchanges: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: assistantResponse }
          ]
        })
      });

    if (error) {
      console.error('❌ [CHAT] Database error:', error);
    } else {
      console.log('✅ [CHAT] Text interaction saved to database');
    }
  } catch (err) {
    console.error('❌ [CHAT] Exception saving interaction:', err);
  }
}

export default router;
