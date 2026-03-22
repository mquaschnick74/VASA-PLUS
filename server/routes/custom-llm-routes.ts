import { Router } from 'express';
import type { Request, Response } from 'express';
import OpenAI from 'openai';
import { sensingLayer, getCachedProfile, fetchLastSessionSummary, getSessionState } from '../services/sensing-layer/index';
import {
  assembleSystemPrompt,
  assembleProfileBlock,
  setLastFooterState,
  clearFooterState,
  type FooterState,
} from '../prompts/pca-core';
import { getPCAContextForAgent } from '../services/memory-service';
import { formatObservationalSessionPicture } from '../services/sensing-layer/guidance-injector';
import { decideUNAOrchestration } from '../services/una-orchestrator';
import { detectMetaInstruction } from '../services/sensing-layer/meta-instruction-detector';

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Per-call streaming lock — prevents duplicate streams from concurrent VAPI requests
const streamingCallIds = new Set<string>();

// Track whether a session has been initialized for a given callId
const initializedCalls = new Set<string>();

// Reserved for future per-request gating of post-intervention state
const postInterventionActive = new Map<string, boolean>();

export function clearCustomLLMCache(callId: string): void {
  streamingCallIds.delete(callId);
  initializedCalls.delete(callId);
  postInterventionActive.delete(callId);
  clearFooterState(callId);
}

// ─── Footer constants ─────────────────────────────────────────────────────────

const FOOTER_DELIMITER = '---STATE:';
// Hold back this many chars while streaming to catch delimiters
// that arrive split across chunk boundaries.
const LOOK_AHEAD = FOOTER_DELIMITER.length - 1; // 8 chars

type LiveSilenceSignal = {
  durationSeconds: number;
  eventCount: number;
  register: 'real' | 'imaginary' | 'symbolic' | 'unknown';
  repeatedExtendedPause: boolean;
};

type SpeakerMode = 'mathew' | 'una' | 'supportive' | 'clarifying' | 'marcus';

function getSilenceFallbackText(
  speakerMode: SpeakerMode,
  silenceSignal: LiveSilenceSignal | null,
  lastUtterance?: string
): string {
  const firstSilenceEvent = (silenceSignal?.eventCount ?? 0) <= 1;

  if (firstSilenceEvent) {
    const firstEventByMode: Record<SpeakerMode, string> = {
      supportive: "I'm here with you. Take your time.",
      clarifying: "I'm here with you. What's happening right now?",
      una: "I'm right here with you. We can stay with this moment.",
      mathew: "I'm here. Take a breath—what's here right now?",
      marcus: "I'm here. Take a breath—what's here right now?",
    };
    return firstEventByMode[speakerMode];
  }
  const repeatedEventByMode: Record<SpeakerMode, string> = {
    supportive: "I'm here with you. Take your time.",
    clarifying: "I'm here.",
    una: "I'm here. Take a moment.",
    mathew: "I'm here.",
    marcus: "I'm here.",
  };
  return repeatedEventByMode[speakerMode];
}

function parseSilenceSignalFromSystemMessage(content: string): LiveSilenceSignal | null {
  if (!content.startsWith('[SILENCE')) return null;

  const durationMatch = content.match(/—\s*(\d+)\s*seconds/i);
  const eventMatch = content.match(/Silence event:\s*(first|second|third|fourth)/i);
  const registerMatch = content.match(/Register:\s*(real|imaginary|symbolic)/i);
  const repeatedExtendedPause = /repeated extended pause/i.test(content);
  const durationSeconds = durationMatch ? Number.parseInt(durationMatch[1], 10) : 0;

  const eventWord = (eventMatch?.[1] || '').toLowerCase();
  const eventCountByWord: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4 };
  const eventCount = eventCountByWord[eventWord] ?? 1;
  const register = (registerMatch?.[1]?.toLowerCase() as LiveSilenceSignal['register']) || 'unknown';

  return {
    durationSeconds,
    eventCount,
    register,
    repeatedExtendedPause,
  };
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
  const cachedProfileBeforeInit = getCachedProfile(callId);

console.log(`🔵 [CUSTOM-LLM] Request: call=${callId} user=${userId} agent=${agentId} firstName=${firstName} turns=${numUserTurns}/${numAssistantTurns}`);

