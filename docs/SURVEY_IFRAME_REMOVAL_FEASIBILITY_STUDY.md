# Feasibility Study: Survey Iframe Removal from Onboarding Flow

**Date:** December 31, 2025
**Author:** Claude (Automated Analysis)
**Branch:** `claude/survey-iframe-removal-study-AXUHD`

---

## Executive Summary

This document provides a comprehensive feasibility analysis for removing the "survey iframe" (Inner Landscape Assessment) from the onboarding flow for new clients or existing clients who have not completed the survey.

### Key Findings

| Aspect | Assessment |
|--------|------------|
| **Technical Feasibility** | HIGH - Straightforward code changes |
| **Development Effort** | LOW-MODERATE (~2-4 hours) |
| **Risk Level** | MEDIUM - Therapeutic personalization impact |
| **Files Affected** | 5 primary files |
| **Breaking Changes** | None - Backward compatible |
| **Recommended Approach** | Feature flag for optional bypass |

---

## 1. Current Implementation Overview

### 1.1 What Is the "Survey Iframe"?

The survey is **NOT** an external survey service (like Typeform or Google Forms). It is the **Inner Landscape Assessment** - a 5-question psychological assessment that:

- **Source:** Hosted at `https://start.ivasa.ai` (external Replit app)
- **Purpose:** Collects therapeutic pattern data (CVDC/IBM scores, register type)
- **Integration:** Embedded via iframe using postMessage API for communication

### 1.2 Current Onboarding Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER ONBOARDING FLOW                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. USER SIGNS IN                                                   │
│         │                                                           │
│         ▼                                                           │
│  2. CONSENT POPUP (ConsentPopup.tsx)                                │
│     ├── AI Therapy Limitations disclosure                          │
│     ├── Data Security & Privacy disclosure                         │
│     └── User must check both acknowledgments                       │
│         │                                                           │
│         ▼                                                           │
│  3. ASSESSMENT IFRAME (AssessmentIframe.tsx) ◄── THIS IS THE SURVEY │
│     ├── 5-question psychological assessment                        │
│     ├── Collects CVDC/IBM scores                                   │
│     ├── Determines register type (symbolic/imaginary/real)         │
│     └── BLOCKING: User cannot proceed without completion           │
│         │                                                           │
│         ▼                                                           │
│  4. DASHBOARD (role-specific)                                       │
│     ├── Individual: VoiceInterface + SessionAnalysis               │
│     ├── Therapist: TherapistDashboard                              │
│     ├── Client: ClientDashboard                                    │
│     ├── Partner: PartnerDashboard                                  │
│     ├── Influencer: InfluencerDashboard                            │
│     └── Admin: AdminDashboard                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 Assessment Iframe Component

**File:** `client/src/components/AssessmentIframe.tsx`

```typescript
interface AssessmentIframeProps {
  onComplete?: (data: AssessmentData) => void;
  className?: string;
  dashboardMode?: boolean; // Skip built-in navigation for logged-in users
}
```

**PostMessage Events Handled:**
- `IFRAME_READY` - Quiz is ready to display
- `RESIZE_IFRAME` - Adjust iframe height dynamically
- `ASSESSMENT_COMPLETE` - User finished the assessment

**External Source:** `https://start.ivasa.ai?mode=dashboard`

---

## 2. User State Tracking

### 2.1 Database Fields (user_profiles table)

| Field | Type | Purpose |
|-------|------|---------|
| `assessment_completed_at` | TIMESTAMPTZ | Timestamp when assessment was completed |
| `assessment_responses` | JSONB | All 5 question responses |
| `inner_landscape_type` | VARCHAR(100) | Identified pattern (e.g., "The Trapped Rebel") |
| `assessment_insights` | TEXT | Summary insights from assessment |
| `cvdc_score` | INTEGER | Contradictory Value-Desire Conflict score (0-7) |
| `ibm_score` | INTEGER | Incoherent Behavior Matrix score (0-7) |
| `thend_detected` | BOOLEAN | Therapeutic shift potential detected |
| `assessment_version` | VARCHAR(10) | 'v1' (metaphor) or 'v2' (CVDC/IBM) |
| `register_type` | VARCHAR(20) | 'symbolic', 'imaginary', or 'real' |
| `gender` | VARCHAR(20) | User's gender for context |

### 2.2 How Completion Is Checked

**File:** `client/src/pages/dashboard.tsx` (lines 433-439)

```typescript
if (!profile?.assessment_completed_at) {
  console.log('📋 [DASHBOARD] No assessment found, showing assessment modal');
  setShowAssessmentModal(true);
} else {
  console.log('✅ [DASHBOARD] Assessment already completed');
  setAssessmentChecked(true);
}
```

---

## 3. Dependencies Analysis

### 3.1 Dashboard Flow Control (CRITICAL)

**File:** `client/src/pages/dashboard.tsx`

The dashboard enforces assessment completion before showing content:

