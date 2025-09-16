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

  try {
    // Fix signature validation - check if VAPI_SECRET_KEY exists, not NODE_ENV
    if (process.env.VAPI_SECRET_KEY) {
      const signature = req.headers['x-vapi-signature'] as string;

      // Handle both raw buffer and parsed JSON body
      let payload: string;
      if (Buffer.isBuffer(req.body)) {
        payload = req.body.toString('utf8');
      } else {
        payload = JSON.stringify(req.body);
      }

      // VAPI uses different signature format - might be base64 encoded
      const expectedSignature = crypto
        .createHmac('sha256', process.env.VAPI_SECRET_KEY)
        .update(payload)
        .digest('hex');

      // Also try base64 format
      const expectedSignatureBase64 = crypto
        .createHmac('sha256', process.env.VAPI_SECRET_KEY)
        .update(payload)
        .digest('base64');

      if (signature !== expectedSignature && signature !== expectedSignatureBase64) {
        console.warn(`Signature mismatch. Received: ${signature?.substring(0, 20)}...`);
        // In development, log warning but continue processing
        if (process.env.NODE_ENV === 'production') {
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }
    }

    // Parse body if it's a buffer
    const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body;
    const { message } = body;
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
        const session = await ensureSession(callId, userId, agentName);
        if (!session) {
          console.warn(`⚠️ Cannot process conversation-update: failed to ensure session for ${callId}`);
          break;
        }

        // Process messages
        if (message.transcript?.length > 0) {
          for (const item of message.transcript) {
            if (item.text && item.text.trim()) {
              await processTranscript(
                callId,
                item.text,
                item.role || 'user',
                userId,
                agentName
              );
            }
          }
        }
        break;

      case 'end-of-call-report':
        console.log('🔍 Starting CSS pattern detection');

        const transcript = message.transcript || message.fullTranscript;
        const summary = message.summary;

        if (transcript) {
          console.log(`📝 Transcript preview: ${transcript.substring(0, 100)}...`);
          console.log(`📝 Raw transcript length: ${transcript.length}`);
          console.log(`📝 First 200 chars: ${transcript.substring(0, 200)}`);

          await processEndOfCall(
            callId,
            transcript,
            summary,
            message.call
          );
        }
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test endpoint for CSS pattern analysis
router.post('/test-css-patterns', async (req, res) => {
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