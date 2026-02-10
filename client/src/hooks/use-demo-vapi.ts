import { useState, useEffect, useCallback, useRef } from 'react';
import { TherapeuticAgent } from '../config/agent-configs';

export interface DemoTranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface DemoSpeechUpdateMessage {
  status: 'started' | 'stopped';
  role: 'assistant' | 'user';
}

interface UseDemoVapiProps {
  selectedAgent: TherapeuticAgent;
}

interface UseDemoVapiReturn {
  isSessionActive: boolean;
  isLoading: boolean;
  startSession: () => void;
  endSession: () => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  error: string | null;
  clearError: () => void;
  elapsedSeconds: number;
}

const DEMO_MAX_DURATION = 300; // 5 minutes in seconds

const getDemoSystemPrompt = (agentName: string, agentSystemPrompt: string): string => {
  return `You are ${agentName}, a therapeutic voice assistant for iVASA.

This is a 5-minute demo session. Your goals:
1. Be warm and welcoming - this is the visitor's first experience with iVASA
2. Demonstrate therapeutic conversation naturally
3. Show that you listen deeply and reflect back what you hear

IMPORTANT TIME MANAGEMENT:
- At around 4 minutes, naturally begin wrapping up
- Say something like: "I'm aware our demo time is almost up. What feels most important to take away from our conversation?"
- At 4:30, guide toward closure: "Before we wrap up, I want you to know that with a full account, we could continue exploring this together..."
- End warmly, encouraging them to sign up

Keep responses concise (2-3 sentences) to allow for natural conversation flow.
Do not mention you are an AI unless directly asked.

VOICE SESSION MODE:
This is a voice conversation through VAPI.
DO NOT include <speak>, </speak>, <meta>, or </meta> tags.
DO NOT output any JSON or metadata.
Just respond naturally with your therapeutic conversation.

${agentSystemPrompt}`;
};

const useDemoVapi = ({
  selectedAgent
}: UseDemoVapiProps): UseDemoVapiReturn => {
  const [vapi, setVapi] = useState<any>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const vapiRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer effect
  useEffect(() => {
    if (isSessionActive && connectionStatus === 'connected') {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => {
          if (prev >= DEMO_MAX_DURATION) {
            // Auto-end session at 5 minutes
            if (vapiRef.current) {
              vapiRef.current.stop();
            }
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isSessionActive, connectionStatus]);

  useEffect(() => {
    const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;

    if (!publicKey) {
      console.error('VAPI public key not found');
      setError('Voice demo is not configured. Please try again later.');
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
          console.log('[Demo] Call started');
          setIsSessionActive(true);
          setConnectionStatus('connected');
          setIsLoading(false);
        });

        vapiInstance.on('call-end', () => {
          console.log('[Demo] Call ended');
          setIsSessionActive(false);
          setConnectionStatus('disconnected');
          setElapsedSeconds(0);
        });

        vapiInstance.on('error', (error: any) => {
          console.error('[Demo] VAPI error:', error);

          let errorMessage = 'An error occurred with the voice demo';

          if (error?.error?.message) {
            errorMessage = error.error.message;
          } else if (error?.message) {
            errorMessage = error.message;
          } else if (typeof error === 'string') {
            errorMessage = error;
          }

          // User-friendly error messages
          if (errorMessage.toLowerCase().includes('microphone') || errorMessage.toLowerCase().includes('permission')) {
            errorMessage = 'Microphone access is required. Please allow microphone permissions and try again.';
          } else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('connection')) {
            errorMessage = 'Connection error. Please check your internet and try again.';
          }

          setError(errorMessage);
          setIsLoading(false);
          setConnectionStatus('disconnected');
          setIsSessionActive(false);
        });

      } catch (error) {
        console.error('[Demo] Failed to initialize VAPI:', error);
        setError('Failed to initialize voice demo. Please refresh and try again.');
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
        setError('Voice demo is not ready. Please refresh the page.');
      }
      return;
    }

    setError(null);
    setIsLoading(true);
    setConnectionStatus('connecting');
    setElapsedSeconds(0);

    try {
      const demoSystemPrompt = getDemoSystemPrompt(selectedAgent.name, selectedAgent.systemPrompt);

      const demoAssistantConfig = {
        name: `VASA-Demo-${selectedAgent.name}`,
        model: {
          provider: 'openai',
          model: selectedAgent.model.model,
          temperature: selectedAgent.model.temperature,
          messages: [
            {
              role: 'system',
              content: demoSystemPrompt
            }
          ],
          maxTokens: 200
        },
        voice: {
          provider: selectedAgent.voice.provider,
          voiceId: selectedAgent.voice.voiceId,
          model: selectedAgent.voice.model || 'eleven_flash_v2_5',
          stability: selectedAgent.voice.stability || 0.9,
          similarityBoost: selectedAgent.voice.similarityBoost || 0.85,
          speed: selectedAgent.voice.speed || 1.0,
          useSpeakerBoost: selectedAgent.voice.useSpeakerBoost ?? true
        },
        maxDurationSeconds: DEMO_MAX_DURATION,
        firstMessage: null,
        firstMessageMode: "assistant-speaks-first-with-model-generated-message",
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en'
        },
        // Therapeutic speech settings
        startSpeakingPlan: {
          waitSeconds: 1.0,
          smartEndpointingEnabled: true,
          transcriptionEndpointingPlan: {
            onNumberSeconds: 0.8,
            onPunctuationSeconds: 0.4,
            onNoPunctuationSeconds: 2.0
          }
        },
        stopSpeakingPlan: {
          numWords: 2,
          voiceSeconds: 0.4,
          backoffSeconds: 1.0
        },
        recordingEnabled: true,
        backgroundSpeechDenoisingPlan: {
          smartDenoisingPlan: {
            enabled: true
          }
        },
        metadata: {
          isDemo: true,
          agentName: selectedAgent.name,
          timestamp: Date.now()
        }
      };

      console.log('[Demo] Starting VAPI session with config:', demoAssistantConfig.name);
      await vapi.start(demoAssistantConfig);
      console.log('[Demo] VAPI start() completed');

    } catch (error: any) {
      console.error('[Demo] Failed to start session:', error);
      const errorMsg = error?.message || error?.error?.message || 'Failed to start voice demo';
      setError(`Unable to start demo: ${errorMsg}`);
      setIsLoading(false);
      setConnectionStatus('disconnected');
      setIsSessionActive(false);
    }
  }, [vapi, isLoading, selectedAgent]);

  const endSession = useCallback(() => {
    if (vapi && isSessionActive) {
      vapi.stop();
      setIsSessionActive(false);
      setConnectionStatus('disconnected');
      setElapsedSeconds(0);
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
    clearError,
    elapsedSeconds
  };
};

export default useDemoVapi;
