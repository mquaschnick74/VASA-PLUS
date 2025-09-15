# CSS (Core Symbol Set) Tracking Architecture

## Overview
Real-time detection of therapeutic patterns in voice conversations, tracking CSS stages (CVDC/IBM/Thend/CYVC) and register dominance (Symbolic/Imaginary/Real) through natural language processing and metadata extraction. The system now provides personalized, stage-aware therapeutic responses based on actual client statements rather than generic responses.

## Core CSS Stages

### Pattern Types
- **CVDC** (Contradiction) - Two opposing desires/pulls
- **IBM** (Intention-Behavior Mismatch) - Gap between saying and doing  
- **Thend** (Therapeutic End) - Shift or integration moment
- **CYVC** (Contextual Variation) - Flexible choice/agency

### Register Dominance
- **Symbolic** - Over-intellectualizing, abstract thinking
- **Imaginary** - What-if scenarios, rumination
- **Real** - Immediate sensation/affect, low symbolization

## Stage Progression Tracking

### CSS Progressions Table
```sql
CREATE TABLE css_progressions (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  from_stage VARCHAR,        -- Previous CSS stage
  to_stage VARCHAR,          -- New CSS stage  
  trigger_content TEXT,      -- Actual client quote that triggered transition
  transition_context TEXT,   -- Therapeutic context of transition
  confidence NUMERIC,
  created_at TIMESTAMP
);
```

### Stage Transitions
```
pointed_origin → focus_bind → suspension → pointed_origin (cycle)
                    ↓              ↓
                  CYVC          Thend
```

## Agent System v3 Architecture

### Natural Voice Separation
```xml
<speak>
Natural therapeutic conversation without tracking codes
</speak>
<meta>
{
  "register": "symbolic|imaginary|real|mixed|undetermined",
  "css": {
    "stage": "CVDC|SUSPENSION|THEND|CYVC|NONE",
    "evidence": ["user quotes"],
    "confidence": 0.0-1.0
  },
  "safety": {
    "flag": boolean,
    "crisis": boolean,
    "reason": "self_harm|harm_to_others|medical"
  }
}
</meta>
```

### Processing Pipeline
```javascript
// server/utils/parseAssistantOutput.ts
parseAssistantOutput(text) {
  const speak = extractSpeak(text);    // For TTS
  const meta = extractMeta(text);      // For tracking
  return { speak, meta };
}
```

## Enhanced Pattern Detection System

### CVDC Detection
```javascript
// Flexible regex patterns with context capture
const cvdcPatterns = [
  /part of me.{0,50}(but|while|yet).{0,50}another part/gi,
  /I want.{0,30}but.{0,30}I (also want|need)/gi,
  /torn between/gi,
  /contradiction between/gi
];

// Example detection:
"I want to connect with people but I also need my space"
→ Stage: CVDC
→ Trigger: "want to connect but need my space"
→ Register: Imaginary
```

### IBM Detection  
```javascript
const ibmPatterns = [
  /I (say|tell myself).{0,30}but.{0,30}I (do|act|behave)/gi,
  /I know.{0,30}but.{0,30}I still/gi,
  /intention.{0,30}but.{0,30}action/gi
];

// Example:
"I tell myself I'll wake up early but I always hit snooze"
→ Stage: IBM
→ Trigger: Complete quote stored
```

### Thend Indicators
```javascript
const thendPatterns = [
  /something.{0,20}(shifted|changed|different)/gi,
  /I (realize|understand|see) now/gi,
  /new perspective/gi,
  /I can hold both/gi
];
```

### CYVC Patterns
```javascript
const cyvcPatterns = [
  /sometimes.{0,30}other times/gi,
  /depends on.{0,20}context/gi,
  /I can choose/gi
];
```

## Personalized Memory Context System

### Enhanced Context Building
```typescript
// server/services/memory-service.ts
buildEnhancedMemoryContext(userId, agentName) {
  // 1. Get CSS progressions with actual quotes
  const cssProgressions = await getCSSProgressions(userId);
  
  // 2. Build personalized greeting
  const verbalAcknowledgment = createVerbalAcknowledgment(
    firstName,
    lastSession,
    agentName,
    cssProgressions // Now includes trigger_content
  );
  
  // 3. Generate stage-aware context
  return {
    context: buildCSSContext(progressions),
    verbalAcknowledgment: personalizedGreeting
  };
}
```

### Personalized Verbal Acknowledgments
```typescript
// Example outputs based on actual CSS data:

// For suspension stage with trigger quote:
"Hello Sophia, last time you reached that place of holding both truths - 
'I can hold both'. How are you holding those contradictions today?"

// For pointed_origin with intensity trigger:
"Hello Sophia, I noticed things felt intense when you said 
'I panic when things feel intense'. What feelings are most alive for you right now?"

// Agent-specific follow-ups:
- Sarah: "What emotional truth wants to emerge today?"
- Mathew: "Has that intention-behavior gap shifted?"
- Marcus: "How has that tension been evolving?"
- Zhanna: "Where does that live in your body today?"
```

## Data Flow Architecture

```
User Speech → VAPI → Webhook → Pattern Detection → CSS Progressions
     ↑                                                    ↓
     ←─────── Agent Response ←── Memory Context ←── Quote References
```

### 1. Webhook Processing
```typescript
// server/routes/webhook-routes.ts
POST /api/vapi/webhook
├── transcript event
├── Extract user/assistant text
├── Detect CSS patterns with quotes
├── Store progression with trigger_content
└── Update therapeutic context
```

