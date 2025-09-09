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
  
  // Pattern guidance tracking
  const [appliedGuidance, setAppliedGuidance] = useState<Set<string>>(new Set());
  const [currentPollInterval, setCurrentPollInterval] = useState<number>(15000);
  const patternCheckRef = useRef<NodeJS.Timeout>();

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
    if (!callId || !isSessionActive) return;

    const checkPatternsAndOrchestration = async () => {
      try {
        const response = await fetch(`/api/orchestration/state/${callId}`);
        if (!response.ok) return;
        
        const state = await response.json();
        
        // Log current patterns for debugging
        const totalPatterns = Object.values(state.patternCounts || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
        if (totalPatterns > 0) {
          console.log(`📊 Active patterns: CVDC=${state.patternCounts.cvdc}, IBM=${state.patternCounts.ibm}, Thend=${state.patternCounts.thend}`);
        }
        
        // Dynamic polling interval based on pattern activity
        const hasActivePatterns = totalPatterns > 0;
        const hasHighPriorityGuidance = state.patternGuidance?.some((g: any) => g.priority === 'high');
        
        let nextInterval = 15000; // Default
        if (hasHighPriorityGuidance) {
          nextInterval = 3000; // 3 seconds for high priority
        } else if (hasActivePatterns) {
          nextInterval = 5000; // 5 seconds for active patterns
        } else if (state.emotionalIntensity === 'low') {
          nextInterval = 20000; // 20 seconds when calm
        }
        
        setCurrentPollInterval(nextInterval);
        
        // Apply pattern guidance if needed
        if (state.needsGuidanceUpdate && state.patternGuidance?.length > 0) {
          const newGuidance = state.patternGuidance.filter((g: any) => 
            !appliedGuidance.has(`${g.pattern}_${g.count}`)
          );
          
          if (newGuidance.length > 0 && vapi && isSessionActive) {
            console.log(`🎯 Injecting ${newGuidance.length} pattern guidance items`);
            
            // Build enhanced system prompt with pattern awareness
            let enhancedPrompt = selectedAgent.systemPrompt;
            
            // Add memory context if exists
            if (memoryContext && memoryContext.length > 50) {
              enhancedPrompt += `\n\n===== PREVIOUS SESSION CONTEXT =====\n${memoryContext}\n===== END CONTEXT =====`;
            }
            
            // Add user name
            enhancedPrompt += `\n\nThe user's name is ${firstName}.`;
            
            // Add pattern guidance
            enhancedPrompt += '\n\n===== ACTIVE PATTERNS REQUIRING ATTENTION =====\n';
            enhancedPrompt += 'Address these patterns naturally in the conversation:\n\n';
            
            newGuidance.forEach((g: any) => {
              enhancedPrompt += `• [${g.priority.toUpperCase()}] ${g.suggestion}\n`;
            });
            
            enhancedPrompt += '\n===== END PATTERNS =====\n';
            enhancedPrompt += 'IMPORTANT: Address these patterns gently and naturally. Do not suddenly change topic.\n';
            enhancedPrompt += 'Continue the conversation flow while weaving in exploration of these patterns.';
            
            try {
              // Update the assistant with pattern awareness
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
              
              // Mark guidance as applied
              const newAppliedSet = new Set(appliedGuidance);
              newGuidance.forEach((g: any) => {
                newAppliedSet.add(`${g.pattern}_${g.count}`);
              });
              setAppliedGuidance(newAppliedSet);
              
              // Notify backend that guidance was applied
              await fetch('/api/orchestration/guidance-applied', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  callId,
                  userId,
                  guidanceKeys: newGuidance.map((g: any) => `${g.pattern}_${g.count}`)
                })
              });
              
              console.log('✅ Pattern guidance successfully injected into conversation');
            } catch (error) {
              console.error('Failed to inject pattern guidance:', error);
            }
          }
        }
        
        // Existing agent switching logic
        if (state.suggestedAgent && state.suggestedAgent !== activeMethodology && state.canSwitch) {
          console.log(`🔄 Switching methodology: ${activeMethodology} → ${state.suggestedAgent}`);
          await updateMethodology(state.suggestedAgent);
        }
        
      } catch (error) {
        console.debug('Orchestration check error:', error);
      }
    };

    // Initial check
    checkPatternsAndOrchestration();
    
    // Set up recurring checks with dynamic interval
    const scheduleNextCheck = () => {
      patternCheckRef.current = setTimeout(() => {
        checkPatternsAndOrchestration();
        scheduleNextCheck();
      }, currentPollInterval);
    };
    
    scheduleNextCheck();
    
    return () => {
      if (patternCheckRef.current) {
        clearTimeout(patternCheckRef.current);
      }
    };
  }, [callId, isSessionActive, activeMethodology, userId, vapi, selectedAgent, memoryContext, firstName, currentPollInterval, appliedGuidance]);

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