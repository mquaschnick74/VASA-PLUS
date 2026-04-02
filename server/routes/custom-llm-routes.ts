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
  recordStructuredPattern,
} from '../services/sensing-layer/session-state';
import {
  assembleSystemPrompt,
  assembleProfileBlock,
  setLastFooterState,
  clearFooterState,
  type FooterState,
} from '../prompts/pca-core';
import { getPCAContextForAgent } from '../services/memory-service';
import { formatFieldSessionPicture } from '../services/sensing-layer/guidance-injector';
import { findResonatingFragments } from '../services/sensing-layer/narrative-web';
import { getArcPosition } from '../services/sensing-layer/arc-tracker';
import { recordCustomLLMResponseSent } from '../services/sensing-layer/silence-monitor';

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Tracks the turn number of the most recently sent LLM response per call.
// Updated each time we send a real response.
const lastSentTurn = new Map<string, number>();

// Tracks the turn number that VAPI has confirmed playing (via speech-update: started).
// Gate blocks any request at or below this number.
const confirmedTurns = new Map<string, number>();

// Tracks turns currently being streamed. Keyed as `${callId}:${numUserTurns}`.
// Prevents two concurrent requests for the same turn both producing responses.
const inFlightTurns = new Set<string>();

const postInterventionActive = new Map<string, boolean>();

// Track whether a session has been initialized for a given callId
const initializedCalls = new Set<string>();

// Reserved for future per-request gating of post-intervention state
const lastFieldAssessmentExchange = new Map<string, number>();

// Tracks the character length of the last user utterance we successfully streamed
// a response for. Used to distinguish true duplicates (same content — block) from
// the final complete-transcript request (longer content — allow through).
const lastRespondedUtteranceLength = new Map<string, number>();

// Tracks a per-call timer that re-opens the confirmed-turn gate if VAPI has not
// sent speech-start within 3500ms of stream-end. If VAPI discards our response
// (user was still speaking), speech-start never fires — this timer detects that
// and re-opens the gate so the final complete-transcript request can get through.
const playbackConfirmationTimers = new Map<string, ReturnType<typeof setTimeout>>();


export function clearCustomLLMCache(callId: string): void {
  lastSentTurn.delete(callId);
  confirmedTurns.delete(callId);
  // Clean up any in-flight entries for this call
  for (const key of Array.from(inFlightTurns)) {
    if (key.startsWith(`${callId}:`)) {
      inFlightTurns.delete(key);
    }
  }
  initializedCalls.delete(callId);
  postInterventionActive.delete(callId);
  lastFieldAssessmentExchange.delete(callId);
  lastRespondedUtteranceLength.delete(callId);
  const existingTimer = playbackConfirmationTimers.get(callId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    playbackConfirmationTimers.delete(callId);
  }
  clearFooterState(callId);
}

/**
 * Called by the webhook handler when speech-update: started fires.
 * Confirms that VAPI has accepted and is playing the last response we sent.
 * This advances the confirmation gate, blocking any further retries for that turn.
 */
