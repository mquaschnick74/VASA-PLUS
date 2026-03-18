import { useState, useEffect, useCallback, useRef } from 'react';
import { TherapeuticAgent, FIRST_SESSION_INTRODUCTION } from '../config/agent-configs';
import { getApiUrl, getAbsoluteUrl, isNativeApp } from '@/lib/platform';

interface OnboardingData {
  voice: string;
  journey: string;
  completedAt: string;
  wasSkipped: boolean;
}

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface SpeechUpdateMessage {
  status: 'started' | 'stopped';
  role: 'assistant' | 'user';
}

interface UseVapiProps {
  userId: string;
  memoryContext: string;
  lastSessionSummary?: string | null;
  shouldReferenceLastSession?: boolean;
  hasUnaddressedUpload?: boolean;
  uploadAddressed?: boolean;
  uploadContext?: string | null;
  uploadId?: string | null;
  firstName: string;
  selectedAgent: TherapeuticAgent;
  sessionDurationLimit?: number;
  onboarding?: OnboardingData | null;
}

interface UseVapiReturn {
  isSessionActive: boolean;
  isLoading: boolean;
  startSession: () => void;
  endSession: () => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  onTranscript: (callback: (message: TranscriptMessage) => void) => void;
  onSpeechUpdate: (callback: (message: SpeechUpdateMessage) => void) => void;
  speakingRole: 'user' | 'assistant' | null;
  isAgentThinking: boolean;
  isAgentSpeakingActive: boolean;
  error: string | null;
  clearError: () => void;
}

// How long to wait after the last final transcript from a speaker before
// firing the callback. Deepgram may send multiple consecutive 'final'
// transcripts for a single thought if the speaker pauses mid-sentence
// (endpointing: 500ms means a 600ms pause triggers a premature final).
// 1200ms accumulates those fragments into one complete message.