| Line Range | Purpose | Blocking? |
|------------|---------|-----------|
| 28-29 | State variables (`showAssessmentModal`, `assessmentChecked`) | - |
| 433-439 | Assessment completion check in useEffect | YES |
| 462-469 | Post-consent assessment check | YES |
| 612-624 | Modal rendering for AssessmentIframe | YES |
| 639-647 | Loading state while waiting for check | YES |

### 3.2 Memory Service (IMPORTANT)

**File:** `server/services/memory-service.ts` (lines 313-427)

Assessment data is fetched and injected into AI agent memory context:

```typescript
const { data: assessmentData } = await supabase
  .from('user_profiles')
  .select('assessment_completed_at, assessment_responses, inner_landscape_type,
           assessment_insights, cvdc_score, ibm_score, thend_detected,
           assessment_version, register_type')
  .eq('id', userId)
  .single();
```

**Usage:**
- First session: Full assessment data included in context
- Subsequent sessions: Lighter reference to patterns
- AI agent uses this data to personalize therapeutic responses

### 3.3 Assessment API Routes

**File:** `server/routes/assessment-routes.ts`

| Endpoint | Purpose |
|----------|---------|
| `POST /api/assessment/save` | Save assessment for authenticated users |
| `POST /api/assessment/save-for-later` | Save assessment for email delivery (pre-signup) |
| `POST /api/assessment/link-to-user` | Link pending assessment to new account |
| `GET /api/assessment/:id` | Retrieve assessment by ID |
| `GET /api/assessment/user/:userId` | Get all assessments for a user |

### 3.4 Schema Definition

**File:** `shared/schema.ts`

Tables involved:
- `user_profiles` - Primary storage for assessment completion status
- `assessment_results` - Detailed assessment data and answers
- `user_onboarding_responses` - Legacy table (UNUSED)

---

## 4. Therapeutic Impact Analysis

### 4.1 What Would Be Lost Without Assessment

| Feature | Impact | Severity |
|---------|--------|----------|
| **Initial Pattern Recognition** | AI agent loses knowledge of user's psychological pattern | MEDIUM |
| **CVDC/IBM Score Data** | Cannot reference evidence-based therapeutic frameworks | HIGH |
| **Inner Landscape Insights** | No personalized insights provided at onboarding | MEDIUM |
| **Memory Context Customization** | Generic context instead of personalized | MEDIUM |
| **First Session Personalization** | AI cannot tailor first therapeutic conversation | HIGH |

### 4.2 Memory Context Comparison

**WITH Assessment (First Session):**
```
===== PRE-SESSION ASSESSMENT =====
Before this first session, John completed an Inner Landscape Assessment.

📊 Assessment Scores:
  - CVDC Score: 5/7 (Contradictory Value-Desire Conflict)
  - IBM Score: 4/7 (Incoherent Behavior Matrix)
  - Thend Pattern: Detected (therapeutic shift potential identified)
  - Register: symbolic (primary experiential mode)

🔍 Primary Pattern: The Trapped Rebel

📋 Synthesis:
You experience anxiety as being caught between competing desires...

💡 Use this assessment data to inform your therapeutic approach.
===== END ASSESSMENT =====
```

**WITHOUT Assessment:**
```
This is your first session together.
```

---

## 5. Implementation Options

### Option A: Complete Removal (NOT RECOMMENDED)

Remove all assessment code and make it non-existent.

**Pros:**
- Simplest implementation
- Fastest onboarding

**Cons:**
- Loses all therapeutic personalization
- Requires updating memory service
- May degrade therapy quality

### Option B: Feature Flag (RECOMMENDED)

Add a feature flag to make assessment optional/skippable.

**Pros:**
- Reversible
- Can be toggled per environment
- Maintains all existing functionality
- Can A/B test impact

**Cons:**
- Slightly more complex implementation

### Option C: Delayed Assessment

Allow users to skip and complete later from dashboard.

**Pros:**
- User choice
- Better onboarding experience
- Assessment data still available

**Cons:**
- More UI work required
- Users may never complete

---

## 6. Recommended Implementation (Option B)

### 6.1 Changes Required

#### File 1: `client/src/pages/dashboard.tsx`

**Add feature flag check (approximately lines 433-439):**

```typescript
// Feature flag to make assessment optional
const ASSESSMENT_REQUIRED = import.meta.env.VITE_REQUIRE_ASSESSMENT !== 'false';

// Replace existing check with:
if (ASSESSMENT_REQUIRED && !profile?.assessment_completed_at) {
  console.log('📋 [DASHBOARD] Assessment required but not found, showing modal');
  setShowAssessmentModal(true);
} else {
  console.log('✅ [DASHBOARD] Assessment check passed (completed or not required)');
  setAssessmentChecked(true);
}
```

**Same pattern for lines 462-469:**

```typescript
if (ASSESSMENT_REQUIRED && !profile?.assessment_completed_at) {
  console.log('📋 [DASHBOARD] Showing assessment iframe');
  setShowAssessmentModal(true);
} else {
  console.log('✅ [DASHBOARD] Proceeding without assessment');
  setAssessmentChecked(true);
}
```

#### File 2: `server/services/memory-service.ts`

**Update to handle missing assessment gracefully (around line 360):**

