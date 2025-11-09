# Inner Landscape Assessment Integration Guide

This document explains how to integrate the external assessment funnel (hosted at start.ivasa.ai on Replit) with the VASA-PLUS backend to store assessment results in user profiles.

## Overview

The integration allows assessment data from the external funnel to be:
1. Captured via webhook when assessment is completed
2. Linked to user accounts when they sign up
3. Stored in the database for future therapeutic use
4. Used to hide the assessment CTA for users who've already completed it

## Database Schema

### New Fields in `user_profiles` Table

```sql
-- Assessment completion timestamp
assessment_completed_at TIMESTAMPTZ

-- Full assessment responses (all 5 questions)
assessment_responses JSONB

-- Identified pattern/type from assessment
inner_landscape_type VARCHAR(100)

-- Summary insights from assessment
assessment_insights TEXT
```

### Migration File

Run the migration to add these fields:

```bash
psql $DATABASE_URL -f migrations/002_add_assessment_fields.sql
```

## API Endpoints

### 1. Webhook Endpoint (POST /api/assessment/webhook)

**Purpose:** Receives assessment data from Replit when user completes the assessment.

**URL:** `https://your-vasa-domain.com/api/assessment/webhook`

**Request Body:**
```json
{
  "email": "user@example.com",
  "responses": {
    "question1": "answer1",
    "question2": "answer2",
    "question3": "answer3",
    "question4": "answer4",
    "question5": "answer5"
  },
  "landscapeType": "Anxious Avoidant",
  "insights": "Summary of the user's pattern and recommendations"
}
```

**Response (User Exists):**
```json
{
  "success": true,
  "message": "Assessment data saved successfully",
  "userId": "uuid"
}
```

**Response (User Doesn't Exist Yet):**
```json
{
  "success": true,
  "message": "Assessment received. Complete signup to link results.",
  "pendingAssessment": true
}
```

### 2. Link Endpoint (POST /api/assessment/link)

**Purpose:** Links pending assessment data to a newly created user account.

**URL:** `https://your-vasa-domain.com/api/assessment/link`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "assessmentData": {
    "responses": { ... },
    "landscapeType": "Anxious Avoidant",
    "insights": "Summary text"
  }
}
```

### 3. Status Endpoint (GET /api/assessment/status/:userId)

**Purpose:** Check if a user has completed the assessment.

**URL:** `https://your-vasa-domain.com/api/assessment/status/:userId`

**Response:**
```json
{
  "completed": true,
  "landscapeType": "Anxious Avoidant",
  "completedAt": "2025-11-08T12:00:00Z"
}
```

## Integration Flow

### Flow 1: Assessment → Sign Up

1. User clicks "Begin." button on landing page
2. Opens start.ivasa.ai in new tab
3. User completes 5-question assessment
4. Replit sends webhook to `/api/assessment/webhook`
5. User doesn't exist yet → Store "pending" status
6. User returns to VASA and signs up
7. During signup, check localStorage for `pendingAssessmentData`
8. Call `/api/assessment/link` to attach assessment to profile

### Flow 2: Sign Up → Assessment

1. User signs up first
2. User clicks "Begin." button
3. Completes assessment on start.ivasa.ai
4. Replit sends webhook to `/api/assessment/webhook`
5. User exists → Direct save to database
6. Assessment data immediately available in profile

## Replit Configuration

### Required Changes to Replit Assessment

Add webhook call at the end of the assessment:

```javascript
// After assessment is completed
async function submitAssessment(email, responses, landscapeType, insights) {
  try {
    const response = await fetch('https://your-vasa-domain.com/api/assessment/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        responses: responses,
        landscapeType: landscapeType,
        insights: insights
      })
    });

    const data = await response.json();

    if (data.pendingAssessment) {
      // User doesn't exist yet - store in localStorage
      localStorage.setItem('pendingAssessmentData', JSON.stringify({
        responses,
        landscapeType,
        insights
      }));

      // Redirect to signup
      window.location.href = 'https://your-vasa-domain.com/?from=assessment';
    } else {
      // User exists - show completion message
      showSuccessMessage('Assessment complete! Return to iVASA to continue.');
    }
  } catch (error) {
    console.error('Failed to submit assessment:', error);
  }
}
```

### URL Parameter Tracking

Add `?from=assessment` parameter when redirecting to track users coming from assessment:

```javascript
if (data.pendingAssessment) {
  window.location.href = 'https://your-vasa-domain.com/?from=assessment';
}
```

## Frontend Integration

### Landing Page CTA

The Assessment CTA appears on the landing page (client/src/components/authentication.tsx):

```tsx
{/* Assessment CTA Section */}
<div className="mt-16 w-full max-w-3xl mx-auto">
  <Card className="glass rounded-2xl border-2 border-emerald-400/60">
    <CardContent className="p-8 md:p-10">
      <div className="text-center space-y-4">
        <h3 className="text-xl md:text-2xl text-white font-semibold">
          Complementary Assessment
        </h3>
        <p className="text-muted-foreground text-sm md:text-base max-w-lg mx-auto">
          Complete 5 questions to better understand how iVASA practitioners can assist you.
        </p>
        <Button
          onClick={() => window.open('https://start.ivasa.ai', '_blank')}
          className="bg-gradient-to-r from-primary to-accent py-3 px-8 rounded-xl"
        >
          Begin.
        </Button>
      </div>
    </CardContent>
  </Card>
</div>
```

