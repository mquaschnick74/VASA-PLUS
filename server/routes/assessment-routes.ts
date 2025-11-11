import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Resend } from 'resend';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

interface AssessmentData {
  encoded: string;
  profile: {
    pattern: string;
    metaphor: string;
    description: string;
    register: string;
    cvdcPattern: string;
    chronicity: string;
    restCapacity: string;
    goal: string;
  };
  answers: Record<string, string>;
  email?: string;
  action: string;
}

/**
 * POST /api/assessment/save-for-later
 * Save assessment results for users who want to receive them via email
 * Note: This is a public endpoint (no auth required for initial capture)
 */
router.post('/save-for-later', async (req: Request, res: Response) => {
  try {
    const { email, assessmentData } = req.body as { 
      email: string; 
      assessmentData: AssessmentData 
    };

    if (!email || !assessmentData) {
      return res.status(400).json({ 
        error: 'Email and assessment data are required' 
      });
    }

    console.log('📧 Saving assessment for email delivery:', email);

    // Import supabase from your app context
    const { supabase } = req.app.locals;

    // Store assessment in database
    const { data, error } = await supabase
      .from('assessment_results')
      .insert({
        email,
        profile_data: assessmentData.profile,
        answers: assessmentData.answers,
        encoded_profile: assessmentData.encoded,
        pattern_name: assessmentData.profile.pattern,
        metaphor: assessmentData.profile.metaphor,
        register: assessmentData.profile.register,
        status: 'pending_email',
        source: 'iframe',
        questions_answered: Object.keys(assessmentData.answers).length,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error saving assessment:', error);
      return res.status(500).json({ 
        error: 'Failed to save assessment results',
        details: error.message 
      });
    }

    // Send assessment results via email
    if (process.env.RESEND_API_KEY) {
      try {
        await resend.emails.send({
          from: 'iVASA Assessment <noreply@ivasa.ai>',
          to: email,
          subject: 'Your iVASA Inner Landscape Assessment Results',
          html: generateAssessmentEmail(assessmentData)
        });
        console.log('✅ Assessment email sent to:', email);
      } catch (emailError) {
        console.error('⚠️ Email failed but assessment saved:', emailError);
      }
    }

    res.json({ 
      success: true, 
      message: 'Assessment saved successfully',
      assessmentId: data?.id 
    });

  } catch (error: any) {
    console.error('❌ Error in save-for-later:', error);
    res.status(500).json({ 
      error: 'An unexpected error occurred',
      message: error.message 
    });
  }
});

/**
 * GET /api/assessment/:id
 * Retrieve assessment results by ID
 * Public endpoint - assessments can be viewed by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { supabase } = req.app.locals;

    const { data, error } = await supabase
      .from('assessment_results')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ 
        error: 'Assessment not found' 
      });
    }

    res.json(data);

  } catch (error: any) {
    console.error('❌ Error fetching assessment:', error);
    res.status(500).json({ 
      error: 'Failed to fetch assessment',
      message: error.message
    });
  }
});

/**
 * POST /api/assessment/link-to-user
 * Link an assessment to a user account after signup
 */
router.post('/link-to-user', async (req: Request, res: Response) => {
  try {
    const { assessmentId, userId, email } = req.body;
    const { supabase } = req.app.locals;

    if (!userId) {
      return res.status(400).json({ 
        error: 'User ID is required' 
      });
    }

    // Build update query
    const updateData = { 
      user_id: userId, 
      status: 'linked',
      linked_at: new Date().toISOString()
    };

    let result;

    if (assessmentId) {
      // Link by assessment ID
      result = await supabase
        .from('assessment_results')
        .update(updateData)
        .eq('id', assessmentId)
        .select()
        .single();
    } else if (email) {
      // Link by email (get the most recent pending assessment)
      result = await supabase
        .from('assessment_results')
        .update(updateData)
        .eq('email', email)
        .eq('status', 'pending_email')
        .order('created_at', { ascending: false })
        .limit(1)
        .select()
        .single();
    } else {
      return res.status(400).json({ 
        error: 'Assessment ID or email is required' 
      });
    }

    const { data, error } = result;

    if (error) {
      console.error('❌ Error linking assessment:', error);
      return res.status(500).json({ 
        error: 'Failed to link assessment to user',
        details: error.message
      });
    }

    console.log('✅ Assessment linked to user:', userId);

    res.json({ 
      success: true, 
      assessment: data 
    });

  } catch (error: any) {
    console.error('❌ Error in link-to-user:', error);
    res.status(500).json({ 
      error: 'An unexpected error occurred',
      message: error.message
    });
  }
});

/**
 * GET /api/assessment/user/:userId
 * Get all assessments for a specific user
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { supabase } = req.app.locals;

    const { data, error } = await supabase
      .from('assessment_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching user assessments:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch assessments',
        details: error.message
      });
    }

    res.json({
      success: true,
      assessments: data || [],
      count: data?.length || 0
    });

  } catch (error: any) {
    console.error('❌ Error fetching user assessments:', error);
    res.status(500).json({ 
      error: 'An unexpected error occurred',
      message: error.message
    });
  }
});

// Helper function to generate assessment email HTML
function generateAssessmentEmail(assessmentData: AssessmentData): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #0f0f1a; color: #10b981; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f5f5f5; }
        .pattern { font-size: 24px; font-weight: bold; color: #10b981; margin: 20px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
        .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Your iVASA Assessment Results</h1>
        </div>

        <div class="content">
          <div class="pattern">Your Pattern: ${assessmentData.profile.pattern}</div>

          <h3>About Your Pattern:</h3>
          <p>You experience anxiety as ${assessmentData.profile.description}.</p>

          <p>When facing difficult choices, ${assessmentData.profile.cvdcPattern}. 
          This creates a particular kind of exhaustion - the paralysis of contradictions.</p>

          <p>${assessmentData.profile.chronicity}</p>

          <p><strong>Your Rest Capacity:</strong> ${assessmentData.profile.restCapacity}</p>

          <p><strong>Your Goal:</strong> ${assessmentData.profile.goal}</p>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

          <h3>Ready to start your therapeutic journey?</h3>
          <p>Create your free account to see your complete therapeutic profile and begin AI-powered therapy sessions.</p>

          <a href="https://beta.ivasa.ai/signup?source=email&profile=${assessmentData.encoded}" class="button">
            Create Your Free Account
          </a>
        </div>

        <div class="footer">
          <p>This assessment is based on Pure Contextual Perception (PCP) therapy methodology 
          developed by licensed therapist Mathew Quaschnick.</p>
          <p>© ${new Date().getFullYear()} iVASA. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export default router;