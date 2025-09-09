// Webhook routes with orchestration support
import { Router } from 'express';
import crypto from 'crypto';
import { 
  initializeSession, 
  processTranscript, 
  processEndOfCall,
  ensureSession,
  getOrchestrationState,
  markGuidanceApplied
} from '../services/orchestration-service';
import { supabase } from '../services/supabase-service';

const router = Router();

router.post('/webhook', async (req, res) => {
  console.log('📥 VAPI webhook received:', req.body.message?.type);

  try {
    if (process.env.NODE_ENV === 'production' && process.env.VAPI_SECRET_KEY) {
      const signature = req.headers['x-vapi-signature'] as string;
      const payload = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', process.env.VAPI_SECRET_KEY)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSignature) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { message } = req.body;
    const eventType = message?.type;

    const userId = extractUserId(message);
    const callId = extractCallId(message);
    const agentName = extractAgentName(message);

    if (!userId || !callId) {
      console.warn('Missing userId or callId');
      return res.status(200).json({ received: true });
    }

    switch (eventType) {
      case 'call-started':
        await initializeSession(userId, callId, agentName);
        break;

      case 'conversation-update':
        // Process conversation update
        
        // Ensure session exists (handles missing call-started events)
        const session = await ensureSession(callId, userId, agentName);
        if (!session) {
          console.warn(`⚠️ Cannot process conversation-update: failed to ensure session for ${callId}`);
          break;
        }
        
        // Process both user and assistant messages for CSS patterns
        if (message?.conversation) {
          // Process the last user message
          const lastUserMessage = message.conversation
            .filter((m: any) => m.role === 'user')
            .pop();

          if (lastUserMessage?.content) {
            await processTranscript(callId, lastUserMessage.content, 'user', userId, agentName);
          }
          
          // Also process the last assistant message for metadata
          const lastAssistantMessage = message.conversation
            .filter((m: any) => m.role === 'assistant')
            .pop();
            
          if (lastAssistantMessage?.content) {
            await processTranscript(callId, lastAssistantMessage.content, 'assistant', userId, agentName);
          }
        }
        break;

      case 'transcript':
        const transcript = message?.transcript?.text || message?.transcript || '';
        const role = message?.transcript?.role || 'user';

        if (transcript) {
          // Ensure session exists before processing
          await ensureSession(callId, userId, agentName);
          await processTranscript(callId, transcript, role, userId, agentName);
        }
        break;

      case 'end-of-call-report':
        const fullTranscript = message?.transcript;
        const summary = message?.summary;
        const callMetadata = message?.call;

        await processEndOfCall(callId, fullTranscript, summary, callMetadata);
        break;

      default:
        console.log(`Unhandled event: ${eventType}`);
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Manual analysis endpoint for testing
router.post('/analyze-transcript', async (req, res) => {
  try {
    const { transcript, userId, callId } = req.body;

    if (!transcript || !userId || !callId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { detectEnhancedCSSPatterns, assessPatternConfidence } = await import('../services/css-pattern-service');

    const patterns = detectEnhancedCSSPatterns(transcript, true);
    const { confidence, reasoning } = assessPatternConfidence(patterns);

    res.json({
      success: true,
      patterns: {
        cvdc: patterns.cvdcPatterns.length,
        ibm: patterns.ibmPatterns.length,
        thend: patterns.thendIndicators.length,
        cyvc: patterns.cyvcPatterns.length
      },
      stage: patterns.currentStage,
      confidence: confidence,
      reasoning: reasoning,
      samples: {
        cvdc: patterns.cvdcPatterns[0] || null,
        ibm: patterns.ibmPatterns[0] || null,
        thend: patterns.thendIndicators[0] || null,
        cyvc: patterns.cyvcPatterns[0] || null
      }
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

function extractUserId(message: any): string | null {
  return message?.call?.metadata?.userId || 
         message?.metadata?.userId ||
         message?.call?.assistant?.metadata?.userId ||
         message?.assistant?.metadata?.userId ||
         null;
}

function extractCallId(message: any): string | null {
  return message?.call?.id || 
         message?.callId || 
         null;
}

function extractAgentName(message: any): string {
  return message?.call?.metadata?.agentName || 
         message?.metadata?.agentName ||
         message?.call?.assistant?.metadata?.agentName ||
         message?.assistant?.metadata?.agentName ||
         'Sarah';
}

// GET orchestration state for a call
router.get('/orchestration/state/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    const state = getOrchestrationState(callId);
    
    if (!state) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(state);
  } catch (error) {
    console.error('Failed to get orchestration state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST to record methodology switch (analytics only)
router.post('/orchestration/record-switch', async (req, res) => {
  try {
    const { callId, userId, fromMethodology, toMethodology, reason } = req.body;
    
    // Just record the switch for analytics - the actual switch happens client-side
    await supabase
      .from('therapeutic_context')
      .insert({
        user_id: userId,
        call_id: callId,
        context_type: 'methodology_switch',
        content: `Methodology switch: ${fromMethodology} → ${toMethodology} (${reason})`,
        confidence: 1.0,
        importance: 7
      });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to record switch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST to mark pattern guidance as applied
router.post('/orchestration/guidance-applied', async (req, res) => {
  try {
    const { callId, guidanceKeys, userId } = req.body;
    
    if (!callId || !guidanceKeys) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Mark guidance as applied in session
    await markGuidanceApplied(callId, guidanceKeys);
    
    // Store in database for analytics
    await supabase
      .from('therapeutic_context')
      .insert({
        user_id: userId || 'unknown',
        call_id: callId,
        context_type: 'guidance_applied',
        content: `Pattern guidance applied: ${guidanceKeys.join(', ')}`,
        confidence: 1.0,
        importance: 5
      });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to mark guidance as applied:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;