### Automatic Linking on Signup

When users sign up, the dashboard automatically checks for pending assessment data and links it:

```typescript
// In dashboard.tsx - ensureUserProfile function
const pendingAssessment = localStorage.getItem('pendingAssessmentData');
if (pendingAssessment) {
  const assessmentData = JSON.parse(pendingAssessment);

  await fetch('/api/assessment/link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      userId: user.id,
      email: user.email,
      assessmentData
    })
  });

  localStorage.removeItem('pendingAssessmentData');
}
```

## Onboarding Questionnaire Replacement

### Automatic Skip Logic

Users who complete the Inner Landscape Assessment will **automatically skip** the onboarding questionnaire. This prevents redundant data collection since the assessment provides richer insights than the basic onboarding questions.

**Logic Flow:**
1. User completes assessment (before or after signup)
2. `assessment_completed_at` timestamp is set in database
3. Dashboard checks for `assessment_completed_at`
4. If present → Skip onboarding questionnaire
5. If absent → Show normal onboarding flow

**Implementation:**
```typescript
// In dashboard.tsx
if (profile.assessment_completed_at) {
  console.log('✅ Assessment completed, skipping onboarding');
  setOnboardingChecked(true);
  sessionStorage.setItem('onboarding_completed_this_session', 'true');
} else {
  // Show regular onboarding questionnaire
  setShowOnboarding(true);
}
```

**Benefits:**
- Better user experience (no duplicate questions)
- Higher completion rates (one form instead of two)
- Richer data (assessment provides deeper insights)
- Seamless flow from assessment to therapy

## Using Assessment Data in Therapy

### Accessing Assessment Data

```typescript
// Get user profile with assessment data
const { data: profile } = await supabase
  .from('user_profiles')
  .select('assessment_completed_at, assessment_responses, inner_landscape_type, assessment_insights')
  .eq('id', userId)
  .single();

if (profile.assessment_completed_at) {
  // User has completed assessment
  console.log('Landscape Type:', profile.inner_landscape_type);
  console.log('Insights:', profile.assessment_insights);
  console.log('Responses:', profile.assessment_responses);
}
```

### Therapeutic Context

The assessment data can be used to:
1. Pre-populate initial therapeutic context
2. Customize agent behavior based on anxiety pattern
3. Track progress against initial assessment
4. Provide personalized recommendations

## Security Considerations

### Webhook Security

Add webhook signature verification:

```typescript
// In assessment-routes.ts
const crypto = require('crypto');

function verifyWebhookSignature(payload: string, signature: string) {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.ASSESSMENT_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

### Environment Variables

Add to `.env`:

```bash
# Assessment Integration
ASSESSMENT_WEBHOOK_SECRET=your_secret_key_here
```

## Testing

### Test Webhook Locally

```bash
curl -X POST http://localhost:5000/api/assessment/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "responses": {
      "q1": "answer1",
      "q2": "answer2",
      "q3": "answer3",
      "q4": "answer4",
      "q5": "answer5"
    },
    "landscapeType": "Test Pattern",
    "insights": "Test insights"
  }'
```

### Test Link Endpoint

```bash
curl -X POST http://localhost:5000/api/assessment/link \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "userId": "user-uuid",
    "email": "test@example.com",
    "assessmentData": {
      "responses": {...},
      "landscapeType": "Test Pattern",
      "insights": "Test insights"
    }
  }'
```

## Deployment Checklist

- [ ] Run database migration (002_add_assessment_fields.sql)
- [ ] Deploy updated backend with assessment routes
- [ ] Update Replit assessment to call webhook
- [ ] Set environment variables (ASSESSMENT_WEBHOOK_SECRET)
- [ ] Test webhook integration
- [ ] Test signup flow with pending assessment
- [ ] Verify data appears in user profiles
- [ ] Test assessment CTA visibility

## Monitoring

### Key Metrics to Track

1. **Assessment Completion Rate**
   - How many users click "Begin."
   - How many complete all 5 questions

2. **Conversion Rate**
   - Assessment → Signup
   - Signup → Assessment

3. **Data Quality**
   - Are responses being stored correctly?
   - Are insights being generated?

### Logging

Check logs for:
```
📋 [ASSESSMENT] Webhook received for: email
✅ [ASSESSMENT] Assessment data saved for user: userId
🔗 [ASSESSMENT] Linking assessment to user: userId
```

## Troubleshooting

### Issue: Assessment data not saving

**Check:**
1. Is migration applied? `SELECT column_name FROM information_schema.columns WHERE table_name='user_profiles'`
2. Are routes mounted? Check `/api/health` endpoint
3. Is webhook URL correct in Replit?

### Issue: Pending assessment not linking

**Check:**
1. Is localStorage available?
2. Is `pendingAssessmentData` key present?
3. Check browser console for errors
4. Verify auth token is valid

### Issue: CTA still showing after assessment

**Check:**
1. Is user authenticated?
2. CTA only shows on Authentication component (unauthenticated users)
3. Once signed in, dashboard is shown instead

## Future Enhancements

1. **Assessment Retakes**: Allow users to retake assessment after 90 days
2. **Progress Tracking**: Compare current state to initial assessment
3. **Personalized Insights**: Use assessment data to customize therapeutic approach
4. **Assessment History**: Track changes in landscape type over time
5. **Email Notifications**: Send assessment summary via email
