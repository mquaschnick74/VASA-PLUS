import { useState, useEffect, useCallback, useRef } from 'react';
import { TherapeuticAgent } from '../config/agent-configs';

interface UseVapiProps {
  userId: string;
  memoryContext: string;
  firstName: string;
  selectedAgent: TherapeuticAgent;
  verbalAcknowledgment?: string;
}

interface UseVapiReturn {
  isSessionActive: boolean;
  isLoading: boolean;
  startSession: () => void;
  endSession: () => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

const useVapi = ({ userId, memoryContext, firstName, selectedAgent, verbalAcknowledgment }: UseVapiProps): UseVapiReturn => {
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

      // Add exchange tracking initialization
      systemPrompt = `
${systemPrompt}

===== SESSION INITIALIZATION =====
This is exchange #1. Remember to track exchanges internally.
Phase: NARRATIVE COLLECTION (exchanges 1-25)
Focus: Deep listening and understanding only.
DO NOT identify patterns or contradictions yet.

===== RESPONSE REQUIREMENTS =====
1. Keep <speak> completely natural - no technical language
2. Track metadata in <meta> only
3. Prioritize building trust and understanding
4. Ask open-ended questions about their experience
`;

      if (hasMemory) {
        systemPrompt += `\n\n===== PREVIOUS SESSION CONTEXT =====
${memoryContext}
===== END CONTEXT =====

Build on the trust and understanding already established.
Reference specific things they shared to show continuity.`;
      } else {
        systemPrompt += '\n\nThis is your first session with this user. Focus on understanding their story.';
      }
      
      systemPrompt += `\n\nThe user's name is ${firstName}. Use their name naturally but not excessively.`;

      // Debug logging
      console.log('🔍 VAPI First Message Debug:');
      console.log('  - verbalAcknowledgment:', verbalAcknowledgment);
      console.log('  - hasMemory:', hasMemory);
      console.log('  - memoryContext length:', memoryContext?.length || 0);
      
      // Use verbal acknowledgment if available, regardless of memory context length
      const firstMessage = verbalAcknowledgment && verbalAcknowledgment.length > 10
        ? verbalAcknowledgment 
        : selectedAgent.firstMessageTemplate(firstName, !!hasMemory);
      
      console.log(`💬 FINAL first message being sent to VAPI: "${firstMessage}"`);

      // Get the current server URL for webhook configuration
      const serverUrl = `${window.location.origin}/api/vapi/webhook`;

      // VAPI configuration with dynamic agent settings
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
        server: {
          url: serverUrl
        },
        firstMessage: firstMessage,
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en'
        },
        recordingEnabled: true,
        metadata: {
          userId: userId,
          agentName: selectedAgent.name,
          agentId: selectedAgent.id
        }
      };

      console.log('🔍 Starting VAPI call with:', {
        firstMessage: assistantConfig.firstMessage,
        hasPublicKey: !!import.meta.env.VITE_VAPI_PUBLIC_KEY,
        metadata: { userId: userId, agentName: selectedAgent.name }
      });
      
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
  }, [vapi, userId, memoryContext, firstName, isLoading, isSessionActive, selectedAgent, verbalAcknowledgment]);

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
