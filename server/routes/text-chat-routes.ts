// server/routes/text-chat-routes.ts
// Text-based chat endpoint that mirrors VAPI's conversation flow with dynamic greetings

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { 
  initializeSession, 
  processTranscript,
  ensureSession
} from '../services/orchestration-service';
import { parseAssistantOutput } from '../utils/parseAssistantOutput';

const router = Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Store conversation history for text sessions
const textConversations = new Map<string, any[]>();

// Create a text chat session with dynamic greeting generation
router.post('/text-session/start', async (req, res) => {
  try {
    const { userId, agentConfig, memoryContext, firstName } = req.body;

    if (!userId || !agentConfig) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate a session ID for text chat
    const sessionId = `text-${uuidv4()}`;

    // Initialize session in orchestration service (same as voice)
    await initializeSession(userId, sessionId, agentConfig.name);

    // System prompt is already built on frontend with greeting instructions
    const systemPrompt = agentConfig.systemPrompt;

    // Initialize conversation with system prompt
    const conversation = [
      { role: 'system', content: systemPrompt }
    ];

    textConversations.set(sessionId, conversation);

    // Generate first message dynamically (like voice mode does)
    try {
      const completion = await openai.chat.completions.create({
        model: agentConfig.model || 'gpt-4',
        messages: conversation,
        temperature: agentConfig.temperature || 0.7,
        max_tokens: agentConfig.maxTokens || 150,
        stream: false
      });

      const firstMessage = completion.choices[0]?.message?.content || 
        `Hello ${firstName || 'there'}, I'm ${agentConfig.name}. What brings you here today?`;

      // Add assistant's first message to conversation
      conversation.push({ role: 'assistant', content: firstMessage });

      // Process through CSS pattern detection
      await processTranscript(sessionId, firstMessage, 'assistant', userId, agentConfig.name);

      res.json({
        success: true,
        sessionId,
        firstMessage,
        agentName: agentConfig.name
      });

    } catch (openAIError) {
      console.error('OpenAI error generating greeting:', openAIError);
      // Fallback greeting if OpenAI fails
      const fallbackGreeting = `Hello ${firstName || 'there'}, I'm ${agentConfig.name}. What brings you here today?`;

      res.json({
        success: true,
        sessionId,
        firstMessage: fallbackGreeting,
        agentName: agentConfig.name
      });
    }

  } catch (error) {
    console.error('Error starting text session:', error);
    res.status(500).json({ error: 'Failed to start text session' });
  }
});

// Send a text message and get response
router.post('/text-session/message', async (req, res) => {
  try {
    const { sessionId, userId, message, agentConfig } = req.body;

    if (!sessionId || !userId || !message || !agentConfig) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Ensure session exists
    const session = await ensureSession(sessionId, userId, agentConfig.name);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get conversation history
    let conversation = textConversations.get(sessionId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation history not found' });
    }

    // Add user message to conversation
    conversation.push({ role: 'user', content: message });

    // Process user message through CSS pattern detection
    await processTranscript(sessionId, message, 'user', userId, agentConfig.name);

    // Keep conversation history manageable (last 20 messages + system)
    if (conversation.length > 21) {
      const systemMessage = conversation[0];
      conversation = [systemMessage, ...conversation.slice(-20)];
      textConversations.set(sessionId, conversation);
    }

    try {
      // Get response from OpenAI (same model as VAPI uses)
      const completion = await openai.chat.completions.create({
        model: agentConfig.model || 'gpt-4',
        messages: conversation,
        temperature: agentConfig.temperature || 0.7,
        max_tokens: agentConfig.maxTokens || 150,
        stream: false
      });

      const assistantResponse = completion.choices[0]?.message?.content || '';

      // Parse the response to extract speak and meta tags (if any)
      const { speak, meta } = parseAssistantOutput(assistantResponse);

      // Add assistant response to conversation
      conversation.push({ role: 'assistant', content: assistantResponse });
      textConversations.set(sessionId, conversation);

      // Process assistant response through CSS pattern detection
      await processTranscript(sessionId, assistantResponse, 'assistant', userId, agentConfig.name);

      // Return the clean response (without meta tags) and metadata separately
      res.json({
        success: true,
        response: speak || assistantResponse,
        metadata: meta,
        sessionId
      });

    } catch (openAIError) {
      console.error('OpenAI API error:', openAIError);
      res.status(500).json({ error: 'Failed to get response from AI' });
    }

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// End text chat session
router.post('/text-session/end', async (req, res) => {
  try {
    const { sessionId, userId } = req.body;

    if (!sessionId || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get conversation history for summary
    const conversation = textConversations.get(sessionId);

    if (conversation) {
      // Create a transcript for end-of-call processing
      const fullTranscript = conversation
        .filter(msg => msg.role !== 'system')
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      // Process end of call (same as voice sessions)
      const { processEndOfCall } = await import('../services/orchestration-service');
      await processEndOfCall(sessionId, fullTranscript, 'Text chat session ended', {
        duration: Date.now(),
        type: 'text'
      });

      // Clean up conversation history
      textConversations.delete(sessionId);
    }

    res.json({
      success: true,
      message: 'Text session ended'
    });

  } catch (error) {
    console.error('Error ending text session:', error);
    res.status(500).json({ error: 'Failed to end text session' });
  }
});

// Get conversation history (for reconnection)
router.get('/text-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const conversation = textConversations.get(sessionId);

    if (!conversation) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Return conversation without system message
    const messages = conversation
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role,
        content: msg.role === 'assistant' ? parseAssistantOutput(msg.content).speak || msg.content : msg.content
      }));

    res.json({
      success: true,
      messages,
      sessionId
    });

  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Health check for text chat
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    activeSessions: textConversations.size,
    timestamp: new Date().toISOString()
  });
});

export default router;