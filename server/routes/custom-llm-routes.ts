import { Router } from 'express';
import type { Request, Response } from 'express';
import OpenAI from 'openai';
import { sensingLayer, getCachedProfile } from '../services/sensing-layer/index';
import { runFieldAssessment } from '../services/sensing-layer/field-assessment';
import {
  getLatestFieldAssessment,
  getPriorFieldSummary,
  recordFieldAssessment,
  recordLastAgentPosture,
  getSessionCSSStage,
  assessSessionCSSStage,
} from '../services/sensing-layer/session-state';
import {
  assembleSystemPrompt,
  assembleProfileBlock,
  setLastFooterState,
  clearFooterState,
  type FooterState,
} from '../prompts/pca-core';
import { getPCAContextForAgent } from '../services/memory-service';
import { formatFieldSessionPicture, injectSpokenReEngagement } from '../services/sensing-layer/guidance-injector';
import { findResonatingFragments } from '../services/sensing-layer/narrative-web';
import { getArcPosition } from '../services/sensing-layer/arc-tracker';
import { recordCustomLLMResponseSent } from '../services/sensing-layer/silence-monitor';

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Per-call streaming lock — prevents duplicate streams from concurrent VAPI requests
const processedTurns = new Map<string, number>();

const postInterventionActive = new Map<string, boolean>();

// Track whether a session has been initialized for a given callId
const initializedCalls = new Set<string>();

// Reserved for future per-request gating of post-intervention state
const lastFieldAssessmentExchange = new Map<string, number>();

// Brief vocalizations injected when LLM processing exceeds threshold.
// One phrase per agent — minimal, presence-signaling, clinically neutral.
const THINKING_PHRASES: Record<string, string> = {
  sarah: "I'm here.",
  marcus: 'Mm.',
  mathew: 'Mm.',
  una: 'Mm.',
};

const LLM_THINKING_THRESHOLD_MS = 4000;

export function clearCustomLLMCache(callId: string): void {
  processedTurns.delete(callId);
  initializedCalls.delete(callId);
  postInterventionActive.delete(callId);
  lastFieldAssessmentExchange.delete(callId);
  clearFooterState(callId);
}

// ─── Footer constants ─────────────────────────────────────────────────────────

