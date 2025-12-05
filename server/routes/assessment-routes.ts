import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Resend } from 'resend';

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

// V1 format (old metaphor-based assessment)
interface AssessmentDataV1 {
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

// V2 format (new CVDC/IBM/Thend pattern assessment)
interface AssessmentDataV2 {
  cvdc_score: number;
  ibm_score: number;
  thend_detected: boolean;
  cvdc_pattern: string;
  ibm_pattern: string;
  synthesis: string;
  age_range: string;
  answers: Record<string, string>;
  encoded?: string;
}

// Union type for both formats
type AssessmentData = AssessmentDataV1 | AssessmentDataV2;

/**
 * Detect assessment format version
 */
function detectAssessmentFormat(data: any): 'v1' | 'v2' {
  // V2 format has cvdc_score, ibm_score, synthesis directly on data
  if (data.cvdc_score !== undefined && data.synthesis !== undefined) {
    return 'v2';
  }
  // V1 format has profile object with pattern/metaphor
  if (data.profile?.pattern !== undefined) {
    return 'v1';
  }
  // Check if v2 data is in encoded field (could be JSON or Base64-encoded JSON)
  if (data.encoded) {
    try {
      let jsonString = data.encoded;

      // Check if it's Base64 encoded (starts with eyJ which is base64 for '{"')
      if (typeof data.encoded === 'string' && data.encoded.startsWith('eyJ')) {
        jsonString = Buffer.from(data.encoded, 'base64').toString('utf-8');
      }

      const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      if (parsed.cvdc_score !== undefined) {
        return 'v2';
      }
      // Check for v1 data in encoded field
      if (parsed.profile?.pattern !== undefined) {
        return 'v1';
      }
    } catch (e) {
      // Not valid JSON/Base64, continue
    }
  }
  // Default to v2 if ambiguous
  return 'v2';
}

/**
 * Normalize assessment data to database format
 * Handles both direct properties and encoded JSON string (may be Base64 encoded)
 */
function normalizeAssessmentData(data: any, version: 'v1' | 'v2') {
  if (version === 'v2') {
    // Check if v2 data is directly on object or needs to be parsed from encoded
    let v2Data = data;

    console.log('📋 normalizeAssessmentData input:', JSON.stringify(data, null, 2));
    console.log('📋 data.cvdc_score:', data.cvdc_score);
    console.log('📋 data.encoded:', data.encoded ? 'exists' : 'missing');

    if (data.cvdc_score === undefined && data.encoded) {
      // V2 data might be in encoded field - could be JSON or Base64-encoded JSON
      try {
        let jsonString = data.encoded;

        // Check if it's Base64 encoded (starts with eyJ which is base64 for '{"')
        if (typeof data.encoded === 'string' && data.encoded.startsWith('eyJ')) {
          console.log('📋 Detected Base64-encoded data, decoding...');
          jsonString = Buffer.from(data.encoded, 'base64').toString('utf-8');
          console.log('📋 Decoded string:', jsonString.substring(0, 100) + '...');
        }

        const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
        console.log('📋 Parsed encoded field:', JSON.stringify(parsed, null, 2));
        if (parsed.cvdc_score !== undefined) {
          console.log('📋 Merging parsed data with original data');
          v2Data = { ...data, ...parsed };
        }
      } catch (e) {
        console.error('⚠️ Failed to parse encoded field:', e);
      }
    }

    console.log('📋 Final v2Data.cvdc_score:', v2Data.cvdc_score);
    console.log('📋 Final v2Data.ibm_score:', v2Data.ibm_score);
    console.log('📋 Final v2Data.thend_detected:', v2Data.thend_detected);

    // New format - direct mapping
    const result = {
      cvdc_score: v2Data.cvdc_score ?? null,
      ibm_score: v2Data.ibm_score ?? null,
      thend_detected: v2Data.thend_detected ?? null,
      synthesis_text: v2Data.synthesis ?? null,
      age_range: v2Data.age_range ?? null,
      pattern_name: v2Data.cvdc_pattern ?? null,  // Map to existing field
      metaphor: v2Data.ibm_pattern ?? null,       // Map to existing field
      register: null,                              // Not used in v2
      profile_data: {
        cvdc_score: v2Data.cvdc_score,
        ibm_score: v2Data.ibm_score,
        thend_detected: v2Data.thend_detected,
        cvdc_pattern: v2Data.cvdc_pattern,
        ibm_pattern: v2Data.ibm_pattern,
        synthesis: v2Data.synthesis,
        age_range: v2Data.age_range,
      },
      answers: v2Data.answers || data.answers || {},
      assessment_version: 'v2',
      encoded: data.encoded || null,
    };

    console.log('📋 Normalized result:', JSON.stringify(result, null, 2));
    return result;
  } else {
    // Old format - existing mapping
    return {
      cvdc_score: null,
      ibm_score: null,
      thend_detected: null,
      synthesis_text: null,
      age_range: null,
      pattern_name: data.profile.pattern,
      metaphor: data.profile.metaphor,
      register: data.profile.register,
      profile_data: data.profile,
      answers: data.answers || {},
      assessment_version: 'v1',
      encoded: data.encoded || null,
    };
  }
}

/**
 * POST /api/assessment/save-for-later
 * Save assessment results for users who want to receive them via email
 * Note: This is a public endpoint (no auth required for initial capture)
 * Supports both v1 (metaphor-based) and v2 (CVDC/IBM/Thend) formats
 */
router.post('/save-for-later', async (req: Request, res: Response) => {
  try {
    const { email, assessmentData } = req.body as {
      email: string;
      assessmentData: any
    };

    if (!email || !assessmentData) {
      return res.status(400).json({
        error: 'Email and assessment data are required'
      });
    }

    console.log('📧 Saving assessment for email delivery:', email);

    // Import supabase from your app context
    const { supabase } = req.app.locals;

    // DETECT FORMAT VERSION
    const version = detectAssessmentFormat(assessmentData);
    console.log(`📋 Detected assessment version: ${version}`);

    // NORMALIZE DATA
    const normalized = normalizeAssessmentData(assessmentData, version);

    // Store assessment in database
    const { data, error } = await supabase
      .from('assessment_results')
      .insert({
        email,
        profile_data: normalized.profile_data,
        answers: normalized.answers,
        encoded_profile: normalized.encoded,
        pattern_name: normalized.pattern_name,
        metaphor: normalized.metaphor,
        register: normalized.register,
        cvdc_score: normalized.cvdc_score,
        ibm_score: normalized.ibm_score,
        thend_detected: normalized.thend_detected,
        synthesis_text: normalized.synthesis_text,
        age_range: normalized.age_range,
        assessment_version: normalized.assessment_version,
        status: 'pending_email',
        source: 'iframe',
        questions_answered: Object.keys(normalized.answers).length,
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
          html: generateAssessmentEmail(assessmentData, version)
        });
        console.log('✅ Assessment email sent to:', email);
      } catch (emailError) {
        console.error('⚠️ Email failed but assessment saved:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Assessment saved successfully',
      assessmentId: data?.id,
      version: version
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
 * POST /api/assessment/save
 * Save assessment results for authenticated users
 * This endpoint is for users completing the assessment while logged in
 * Supports both v1 (metaphor-based) and v2 (CVDC/IBM/Thend) formats
 */
router.post('/save', async (req: Request, res: Response) => {
  try {
    const { userId, email, assessmentData } = req.body as {
      userId: string;
      email: string;
      assessmentData: any;
    };

    if (!userId || !assessmentData) {
      return res.status(400).json({
        error: 'User ID and assessment data are required'
      });
    }

    console.log('📋 Saving assessment for user:', userId);

    const { supabase } = req.app.locals;

    // DETECT FORMAT VERSION
    const version = detectAssessmentFormat(assessmentData);
    console.log(`📋 Detected assessment version: ${version}`);

    // NORMALIZE DATA
    const normalized = normalizeAssessmentData(assessmentData, version);

    // Store assessment in database
    const { data, error } = await supabase
      .from('assessment_results')
      .insert({
        user_id: userId,
        email: email || null,
        profile_data: normalized.profile_data,
        answers: normalized.answers,
        encoded_profile: normalized.encoded,
        pattern_name: normalized.pattern_name,
        metaphor: normalized.metaphor,
        register: normalized.register,
        cvdc_score: normalized.cvdc_score,
        ibm_score: normalized.ibm_score,
        thend_detected: normalized.thend_detected,
        synthesis_text: normalized.synthesis_text,
        age_range: normalized.age_range,
        assessment_version: normalized.assessment_version,
        status: 'completed',
        source: 'dashboard_iframe',
        questions_answered: Object.keys(normalized.answers).length,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error saving assessment:', error);
      return res.status(500).json({
        error: 'Failed to save assessment',
        details: error.message
      });
    }

    // Update user_profiles with assessment data
    const profileUpdate: any = {
      assessment_completed_at: new Date().toISOString(),
      assessment_responses: normalized.answers,
      assessment_version: normalized.assessment_version,
    };

    if (version === 'v2') {
      profileUpdate.inner_landscape_type = normalized.pattern_name;
      profileUpdate.assessment_insights = normalized.synthesis_text;
      profileUpdate.cvdc_score = normalized.cvdc_score;
      profileUpdate.ibm_score = normalized.ibm_score;
      profileUpdate.thend_detected = normalized.thend_detected;
    } else {
      profileUpdate.inner_landscape_type = normalized.pattern_name;
      profileUpdate.assessment_insights = normalized.profile_data?.description || null;
    }

    const { error: profileError } = await supabase
      .from('user_profiles')
      .update(profileUpdate)
      .eq('id', userId);

    if (profileError) {
      console.error('⚠️ Failed to update user profile:', profileError);
    } else {
      console.log('✅ User profile updated with assessment data');
    }

    console.log('✅ Assessment saved successfully for user:', userId);

    res.json({
      success: true,
      message: 'Assessment saved successfully',
      assessmentId: data?.id,
      version: version
    });

  } catch (error: any) {
    console.error('❌ Error in save assessment:', error);
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
// Supports both v1 (metaphor-based) and v2 (CVDC/IBM/Thend) formats
function generateAssessmentEmail(assessmentData: any, version: 'v1' | 'v2'): string {
  const baseStyles = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #0f0f1a; color: #10b981; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f5f5f5; }
        .pattern { font-size: 24px; font-weight: bold; color: #10b981; margin: 20px 0; }
        .score-box { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .score-label { font-weight: bold; color: #666; }
        .score-value { font-size: 24px; color: #10b981; }
        .button { display: inline-block; padding: 12px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
        .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Your iVASA Assessment Results</h1>
        </div>`;

  const footer = `
        <div class="footer">
          <p>This assessment is based on Pure Contextual Perception (PCP) therapy methodology
          developed by licensed therapist Mathew Quaschnick.</p>
          <p>© ${new Date().getFullYear()} iVASA. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>`;

  if (version === 'v2') {
    // V2 format - CVDC/IBM/Thend based assessment
    return `${baseStyles}
        <div class="content">
          <h2>Your Inner Landscape Assessment Results</h2>

          <p>${assessmentData.synthesis}</p>

          <div class="score-box">
            <div style="display: flex; justify-content: space-around; text-align: center;">
              <div>
                <div class="score-label">CVDC Score</div>
                <div class="score-value">${assessmentData.cvdc_score}/7</div>
              </div>
              <div>
                <div class="score-label">IBM Score</div>
                <div class="score-value">${assessmentData.ibm_score}/7</div>
              </div>
            </div>
          </div>

          ${assessmentData.cvdc_pattern ? `<p><strong>Pattern Observed:</strong> ${assessmentData.cvdc_pattern}</p>` : ''}
          ${assessmentData.ibm_pattern ? `<p><strong>Behavioral Insight:</strong> ${assessmentData.ibm_pattern}</p>` : ''}

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

          <h3>Ready to continue?</h3>
          <p>Sign in to iVASA to explore your complete therapeutic profile and begin AI-powered therapy sessions.</p>

          <a href="https://beta.ivasa.ai/signup?source=email${assessmentData.encoded ? `&profile=${assessmentData.encoded}` : ''}" class="button">
            Sign in to iVASA
          </a>
        </div>
    ${footer}`;
  } else {
    // V1 format - Original metaphor-based assessment
    return `${baseStyles}
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
    ${footer}`;
  }
}

export default router;