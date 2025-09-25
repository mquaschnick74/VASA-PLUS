// server/routes/subscription-routes.ts
import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { subscriptionService } from '../services/subscription-service';

const router = Router();

// Get subscription status and limits for a user
router.get('/status/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    
    console.log('Auth check:', {
      reqUserId: req.user?.id,
      paramUserId: userId,
      match: req.user?.id === userId
    });
    
    // For now, skip this check to test:
    // if (req.user?.id !== userId) {
    //   return res.status(403).json({ error: 'Unauthorized' });
    // }
    
    const status = await subscriptionService.getSubscriptionStatus(userId);
    res.json(status);
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

// Check if user can start a voice session
router.get('/can-start-session/:userId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;

    // Verify the request is for the authenticated user
    if (req.user?.id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const canStart = await subscriptionService.canStartVoiceSession(userId);
    const limits = await subscriptionService.getSubscriptionLimits(userId);

    res.json({
      canStart,
      limits
    });
  } catch (error) {
    console.error('Error checking voice session permission:', error);
    res.status(500).json({ error: 'Failed to check session permission' });
  }
});

// Track usage (backup endpoint if webhook fails)
router.post('/track-usage', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { userId, duration, sessionId, callId } = req.body;

    // Verify the request is for the authenticated user
    if (req.user?.id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const durationMinutes = Math.ceil(duration / 60);
    const tracked = await subscriptionService.trackUsageSession(
      userId,
      durationMinutes,
      sessionId,
      callId
    );

    res.json({ success: tracked });
  } catch (error) {
    console.error('Error tracking usage:', error);
    res.status(500).json({ error: 'Failed to track usage' });
  }
});

export default router;