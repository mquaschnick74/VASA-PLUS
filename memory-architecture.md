# VASA Memory Architecture

## Overview
VASA's memory system provides persistent therapeutic context across voice sessions using a multi-layered architecture that combines session history, CSS pattern detection, and intelligent context building.

## Database Schema

### Core Memory Tables

#### 1. `users`
**Purpose:** User identification and basic profile
```sql
- id (uuid, primary key)
- email (unique identifier)
- first_name (optional)
- created_at, updated_at
```

#### 2. `therapeutic_sessions`
**Purpose:** Session metadata and duration tracking
```sql
- id (uuid, primary key)
- user_id (foreign key)
- call_id (unique session identifier)
- agent_name (which AI therapist)
- status, start_time, end_time, duration_seconds
- metadata (JSONB for additional data)
```

#### 3. `therapeutic_context`
**Purpose:** General insights and therapeutic observations
```sql
- id (uuid, primary key)
- user_id (foreign key)
- call_id (session reference)
- context_type (e.g., "session_insight")
- content (the actual insight text)
- css_stage, pattern_type, contradiction_content
- confidence (0.0-1.0), importance (1-10)
```

#### 4. `css_patterns` ⭐
**Purpose:** Dedicated CSS pattern storage with clean structure
```sql
- id (uuid, primary key)
- user_id (foreign key)
- call_id (session reference)
- pattern_type (CVDC, IBM, Thend, CYVC, STAGE_ASSESSMENT)
- content (full pattern text)
- extracted_contradiction ("X BUT Y" format)
- behavioral_gap ("want X, do Y" format)
- css_stage (current therapeutic stage)
- confidence (pattern detection confidence)
- detected_at (timestamp)
```

#### 5. `session_transcripts`
**Purpose:** Real-time conversation storage
```sql
- id (uuid, primary key)
- user_id (foreign key)
- call_id (session reference)
- text (transcript content)
- role (user/assistant)
- timestamp
```

#### 6. `css_progressions`
**Purpose:** Stage transition tracking
```sql
- id (uuid, primary key)
- user_id (foreign key)
- call_id (session reference)
- from_stage, to_stage (stage progression)
- trigger_content (what caused the transition)
- agent_name (which therapist facilitated)
```

## Memory Flow Architecture

### 1. **Real-Time Pattern Detection**
```
User speaks → VAPI webhook → CSS pattern service → Store in css_patterns
```

### 2. **Session Completion Analysis**
```
Call ends → Full transcript analysis → Pattern extraction → Database storage
```

### 3. **Memory Context Building**
```
New session starts → buildMemoryContext() → Aggregate data → Inject into agent
```

## CSS Pattern Types

### **CVDC (Core/Vessel/Drive/Contradiction)**
- **Purpose:** Identifies core contradictions
- **Storage:** `extracted_contradiction` field in "X BUT Y" format
- **Example:** "I want connection BUT I push people away"

### **IBM (Intention/Behavior/Mismatch)**
- **Purpose:** Tracks intention vs behavior gaps
- **Storage:** `behavioral_gap` field
- **Example:** "Want to be healthy, eat junk food"

### **Thend (Therapeutic Ending)**
- **Purpose:** Captures moments of insight/shift
- **Storage:** Full content with stage marker
- **Stage:** Usually marks transition to `gesture_toward`

### **CYVC (Client/Yourself/Voice/Choice)**
- **Purpose:** Moments of agency and self-direction
- **Storage:** Achievement content
- **Stage:** Usually marks `completion` stage

## Memory Building Process

### `buildMemoryContext(userId: string)` Function:

1. **Fetch Recent Sessions** (last 5)
   - Session count, dates, durations
   - Agent used, overall patterns

2. **Fetch Therapeutic Insights** (last 5)
   - General therapeutic observations
   - Cross-session themes and patterns

3. **Fetch CSS Patterns** (last 3)
   - Current therapeutic stage
   - Active contradictions
   - Recent pattern developments

4. **Format Context String**
   ```
   "You have had X previous sessions with this user.
   The last session was on [date] and lasted X minutes.
   
   Key insights from previous sessions:
   1. [insight content]
   2. [insight content]
   
   Therapeutic Progress: Currently in [stage] stage.
   Key contradiction: '[X BUT Y format]'"
   ```

## Integration with VAPI

### Memory Injection Process:
1. **Context Loading** (`voice-interface.tsx`)
   ```typescript
   fetch(`/api/auth/user-context/${userId}`) → setUserContext()
   ```

2. **Session Initialization** (`use-vapi.ts`)
   ```typescript
   if (memoryContext && memoryContext.length > 50) {
     systemPrompt += `\n\n===== PREVIOUS SESSION CONTEXT =====
     ${memoryContext}
     ===== END CONTEXT =====`
   }
   ```

3. **Agent Configuration** (`agent-configs.ts`)
   - Each agent receives full memory context
   - Context influences first message and therapeutic approach
   - Register-aware interventions based on history

## CSS Stage Progression

### Six Therapeutic Stages:
1. **pointed_origin** - Initial presentation
2. **focus_bind** - Problem identification
3. **suspension** - Holding contradictions
4. **gesture_toward** - Movement toward resolution
5. **completion** - Resolution achieved
6. **terminal** - Session closure

### Stage Tracking:
- Real-time detection during calls
- Progression stored in `css_progressions`
- Current stage influences agent behavior
- Pattern-based stage assessment

## Data Flow Summary

```
Session Start → Load Memory Context → Inject into Agent → 
Real-time Pattern Detection → Store Patterns → 
Session End → Comprehensive Analysis → Update Context →
Next Session → Enhanced Memory Available
```

## Memory Persistence Benefits

1. **Therapeutic Continuity** - Agents reference specific past contradictions
2. **Progress Tracking** - CSS stage progression over time
3. **Pattern Recognition** - Recurring themes and contradictions
4. **Personalized Interventions** - Register-aware responses based on history
5. **Relationship Building** - Consistent therapeutic alliance

## Technical Notes

- **Memory Context Threshold:** 50 characters minimum for injection
- **Pattern Confidence:** 0.0-1.0 scoring for reliability
- **Real-time Processing:** Immediate pattern detection during calls
- **Cascade Deletion:** All user data deleted when user account removed
- **Type Safety:** Full TypeScript coverage with Drizzle ORM schemas