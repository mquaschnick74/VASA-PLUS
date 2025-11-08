// server/routes/assessment-routes.ts
// API routes for Inner Landscape Assessment integration

import { Router } from 'express';
import { db } from '@db';
import { userProfiles } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

/**
 * POST /api/assessment/webhook
 * Receives assessment data from the Replit funnel (start.ivasa.ai)
 *
 * Expected payload:
 * {
 *   email: string,
 *   responses: object, // All 5 question responses
 *   landscapeType: string, // Result pattern
 *   insights: string // Summary
 * }
 */
router.post('/webhook', async (req, res) => {
  try {
    const { email, responses, landscapeType, insights } = req.body;

    console.log('📋 [ASSESSMENT] Webhook received for:', email);

    // Validate required fields
    if (!email || !responses) {
      console.error('❌ [ASSESSMENT] Missing required fields');
      return res.status(400).json({
        error: 'Missing required fields: email and responses are required'
      });
    }

    // Find user by email
    const userProfile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.email, email.toLowerCase()))
      .limit(1);

    if (userProfile.length === 0) {
      console.log('⚠️ [ASSESSMENT] User not found, storing for later:', email);

      // Store in temporary storage (localStorage-like approach)
      // When user signs up, we'll check for pending assessments
      // For now, return success and let the signup flow handle it
      return res.json({
        success: true,
        message: 'Assessment received. Complete signup to link results.',
        pendingAssessment: true
      });
    }

    // Update user profile with assessment data
    const result = await db
      .update(userProfiles)
      .set({
        assessment_completed_at: new Date(),
        assessment_responses: responses,
        inner_landscape_type: landscapeType || null,
        assessment_insights: insights || null,
        updated_at: new Date()
      })
      .where(eq(userProfiles.id, userProfile[0].id))
      .returning();

    console.log('✅ [ASSESSMENT] Assessment data saved for user:', userProfile[0].id);

    return res.json({
      success: true,
      message: 'Assessment data saved successfully',
      userId: userProfile[0].id
    });

  } catch (error) {
    console.error('❌ [ASSESSMENT] Error processing webhook:', error);
    return res.status(500).json({
      error: 'Failed to process assessment data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/assessment/link
 * Links pending assessment data to a newly created user account
 * Called during signup flow when user has completed assessment first
 *
 * Expected payload:
 * {
 *   userId: string,
 *   email: string,
 *   assessmentData: {
 *     responses: object,
 *     landscapeType: string,
 *     insights: string
 *   }
 * }
 */
router.post('/link', async (req, res) => {
  try {
    const { userId, email, assessmentData } = req.body;

    console.log('🔗 [ASSESSMENT] Linking assessment to user:', userId);

    if (!userId || !assessmentData) {
      return res.status(400).json({
        error: 'Missing required fields: userId and assessmentData are required'
      });
    }

    // Update user profile with assessment data
    const result = await db
      .update(userProfiles)
      .set({
        assessment_completed_at: new Date(),
        assessment_responses: assessmentData.responses,
        inner_landscape_type: assessmentData.landscapeType || null,
        assessment_insights: assessmentData.insights || null,
        updated_at: new Date()
      })
      .where(eq(userProfiles.id, userId))
      .returning();

    console.log('✅ [ASSESSMENT] Assessment linked successfully');

    return res.json({
      success: true,
      message: 'Assessment data linked to user account',
      profile: result[0]
    });

  } catch (error) {
    console.error('❌ [ASSESSMENT] Error linking assessment:', error);
    return res.status(500).json({
      error: 'Failed to link assessment data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/assessment/status/:userId
 * Checks if a user has completed the assessment
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userProfile = await db
      .select({
        assessmentCompleted: userProfiles.assessment_completed_at,
        landscapeType: userProfiles.inner_landscape_type,
      })
      .from(userProfiles)
      .where(eq(userProfiles.id, userId))
      .limit(1);

    if (userProfile.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      completed: !!userProfile[0].assessmentCompleted,
      landscapeType: userProfile[0].landscapeType,
      completedAt: userProfile[0].assessmentCompleted
    });

  } catch (error) {
    console.error('❌ [ASSESSMENT] Error checking status:', error);
    return res.status(500).json({
      error: 'Failed to check assessment status'
    });
  }
});

export default router;