export function confirmTurnPlayed(callId: string): void {
  const turn = lastSentTurn.get(callId);
  if (turn !== undefined) {
    confirmedTurns.set(callId, turn);
    console.log(`🔵 [CUSTOM-LLM] Turn confirmed by VAPI speech-start: call=${callId} turn=${turn}`);
  }
  // Cancel the playback confirmation timer — VAPI is playing our response,
  // gate stays closed permanently.
  const timer = playbackConfirmationTimers.get(callId);
  if (timer) {
    clearTimeout(timer);
    playbackConfirmationTimers.delete(callId);
  }
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
  const lastConfirmedTurn = confirmedTurns.get(callId) ?? -1;
  if (numUserTurns <= lastConfirmedTurn) {
    // VAPI has already confirmed it played a response for this turn.
    // Check if this is a silence injection (which must always pass through).
    const isSilenceInjection = messages.some(
      (m: { role: string; content: string }) =>
        m.role === 'system' && m.content.startsWith('[SILENCE —')
    );

    if (!isSilenceInjection) {
      console.log(`🔵 [CUSTOM-LLM] Duplicate suppressed: call=${callId} turn=${numUserTurns} (VAPI confirmed turn ${lastConfirmedTurn})`);
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
  }

  // Record the turn number of the response we are about to send.
  // This will be confirmed (or not) when speech-update: started arrives.
  const isSilenceReq = messages.some(
    (m: { role: string; content: string }) =>
      m.role === 'system' && m.content.startsWith('[SILENCE —')
  );
  if (!isSilenceReq) {
    lastSentTurn.set(callId, numUserTurns);
  }

  // Block concurrent requests for the same turn that are already in-flight.
  const turnKey = `${callId}:${numUserTurns}`;
  if (inFlightTurns.has(turnKey) && !isSilenceReq) {
    console.log(`🔵 [CUSTOM-LLM] In-flight duplicate suppressed: call=${callId} turn=${numUserTurns}`);
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
  if (!isSilenceReq) {
    inFlightTurns.add(turnKey);
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
          if (assessment.explicit_pattern_identification?.present === true) {
            const epi = assessment.explicit_pattern_identification;
            recordStructuredPattern(callId, {
              description: epi.inferred_pattern || epi.statement || 'Pattern identified by client',
              patternType: 'cognitive',
              confidence: epi.confidence,
              evidence: epi.statement || '',
              userExplicitlyIdentified: true
            });
            console.log(`🔒 [PatternGate] Explicit pattern identification recorded for call ${callId}: "${(epi.inferred_pattern || '').slice(0, 60)}"`);
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
        resonance,
        cachedProfile?.cvdcState ?? null
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
        firstContentChunk = false;
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
      })}\\n\\n`
    );
    // Release in-flight lock and close the confirmed-turn gate at stream completion.
    // Closing the gate here (not waiting for speech-start) prevents the window
    // between stream-end and speech-start from being exploited by subsequent
    // conversation-update requests that would produce duplicate full responses.
    // speech-start events will arrive after this and become no-ops on an
    // already-closed gate, which is correct.
    if (!isSilenceReq) {
      inFlightTurns.delete(turnKey);
      // Start a playback confirmation timer. If VAPI plays our response,
      // speech-start will fire within ~1-2s (TTS processing) and cancel this timer.
      // If speech-start does NOT fire within 3500ms, VAPI discarded our response
      // (user was still speaking) — re-open the gate so the final complete-transcript
      // request can get through and produce a response VAPI will actually play.
      const existingTimer = playbackConfirmationTimers.get(callId);
      if (existingTimer) clearTimeout(existingTimer);
      const confirmTimer = setTimeout(() => {
        playbackConfirmationTimers.delete(callId);
        confirmedTurns.delete(callId);
        console.log(`🔵 [CUSTOM-LLM] Playback not confirmed — gate re-opened: call=${callId} turn=${numUserTurns}`);
      }, 3500);
      playbackConfirmationTimers.set(callId, confirmTimer);
    }
    res.write('data: [DONE]\\n\\n');
    res.end();
    recordCustomLLMResponseSent(callId);

    const totalTime = Date.now() - requestStartTime;
    console.log(
      `🔵 [CUSTOM-LLM] Complete: call=${callId} turns=${numUserTurns}/${numAssistantTurns} total=${totalTime}ms sent=${totalSentLength} chars`
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
    // Hold the in-flight lock for 2500ms after stream completes before releasing.
    // This covers the window between our stream-end and VAPI's speech-start event,
    // during which VAPI sends additional growing-transcript requests for the same turn.
    // The confirmed-turn gate (closed at speech-start) is the permanent block.
    // This is only the temporary bridge until speech-start arrives.
    setTimeout(() => {
      inFlightTurns.delete(turnKey);
    }, 2500);
  }
});

export default router;