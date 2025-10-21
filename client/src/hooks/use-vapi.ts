import { useState, useEffect, useCallback, useRef } from 'react';
import { TherapeuticAgent } from '../config/agent-configs';

interface UseVapiProps {
  userId: string;
  memoryContext: string;
  lastSessionSummary?: string | null;  // ADD: Session continuity
  shouldReferenceLastSession?: boolean; // ADD: Session continuity  
  firstName: string;
  selectedAgent: TherapeuticAgent;
  sessionDurationLimit?: number;
}

interface UseVapiReturn {
  isSessionActive: boolean;
  isLoading: boolean;
  startSession: () => void;
  endSession: () => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

const useVapi = ({ 
  userId, 
  memoryContext, 
  lastSessionSummary, 
  shouldReferenceLastSession,
  firstName, 
  selectedAgent,
  sessionDurationLimit = 7200
}: UseVapiProps): UseVapiReturn => {
  const [vapi, setVapi] = useState<any>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const vapiRef = useRef<any>(null);

  useEffect(() => {
    const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;

    if (!publicKey) {
      console.error('VAPI public key not found');
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

        vapiInstance.on('call-end', () => {
          console.log('📴 Call ended');
          setIsSessionActive(false);
          setConnectionStatus('disconnected');
        });

        vapiInstance.on('error', (error: any) => {
          console.error('VAPI error details:', {
            message: error?.error?.message || error?.message,
            status: error?.error?.status,
            fullError: error
          });
          setIsLoading(false);
          setConnectionStatus('disconnected');
        });
      } catch (error) {
        console.error('Failed to initialize VAPI:', error);
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
    if (!vapi || isLoading || !selectedAgent) return;

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
      const serverUrl = `${window.location.origin}/api/vapi/webhook`;

      console.log('📍 Webhook URL:', serverUrl);
      console.log('📍 User ID:', userId);
      console.log('📍 Agent:', selectedAgent.name);
      console.log('📝 Session continuity:', shouldReferenceLastSession ? 'Enabled' : 'Disabled');

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
          maxTokens: 150
        },
        voice: {
          provider: selectedAgent.voice.provider,
          voiceId: selectedAgent.voice.voiceId,
          stability: selectedAgent.voice.stability || 0.5,
          similarityBoost: 0.75,
          speed: selectedAgent.voice.speed || 1.0
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

      try {
        await vapi.start(assistantConfig);
        // Since VAPI.start() succeeded, consider the session active
        setIsSessionActive(true);
        setConnectionStatus('connected');
        setIsLoading(false);
      } catch (error) {
        console.error('❌ VAPI start failed:', error);
        throw error; // Re-throw to be caught by outer try-catch
      }

    } catch (error) {
      console.error('Failed to start VAPI session:', error);
      setIsLoading(false);
      setConnectionStatus('disconnected');
    }
  }, [vapi, userId, memoryContext, lastSessionSummary, shouldReferenceLastSession, firstName, isLoading, isSessionActive, selectedAgent]);

  const endSession = useCallback(() => {
    if (vapi && isSessionActive) {
      vapi.stop();
      setIsSessionActive(false);
      setConnectionStatus('disconnected');
    }
  }, [vapi, isSessionActive]);

  return {
    isSessionActive,
    isLoading,
    startSession,
    endSession,
    connectionStatus
  };
};

export default useVapi;