const useVapi = ({
  userId,
  memoryContext,
  lastSessionSummary,
  shouldReferenceLastSession,
  hasUnaddressedUpload,
  uploadAddressed,
  uploadContext,
  uploadId,
  firstName,
  selectedAgent,
  sessionDurationLimit = 7200,
  onboarding = null
}: UseVapiProps): UseVapiReturn => {
  const [vapi, setVapi] = useState<any>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [speakingRole, setSpeakingRole] = useState<'user' | 'assistant' | null>(null);
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [isAgentSpeakingActive, setIsAgentSpeakingActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vapiRef = useRef<any>(null);
  const transcriptCallbackRef = useRef<((message: TranscriptMessage) => void) | null>(null);
  const speechUpdateCallbackRef = useRef<((message: SpeechUpdateMessage) => void) | null>(null);
  const sessionActiveRef = useRef(false);

  // Per-role pending transcript accumulation.
  // Each entry holds the accumulated text and the active debounce timer.
  // When a final transcript arrives, the timer resets and content appends.
  // When the timer fires, the full accumulated message is sent to the callback.
  // Accumulates transcript fragments per role.
  // Flushed when speech-update:stopped fires for that role —
  // that event definitively marks end-of-turn for both user and assistant.
  // Index of the last conversation turn we've fired to the transcript callback.
  // A turn is only fired once the next turn from the other role appears in
  // conversation-update — that's the only reliable signal of a complete turn.
  const lastFiredIndexRef = useRef<number>(-1);

  useEffect(() => {
    const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;

    if (!publicKey) {
      console.error('VAPI public key not found');
      setError('VAPI is not configured. Please contact support or check your environment variables.');
      setConnectionStatus('disconnected');
      return;
    }

    const initializeVapi = async () => {
      try {
        const { default: Vapi } = await import('@vapi-ai/web');
        const vapiInstance = new Vapi(publicKey);
        vapiRef.current = vapiInstance;
        setVapi(vapiInstance);

        vapiInstance.on('call-start', () => {
          console.log('✅ Call started');
          sessionActiveRef.current = true;
          setIsSessionActive(true);
          setConnectionStatus('connected');
          setIsLoading(false);
          setIsAgentSpeakingActive(false);
          setIsAgentThinking(false);
        });

        vapiInstance.on('call-end', () => {
          console.log('📴 Call ended');
          lastFiredIndexRef.current = -1;
          sessionActiveRef.current = false;
          setIsSessionActive(false);
          setConnectionStatus('disconnected');
          setSpeakingRole(null);
          setIsAgentSpeakingActive(false);
          setIsAgentThinking(false);
        });

        vapiInstance.on('speech-start', () => {
          console.log('🎤 User started speaking');
          setSpeakingRole('user');
          setIsAgentSpeakingActive(false);
        });

        vapiInstance.on('speech-end', () => {
          console.log('🎤 User stopped speaking');
          setSpeakingRole(null);
          setIsAgentThinking(true);
        });

        vapiInstance.on('error', (error: any) => {
          console.error('🔴 VAPI ERROR EVENT:', error);
          console.error('🔍 Error type:', typeof error);
          console.error('🔍 Error keys:', Object.keys(error || {}));
          console.error('🔍 Error message paths:', {
            'error.error.message': error?.error?.message,
            'error.message': error?.message,
            'error.error': error?.error,
            'error.toString()': error?.toString?.()
          });

          let errorMessage = '';

          if (error?.error?.message) {
            errorMessage = error.error.message;
          } else if (error?.message) {
            errorMessage = error.message;
          } else if (typeof error === 'string') {
            errorMessage = error;
          } else if (error?.statusCode) {
            errorMessage = `VAPI returned status code ${error.statusCode}`;
          }

          const wasSessionActive = sessionActiveRef.current;
          const lowerMsg = errorMessage.toLowerCase();
          const isSilenceOrInactivity = lowerMsg.includes('silence') ||
            lowerMsg.includes('inactive') ||
            lowerMsg.includes('not active') ||
            lowerMsg.includes('timeout');

          if (wasSessionActive && (!errorMessage || isSilenceOrInactivity)) {
            console.log('📴 Session ended (likely silence timeout or inactivity)');
            setError('Your session ended due to inactivity. Click "Start Voice Session" to reconnect.');
          } else if (!errorMessage) {
            setError('VAPI Error: An unknown error occurred. Please try again.');
          } else {
            if (lowerMsg.includes('api key') || lowerMsg.includes('unauthorized')) {
              errorMessage += ' - Check your VAPI_PUBLIC_KEY or OpenAI API key';
            } else if (lowerMsg.includes('timeout')) {
              errorMessage += ' - The connection timed out. Check your internet connection';
            } else if (lowerMsg.includes('voice')) {
              errorMessage += ' - Voice provider error. Check ElevenLabs or voice configuration';
            }
            setError(`VAPI Error: ${errorMessage}`);
          }

          sessionActiveRef.current = false;
          setIsLoading(false);
          setConnectionStatus('disconnected');
          setIsSessionActive(false);
        });

        // Single message handler — handles transcript accumulation and speech updates
        vapiInstance.on('message', (message: any) => {
          console.log('📨 VAPI message:', message);

          // conversation-update contains the full conversation array.
          // A turn is complete when the next message from the other role exists.
          // Fire the callback for each newly completed turn in order.
          if (message.type === 'conversation-update' && Array.isArray(message.conversation)) {
            const conversation = message.conversation as Array<{ role: string; content: string }>;

            for (let i = lastFiredIndexRef.current + 1; i < conversation.length - 1; i++) {
              const turn = conversation[i];
              const next = conversation[i + 1];

              // Turn is complete when the role changes (other party has started)
              if (turn.role !== next.role) {
                const role: 'user' | 'assistant' = turn.role === 'assistant' ? 'assistant' : 'user';
                const content = String(turn.content || '').trim();

                // Filter out injected system content that leaks into conversation array:
                // 1. System prompt (contains greeting instruction block)
                // 2. Silence monitor injections
                // 3. Sensing layer session picture injections
                const isSystemPrompt = content.includes('GREETING GENERATION INSTRUCTION');
                const isSilenceInject = content.startsWith('[SILENCE —');
                const isSessionPicture = content.startsWith('[SESSION PICTURE]') || content.startsWith('[SENSING]') || content.startsWith('POSTURE:') || content.startsWith('SESSION STATE:');

                if (content && !isSystemPrompt && !isSilenceInject && !isSessionPicture && transcriptCallbackRef.current) {
                  transcriptCallbackRef.current({ role, content, timestamp: new Date() });
                }

                // Drive thinking indicator from completed turns:
                // user turn complete → agent is now processing → thinking = true
                // assistant turn complete → agent responded → thinking = false

                lastFiredIndexRef.current = i;
              }
            }
          }

          // speech-update drives speakingRole state only — no transcript flushing
          if (message.type === 'speech-update') {
            const role: 'assistant' | 'user' = message.role === 'assistant' ? 'assistant' : 'user';
            if (message.status === 'started') {
              setSpeakingRole(role);
              if (role === 'assistant') {
                setIsAgentSpeakingActive(true);
                setIsAgentThinking(false);
              }
            } else if (message.status === 'stopped') {
              setSpeakingRole(null);
              // Do NOT clear isAgentSpeakingActive here — VAPI fires multiple
              // started/stopped pairs within a single agent response. The latch
              // only clears when the user's mic activates or the call ends.
            }
            const speechUpdateMessage: SpeechUpdateMessage = {
              status: message.status,
              role,
            };
            if (speechUpdateCallbackRef.current) {
              speechUpdateCallbackRef.current(speechUpdateMessage);
            }
          }
        });
      } catch (error) {
        console.error('Failed to initialize VAPI:', error);
        setError('Failed to initialize voice assistant. Please refresh the page and try again.');
        setConnectionStatus('disconnected');
      }
    };

    initializeVapi();

    return () => {
        if (vapiRef.current) {
          vapiRef.current.stop();
        }
      };
    }, []);

  const startSession = useCallback(async () => {
    if (!vapi || isLoading || !selectedAgent) {
      if (!vapi) {
        setError('Voice assistant is not initialized. Please refresh the page.');
      }
      return;
    }

    setError(null);
    setIsLoading(true);
    setConnectionStatus('connecting');

    try {
      if (isNativeApp) {
        console.log('🔊 [iOS] Unlocking audio context for WebView...');
        try {
          const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContext) {
            const audioContext = new AudioContext();
            const buffer = audioContext.createBuffer(1, 1, 22050);
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);
            source.start(0);
            if (audioContext.state === 'suspended') {
              audioContext.resume().catch(() => {});
            }
            console.log('🔊 [iOS] Audio context unlocked successfully');
          }
        } catch (audioError) {
          console.warn('🔊 [iOS] Audio unlock warning (non-fatal):', audioError);
        }
      }

      const hasMemory = memoryContext && memoryContext.length > 50;

      let systemPrompt = selectedAgent.systemPrompt;

      systemPrompt = `GREETING GENERATION INSTRUCTION:
Your first message should be a warm, brief greeting. Follow these rules strictly:

IF this is the FIRST session: Introduce yourself naturally. Do NOT reference past sessions.
IF there are previous sessions: Pick ONE specific thread from the context below — the one that feels most alive or unfinished — and reference it briefly. Do NOT summarize multiple topics. Do NOT try to cover everything. One thread, one sentence about it, then invite them in.

CRITICAL GREETING RULES:
- Your greeting should be 2-3 sentences MAX (one greeting, one specific reference, one invitation)
- Do NOT list multiple topics from previous sessions
- Do NOT reference uploads AND session history AND patterns in the same greeting
- Do NOT front-load clinical observations — save those for after the user responds
- NEVER invent or hallucinate previous conversations
- If you see multiple context blocks below, pick the MOST RECENT and MOST SPECIFIC one only

GOOD EXAMPLE: "Hey Matthew. Last time we were getting into that thing about needing to breathe — not physically, but like needing room. What's present for you today?"

BAD EXAMPLE: "Hey Matthew. I'm holding that thread about organizing and tracking, and you being clear it's not about preventing anything, and needing to breathe, and the coffee and carbs and alcohol monitoring..." (This is a data dump, not a greeting.)

VOICE SESSION MODE:
This is a voice conversation through VAPI.
DO NOT include <speak>, </speak>, <meta>, or </meta> tags.
DO NOT output any JSON or metadata.
Just respond naturally with your therapeutic conversation.

` + systemPrompt;

      const hasOnboarding = onboarding && !onboarding.wasSkipped;
      const hasOnboardingContent = hasOnboarding && (
        (onboarding.voice && onboarding.voice.trim().length > 0) ||
        (onboarding.journey && onboarding.journey.trim().length > 0)
      );

      if (hasOnboardingContent) {
        let onboardingContext = "\n\n===== IMPORTANT: USER'S INITIAL CONTEXT =====\n\n";
        if (onboarding.voice && onboarding.voice.trim().length > 0) {
          onboardingContext += `What they want to discuss (Your Voice):\n"${onboarding.voice}"\n\n`;
        }
        if (onboarding.journey && onboarding.journey.trim().length > 0) {
          onboardingContext += `Their journey and experiences (Your Journey):\n"${onboarding.journey}"\n\n`;
        }
        onboardingContext += `INSTRUCTIONS:
- Reference this context naturally in your introduction
- Use specific details they mentioned to personalize the conversation
- Don't simply repeat what they wrote; engage thoughtfully with their input
- Show that you truly heard and understood what they shared
===== END USER CONTEXT =====\n`;
        systemPrompt += onboardingContext;
      } else if (hasOnboarding && (!onboarding.voice?.trim() && !onboarding.journey?.trim())) {
        systemPrompt += "\n\nNote: The user chose not to provide initial context. Start with open-ended, welcoming exploration.\n";
      }

      if (shouldReferenceLastSession && lastSessionSummary) {
        systemPrompt += `\n\n===== LAST SESSION CONTEXT =====
${lastSessionSummary}

FOR YOUR GREETING: Pick ONE thread from this context — the most unfinished or emotionally alive one. Do NOT summarize the whole session. After the greeting, build naturally from the user's response.
===== END LAST SESSION =====\n`;
      }

      if (uploadContext && (hasUnaddressedUpload || uploadAddressed)) {
        systemPrompt += `\n\n===== CONTENT THE USER SHARED FOR DISCUSSION =====
${uploadContext}
===== END SHARED CONTENT =====\n`;

        if (hasUnaddressedUpload) {
          systemPrompt += `
===== UPLOAD ENGAGEMENT INSTRUCTIONS =====
The user uploaded this content and chose to have it analyzed. It is ONE possible thread for your greeting — potentially the most relevant one if it is recent and unaddressed.

YOUR GREETING: Follow the GREETING GENERATION INSTRUCTION above. The upload is a strong candidate for the ONE thread you pick, but only if it feels more alive than other available context. Do NOT dump the analysis. If you reference the upload, pick ONE specific detail — a quote, a tension, a concept — and weave it into a natural 2-3 sentence greeting. Then wait for their response before going deeper.

GOOD EXAMPLE: "Hey Matthew. That line you wrote — 'I need to breathe' — it stayed with me. What's that about for you right now?"
BAD EXAMPLE: "Hey Matthew. I read your upload about needing to breathe, coffee and alcohol intake, and having a strong direction forward. Let's explore the tension between your self-awareness and self-sabotaging behaviors."

YOUR STANCE DURING THE SESSION: Engage with the content on its own terms. If it is theoretical writing, engage with the arguments, concepts, and structure of reasoning. If it is personal writing, engage with the emotional texture and what it reveals. If it is a practical document like a script or plan, engage with the intentions, dynamics, and underlying needs at work. Let the nature of the document guide your language — never call text passages "images" or use language that misrepresents the form of what the user shared.

WHEN THE USER WANTS TO DISCUSS THE UPLOAD: You have both the clinical analysis AND the full document text above. Use specific passages, arguments, and concepts from their actual writing. Reference concrete elements — quote their exact words, engage their specific formulations, discuss the structure of their reasoning. Do NOT fabricate or infer content that is not present in the document text above. If the user asks about something you cannot find in the provided text, say so honestly rather than improvising.
===== END UPLOAD INSTRUCTIONS =====\n`;
          console.log('📤 [VAPI] Unaddressed upload detected - adding proactive engagement context');
        } else {
          systemPrompt += `
===== PREVIOUSLY SHARED CONTENT — AVAILABLE FOR DISCUSSION =====
This content was previously discussed in an earlier session but remains fully available. Do NOT proactively bring it up in your greeting. However, if the user references this material, asks about it, or wants to revisit it:
- Engage substantively using BOTH the clinical analysis AND the full document text above
- Reference specific passages, arguments, concepts, and quotes from their actual writing
- Do NOT deflect with "what would you like to discuss?" — you have the full content, use it
- Engage with the content on its own terms — match your language to the nature of the document
- Do NOT fabricate or infer content that is not in the document text above. If you cannot find what the user is asking about, say so honestly
===== END PREVIOUSLY SHARED CONTENT INSTRUCTIONS =====\n`;
          console.log('📤 [VAPI] Addressed upload available for revisit - adding to context');
        }
      }

      if (hasMemory) {
        systemPrompt += `\n\n===== PREVIOUS SESSION HISTORY =====
${memoryContext}
===== END HISTORY =====

This history is for YOUR reference during the conversation. Do NOT try to reference it all in your greeting. If LAST SESSION CONTEXT is also present above, use that for your greeting instead — it is more recent and specific. Do not make up or hallucinate any details not explicitly mentioned above.`;
      } else if (!lastSessionSummary) {
        const firstSessionIntro = FIRST_SESSION_INTRODUCTION.replace(/\{firstName\}/g, firstName);
        systemPrompt += `\n\n${firstSessionIntro}`;
        console.log('🎬 [VAPI] First session detected - injecting introduction script');
      }

      systemPrompt += `\n\nMID-CALL CONTEXT TOOL:
When the user asks for more background, prior sessions, more context, says "do you remember", or you need specifics to answer, call fetch_more_context with userId "${userId}" and a short query.
Do NOT call the tool unless you actually need more context beyond what is already in this prompt.`;

      systemPrompt += `\n\nThe user's name is ${firstName}. Use their name naturally but not excessively.`;

      const basePromptLen = selectedAgent.systemPrompt.length;
      const greetingInstructionsLen = systemPrompt.indexOf(selectedAgent.systemPrompt) > 0
        ? systemPrompt.indexOf(selectedAgent.systemPrompt)
        : 250;
      const onboardingLen = hasOnboardingContent
        ? (onboarding?.voice?.length || 0) + (onboarding?.journey?.length || 0) + 300
        : 0;
      const lastSessionLen = (shouldReferenceLastSession && lastSessionSummary)
        ? lastSessionSummary.length + 150
        : 0;
      const memoryLen = (memoryContext && memoryContext.length > 50)
        ? memoryContext.length + 150
        : 0;
      const totalPromptLen = systemPrompt.length;
      const estimatedTokens = Math.ceil(totalPromptLen / 4);

      console.log('\n📊 ===== VAPI SYSTEM PROMPT SIZE AUDIT =====');
      console.log(`📏 Base agent prompt:       ${basePromptLen} chars (~${Math.ceil(basePromptLen / 4)} tokens)`);
      console.log(`📏 Greeting instructions:   ~${greetingInstructionsLen} chars (~${Math.ceil(greetingInstructionsLen / 4)} tokens)`);
      console.log(`📏 Onboarding context:      ${onboardingLen} chars (~${Math.ceil(onboardingLen / 4)} tokens)`);
      console.log(`📏 Last session summary:    ${lastSessionLen} chars (~${Math.ceil(lastSessionLen / 4)} tokens)`);
      console.log(`📏 Memory context:          ${memoryLen} chars (~${Math.ceil(memoryLen / 4)} tokens)`);
      console.log(`📏 TOTAL systemPrompt:      ${totalPromptLen} chars (~${estimatedTokens} tokens)`);
      console.log('===== END PROMPT SIZE AUDIT =====\n');

      const serverUrl = getAbsoluteUrl('/api/vapi/webhook');
      const toolsUrl = getAbsoluteUrl('/api/vapi/tools');

      console.log('');
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║ VAPI SESSION CONFIGURATION                                    ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log('📍 Webhook URL:', serverUrl);
      console.log('   ├─ Is Native App:', isNativeApp);
      console.log('   └─ Using getAbsoluteUrl() for proper HTTPS URL');
      console.log('👤 User ID:', userId);
      console.log('🤖 Agent:', selectedAgent.name);
      console.log('📝 Session continuity:', shouldReferenceLastSession ? 'Enabled' : 'Disabled');
      console.log('════════════════════════════════════════════════════════════════');
      console.log('');

      const assistantConfig = {
        name: `VASA-${selectedAgent.name}`,
        ...(selectedAgent.name.toLowerCase() === 'mathew' && { interruptionsEnabled: true }),
        model: {
          provider: 'custom-llm',
          url: getAbsoluteUrl('/api/custom-llm'),
          model: selectedAgent.model.model,
          temperature: selectedAgent.model.temperature,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            }
          ],
          maxTokens: 300,
          tools: [
            {
              type: 'function' as const,
              function: {
                name: 'fetch_more_context',
                description: 'Fetch additional context from the user\'s session history, memory, and knowledge base. Use when the user asks about prior sessions, wants more background, or you need specifics to answer.',
                parameters: {
                  type: 'object',
                  properties: {
                    userId: { type: 'string', description: 'The user\'s ID' },
                    query: { type: 'string', description: 'A short search query describing what context is needed' },
                    limit: { type: 'number', description: 'Max knowledge chunks to return (default 5)' },
                    types: { type: 'array', items: { type: 'string' }, description: 'Knowledge types: theory, example, technique, guideline' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Tags to filter knowledge chunks' }
                  },
                  required: ['userId', 'query']
                }
              },
              server: {
                url: toolsUrl,
                timeoutSeconds: 10
              }
            }
          ]
        },
        voice: selectedAgent.voice.provider === '11labs'
          ? {
              provider: selectedAgent.voice.provider,
              voiceId: selectedAgent.voice.voiceId,
              model: selectedAgent.voice.model || 'eleven_flash_v2_5',
              stability: selectedAgent.voice.stability || 0.7,
              similarityBoost: selectedAgent.voice.similarityBoost || 0.75,
              speed: selectedAgent.voice.speed || 1.0,
              useSpeakerBoost: selectedAgent.voice.useSpeakerBoost ?? false
            }
          : {
              provider: selectedAgent.voice.provider,
              voiceId: selectedAgent.voice.voiceId,
              model: selectedAgent.voice.model || 'sonic-3',
              ...(selectedAgent.voice.generationConfig && {
                generationConfig: selectedAgent.voice.generationConfig
              })
            },
        startSpeakingPlan: {
          waitSeconds: 0.6,
          customEndpointingRules: [
            {
              type: 'assistant' as const,
              regex: '(feel|body|inside you|imagine|what happens|remind you|what.?s that about|where do you notice|what comes up|what shifted|say more about|sit with)',
              timeoutSeconds: 8.0
            },
            {
              type: 'customer' as const,
              regex: '(,\\s*$|\\.{2,}\\s*$|—\\s*$|-\\s*$)',
              timeoutSeconds: 6.0
            }
          ]
        },
        stopSpeakingPlan: {
          numWords: 5,
          voiceSeconds: 0.5,
          backoffSeconds: 2
        },
        serverUrl: serverUrl,
        serverMessages: [
          "assistant.started",
          "conversation-update",
          "end-of-call-report",
          "status-update",
          "speech-update",
          "transcript"
        ],
        clientMessages: [
          "transcript",
          "speech-update",
          "status-update",
          "conversation-update"
        ],
        server: {
          url: serverUrl,
          timeoutSeconds: 20,
          secret: import.meta.env.VITE_VAPI_SERVER_SECRET || undefined
        },
        firstMessage: null,
        firstMessageMode: "assistant-speaks-first-with-model-generated-message",
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en-US',
          smartFormat: true,
          endpointing: 500
        },
        recordingEnabled: true,
        backgroundSpeechDenoisingPlan: {
          smartDenoisingPlan: {
            enabled: true
          }
        },
        maxDurationSeconds: sessionDurationLimit,
        silenceTimeoutSeconds: 300,
        metadata: {
          userId: userId,
          agentName: selectedAgent.name,
          agentId: selectedAgent.id,
          firstName: firstName,
          hasSessionContinuity: shouldReferenceLastSession || false,
          uploadId: uploadId || null,
          timestamp: Date.now()
        }
      };

      console.log('🔍 VAPI START - Config Details:', {
        maxDurationSeconds: assistantConfig.maxDurationSeconds,
        sessionDurationLimit: sessionDurationLimit,
        name: assistantConfig.name,
        hasMaxDuration: 'maxDurationSeconds' in assistantConfig
      });

      console.log('🔍 FULL ASSISTANT CONFIG:', JSON.stringify(assistantConfig, null, 2));

      console.log('⚠️ Configuration checks:');
      console.log('  - VAPI Public Key:', import.meta.env.VITE_VAPI_PUBLIC_KEY ? '✅ Set' : '❌ Missing');
      console.log('  - Webhook URL:', serverUrl);
      console.log('  - First Message Mode:', assistantConfig.firstMessageMode);
      console.log('  - Model:', assistantConfig.model.model);

      try {
        console.log('🚀 Calling vapi.start()...');
        await vapi.start(assistantConfig);
        console.log('✅ vapi.start() completed successfully');
        setIsSessionActive(true);
        setConnectionStatus('connected');
        setIsLoading(false);
      } catch (error: any) {
        console.error('❌ VAPI start failed:', error);
        const errorMsg = error?.message || error?.error?.message || 'Failed to start voice session';
        setError(`Unable to start session: ${errorMsg}. Please check your microphone permissions and try again.`);
        throw error;
      }

    } catch (error: any) {
      console.error('Failed to start VAPI session:', error);
      const errorMsg = error?.message || error?.error?.message || 'Unknown error';
      setError(`Session failed to start: ${errorMsg}`);
      setIsLoading(false);
      setConnectionStatus('disconnected');
      setIsSessionActive(false);
    }
  }, [vapi, userId, memoryContext, lastSessionSummary, shouldReferenceLastSession, hasUnaddressedUpload, uploadAddressed, uploadContext, uploadId, firstName, isLoading, isSessionActive, selectedAgent, onboarding, sessionDurationLimit]);

  const endSession = useCallback(() => {
    if (vapi && isSessionActive) {
      vapi.stop();
      setIsSessionActive(false);
      setConnectionStatus('disconnected');
    }
  }, [vapi, isSessionActive]);

  const onTranscript = useCallback((callback: (message: TranscriptMessage) => void) => {
    transcriptCallbackRef.current = callback;
  }, []);

  const onSpeechUpdate = useCallback((callback: (message: SpeechUpdateMessage) => void) => {
    speechUpdateCallbackRef.current = callback;
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isSessionActive,
    isLoading,
    startSession,
    endSession,
    connectionStatus,
    onTranscript,
    onSpeechUpdate,
    speakingRole,
    isAgentThinking,
    isAgentSpeakingActive,
    error,
    clearError
  };
};

export default useVapi;