// Step 2: Startup ownership is webhook-owned; custom-llm must not duplicate init side effects
if (!initializedCalls.has(callId)) {
  initializedCalls.add(callId);
  console.log(`[STARTUP SKIP] call=${callId} custom-llm init skipped; webhook already owns startup`);
}

  // Step 3: Assemble full PCA system prompt
  const cachedProfile = getCachedProfile(callId);
  let lastSessionSummary = cachedProfile?.lastSessionSummary ?? null;
  if (
    lastSessionSummary === null &&
    numUserTurns === 0 &&
    userId !== 'unknown'
  ) {
    lastSessionSummary = await fetchLastSessionSummary(userId);
    console.log(
      `🔵 [CUSTOM-LLM] Turn-0 summary fetch: ` +
      `userId=${userId} result=${lastSessionSummary
        ? lastSessionSummary.slice(0, 60)
        : 'NULL'}`
    );
  }
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

  const profileBlockBase = assembleProfileBlock(firstName, cachedProfile, isFirstSession);
  const profileBlock = pcaContext
    ? `${profileBlockBase}\n\n[CLINICAL CONTEXT]\n${pcaContext}`
    : profileBlockBase;
  const currentUtterance = messages.filter(m => m.role === 'user').pop()?.content ?? '';
  const trimmedUtterance = currentUtterance.trim();
  const utteranceWordCount = trimmedUtterance ? trimmedUtterance.split(/\s+/).length : 0;
  const isUltraShortUtterance = trimmedUtterance.length > 0 && (trimmedUtterance.length <= 24 || utteranceWordCount <= 3);
  const shouldTrimPromptForEarlyTurn = numUserTurns <= 2 || isUltraShortUtterance;
  const fullSystemPrompt = assembleSystemPrompt(
    agentId,
    firstName,
    profileBlock,
    isFirstSession,
    lastSessionSummary,
    { trimForEarlyTurn: shouldTrimPromptForEarlyTurn }
  );

  const modifiedMessages = JSON.parse(JSON.stringify(messages));
  let liveSilenceSignal: LiveSilenceSignal | null = null;
  let silenceSpeakerMode: SpeakerMode = 'mathew';
  for (let i = modifiedMessages.length - 1; i >= 0; i--) {
    const msg = modifiedMessages[i];
    if (msg.role !== 'system' || typeof msg.content !== 'string') continue;
    const parsedSilenceSignal = parseSilenceSignalFromSystemMessage(msg.content);
    if (!parsedSilenceSignal) continue;
    if (!liveSilenceSignal) liveSilenceSignal = parsedSilenceSignal;
    modifiedMessages.splice(i, 1);
  }

  // Discard stale silence signal when
  // the user has spoken substantively.
  // Silence messages are injected into
  // VAPI's conversation history and
  // persist in modifiedMessages on
  // subsequent turns. A current utterance
  // longer than 30 chars means the user
  // has already responded — the signal
  // is no longer live.
  if (
    liveSilenceSignal &&
    currentUtterance &&
    currentUtterance.length > 30
  ) {
    liveSilenceSignal = null;
  }

  const systemMessageIdx = modifiedMessages.findIndex((m: any) => m.role === 'system');
  if (systemMessageIdx !== -1) {
    modifiedMessages[systemMessageIdx].content = fullSystemPrompt;
  } else {
    modifiedMessages.unshift({ role: 'system', content: fullSystemPrompt });
    console.warn(`🔵 [CUSTOM-LLM] No system message from VAPI — inserted assembled prompt`);
  }

  if (numUserTurns === 0 && numAssistantTurns === 0 && isFirstSession) {
    modifiedMessages.unshift({
      role: 'system',
      content: '[OPENING TURN]\nFor the first opening line, give one brief present invitation (not a generic shell greeting).',
    });
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

  // Step 4a: Fast sensing cascade (same-turn, heuristic only)
  if (currentUtterance && numUserTurns > 0) {
    try {
      const conversationHistory = modifiedMessages
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .slice(0, -1)
        .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const turnInput = {
        utterance: currentUtterance,
        sessionId,
        callId,
        userId,
        exchangeCount: numUserTurns,
        conversationHistory,
      };

      const metaInstructionTimeout = new Promise<boolean>(
        (resolve) => setTimeout(() => resolve(false), 500)
      );
      const [fastResult, metaInstructionPresent] =
        await Promise.all([
          sensingLayer.processFastUtterance(
            turnInput,
            { skipResonance: isUltraShortUtterance }
          ),
          Promise.race([
            detectMetaInstruction(currentUtterance),
            metaInstructionTimeout,
          ]),
        ]);

      const clientMetaInstruction = metaInstructionPresent === true;

      if (!isUltraShortUtterance) {
        sensingLayer.processUtterance(turnInput).catch(err =>
          console.error(`🔵 [CUSTOM-LLM] Background sensing error:`, err)
        );
      } else {
        console.log(`🔵 [CUSTOM-LLM] Ultra-short fast path: skipped background sensing for call=${callId} turn=${numUserTurns}`);
      }

      // Custom-LLM route injects observational state only; policy/directive interpretation is not injected here.
      const guidanceMessage = formatObservationalSessionPicture(
        fastResult.guidance,
        fastResult.register,
        fastResult.movement,
        fastResult.stateVector,
        numUserTurns,
        callId,
        fastResult.resonance
      );
      const sessionState = getSessionState(callId);
      const metaInstructionKeywords = [
        'literal', 'literally',
        'reject interpretation',
        'resist interpretation',
        'factual accuracy',
        'stick to facts',
        'hidden meaning',
        'no interpretation',
        'no meaning',
        'reject alteration',
        'record of events',
      ];
      const metaInstructionPatterns =
        sessionState?.patternsThisSession?.filter(p =>
          metaInstructionKeywords.some(kw =>
            p.toLowerCase().includes(kw)
          )
        ) ?? [];
      const clientMetaInstruction =
        metaInstructionPatterns.length >= 2;

      const orchestrationDecision = decideUNAOrchestration({
        guidance: fastResult.guidance,
        register: fastResult.register,
        movement: fastResult.movement,
        stateVector: fastResult.stateVector,
        resonance: fastResult.resonance ?? null,
        silence: liveSilenceSignal,
        clientMetaInstruction,
      });
      silenceSpeakerMode = orchestrationDecision.speakerMode;

      // Silence state is interpreted through UNA; it is not injected as a separate policy message.
      const unaOrchestrationBlock = [
        '[UNA ORCHESTRATION]',
        `Mode: ${orchestrationDecision.mode}`,
        `Depth: ${orchestrationDecision.depth}`,
        `Narrative focus: ${orchestrationDecision.narrativeFocus}`,
        `Hypothesis handling: ${orchestrationDecision.hypothesisHandling}`,
        `Pacing: ${orchestrationDecision.pacing}`,
        `Silence focus: ${orchestrationDecision.silenceFocus}`,
        `Response initiation: ${orchestrationDecision.responseInitiation}`,
        `Speaker mode: ${orchestrationDecision.speakerMode}`,
        `Turn type: ${orchestrationDecision.turnType === 'silence_reengagement' ? 'silence re-engagement' : 'normal'}`,
        ...(orchestrationDecision.turnType === 'silence_reengagement'
          ? [
              'Response goal: one sentence only.',
              `The client last said: "${currentUtterance.slice(0, 120)}"`,
              'Respond directly to that content. ' +
              'Do not issue a generic check-in. ' +
              'Do not ask if they are still there.',
            ]
          : []),
        ...(orchestrationDecision.mode === 'hold_frame'
          ? [
              'FRAME HOLD — clinical posture:',
              'The client is issuing a repeated ' +
                'instruction about how the work ' +
                'should proceed. This instruction ' +
                'is itself what is present in the ' +
                'session — it is not a contract ' +
                'to honor.',
              'Hold the analytical position. ' +
                'Acknowledge what the client is ' +
                'saying without accepting their ' +
                'framing of the work.',
              'Do not mirror the client\'s language. ' +
                'Do not use phrases like "a clean ' +
                'record", "just the observation", ' +
                'or "exactly as you reported it". ' +
                'These phrases accept the meta-' +
                'instruction and exit the analytical ' +
                'function.',
              'If the instruction has repeated across ' +
                'turns, the repetition itself is ' +
                'available as observable material — ' +
                'name it without interpreting it: ' +
                '"You\'ve come back to that several ' +
                'times — the need for the record to ' +
                'stay exactly as it is."',
              'Remain present. Remain differentiated. ' +
                'One sentence is sufficient.',
            ]
          : []),
        ...(orchestrationDecision.mode === 'hold_frame'
          ? [
              'FRAME HOLD — clinical posture:',
              'The client is presenting material while ' +
                'simultaneously declaring that it should ' +
                'not be interpreted or given meaning. ' +
                'This is the presenting structure — it ' +
                'is not a contract to honor.',
              'Do not accept the client\'s framing of ' +
                'the work. Do not use the client\'s ' +
                'language to describe what you are doing: ' +
                'phrases like "a clean record", "just ' +
                'the observation", "exactly as you ' +
                'reported it" mirror the defense and ' +
                'exit the analytical function.',
              'Hold the differentiated position. ' +
                'Acknowledge what the client is saying ' +
                'without agreeing to the terms they are ' +
                'setting for the work.',
              'If the foreclosure has repeated across ' +
                'turns, the repetition itself is ' +
                'observable and nameable without ' +
                'interpretation: "You\'ve come back to ' +
                'that several times — the need for it ' +
                'to stay exactly as it is."',
              'Remain present. One sentence is enough.',
            ]
          : []),
      ].join('\n');

      let lastUserIdx = -1;
      for (let i = modifiedMessages.length - 1; i >= 0; i--) {
        if (modifiedMessages[i].role === 'user') { lastUserIdx = i; break; }
      }
      if (lastUserIdx !== -1) {
        // UNA selects response mode/persona here, while runtime remains a single speaking pipeline.
        modifiedMessages.splice(lastUserIdx, 0, { role: 'system', content: guidanceMessage });
        modifiedMessages.splice(lastUserIdx + 1, 0, { role: 'system', content: unaOrchestrationBlock });
      }
      console.log(`🔵 [CUSTOM-LLM] Session picture injected: call=${callId} turns=${numUserTurns} register=${fastResult.register.currentRegister} movement=${fastResult.movement.trajectory}`);
      console.log(
        `[UNA] mode=${orchestrationDecision.mode} depth=${orchestrationDecision.depth} narrativeFocus=${orchestrationDecision.narrativeFocus} hypothesisHandling=${orchestrationDecision.hypothesisHandling} pacing=${orchestrationDecision.pacing} silenceFocus=${orchestrationDecision.silenceFocus} responseInitiation=${orchestrationDecision.responseInitiation} speakerMode=${orchestrationDecision.speakerMode} turnType=${orchestrationDecision.turnType}`
      );
      console.log(`🔵 [CUSTOM-LLM] UNA orchestration: call=${callId} mode=${orchestrationDecision.mode} depth=${orchestrationDecision.depth} narrative=${orchestrationDecision.narrativeFocus} hypothesis=${orchestrationDecision.hypothesisHandling} pacing=${orchestrationDecision.pacing} reason=${orchestrationDecision.reason}`);
    } catch (err) {
      console.error(`🔵 [CUSTOM-LLM] Fast guidance error (non-fatal):`, err);
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
    let sentContent = '';

    for await (const chunk of completion) {
      if (!firstChunkId) firstChunkId = chunk.id;
      lastChunkId = chunk.id;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (!delta) continue;

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
          sentContent += toSend;
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
        sentContent += toSend;
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
      sentContent += pendingBuffer;
      console.warn(`🔵 [CUSTOM-LLM] No footer in response for call=${callId} turn=${numUserTurns}`);
    }

    const sentTrimmedLength = sentContent.trim().length;
    if (liveSilenceSignal && sentTrimmedLength === 0) {
      const fallbackText = getSilenceFallbackText(silenceSpeakerMode, liveSilenceSignal, currentUtterance || undefined);
      res.write(
        `data: ${JSON.stringify({
          id: firstChunkId || 'resp',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: fallbackText }, finish_reason: null }],
        })}\n\n`
      );
      totalSentLength += fallbackText.length;
      sentContent += fallbackText;
      console.log(
        `[SILENCE FALLBACK] call=${callId} speakerMode=${silenceSpeakerMode} text="${fallbackText}"`
      );
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
    streamingCallIds.delete(callId);
  }
});

export default router;
