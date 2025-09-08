// Lean Webhook Routes - Delegates to services
import { Router } from 'express';
import crypto from 'crypto';
import { 
  initializeSession, 
  processTranscript, 
  processEndOfCall,
  completeIntervention 
} from '../services/orchestration-service';

const router = Router();

// VAPI webhook handler
router.post('/webhook', async (req, res) => {
  console.log('📥 VAPI webhook received:', req.body.message?.type);

  try {
    // Verify webhook signature in production
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

    // Extract core identifiers
    const userId = extractUserId(message);
    const callId = extractCallId(message);
    const agentName = extractAgentName(message);

    if (!userId || !callId) {
      console.warn('Missing userId or callId in webhook');
      return res.status(200).json({ received: true });
    }

    // Route to appropriate handler
    switch (eventType) {
      case 'call-started':
      case 'conversation-update':
        await handleCallStart(userId, callId, agentName);
        break;

      case 'transcript':
        const response = await handleTranscript(userId, callId, message);
        return res.status(200).json(response);

      case 'end-of-call-report':
        await handleEndOfCall(userId, callId, message);
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

// HSFB intervention completion endpoint
router.post('/hsfb/complete', async (req, res) => {
  try {
    const { callId, postTranscript, duration } = req.body;

    if (!callId) {
      return res.status(400).json({ error: 'Missing call ID' });
    }

    const result = await completeIntervention(callId, postTranscript, duration);
    res.json(result);

  } catch (error) {
    console.error('HSFB completion error:', error);
    res.status(500).json({ error: 'Failed to complete intervention' });
  }
});

// Helper functions for extracting data from webhook
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

// Handler functions
async function handleCallStart(userId: string, callId: string, agentName: string) {
  console.log(`🚀 Initializing session: ${callId}`);
  await initializeSession(userId, callId, agentName);
}

async function handleTranscript(userId: string, callId: string, message: any) {
  const transcript = message?.transcript?.text || message?.transcript || '';
  const role = message?.transcript?.role || 'user';

  if (!transcript) {
    return { received: true };
  }

  console.log(`📝 Processing ${role} transcript`);
  const response = await processTranscript(callId, transcript, role);

  // If HSFB intervention needed, return special response
  if (response.action === 'trigger_hsfb') {
    console.log('🚨 HSFB intervention triggered');
    return response;
  }

  return { received: true };
}

async function handleEndOfCall(userId: string, callId: string, message: any) {
  console.log(`📊 Processing end of call: ${callId}`);

  const fullTranscript = message?.transcript;
  const summary = message?.summary;
  const callMetadata = message?.call; // Pass full call metadata for duration calculation

  await processEndOfCall(callId, fullTranscript, summary, callMetadata);
}

export default router;