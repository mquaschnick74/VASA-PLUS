import { Router } from 'express';
import type { Request, Response } from 'express';
import OpenAI from 'openai';
import { fastSense, FastSenseInput } from '../services/sensing-layer/fast-sense';
import { sensingLayer } from '../services/sensing-layer/index';
import { getSessionState } from '../services/sensing-layer/session-state';
import { loadSessionNarrativeContext } from '../services/sensing-layer/narrative-web';
import type { TurnInput } from '../services/sensing-layer/types';

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Module-level cache for narrative context, keyed by callId
const narrativeContextCache = new Map<string, any>();

export function clearCustomLLMCache(callId: string): void {
  narrativeContextCache.delete(callId);
}

router.post('/chat/completions', async (req: Request, res: Response) => {
  const requestStartTime = Date.now();

  // ─── Step 1: Extract metadata ────────────────────────────────────────────
  const callId = req.body.call?.id || 'unknown';
  const userId = req.body.metadata?.userId || 'unknown';
  const agentName = req.body.metadata?.agentName || 'unknown';
  const messages: Array<{ role: string; content: string }> = req.body.messages || [];
  const numUserTurns = messages.filter((m) => m.role === 'user').length;
  const numAssistantTurns = messages.filter((m) => m.role === 'assistant').length;
  const sessionId = req.body.metadata?.sessionId || callId;
  const userMessages = messages.filter((m) => m.role === 'user');
  const userUtterance = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : '';

  console.log(`🔵 [CUSTOM-LLM] Request: call=${callId} user=${userId} agent=${agentName} turns=${numUserTurns}/${numAssistantTurns} messages=${messages.length}`);

  let guidanceInjection = '';
  let alreadyProcessedDeepPath = false;

  try {
    // ─── Step 2: Initialize session on first turn ────────────────────────
    const existingSession = getSessionState(callId);

    if (!existingSession) {
      if (numUserTurns <= 1) {
        // First turn — fire and forget initialization
        sensingLayer.initializeCallSession(callId, userId, sessionId).catch((err) => {
          console.error(`🔵 [CUSTOM-LLM] Session init error:`, err);
        });
        loadSessionNarrativeContext(userId)
          .then((ctx) => {
            narrativeContextCache.set(callId, ctx);
          })
          .catch((err) => {
            console.error(`🔵 [CUSTOM-LLM] Narrative context load error:`, err);
          });
        console.log(`🔵 [CUSTOM-LLM] Session initialized for call ${callId}`);
      } else {
        // Recovery: session missing on a later turn — await initialization
        await sensingLayer.initializeCallSession(callId, userId, sessionId);
        const ctx = await loadSessionNarrativeContext(userId);
        narrativeContextCache.set(callId, ctx);
        console.log(`🔵 [CUSTOM-LLM] Session initialized for call ${callId} (recovery)`);
      }
    }

    // ─── Step 3: Run fast-path sensing ─────────────────────────────────────
    let fastResult: Awaited<ReturnType<typeof fastSense>> | null = null;

    if (numUserTurns >= 1) {
      const fastInput: FastSenseInput = {
        userId,
        callId,
        sessionId,
        utterance: userUtterance,
        exchangeCount: numUserTurns,
        agentName,
      };

      fastResult = await fastSense(fastInput);
      guidanceInjection = fastResult.guidanceInjection;

      console.log(`🔵 [CUSTOM-LLM] Fast sense: ${fastResult.processingTimeMs}ms, critical: ${fastResult.isCriticalMoment}, fragments: ${fastResult.resonance.matchedFragments.length}`);

      // ─── Step 4: Critical moment — run deep path synchronously ─────────
      if (fastResult.isCriticalMoment) {
        const conversationHistory = messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        const turnInput: TurnInput = {
          utterance: userUtterance,
          sessionId,
          callId,
          userId,
          exchangeCount: numUserTurns,
          conversationHistory,
        };

        const deepGuidance = await sensingLayer.processUtterance(turnInput);
        alreadyProcessedDeepPath = true;

        console.log(`🔵 [CUSTOM-LLM] Deep path completed for critical moment: posture=${deepGuidance.posture}`);

        guidanceInjection += `\n\nDEEP ANALYSIS: Posture: ${deepGuidance.posture}. ${deepGuidance.strategicDirection}`;
        if (deepGuidance.framing) {
          guidanceInjection += ` Framing: ${deepGuidance.framing}`;
        }
        if (deepGuidance.avoidances.length > 0) {
          guidanceInjection += ` Avoid: ${deepGuidance.avoidances.join(', ')}`;
        }
      }
    }
  } catch (sensingError: any) {
    // Sensing failed — continue without guidance
    console.error(`🔵 [CUSTOM-LLM] Sensing failed, forwarding without guidance: ${sensingError.message}`);
    guidanceInjection = '';
  }

  // ─── Step 5: Inject guidance into messages ─────────────────────────────
  const modifiedMessages = JSON.parse(JSON.stringify(messages));

  if (guidanceInjection) {
    const systemMessage = modifiedMessages.find((m: any) => m.role === 'system');
    if (systemMessage) {
      systemMessage.content = systemMessage.content + '\n\n' + guidanceInjection;
    } else {
      console.warn(`🔵 [CUSTOM-LLM] No system message found — skipping guidance injection`);
    }
  }

  // ─── Step 6: Forward to OpenAI and stream back ─────────────────────────
  try {
    const completion = await openai.chat.completions.create({
      model: req.body.model || 'gpt-4o',
      messages: modifiedMessages,
      temperature: req.body.temperature ?? 0.7,
      max_completion_tokens: req.body.max_tokens ?? 300,
      stream: true,
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of completion) {
      const data = JSON.stringify(chunk);
      res.write(`data: ${data}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

    const totalTime = Date.now() - requestStartTime;
    console.log(`🔵 [CUSTOM-LLM] Response streamed: call=${callId} turns=${numUserTurns}/${numAssistantTurns} total=${totalTime}ms`);

    // ─── Step 7: Async deep processing after stream ────────────────────
    if (!alreadyProcessedDeepPath && numUserTurns >= 1) {
      const conversationHistory = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const turnInput: TurnInput = {
        utterance: userUtterance,
        sessionId,
        callId,
        userId,
        exchangeCount: numUserTurns,
        conversationHistory,
      };

      sensingLayer.processUtterance(turnInput)
        .then((guidance) => {
          console.log(`🔵 [CUSTOM-LLM] Async deep path completed: posture=${guidance.posture}`);
        })
        .catch((err) => {
          console.error(`🔵 [CUSTOM-LLM] Async deep path error:`, err);
        });
    }
  } catch (error: any) {
    console.error(`🔴 [CUSTOM-LLM] OpenAI error: ${error.message}`, { callId, userId, agentName });

    if (!res.headersSent) {
      res.status(500).json({ error: 'LLM request failed', message: error.message });
    } else {
      // Mid-stream failure — send graceful recovery message
      try {
        const errorChunk = {
          id: 'error',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: ' I apologize, I experienced a brief interruption. Could you repeat what you just said?' }, finish_reason: null }]
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        const finishChunk = {
          id: 'error',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
        };
        res.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (e) {
        res.end();
      }
    }
  }
});

export default router;
