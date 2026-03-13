import { Router } from 'express';
import type { Request, Response } from 'express';
import OpenAI from 'openai';
import { sensingLayer, getCachedProfile } from '../services/sensing-layer/index';
import {
  assembleSystemPrompt,
  assembleProfileBlock,
  setLastFooterState,
  clearFooterState,
  type FooterState,
} from '../prompts/pca-core';

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Per-call streaming lock — prevents duplicate streams from concurrent VAPI requests
const streamingCallIds = new Set<string>();

// Track whether a session has been initialized for a given callId
const initializedCalls = new Set<string>();

export function clearCustomLLMCache(callId: string): void {
  streamingCallIds.delete(callId);
  initializedCalls.delete(callId);
  clearFooterState(callId);
}

// ─── Footer stripping ─────────────────────────────────────────────────────────

const FOOTER_DELIMITER = '---STATE:';

function stripFooter(fullContent: string): { clean: string; footerState: FooterState | null } {
  const idx = fullContent.indexOf(FOOTER_DELIMITER);
  if (idx === -1) {
    return { clean: fullContent, footerState: null };
  }

  const clean = fullContent.slice(0, idx);
  const footerStr = fullContent.slice(idx);
  const match = footerStr.match(/^---STATE:(\{[\s\S]*?\})---/);

  if (!match) {
    console.warn(`[CUSTOM-LLM] Footer delimiter found but JSON extraction failed`);
    return { clean, footerState: null };
  }

  try {
    const parsed = JSON.parse(match[1]);
    const footerState: FooterState = {
      register: parsed.register || 'imaginary',
      posture: parsed.posture || 'prescripting',
      css: parsed.css || 'pointed-origin',
      movement: parsed.movement || 'stable',
      flag: parsed.flag || null,
      cvdc: parsed.cvdc || null,
    };
    return { clean, footerState };
  } catch (e) {
    console.warn(`[CUSTOM-LLM] Footer JSON parse failed: ${e}`);
    return { clean, footerState: null };
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

router.post('/chat/completions', async (req: Request, res: Response) => {
  const requestStartTime = Date.now();

  // Step 1: Extract metadata
  const callId = req.body.call?.id || 'unknown';
  const userId = req.body.metadata?.userId || 'unknown';
  const agentId = (req.body.metadata?.agentName || 'marcus').toLowerCase();
  const firstName = req.body.metadata?.firstName || req.body.metadata?.customerName || 'there';
  const sessionId = req.body.metadata?.sessionId || callId;
  const messages: Array<{ role: string; content: string }> = req.body.messages || [];
  const numUserTurns = messages.filter((m) => m.role === 'user').length;
  const numAssistantTurns = messages.filter((m) => m.role === 'assistant').length;

  console.log(`🔵 [CUSTOM-LLM] Request: call=${callId} user=${userId} agent=${agentId} firstName=${firstName} turns=${numUserTurns}/${numAssistantTurns}`);

  // Step 2: Initialize session on first turn
  if (!initializedCalls.has(callId)) {
    initializedCalls.add(callId);
    try {
      await sensingLayer.initializeCallSession(callId, userId, sessionId);
    } catch (err) {
      console.error(`🔵 [CUSTOM-LLM] Session init error:`, err);
    }
    console.log(`🔵 [CUSTOM-LLM] Session initialized for call ${callId}`);
  }

  // Step 3: Assemble full PCA system prompt
  const cachedProfile = getCachedProfile(callId);
  const lastSessionSummary = cachedProfile?.lastSessionSummary ?? null;
  const isFirstSession = lastSessionSummary === null;

  const profileBlock = assembleProfileBlock(firstName, cachedProfile, isFirstSession);
  const fullSystemPrompt = assembleSystemPrompt(agentId, firstName, profileBlock, isFirstSession, lastSessionSummary);

  const modifiedMessages = JSON.parse(JSON.stringify(messages));
  const systemMessageIdx = modifiedMessages.findIndex((m: any) => m.role === 'system');
  if (systemMessageIdx !== -1) {
    modifiedMessages[systemMessageIdx].content = fullSystemPrompt;
  } else {
    modifiedMessages.unshift({ role: 'system', content: fullSystemPrompt });
    console.warn(`🔵 [CUSTOM-LLM] No system message from VAPI — inserted assembled prompt`);
  }

  console.log(`🔵 [CUSTOM-LLM] Prompt size: ${fullSystemPrompt.length} chars (~${Math.round(fullSystemPrompt.length / 4)} tokens)`);

  // Step 4: Streaming lock gate
  if (streamingCallIds.has(callId)) {
    console.log(`🔵 [CUSTOM-LLM] Duplicate suppressed: call=${callId}`);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(
      `data: ${JSON.stringify({
        id: 'skip',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      })}\n\n`
    );
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }
  streamingCallIds.add(callId);

  try {
    // Step 5: Stream from OpenAI, buffer full response for footer stripping
    const completion = await openai.chat.completions.create({
      model: req.body.model || 'gpt-4o',
      messages: modifiedMessages,
      temperature: req.body.temperature ?? 0.7,
      max_completion_tokens: req.body.max_tokens ?? 300,
      stream: true,
    });

    let fullContent = '';
    let firstChunkId = '';
    let lastChunkId = '';

    for await (const chunk of completion) {
      if (!firstChunkId) firstChunkId = chunk.id;
      lastChunkId = chunk.id;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) fullContent += delta;
    }

    // Strip footer
    const { clean: cleanContent, footerState } = stripFooter(fullContent);

    if (footerState) {
      setLastFooterState(callId, footerState);
      console.log(
        `🔵 [CUSTOM-LLM] Footer stripped: register=${footerState.register} posture=${footerState.posture} css=${footerState.css} movement=${footerState.movement}`
      );
    } else if (fullContent.includes(FOOTER_DELIMITER)) {
      // Footer delimiter found but parsing failed — block the response
      console.error(`🔴 [CUSTOM-LLM] Footer strip failure for call=${callId} — response blocked`);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(
        `data: ${JSON.stringify({
          id: 'blocked',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: 'Something went wrong. Can you say that again?' }, finish_reason: null }],
        })}\n\n`
      );
      res.write(
        `data: ${JSON.stringify({
          id: 'blocked',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })}\n\n`
      );
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    } else {
      console.warn(
        `🔵 [CUSTOM-LLM] No footer in response for call=${callId} turn=${numUserTurns}`
      );
    }

    // Stream clean content back to VAPI
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    if (cleanContent) {
      res.write(
        `data: ${JSON.stringify({
          id: firstChunkId || 'resp',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: cleanContent }, finish_reason: null }],
        })}\n\n`
      );
    }

    res.write(
      `data: ${JSON.stringify({
        id: lastChunkId || 'resp',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      })}\n\n`
    );
    res.write('data: [DONE]\n\n');
    res.end();

    const totalTime = Date.now() - requestStartTime;
    console.log(
      `🔵 [CUSTOM-LLM] Complete: call=${callId} turns=${numUserTurns}/${numAssistantTurns} total=${totalTime}ms length=${cleanContent.length}`
    );
  } catch (error: any) {
    console.error(`🔴 [CUSTOM-LLM] OpenAI error: ${error.message}`, { callId, userId, agentId });
    if (!res.headersSent) {
      res.status(500).json({ error: 'LLM request failed', message: error.message });
    } else {
      try {
        res.write(
          `data: ${JSON.stringify({
            id: 'error',
            object: 'chat.completion.chunk',
            choices: [
              {
                index: 0,
                delta: { content: 'I apologize, I experienced a brief interruption. Could you repeat that?' },
                finish_reason: null,
              },
            ],
          })}\n\n`
        );
        res.write(
          `data: ${JSON.stringify({
            id: 'error',
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
      } catch {
        res.end();
      }
    }
  } finally {
    streamingCallIds.delete(callId);
  }
});

export default router;