const FOOTER_DELIMITER = '---STATE:';
// Hold back this many chars while streaming to catch delimiters
// that arrive split across chunk boundaries.
const LOOK_AHEAD = FOOTER_DELIMITER.length - 1; // 8 chars

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

  let pcaContext: string | null = null;
  if (userId && userId !== 'unknown') {
    try {
      pcaContext = await getPCAContextForAgent(userId);
    } catch (err) {
      console.warn(`🔵 [CUSTOM-LLM] PCA context unavailable (non-fatal):`, err);
      pcaContext = null;
    }
  }

  let arcPosition = null;
  if (userId && userId !== 'unknown' && !isFirstSession) {
    try {
      arcPosition = await getArcPosition(userId);
    } catch (err) {
      console.warn(`🔵 [CUSTOM-LLM] Arc position unavailable (non-fatal):`, err);
    }
  }

  const profileBlockBase = assembleProfileBlock(
    firstName,
    cachedProfile,
    isFirstSession,
    arcPosition,
    cachedProfile?.lastCSSStage ?? null,
    cachedProfile?.lastCSSStageConfidence ?? null
  );
  const profileBlock = pcaContext
    ? `${profileBlockBase}\n\n[CLINICAL CONTEXT]\n${pcaContext}`
    : profileBlockBase;
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
  const lastProcessedTurn = processedTurns.get(callId) ?? -1;
  if (numUserTurns <= lastProcessedTurn) {
    // Allow silence-injection requests through — these are VAPI re-triggers from
    // Tier 1-3 silence monitor add-message calls. They carry no new user turn but
    // must produce a real LLM response. Identifiable by a system message starting
    // with "[SILENCE —" in the messages array.
    const isSilenceInjection = messages.some(
      (m: { role: string; content: string }) =>
        m.role === 'system' && m.content.startsWith('[SILENCE —')
    );

    if (!isSilenceInjection) {
      console.log(`🔵 [CUSTOM-LLM] Duplicate suppressed: call=${callId} turn=${numUserTurns} (already processed turn ${lastProcessedTurn})`);
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

    console.log(`🔵 [CUSTOM-LLM] Silence injection allowed through: call=${callId} turn=${numUserTurns}`);
    // Do not update processedTurns — silence injections don't advance the turn record.
    // A real VAPI retry for this same turn will still be suppressed.
  }
  if (!messages.some((m: { role: string; content: string }) => m.role === 'system' && m.content.startsWith('[SILENCE —'))) {
    processedTurns.set(callId, numUserTurns);
  }

  // Step 4a: Field assessment session picture + background sensing
  const currentUtterance = messages.filter(m => m.role === 'user').pop()?.content;
  if (currentUtterance && numUserTurns > 0) {
    try {
      const conversationHistory = modifiedMessages
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .slice(0, -1)
        .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // Read field assessment from the PREVIOUS turn (completed during agent speech window)
      const latestFieldAssessment = getLatestFieldAssessment(callId);
      const priorFieldSummary = getPriorFieldSummary(callId);
      const { stage: currentCSSStage } = getSessionCSSStage(callId);

      // Fire field assessment for THIS turn in background — once per exchange only
      const lastAssessedExchange = lastFieldAssessmentExchange.get(callId) ?? -1;
      if (numUserTurns > lastAssessedExchange) {
        lastFieldAssessmentExchange.set(callId, numUserTurns);
        runFieldAssessment({
          userId,
          callId,
          sessionId,
          utterance: currentUtterance,
          exchangeCount: numUserTurns,
          agentName: agentId,
          conversationHistory,
          cssStage: currentCSSStage || 'unassessed',
          priorFieldSummary,
        }).then(assessment => {
          recordFieldAssessment(callId, assessment, numUserTurns);
          if (numUserTurns > 0 && numUserTurns % 5 === 0) {
            assessSessionCSSStage(callId);
          }
        }).catch(err =>
          console.error(`🔵 [CUSTOM-LLM] Field assessment background error:`, err)
        );
      }

      // Fire narrative resonance query in background (narrative web survives architecture change)
      let resonance = null;
      try {
        resonance = await findResonatingFragments(userId, currentUtterance);
      } catch (err) {
        console.warn(`🔵 [CUSTOM-LLM] Resonance query failed (non-fatal):`, err);
      }

      // Format session picture from previous turn's field assessment
      const guidanceMessage = formatFieldSessionPicture(
        latestFieldAssessment,
        numUserTurns,
        callId,
        resonance
      );

      let lastUserIdx = -1;
      for (let i = modifiedMessages.length - 1; i >= 0; i--) {
        if (modifiedMessages[i].role === 'user') { lastUserIdx = i; break; }
      }
      if (lastUserIdx !== -1) {
        modifiedMessages.splice(lastUserIdx, 0, { role: 'system', content: guidanceMessage });
      }

      console.log(`🔵 [CUSTOM-LLM] Session picture injected: call=${callId} turns=${numUserTurns} register=${latestFieldAssessment.register.current} contact=${latestFieldAssessment.contact_quality.type} critical=${latestFieldAssessment.critical_moment}`);
    } catch (err) {
      console.error(`🔵 [CUSTOM-LLM] Sensing error (non-fatal):`, err);
    }
  }

  // Set SSE headers once — before OpenAI stream.
  // Nothing below may call res.setHeader again.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Start thinking indicator timer — inject brief vocalization if LLM exceeds threshold
  let thinkingInjected = false;
  const agentKey = agentId.toLowerCase();
  const thinkingPhrase = THINKING_PHRASES[agentKey] ?? 'Mm.';

  const thinkingTimer = setTimeout(async () => {
      try {
        const injected = await injectSpokenReEngagement(callId, thinkingPhrase);
        if (injected) {
          thinkingInjected = true;
          console.log(`🧠 [THINKING] Injected "${thinkingPhrase}" for call ${callId} (LLM > ${LLM_THINKING_THRESHOLD_MS}ms)`);
        }
      } catch (err) {
        console.warn(`🧠 [THINKING] Injection failed for call ${callId}:`, err);
      }
    }, LLM_THINKING_THRESHOLD_MS);

  try {
    // Step 5: Stream from OpenAI with look-ahead footer detection.
    //
    // Chunks are sent to VAPI as they arrive, holding back LOOK_AHEAD chars
    // to catch the ---STATE: delimiter even if it arrives split across chunks.
    // When ---STATE: is found, everything before it has already been sent.
    // Everything from ---STATE: onward accumulates in footerBuffer for parsing
    // after the stream ends. setLastFooterState is called once at the end —
    // consumed by the NEXT request for this callId, so cross-turn timing unchanged.

    const completion = await openai.chat.completions.create({
      model: req.body.model || 'gpt-4o',
      messages: modifiedMessages,
      temperature: req.body.temperature ?? 0.7,
      max_completion_tokens: req.body.max_tokens ?? 300,
      stream: true,
    });

    let pendingBuffer = '';  // chars held back for look-ahead
    let footerBuffer = '';   // accumulates everything from ---STATE: onward
    let inFooter = false;    // true once ---STATE: has been found
    let firstChunkId = '';
    let lastChunkId = '';
    let totalSentLength = 0;
    let firstContentChunk = true;

    for await (const chunk of completion) {
      if (!firstChunkId) firstChunkId = chunk.id;
      lastChunkId = chunk.id;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (!delta) continue;

      // Clear thinking timer on first content — this is the actual signal
      // that the LLM has started producing output.
      if (firstContentChunk) {
        clearTimeout(thinkingTimer);
        firstContentChunk = false;

        // If a thinking phrase was injected, pause briefly so it finishes
        // playing before the actual response begins streaming.
        if (thinkingInjected) {
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
      }

      if (inFooter) {
        footerBuffer += delta;
        continue;
      }

      pendingBuffer += delta;

      const delimIdx = pendingBuffer.indexOf(FOOTER_DELIMITER);
      if (delimIdx !== -1) {
        const toSend = pendingBuffer.slice(0, delimIdx);
        footerBuffer = pendingBuffer.slice(delimIdx);
        pendingBuffer = '';
        inFooter = true;

        if (toSend) {
          res.write(
            `data: ${JSON.stringify({
              id: firstChunkId,
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { content: toSend }, finish_reason: null }],
            })}\n\n`
          );
          totalSentLength += toSend.length;
        }
        continue;
      }

      // Delimiter not yet seen — flush all but last LOOK_AHEAD chars
      if (pendingBuffer.length > LOOK_AHEAD) {
        const toSend = pendingBuffer.slice(0, pendingBuffer.length - LOOK_AHEAD);
        pendingBuffer = pendingBuffer.slice(pendingBuffer.length - LOOK_AHEAD);

        res.write(
          `data: ${JSON.stringify({
            id: firstChunkId,
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: { content: toSend }, finish_reason: null }],
          })}\n\n`
        );
        totalSentLength += toSend.length;
      }
    }

    // Flush remaining pendingBuffer (no footer case)
    if (pendingBuffer && !inFooter) {
      res.write(
        `data: ${JSON.stringify({
          id: firstChunkId || 'resp',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: pendingBuffer }, finish_reason: null }],
        })}\n\n`
      );
      totalSentLength += pendingBuffer.length;
      console.warn(`🔵 [CUSTOM-LLM] No footer in response for call=${callId} turn=${numUserTurns}`);
    }

    // Parse footer after stream ends
    if (inFooter && footerBuffer) {
      const match = footerBuffer.match(/^---STATE:(\{[\s\S]*?\})---/);
      if (match) {
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
          setLastFooterState(callId, footerState);
          if (footerState.posture) {
            recordLastAgentPosture(callId, footerState.posture);
          }
          console.log(
            `🔵 [CUSTOM-LLM] Footer parsed: register=${footerState.register} posture=${footerState.posture} css=${footerState.css} movement=${footerState.movement}`
          );
        } catch (e) {
          console.warn(`🔵 [CUSTOM-LLM] Footer JSON parse failed: ${e}`);
        }
      } else {
        console.warn(`🔵 [CUSTOM-LLM] Footer delimiter found but regex extraction failed for call=${callId}`);
      }
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
    recordCustomLLMResponseSent(callId);

    const totalTime = Date.now() - requestStartTime;
    console.log(
      `🔵 [CUSTOM-LLM] Complete: call=${callId} turns=${numUserTurns}/${numAssistantTurns} total=${totalTime}ms sent=${totalSentLength} chars`
    );
  } catch (error: any) {
    clearTimeout(thinkingTimer);
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
  }
});

export default router;