import { useState, useEffect, useCallback, useRef } from 'react';
import { TherapeuticAgent } from '../config/agent-configs';

interface OnboardingData {
  voice: string;
  journey: string;
  completedAt: string;
  wasSkipped: boolean;
}

interface UseVapiProps {
  userId: string;
  memoryContext: string;
  lastSessionSummary?: string | null;  // ADD: Session continuity
  shouldReferenceLastSession?: boolean; // ADD: Session continuity
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
  error: string | null;
  clearError: () => void;
}

const useVapi = ({
  userId,
  memoryContext,
  lastSessionSummary,
  shouldReferenceLastSession,
  firstName,
  selectedAgent,
  sessionDurationLimit = 7200,
  onboarding = null
}: UseVapiProps): UseVapiReturn => {
  const [vapi, setVapi] = useState<any>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const vapiRef = useRef<any>(null);

  useEffect(() => {
    const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;

    if (!publicKey) {
      console.error('VAPI public key not found');
      setError('VAPI is not configured. Please contact support or check your environment variables.');
      setConnectionStatus('disconnected');
      return;
    }

    // Dynamically import VAPI when needed
    const initializeVapi = async () => {
      try {
        const { default: Vapi } = await import('@vapi-ai/web');
        const vapiInstance = new Vapi(publicKey);
        vapiRef.current = vapiInstance;
        setVapi(vapiInstance);

        // Set up event listeners
        vapiInstance.on('call-start', () => {
          console.log('✅ Call started');
          setIsSessionActive(true);
          setConnectionStatus('connected');
          setIsLoading(false);
        });

        vapiInstance.on('call-end', (endData: any) => {
          console.log('📴 Call ended');
          console.log('📊 Call end data:', endData);

          // If call ended too quickly, it might be an error
          setIsSessionActive(false);
          setConnectionStatus('disconnected');
        });

        // Add more event listeners for debugging
        vapiInstance.on('speech-start', () => {
          console.log('🎤 User started speaking');
        });

        vapiInstance.on('speech-end', () => {
          console.log('🎤 User stopped speaking');
        });

        vapiInstance.on('message', (message: any) => {
          console.log('📨 VAPI message:', message);
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

          // Try to extract the most useful error message
          let errorMessage = 'An unknown error occurred with VAPI';

          if (error?.error?.message) {
            errorMessage = error.error.message;
          } else if (error?.message) {
            errorMessage = error.message;
          } else if (typeof error === 'string') {
            errorMessage = error;
          } else if (error?.statusCode) {
            errorMessage = `VAPI returned status code ${error.statusCode}`;
          }

          // Add helpful context based on common errors
          if (errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('unauthorized')) {
            errorMessage += ' - Check your VAPI_PUBLIC_KEY or OpenAI API key';
          } else if (errorMessage.toLowerCase().includes('timeout')) {
            errorMessage += ' - The connection timed out. Check your internet connection';
          } else if (errorMessage.toLowerCase().includes('voice')) {
            errorMessage += ' - Voice provider error. Check ElevenLabs or voice configuration';
          }

          setError(`VAPI Error: ${errorMessage}`);
          setIsLoading(false);
          setConnectionStatus('disconnected');
          setIsSessionActive(false);
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

    setError(null); // Clear any previous errors
    setIsLoading(true);
    setConnectionStatus('connecting');

    try {
      // Build system prompt with agent-specific configuration
      const hasMemory = memoryContext && memoryContext.length > 50;

      let systemPrompt = selectedAgent.systemPrompt;

      // CHANGE 1: Add greeting generation instructions
      systemPrompt = `GREETING GENERATION INSTRUCTION:
Your first message should be a warm greeting that:
1. IF there are previous sessions: Reference specific details from the context
2. IF this is the first session: Introduce yourself naturally without referencing past sessions
3. NEVER invent or hallucinate previous conversations
4. Uses the user's actual words when available (if any exist)
5. Feels natural and conversational

VOICE SESSION MODE:
This is a voice conversation through VAPI.
DO NOT include <speak>, </speak>, <meta>, or </meta> tags.
DO NOT output any JSON or metadata.
Just respond naturally with your therapeutic conversation.

` + systemPrompt;

      // INJECT ONBOARDING CONTEXT - Only if exists and not skipped
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
        // User submitted blank onboarding
        systemPrompt += "\n\nNote: The user chose not to provide initial context. Start with open-ended, welcoming exploration.\n";
      }

      // ENHANCED: Add session continuity context if available
      if (shouldReferenceLastSession && lastSessionSummary) {
        systemPrompt += `\n\n===== LAST SESSION CONTEXT =====
${lastSessionSummary}

IMPORTANT: You've already referenced this in your greeting. Build naturally from there.
Continue the therapeutic narrative without re-introducing the previous session.
===== END LAST SESSION =====\n`;
      }

      // Add regular memory context if available
      if (hasMemory) {
        systemPrompt += `\n\n===== PREVIOUS SESSION HISTORY =====
${memoryContext}
===== END HISTORY =====

IMPORTANT: Reference the above context naturally in conversation when relevant.
Do not make up or hallucinate any details not explicitly mentioned above.`;
      } else if (!lastSessionSummary) {
        // Only add this if we don't have a last session summary
        systemPrompt += '\n\nThis is your first session with this user. Get to know them gently.';
      }

      systemPrompt += `\n\nThe user's name is ${firstName}. Use their name naturally but not excessively.`;

      // CHANGE 2: REMOVED the firstMessageTemplate call - no more hardcoded greetings

      // Get the current server URL for webhook configuration
      // Use environment variable if available, otherwise fall back to window.location.origin
      const baseUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
      const serverUrl = `${baseUrl}/api/vapi/webhook`;

      console.log('');
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║ VAPI SESSION CONFIGURATION                                    ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log('📍 Webhook URL:', serverUrl);
      console.log('   ├─ Base URL:', baseUrl);
      console.log('   ├─ From Env Var:', !!import.meta.env.VITE_SERVER_URL);
      console.log('   └─ Full Path:', `${baseUrl}/api/vapi/webhook`);
      console.log('👤 User ID:', userId);
      console.log('🤖 Agent:', selectedAgent.name);
      console.log('📝 Session continuity:', shouldReferenceLastSession ? 'Enabled' : 'Disabled');
      console.log('════════════════════════════════════════════════════════════════');
      console.log('');

      // VAPI configuration with dynamic agent settings
      // Session duration is controlled by maxDurationSeconds property
      // - Individual users: 2 hours (7200 seconds) by default
      // - Therapist clients: Custom duration set by therapist per client
      // - All users: Also limited by subscription minutes remaining
      const assistantConfig = {
        name: `VASA-${selectedAgent.name}`,
        model: {
          provider: 'openai',
          model: selectedAgent.model.model,
          temperature: selectedAgent.model.temperature,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            }
          ],
          maxTokens: 200
        },
        voice: {
          provider: selectedAgent.voice.provider,
          voiceId: selectedAgent.voice.voiceId,
          stability: selectedAgent.voice.stability || 0.5,
          similarityBoost: 0.75,
          speed: selectedAgent.voice.speed || 1.0
        },
        // 🎯 NEW: Therapeutic Speech Configuration
        // These settings make VASA more patient and harder to interrupt accidentally
        startSpeakingPlan: {
          waitSeconds: 1.2,  // Wait 1.2s after user stops (vs 0.4s default)
          smartEndpointingEnabled: true,  // Enable AI detection of incomplete thoughts
          // Use LiveKit for sophisticated English conversation analysis
          smartEndpointingPlan: {
            provider: 'livekit'
            // Uses default waitFunction: 200 + 8000 * x
            // Where x = probability user is still speaking (0=done, 1=speaking)
          },
          // Fine-tune waiting based on what user said
          transcriptionEndpointingPlan: {
            onNumberSeconds: 1.0,          // Wait 1.0s after numbers (addresses, dates, etc.)
            onPunctuationSeconds: 0.5,     // Wait 0.5s after punctuation
            onNoPunctuationSeconds: 2.5    // Wait 2.5s when trailing off without punctuation
          }
        },
        // Make user harder to interrupt - requires deliberate speech
        stopSpeakingPlan: {
          numWords: 3,         // Requires 3 words to interrupt (vs 1 word default)
          voiceSeconds: 0.5,   // Requires 0.5s of voice activity (vs 0.2s default)
          backoffSeconds: 1.5  // After interruption, wait 1.5s before VASA can resume
        },
        serverUrl: serverUrl,
        serverMessages: [
          "conversation-update",
          "end-of-call-report",
          "status-update", 
          "speech-update",
          "transcript"
        ],
        server: {
          url: serverUrl,
          timeoutSeconds: 20,  // This is for webhook timeout, not call duration
          secret: import.meta.env.VITE_VAPI_SERVER_SECRET || undefined
        },
        firstMessage: null,  // MUST be null, not undefined or omitted
        firstMessageMode: "assistant-speaks-first-with-model-generated-message",
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en'
        },
        recordingEnabled: true,
        maxDurationSeconds: sessionDurationLimit,  // ← ADD THIS LINE (Vapi will enforce this limit)
        metadata: {
          userId: userId,
          agentName: selectedAgent.name,
          agentId: selectedAgent.id,
          hasSessionContinuity: shouldReferenceLastSession || false,
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

      // Warn about potential configuration issues
      console.log('⚠️ Configuration checks:');
      console.log('  - VAPI Public Key:', import.meta.env.VITE_VAPI_PUBLIC_KEY ? '✅ Set' : '❌ Missing');
      console.log('  - Webhook URL:', serverUrl);
      console.log('  - First Message Mode:', assistantConfig.firstMessageMode);
      console.log('  - Model:', assistantConfig.model.model);

      try {
        console.log('🚀 Calling vapi.start()...');
        await vapi.start(assistantConfig);
        console.log('✅ vapi.start() completed successfully');
        // Since VAPI.start() succeeded, consider the session active
        setIsSessionActive(true);
        setConnectionStatus('connected');
        setIsLoading(false);
      } catch (error: any) {
        console.error('❌ VAPI start failed:', error);
        const errorMsg = error?.message || error?.error?.message || 'Failed to start voice session';
        setError(`Unable to start session: ${errorMsg}. Please check your microphone permissions and try again.`);
        throw error; // Re-throw to be caught by outer try-catch
      }

    } catch (error: any) {
      console.error('Failed to start VAPI session:', error);
      const errorMsg = error?.message || error?.error?.message || 'Unknown error';
      setError(`Session failed to start: ${errorMsg}`);
      setIsLoading(false);
      setConnectionStatus('disconnected');
      setIsSessionActive(false);
    }
  }, [vapi, userId, memoryContext, lastSessionSummary, shouldReferenceLastSession, firstName, isLoading, isSessionActive, selectedAgent, onboarding, sessionDurationLimit]);

  const endSession = useCallback(() => {
    if (vapi && isSessionActive) {
      vapi.stop();
      setIsSessionActive(false);
      setConnectionStatus('disconnected');
    }
  }, [vapi, isSessionActive]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isSessionActive,
    isLoading,
    startSession,
    endSession,
    connectionStatus,
    error,
    clearError
  };
};

export default useVapi;