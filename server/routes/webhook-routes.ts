// Simplified Webhook - CSS pattern tracking only
import { Router } from 'express';
import crypto from 'crypto';
import { 
  initializeSession, 
  processTranscript, 
  processEndOfCall,
  ensureSession
} from '../services/orchestration-service';

const router = Router();

router.post('/webhook', async (req, res) => {
  console.log('📥 VAPI webhook received:', req.body.message?.type);
  
  // ADD THIS DEBUG BLOCK
  console.log('🔍 Available imports check:');
  try {
    const { initializeSession, processTranscript, processEndOfCall, ensureSession } = await import('../services/orchestration-service');
    console.log('✅ Orchestration service imported successfully');
    console.log('✅ Functions available:', { 
      initializeSession: typeof initializeSession, 
      processTranscript: typeof processTranscript,
      ensureSession: typeof ensureSession 
    });
  } catch (error) {
    console.error('❌ Failed to import orchestration service:', error);
  }

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
        console.log('🔍 ENTERING conversation-update case');
        console.log('📝 Message conversation length:', message?.conversation?.length);
        
        // Ensure session exists (handles missing call-started events)
        const session = await ensureSession(callId, userId, agentName);
        if (!session) {
          console.warn(`⚠️ Cannot process conversation-update: failed to ensure session for ${callId}`);
          break;
        }
        console.log(`✔️ Session ensured for ${callId}`);
        
        // Process latest user message for CSS patterns
        if (message?.conversation) {
          const lastUserMessage = message.conversation
            .filter((m: any) => m.role === 'user')
            .pop();

          console.log('👤 Last user message found:', !!lastUserMessage?.content);

          if (lastUserMessage?.content) {
            console.log('🚀 Calling processTranscript with:', lastUserMessage.content.substring(0, 50));
            await processTranscript(callId, lastUserMessage.content, 'user', userId, agentName);
            console.log('✅ processTranscript completed');
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

    const { detectCSSPatterns, assessPatternConfidence } = await import('../services/css-pattern-service');

    const patterns = detectCSSPatterns(transcript, true);
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

export default router;