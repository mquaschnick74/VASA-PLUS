// Location: server/routes/pca-analysis-routes.ts
// API routes for PCA Master Analyst feature

import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { pcaAnalystService } from '../services/pca-master-analyst-service';

const router = Router();

/**
 * POST /api/analysis/pca-master
 * Trigger PCA master analysis for authenticated user
 *
 * Body:
 *   - sessionCount: number (1-5, default 3) - Number of recent sessions to analyze
 */
router.post('/pca-master', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get session count from request body, default to 3
    let { sessionCount } = req.body;
    sessionCount = parseInt(sessionCount) || 3;

    // Validate session count range
    if (sessionCount < 1 || sessionCount > 5) {
      return res.status(400).json({
        error: 'Session count must be between 1 and 5'
      });
    }

    console.log(`📊 PCA analysis requested for user ${userId}, ${sessionCount} sessions`);

    // Perform analysis
    const result = await pcaAnalystService.performAnalysis(userId, sessionCount);

    res.json({
      success: true,
      message: 'Analysis completed successfully',
      data: {
        analysisId: result.analysisId,
        currentCssStage: result.currentCssStage,
        safetyAssessment: result.safetyAssessment,
        registerDominance: result.registerDominance
      }
    });

  } catch (error: any) {
    console.error('❌ PCA analysis error:', error);

    // Handle specific error cases
    if (error.message.includes('No transcripts')) {
      return res.status(404).json({
        error: 'No session transcripts found for analysis',
        message: 'Please complete at least one therapeutic session before requesting analysis.'
      });
    }

    if (error.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(500).json({
        error: 'Service configuration error',
        message: 'PCA analysis service is not properly configured. Please contact support.'
      });
    }

    res.status(500).json({
      error: 'Analysis failed',
      message: error.message || 'An unexpected error occurred during analysis'
    });
  }
});

/**
 * GET /api/analysis/pca-master/:analysisId
 * Retrieve a specific PCA analysis by ID
 */
router.get('/pca-master/:analysisId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { analysisId } = req.params;

    if (!analysisId) {
      return res.status(400).json({ error: 'Analysis ID is required' });
    }

    console.log(`📖 Fetching analysis ${analysisId} for user ${userId}`);

    const analysis = await pcaAnalystService.getAnalysis(userId, analysisId);

    res.json({
      success: true,
      data: analysis
    });

  } catch (error: any) {
    console.error('❌ Error fetching analysis:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Analysis not found',
        message: 'The requested analysis could not be found or does not belong to this user.'
      });
    }

    res.status(500).json({
      error: 'Failed to fetch analysis',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

/**
 * GET /api/analysis/pca-master
 * Get all PCA analyses for authenticated user
 *
 * Query params:
 *   - limit: number (default 10) - Maximum number of analyses to return
 */
router.get('/pca-master', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const limit = parseInt(req.query.limit as string) || 10;

    console.log(`📋 Fetching analyses for user ${userId} (limit: ${limit})`);

    const analyses = await pcaAnalystService.getUserAnalyses(userId, limit);

    res.json({
      success: true,
      count: analyses.length,
      data: analyses
    });

  } catch (error: any) {
    console.error('❌ Error fetching analyses:', error);
    res.status(500).json({
      error: 'Failed to fetch analyses',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

export default router;