```typescript
if (assessmentData?.assessment_completed_at) {
  // Existing assessment context building...
} else {
  // Fallback for users without assessment
  memoryContext += `\n📋 Note: ${userName} has not completed an initial assessment. `;
  memoryContext += `Explore their concerns naturally during this session.\n\n`;
}
```

#### File 3: Environment Variable

**Add to `.env`:**
```env
# Set to 'false' to make Inner Landscape Assessment optional
VITE_REQUIRE_ASSESSMENT=true
```

### 6.2 Files That Need NO Changes

- `client/src/components/AssessmentIframe.tsx` - Keep as-is
- `client/src/components/ConsentPopup.tsx` - Keep as-is
- `server/routes/assessment-routes.ts` - Keep as-is
- `shared/schema.ts` - Keep as-is
- All migration files - Keep as-is

---

## 7. Testing Checklist

### 7.1 With Assessment Required (VITE_REQUIRE_ASSESSMENT=true)

- [ ] New user signup → Consent → Assessment → Dashboard
- [ ] Existing user without assessment → Shows assessment modal
- [ ] User completes assessment → Data saved to user_profiles
- [ ] AI agent receives assessment data in memory context

### 7.2 With Assessment Bypassed (VITE_REQUIRE_ASSESSMENT=false)

- [ ] New user signup → Consent → Dashboard (no assessment)
- [ ] Existing user without assessment → Dashboard (no modal)
- [ ] First voice session works without assessment data
- [ ] AI agent generates appropriate fallback context
- [ ] No console errors about missing assessment
- [ ] All user types route correctly:
  - [ ] Individual users
  - [ ] Therapists
  - [ ] Clients
  - [ ] Partners
  - [ ] Influencers
  - [ ] Admins

### 7.3 Edge Cases

- [ ] User has partial assessment data (assessment_completed_at but no responses)
- [ ] User has V1 assessment format (metaphor-based)
- [ ] User has V2 assessment format (CVDC/IBM)
- [ ] Mobile responsive flows work
- [ ] Pre-existing assessment data persists correctly

---

## 8. Data Migration Requirements

### 8.1 Existing User Data

**No migration required.** The implementation is backward compatible:

- Users with `assessment_completed_at` timestamp: Continue to have personalized experience
- Users without assessment: Will skip to dashboard when flag is disabled
- Database fields remain unchanged

### 8.2 Rollback Plan

To re-enable assessment requirement:

1. Set `VITE_REQUIRE_ASSESSMENT=true` in environment
2. Rebuild and deploy frontend
3. All users without assessment will see modal again

---

## 9. Effort Estimation

| Task | Estimated Time |
|------|---------------|
| Add feature flag to dashboard.tsx | 30 minutes |
| Update memory-service.ts fallback | 30 minutes |
| Add environment variable | 10 minutes |
| Testing (all scenarios) | 2-3 hours |
| Documentation update | 30 minutes |
| **Total** | **3-5 hours** |

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Degraded therapy quality without assessment | Medium | High | Keep assessment enabled by default; measure outcomes |
| Users confused by optional assessment | Low | Low | Clear messaging in consent flow |
| Memory context errors | Low | Medium | Add null checks and fallback messages |
| Database inconsistencies | Very Low | Low | Assessment fields already nullable |

---

## 11. Recommendations

### Immediate Action

1. **Implement Option B (Feature Flag)** - This provides maximum flexibility with minimal risk
2. **Keep assessment enabled by default** - Preserve therapeutic quality
3. **Use flag only for testing/specific users** - Until impact is understood

### Future Considerations

1. **A/B Testing** - Compare therapy outcomes with/without assessment
2. **Delayed Assessment UI** - Add "Complete Assessment" button in dashboard
3. **Simplified Assessment** - Consider a 2-3 question quick version
4. **Progressive Assessment** - Collect data across first few sessions instead

---

## 12. Appendix: File References

| File | Purpose | Lines Affected |
|------|---------|----------------|
| `client/src/pages/dashboard.tsx` | Main flow control | 28-29, 433-439, 462-469, 612-624, 639-647 |
| `client/src/components/AssessmentIframe.tsx` | Iframe component | None (keep as-is) |
| `client/src/components/ConsentPopup.tsx` | Disclosure popup | None (keep as-is) |
| `server/services/memory-service.ts` | AI memory context | 313-427 |
| `server/routes/assessment-routes.ts` | Assessment API | None (keep as-is) |
| `shared/schema.ts` | Database schema | None (keep as-is) |
| `migrations/002_add_assessment_fields.sql` | DB migration | None (keep as-is) |

---

## 13. Conclusion

**Removing the survey iframe from the onboarding flow is FEASIBLE** with:

- Low-to-moderate development effort (3-5 hours)
- No database migrations required
- Backward compatible implementation
- Reversible via feature flag

**Recommendation:** Implement the feature flag approach to allow controlled testing while preserving the option to restore full assessment flow. Monitor therapy session quality metrics before making assessment permanently optional.

---

*This document was generated through automated codebase analysis. All code snippets and file references are based on the current state of the VASA-PLUS repository.*
