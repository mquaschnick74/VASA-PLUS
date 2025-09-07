import { Router } from 'express';
import crypto from 'crypto';
import { detectCSSPatterns, assessPatternConfidence } from '../services/css-pattern-service';
import { supabase } from '../services/supabase-service';
import { storeSessionContext } from '../services/memory-service';

const router = Router();

// VAPI webhook handler
router.post('/webhook', async (req, res) => {
  console.log('📥 VAPI webhook received:', JSON.stringify(req.body, null, 2));
  try {
    // Verify webhook signature if in production
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

    console.log(`📥 Received VAPI webhook: ${eventType}`);

    // Extract user ID from metadata - handle different webhook structures
    const userId = message?.call?.metadata?.userId || 
                  message?.metadata?.userId ||
                  message?.call?.assistant?.metadata?.userId ||
                  message?.assistant?.metadata?.userId;
    const callId = message?.call?.id || message?.callId;
    
    console.log('🔍 Parsing webhook data:', {
      foundUserId: userId,
      foundCallId: callId,
      path1: message?.call?.metadata?.userId,
      path2: message?.metadata?.userId,
      path3: message?.call?.assistant?.metadata?.userId,
      path4: message?.assistant?.metadata?.userId
    });

    if (!userId || !callId) {
      console.warn('Missing userId or callId in webhook');
      console.warn('Available data:', {
        userId: userId,
        callId: callId,
        messageStructure: {
          hasCall: !!message?.call,
          hasCallMetadata: !!message?.call?.metadata,
          hasCallAssistantMetadata: !!message?.call?.assistant?.metadata,
          hasDirectMetadata: !!message?.metadata,
          callKeys: message?.call ? Object.keys(message.call) : [],
          metadataKeys: message?.call?.metadata ? Object.keys(message.call.metadata) : []
        }
      });
      return res.status(200).json({ received: true });
    }

    switch (eventType) {
      case 'call-started':
        // Extract agent name from metadata
        const agentName = message?.call?.metadata?.agentName || 
                         message?.metadata?.agentName ||
                         message?.call?.assistant?.metadata?.agentName ||
                         message?.assistant?.metadata?.agentName ||
                         'Sarah'; // Default fallback
        
        // Create or update session
        const { data: sessionData, error: sessionError } = await supabase
          .from('therapeutic_sessions')
          .upsert({
            call_id: callId,
            user_id: userId,
            agent_name: agentName,
            status: 'active',
            start_time: new Date().toISOString(),
            metadata: message.call
          }, {
            onConflict: 'call_id'
          });
        
        if (sessionError) {
          console.error('❌ Session creation failed:', sessionError);
        } else {
          console.log('✅ Session started:', sessionData);
        }
        break;

      case 'end-of-call-report':
        // Update session with end time and duration
        const duration = message?.call?.duration || 0;
        
        await supabase
          .from('therapeutic_sessions')
          .update({
            status: 'completed',
            end_time: new Date().toISOString(),
            duration_seconds: duration,
            metadata: message.call
          })
          .eq('call_id', callId);

        // Store call summary as context
        if (message?.summary) {
          await storeSessionContext(
            userId,
            callId,
            message.summary,
            'call_summary'
          );
        }

        // Store complete transcript
        if (message?.transcript) {
          await supabase
            .from('session_transcripts')
            .insert({
              user_id: userId,
              call_id: callId,
              text: message.transcript,
              role: 'complete'
            });

          // Detect CSS patterns in the transcript
          const patterns = detectCSSPatterns(message.transcript);
          const { confidence, reasoning } = assessPatternConfidence(patterns);
          
          console.log(`🎯 CSS Detection: Stage ${patterns.currentStage}, Confidence ${confidence}`);
          console.log(`📊 Pattern counts: CVDC=${patterns.cvdcPatterns.length}, IBM=${patterns.ibmPatterns.length}`);

          // Store each CVDC pattern found
          for (const cvdc of patterns.cvdcPatterns) {
            await supabase
              .from('therapeutic_context')
              .insert({
                user_id: userId,
                call_id: callId,
                context_type: 'cvdc_identified',
                content: cvdc,
                css_stage: 'focus_bind',
                pattern_type: 'CVDC',
                confidence: confidence,
                importance: 8
              });
          }

          // Store each IBM pattern found
          for (const ibm of patterns.ibmPatterns) {
            await supabase
              .from('therapeutic_context')
              .insert({
                user_id: userId,
                call_id: callId,
                context_type: 'ibm_pattern',
                content: ibm,
                css_stage: 'focus_bind',
                pattern_type: 'IBM',
                confidence: confidence,
                importance: 7
              });
          }

          // Store Thend moments
          for (const thend of patterns.thendIndicators) {
            await supabase
              .from('therapeutic_context')
              .insert({
                user_id: userId,
                call_id: callId,
                context_type: 'thend_moment',
                content: thend,
                css_stage: 'gesture_toward',
                pattern_type: 'Thend',
                confidence: confidence,
                importance: 9
              });
          }

          // Store CYVC achievements
          for (const cyvc of patterns.cyvcPatterns) {
            await supabase
              .from('therapeutic_context')
              .insert({
                user_id: userId,
                call_id: callId,
                context_type: 'cyvc_achieved',
                content: cyvc,
                css_stage: 'completion',
                pattern_type: 'CYVC',
                confidence: confidence,
                importance: 10
              });
          }

          // Track stage progression if changed
          // First get the user's last CSS stage
          const { data: lastContext } = await supabase
            .from('therapeutic_context')
            .select('css_stage')
            .eq('user_id', userId)
            .not('css_stage', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          const previousStage = lastContext?.css_stage || 'pointed_origin';
          
          // If stage has changed, record progression
          if (patterns.currentStage !== previousStage) {
            await supabase
              .from('css_progressions')
              .insert({
                user_id: userId,
                call_id: callId,
                from_stage: previousStage,
                to_stage: patterns.currentStage,
                trigger_content: patterns.cvdcPatterns[0] || patterns.thendIndicators[0] || 'Stage transition detected',
                agent_name: message?.call?.metadata?.agentName || 'Unknown'
              });
            
            console.log(`📈 CSS Progression: ${previousStage} → ${patterns.currentStage}`);
          }

          // Store overall stage assessment
          await supabase
            .from('therapeutic_context')
            .insert({
              user_id: userId,
              call_id: callId,
              context_type: 'css_stage_assessment',
              content: `Stage: ${patterns.currentStage}. ${reasoning}`,
              css_stage: patterns.currentStage,
              confidence: confidence,
              importance: 6
            });
        }

        console.log('✅ Session completed and stored');
        break;

      case 'transcript':
        // Optional: Store real-time transcript chunks
        if (message?.transcript?.text) {
          // Could store incremental transcripts if needed
        }
        break;

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;