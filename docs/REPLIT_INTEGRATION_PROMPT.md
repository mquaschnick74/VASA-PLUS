# Claude Code Prompt for start.ivasa.ai Integration

**Copy and paste this entire prompt into a new Claude Code conversation connected to the start.ivasa.ai repository:**

---

## Context

I have a 5-question Inner Landscape Assessment funnel at start.ivasa.ai that helps users understand their emotional patterns. This assessment needs to send results to a VASA-PLUS backend API so that:

1. Assessment responses are saved to the user's profile in the database
2. An AI therapy agent can use this data as context in therapeutic conversations

The VASA-PLUS backend is already fully implemented with a webhook endpoint ready to receive data. I need you to implement the sending side on this Replit assessment.

## Your Task

Add webhook integration to send assessment results to the VASA backend when a user completes all 5 questions.

## Technical Specifications

### Webhook Endpoint

**URL:** `https://[VASA-DOMAIN]/api/assessment/webhook`

Replace `[VASA-DOMAIN]` with the actual deployed domain (I'll provide this).

**Method:** POST

**Headers:**
```json
{
  "Content-Type": "application/json"
}
```

**Payload Format:**
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
  "landscapeType": "Pattern Name",
  "insights": "Summary insights about the user's pattern"
}
```

### Payload Details

- **email** (required): User's email address - this is the key to link assessment to their VASA account
- **responses** (required): Object containing all question-answer pairs. Keys can be question text or identifiers (e.g., "q1", "q2")
- **landscapeType** (optional): The identified emotional/behavioral pattern name (e.g., "Anxious Avoidant", "Secure Attachment")
- **insights** (optional): Summary text about their pattern and what it means

### Expected Response

The webhook will return:

**Success - User Exists:**
```json
{
  "success": true,
  "message": "Assessment data saved successfully",
  "userId": "user-id-here"
}
```

**Success - User Doesn't Exist Yet:**
```json
{
  "success": true,
  "message": "Assessment received. Complete signup to link results.",
  "pendingAssessment": true
}
```

**Error:**
```json
{
  "error": "Error message here"
}
```

## Implementation Requirements

1. **Email Capture**: Ensure you're capturing the user's email address (if not already done)

2. **Send on Completion**: Call the webhook after the user completes the final question and you've calculated their results

3. **Handle Pending State**: If response contains `pendingAssessment: true`, store the data in localStorage so it can be retrieved when they sign up:
   ```javascript
   localStorage.setItem('pendingAssessmentData', JSON.stringify({
     responses: responses,
     landscapeType: landscapeType,
     insights: insights
   }));
   ```

4. **Error Handling**: Log errors gracefully, don't block the user's experience if webhook fails

5. **Optional Redirect**: After successful send, optionally redirect user to VASA signup with `?from=assessment` parameter

## Example Implementation

Here's example code you can adapt:

```javascript
async function sendAssessmentToVASA(email, responses, landscapeType, insights) {
  const webhookUrl = 'https://[VASA-DOMAIN]/api/assessment/webhook';

  try {
    console.log('📤 Sending assessment data to VASA...');

    const response = await fetch(webhookUrl, {
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

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Assessment sent successfully:', data);

    if (data.pendingAssessment) {
      // User hasn't signed up yet - store for later
      console.log('⏳ User needs to sign up - storing in localStorage');
      localStorage.setItem('pendingAssessmentData', JSON.stringify({
        responses: responses,
        landscapeType: landscapeType,
        insights: insights
      }));

      // Optional: Show message encouraging signup
      showMessage('Complete your VASA signup to save your results!');

      // Optional: Redirect to signup
      setTimeout(() => {
        window.location.href = `https://[VASA-DOMAIN]/?from=assessment`;
      }, 2000);
    } else {
      // User already exists - data saved!
      console.log('✅ Assessment saved to existing account');
      showMessage('Your results have been saved to your VASA account!');
    }

    return data;

  } catch (error) {
    console.error('❌ Failed to send assessment to VASA:', error);
    // Don't block user experience - just log the error
    return null;
  }
}

// Call this after assessment completion
// Example usage:
const userEmail = getUserEmail(); // Your function to get email
const allResponses = getAllResponses(); // Your function to collect responses
const pattern = calculatePattern(); // Your function to determine pattern
const summary = generateInsights(); // Your function to create insights

await sendAssessmentToVASA(userEmail, allResponses, pattern, summary);
```

## Testing

After implementation, test by:

1. Complete the assessment with a test email
2. Check browser console for success messages
3. Verify VASA backend receives the data (I can check server logs)
4. Test both scenarios:
   - User who already has VASA account
   - User who hasn't signed up yet

## Questions to Answer First

Before you start, please:

1. **Show me the current code structure** - where is the assessment logic? Where are results calculated?
2. **Confirm email collection** - are you already capturing user email? Where?
3. **Identify completion point** - where in the code does the user "finish" the assessment?
4. **Show response structure** - what format are question/answer pairs currently stored in?

## Additional Notes

- The VASA backend handles all database operations - you just need to send the data
- Email matching is case-insensitive on the backend
- The webhook is CORS-enabled and ready to receive requests
- If a user completes the assessment multiple times, the latest data overwrites previous
- This integration is optional for user experience - if it fails, the assessment should still work

## What I Need From You

1. Analyze the current codebase and show me where to integrate this
2. Implement the webhook call at the appropriate point
3. Add error handling and localStorage backup for pending users
4. Test and confirm it's working

Please start by exploring the codebase and identifying where the assessment completion happens and where user responses are currently stored.
