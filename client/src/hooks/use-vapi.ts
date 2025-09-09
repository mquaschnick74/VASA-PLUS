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
  
  // Use refs for pattern guidance to avoid re-render issues
  const appliedGuidanceRef = useRef<Set<string>>(new Set());
  const pollIntervalRef = useRef<number>(15000);

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

  // Enhanced orchestration with pattern awareness
  useEffect(() => {
    if (!callId || !isSessionActive || !vapi) return;

    let isActive = true; // Track if effect is still mounted
    
    const checkPatternsAndOrchestration = async () => {
      if (!isActive) return;
      
      try {
        const response = await fetch(`/api/orchestration/state/${callId}`);
        if (!response.ok) {
          console.error('Failed to fetch orchestration state');
          return;
        }
        
        const state = await response.json();
        console.log('📊 Orchestration state received:', state);
        
        // Log current patterns
        const totalPatterns = Object.values(state.patternCounts || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
        if (totalPatterns > 0) {
          console.log(`📊 Active patterns: CVDC=${state.patternCounts.cvdc}, IBM=${state.patternCounts.ibm}, Thend=${state.patternCounts.thend}`);
        }
        
        // Determine polling interval based on pattern activity
        if (state.patternGuidance?.some((g: any) => g.priority === 'high')) {
          pollIntervalRef.current = 3000; // 3 seconds for high priority
        } else if (totalPatterns > 0) {
          pollIntervalRef.current = 5000; // 5 seconds for active patterns
        } else {
          pollIntervalRef.current = 15000; // 15 seconds default
        }
        
        // Apply pattern guidance if available
        if (state.needsGuidanceUpdate && state.patternGuidance?.length > 0) {
          const newGuidance = state.patternGuidance.filter((g: any) => 
            !appliedGuidanceRef.current.has(`${g.pattern}_${g.count}`)
          );
          
          if (newGuidance.length > 0) {
            console.log(`🎯 Injecting ${newGuidance.length} pattern guidance items`);
            
            // Build enhanced prompt
            let enhancedPrompt = selectedAgent.systemPrompt;
            
            if (memoryContext && memoryContext.length > 50) {
              enhancedPrompt += `\n\n===== PREVIOUS SESSION CONTEXT =====\n${memoryContext}\n===== END CONTEXT =====`;
            }
            
            enhancedPrompt += `\n\nThe user's name is ${firstName}.`;
            enhancedPrompt += '\n\n===== ACTIVE PATTERNS REQUIRING ATTENTION =====\n';
            enhancedPrompt += 'Address these patterns naturally in the conversation:\n\n';
            
            newGuidance.forEach((g: any) => {
              enhancedPrompt += `• [${g.priority.toUpperCase()}] ${g.suggestion}\n`;
            });
            
            enhancedPrompt += '\n===== END PATTERNS =====\n';
            enhancedPrompt += 'IMPORTANT: Address these patterns gently and naturally.';
            
            try {
              // Update assistant with pattern awareness
              await vapi.setAssistant({
                model: {
                  provider: 'openai',
                  model: selectedAgent.model.model,
                  temperature: selectedAgent.model.temperature,
                  messages: [{
                    role: 'system',
                    content: enhancedPrompt
                  }]
                }
              });
              
              // Mark as applied using ref
              newGuidance.forEach((g: any) => {
                appliedGuidanceRef.current.add(`${g.pattern}_${g.count}`);
              });
              
              // Notify backend
              await fetch('/api/orchestration/guidance-applied', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  callId,
                  userId,
                  guidanceKeys: newGuidance.map((g: any) => `${g.pattern}_${g.count}`)
                })
              });
              
              console.log('✅ Pattern guidance successfully injected');
            } catch (error) {
              console.error('Failed to inject pattern guidance:', error);
            }
          }
        }
        
        // Handle agent switching (existing logic)
        if (state.suggestedAgent && state.suggestedAgent !== activeMethodology && state.canSwitch) {
          console.log(`🔄 Switching methodology: ${activeMethodology} → ${state.suggestedAgent}`);
          await updateMethodology(state.suggestedAgent);
        }
        
      } catch (error) {
        console.error('Orchestration check error:', error);
      }
      
      // Schedule next check if still active
      if (isActive) {
        setTimeout(() => {
          if (isActive) {
            checkPatternsAndOrchestration();
          }
        }, pollIntervalRef.current);
      }
    };
    
    // Start polling
    console.log('🚀 Starting orchestration polling for call:', callId);
    checkPatternsAndOrchestration();
    
    // Cleanup
    return () => {
      isActive = false;
      console.log('🛑 Stopping orchestration polling');
    };
  }, [callId, isSessionActive, vapi, selectedAgent, memoryContext, firstName, userId, activeMethodology]);

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