### 2. CSS Progression Tracking
```typescript
// server/services/orchestration-service.ts
async function trackCSSProgression(userId, patterns, transcript) {
  // Extract triggering quote
  const triggerContent = extractTriggerPhrase(transcript, patterns);
  
  // Record stage transition
  await supabase.from('css_progressions').insert({
    user_id: userId,
    from_stage: previousStage,
    to_stage: newStage,
    trigger_content: triggerContent, // Actual client words
    transition_context: buildContext(patterns),
    confidence: calculateConfidence(patterns)
  });
}
```

### 3. Memory Context Integration
```typescript
// Enhanced context with specific references
const memoryContext = `
THERAPEUTIC JOURNEY:
- Current Stage: suspension (holding contradictions)
- Recent Progression: pointed_origin → focus_bind → suspension

KEY MOMENTS FROM LAST SESSION:
- "I panic when things feel intense" (pointed_origin trigger)
- "I can hold both" (reached suspension)
- "Miss Sarah, I love Alex, but feel suffocated" (CVDC pattern)

AGENT GUIDANCE:
- Reference these specific quotes naturally
- Build on established patterns
- Focus on ${agentSpecificFocus}
`;
```

## Database Schema Updates

### session_summaries Table (Enhanced)
```sql
CREATE TABLE session_summaries (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  call_id VARCHAR,
  summary TEXT,
  patterns JSONB,        -- Structured CSS patterns
  key_quotes TEXT[],     -- Actual client statements
  css_stage VARCHAR,
  metadata JSONB,        -- Contains currentStage, progressions
  created_at TIMESTAMP
);
```

### therapeutic_context Table
```sql
CREATE TABLE therapeutic_context (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR,
  call_id VARCHAR,
  context_type VARCHAR,
  content TEXT,          -- May contain embedded metadata
  css_stage VARCHAR,
  pattern_type VARCHAR,  -- enhanced_summary|basic_summary
  confidence NUMERIC,
  created_at TIMESTAMP
);
```

## Session Summary Generation

### CSS-Focused Summaries
```typescript
// server/services/summary-service.ts
generateEnhancedSummary(transcript, patterns) {
  const summary = {
    // Narrative summary with actual quotes
    narrative: buildNarrativeSummary(transcript, patterns),
    
    // Structured CSS data
    cssAnalysis: {
      dominantStage: determineStage(patterns),
      contradictions: patterns.cvdcPatterns,
      keyQuotes: extractKeyQuotes(transcript),
      stageProgression: trackProgression(patterns)
    },
    
    // Embedded metadata for retrieval
    metadata: {
      currentStage: patterns.currentStage,
      confidence: patterns.confidence,
      triggerPhrases: patterns.evidence
    }
  };
  
  return formatSummary(summary);
}
```

## Real-World Example: Sophia's Journey

### Session 1: Initial CVDC
```
Sophia: "Miss Sarah, I love Alex, but feel suffocated by her fights"
→ Stage: CVDC (contradiction detected)
→ Stored trigger: Complete quote
→ Agent response references this specific tension
```

### Session 2: Movement to Suspension
```
Sophia: "I can hold both"
→ Stage transition: CVDC → suspension
→ Progress tracked with trigger quote
→ Next session greeting: "Last time you reached that place of 
   holding both truths - 'I can hold both'"
```

### Session 3: Return to Pointed Origin
```
Sophia: "I panic when things feel intense"
→ Stage transition: suspension → pointed_origin
→ Intensity spike detected
→ Sarah's response: "I noticed things felt intense when you said 
   'I panic when things feel intense'"
```

## Implementation Benefits

1. **Specific Personalization** - References actual client statements, not generic patterns
2. **Stage-Aware Responses** - Questions match CSS progression stage
3. **Therapeutic Continuity** - Tracks journey through specific transitions
4. **Natural Integration** - Quotes woven naturally into therapeutic dialogue
5. **Agent Differentiation** - Each agent has stage-specific approaches
6. **Evidence-Based** - All progressions backed by actual client quotes

## Recent Improvements

- ✅ CSS progressions table with trigger_content tracking
- ✅ Personalized greetings using actual client quotes
- ✅ Stage-aware agent responses
- ✅ Enhanced memory context with specific references
- ✅ Improved summary generation with embedded metadata
- ✅ Fix for generic greetings - now uses CSS progression data

## Known Issues & Solutions

### Issue: Marcus Agent Prompt Bleeding
**Problem**: Marcus reading database operations and technical jargon
**Status**: Identified - system prompts bleeding into responses
**Solution**: Need output sanitization filter to strip diagnostic tokens

## Files & Locations

- **Pattern Detection**: `server/services/css-pattern-service.ts`
- **Memory Building**: `server/services/memory-service.ts` 
- **Summary Generation**: `server/services/summary-service.ts`
- **Session Management**: `server/services/orchestration-service.ts`
- **Webhook Handler**: `server/routes/webhook-routes.ts`
- **Agent Configs**: `client/src/config/agent-configs.ts`
- **Database Schema**: `shared/schema.ts`

## Testing & Validation

### Test Endpoints
- `/api/test/generate-css-summary` - Test CSS pattern detection
- `/api/auth/user-context/:userId` - Verify personalized greetings
- `/api/auth/generate-missing-css-summaries` - Backfill CSS data

### Example Test Flow
```bash
# Get Sophia's context with CSS progressions
curl "http://localhost:5000/api/auth/user-context/c754ed65-9839-4297-ba92-dc3c58864938?agentName=Sarah"

# Response includes personalized greeting:
# "Hello Sophia, I noticed things felt intense when you said 
#  'I panic when things feel intense'. What feelings are most 
#  alive for you right now?"
```

## Architecture Principles

1. **Client-First** - Never expose technical details to clients
2. **Evidence-Based** - All insights backed by actual quotes
3. **Stage Awareness** - Responses match therapeutic progression
4. **Natural Language** - Technical tracking separate from dialogue
5. **Safety First** - Crisis detection takes precedence