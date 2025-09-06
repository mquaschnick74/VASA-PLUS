import { useState, useEffect, useCallback, useRef } from 'react';

interface UseVapiProps {
  userId: string;
  memoryContext: string;
  firstName: string;
}

interface UseVapiReturn {
  isSessionActive: boolean;
  isLoading: boolean;
  startSession: () => void;
  endSession: () => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

const useVapi = ({ userId, memoryContext, firstName }: UseVapiProps): UseVapiReturn => {
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
    if (!vapi || isLoading) return;

    setIsLoading(true);
    setConnectionStatus('connecting');

    try {
      // Build system prompt with memory context
      const systemPrompt = `You are Sarah, a warm and empathetic therapeutic guide. 
      You provide supportive, non-judgmental listening and gentle guidance.
      
      ${memoryContext ? `===== PREVIOUS SESSION CONTEXT =====
      ${memoryContext}
      ===== END CONTEXT =====
      
      IMPORTANT: Reference the above context naturally in conversation when relevant.
      Do not make up or hallucinate any details not explicitly mentioned above.` : 
      'This is your first session with this user. Get to know them gently.'}
      
      The user's name is ${firstName}. Use their name naturally but not excessively.
      
      Focus on:
      - Active listening and validation
      - Exploring feelings with curiosity
      - Holding space for difficult emotions
      - Gentle, open-ended questions
      - Reflecting back what you hear`;

      const firstMessage = memoryContext && memoryContext.length > 50 ? 
        `Hello ${firstName}, it's good to continue our conversation. What's on your mind today?` :
        `Hello ${firstName}, I'm Sarah. I'm here to listen and support you. How are you feeling today?`;

      // Get the current server URL for webhook configuration
      const serverUrl = `${window.location.origin}/api/vapi/webhook`;

      // VAPI assistant configuration
      const assistantConfig = {
        model: {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            }
          ],
          maxTokens: 150
        },
        voice: {
          provider: '11labs',
          voiceId: 'EXAVITQu4vr4xnSDxMaL',  // Valid Sarah voice ID
          stability: 0.5,
          similarityBoost: 0.75
        },
        server: {
          url: serverUrl,
          timeout: 30
        },
        firstMessage: firstMessage,
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en'
        },
        recordingEnabled: true,
        metadata: {
          userId: userId
        }
      };

      console.log('Starting VAPI session with config:', assistantConfig);
      await vapi.start(assistantConfig);

      // Set timeout fallback if call doesn't start
      setTimeout(() => {
        if (!isSessionActive) {
          console.warn('Call start timeout - resetting UI');
          setIsLoading(false);
          setConnectionStatus('disconnected');
        }
      }, 15000);

    } catch (error) {
      console.error('Failed to start VAPI session:', error);
      setIsLoading(false);
      setConnectionStatus('disconnected');
    }
  }, [vapi, userId, memoryContext, firstName, isLoading, isSessionActive]);

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
