import { useState, useEffect, useCallback, useRef } from 'react';
import { TherapeuticAgent, getAgentById } from '../config/agent-configs';

interface UseVapiProps {
  userId: string;
  memoryContext: string;
  firstName: string;
  selectedAgent: TherapeuticAgent;
}

interface UseVapiReturn {
  isSessionActive: boolean;
  isLoading: boolean;
  startSession: () => void;
  endSession: () => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

const useVapi = ({ userId, memoryContext, firstName, selectedAgent }: UseVapiProps): UseVapiReturn => {
  const [vapi, setVapi] = useState<any>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const vapiRef = useRef<any>(null);
  
  // Track active methodology internally (invisible to user)
  const [activeMethodology, setActiveMethodology] = useState<string>(selectedAgent.id);
  const [callId, setCallId] = useState<string>('');
  const checkIntervalRef = useRef<NodeJS.Timeout>();

  // Initialize VAPI
  useEffect(() => {
    const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;
    
    if (!publicKey) {
      console.error('VAPI public key not found');
      return;
    }

    const initializeVapi = async () => {
      try {
        const { default: Vapi } = await import('@vapi-ai/web');
        const vapiInstance = new Vapi(publicKey);
        vapiRef.current = vapiInstance;
        setVapi(vapiInstance);

        vapiInstance.on('call-start', (event?: any) => {
          console.log('✅ Call started');
          setIsSessionActive(true);
          setConnectionStatus('connected');
          setIsLoading(false);
          setCallId(event?.call?.id || '');
        });

        vapiInstance.on('call-end', () => {
          console.log('📴 Call ended');
          setIsSessionActive(false);
          setConnectionStatus('disconnected');
          setCallId('');
          setActiveMethodology(selectedAgent.id);
        });

        vapiInstance.on('error', (error: any) => {
          console.error('VAPI error:', error);
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
  }, [selectedAgent.id]);

  // Silently check for methodology suggestions from backend
  useEffect(() => {
    if (!callId || !isSessionActive) return;

    const checkMethodology = async () => {
      try {
        const response = await fetch(`/api/orchestration/state/${callId}`);
        if (response.ok) {
          const state = await response.json();
          
          // Log contextual data for debugging
          console.log(`📊 Orchestration state: CSS Stage=${state.currentCSSStage}, Agent=${state.currentAgent}`);
          
          // If backend suggests different methodology, update silently
          if (state.suggestedAgent && state.suggestedAgent !== activeMethodology && state.canSwitch) {
            console.log(`🔄 Silently switching methodology: ${activeMethodology} → ${state.suggestedAgent}`);
            await updateMethodology(state.suggestedAgent);
          }
        }
      } catch (error) {
        // Silently handle errors - orchestration is optional enhancement
        console.debug('Orchestration check skipped:', error);
      }
    };

    // Check every 15 seconds for methodology suggestions
    checkIntervalRef.current = setInterval(checkMethodology, 15000);
    
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [callId, isSessionActive, activeMethodology, userId]);

  // Silently update the therapeutic methodology
  const updateMethodology = async (newMethodology: string) => {
    if (!vapi || !isSessionActive) return;
    
    const newAgent = getAgentById(newMethodology);
    if (!newAgent) return;

    try {
      // Build updated system prompt for new methodology
      let systemPrompt = newAgent.systemPrompt;
      
      if (memoryContext && memoryContext.length > 50) {
        systemPrompt += `\n\n===== PREVIOUS SESSION CONTEXT =====
${memoryContext}
===== END CONTEXT =====`;
      }
      
      systemPrompt += `\n\nThe user's name is ${firstName}.`;
      
      // Critical: Add seamless continuation instruction
      systemPrompt += `\n\nIMPORTANT: You are continuing an ongoing conversation. 
Do not reintroduce yourself or indicate any change has occurred.
Continue naturally from where the conversation is at this moment.
Maintain the same warm, consistent presence throughout.
Never mention switching approaches or changing methods.`;

      // Silently update the assistant configuration
      await vapi.setAssistant({
        model: {
          provider: 'openai',
          model: newAgent.model.model,
          temperature: newAgent.model.temperature,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            }
          ]
        }
        // Keep same voice - no change in how they sound
      });

      setActiveMethodology(newMethodology);
      
      // Record the switch in backend (for analytics only)
      try {
        await fetch('/api/orchestration/record-switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callId,
            userId,
            fromMethodology: activeMethodology,
            toMethodology: newMethodology,
            reason: 'pattern_detected'
          })
        });
      } catch (error) {
        // Analytics failure shouldn't break the switch
        console.debug('Failed to record switch:', error);
      }
      
    } catch (error) {
      console.error('Failed to update methodology:', error);
    }
  };

  const startSession = useCallback(async () => {
    if (!vapi || isLoading || !selectedAgent) return;

    setIsLoading(true);
    setConnectionStatus('connecting');

    try {
      const hasMemory = memoryContext && memoryContext.length > 50;
      
      let systemPrompt = selectedAgent.systemPrompt;
      
      if (hasMemory) {
        systemPrompt += `\n\n===== PREVIOUS SESSION CONTEXT =====
${memoryContext}
===== END CONTEXT =====

IMPORTANT: Reference the above context naturally in conversation when relevant.
Do not make up or hallucinate any details not explicitly mentioned above.`;
      } else {
        systemPrompt += '\n\nThis is your first session with this user. Get to know them gently.';
      }
      
      systemPrompt += `\n\nThe user's name is ${firstName}. Use their name naturally but not excessively.`;
      
      // Get personalized first message
      const firstMessage = selectedAgent.firstMessageTemplate(firstName, !!hasMemory);
      const serverUrl = `${window.location.origin}/api/vapi/webhook`;

      const assistantConfig = {
        name: 'VASA-Therapist', // Generic name - no agent identification
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
          initialMethodology: selectedAgent.id,
          agentName: selectedAgent.name // For backend tracking only
        }
      };

      await vapi.start(assistantConfig);
      setIsSessionActive(true);
      setConnectionStatus('connected');
      setIsLoading(false);
      setActiveMethodology(selectedAgent.id);

    } catch (error) {
      console.error('Failed to start VAPI session:', error);
      setIsLoading(false);
      setConnectionStatus('disconnected');
    }
  }, [vapi, userId, memoryContext, firstName, isLoading, isSessionActive, selectedAgent]);

  const endSession = useCallback(() => {
    if (vapi && isSessionActive) {
      vapi.stop();
      setIsSessionActive(false);
      setConnectionStatus('disconnected');
      
      // Clear orchestration interval
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    }
  }, [vapi, isSessionActive]);

  return {
    isSessionActive,
    isLoading,
    startSession,
    endSession,
    connectionStatus
    // Note: activeMethodology is intentionally not exposed
  };
};

export default useVapi;