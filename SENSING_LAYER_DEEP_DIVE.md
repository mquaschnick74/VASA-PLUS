# VASA Sensing Layer: A Comprehensive Technical Deep Dive

The Sensing Layer is VASA's real-time therapeutic intelligence system that monitors, analyzes, and guides voice AI therapy sessions. This document provides a precise technical explanation of every component, algorithm, and data flow.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Structure & Modules](#2-file-structure--modules)
3. [Core Data Types](#3-core-data-types)
4. [Processing Pipeline](#4-processing-pipeline)
5. [Module Deep Dives](#5-module-deep-dives)
   - [Pattern Detection](#51-pattern-detection)
   - [Register Analysis](#52-register-analysis)
   - [Symbolic Mapping](#53-symbolic-mapping)
   - [Movement Assessment](#54-movement-assessment)
   - [Guidance Generation](#55-guidance-generation)
6. [State Management](#6-state-management)
7. [Integration Points](#7-integration-points)
8. [Performance Optimizations](#8-performance-optimizations)
9. [Key Algorithms](#9-key-algorithms)

---

## 1. Architecture Overview

### Purpose
The Sensing Layer enables VASA's voice AI therapist to understand therapeutic dynamics in real-time and adjust its approach accordingly. It answers the question: *"What is happening therapeutically, and how should the AI respond?"*

### High-Level Flow

```
User speaks into VAPI voice call
            ↓
VAPI sends webhook (user-message event)
            ↓
    ┌───────────────────────────────────────────┐
    │           SENSING LAYER                   │
    │                                           │
    │  ┌─────────────────────────────────────┐  │
    │  │     4 PARALLEL SENSING MODULES       │  │
    │  │  ┌────────┐ ┌────────┐ ┌──────────┐ │  │
    │  │  │Pattern │ │Register│ │ Symbolic │ │  │
    │  │  │Detect  │ │Analysis│ │ Mapping  │ │  │
    │  │  └────────┘ └────────┘ └──────────┘ │  │
    │  │           ┌──────────┐              │  │
    │  │           │Movement  │              │  │
    │  │           │Assessment│              │  │
    │  │           └──────────┘              │  │
    │  └─────────────────────────────────────┘  │
    │                    ↓                      │
    │  ┌─────────────────────────────────────┐  │
    │  │   ORIENTATION STATE REGISTER (OSR)   │  │
    │  │   Unified therapeutic state snapshot  │  │
    │  └─────────────────────────────────────┘  │
    │                    ↓                      │
    │  ┌─────────────────────────────────────┐  │
    │  │      GUIDANCE GENERATOR             │  │
    │  │   (Rule-based + Claude + RAG)        │  │
    │  └─────────────────────────────────────┘  │
    │                    ↓                      │
    │  ┌─────────────────────────────────────┐  │
    │  │      GUIDANCE INJECTOR              │  │
    │  │   (VAPI controlUrl injection)        │  │
    │  └─────────────────────────────────────┘  │
    └───────────────────────────────────────────┘
            ↓
VAPI voice model receives guidance
            ↓
AI therapist speaks informed response
```

---

## 2. File Structure & Modules

All files located in: `/server/services/sensing-layer/`

| File | Lines | Purpose |
|------|-------|---------|
| `index.ts` | 440 | **Orchestrator** - Main entry point, singleton service, coordinates all modules |
| `types.ts` | 490 | **Type Definitions** - All interfaces, types, and data structures |
| `pattern-detection.ts` | 488 | **Pattern Sensor** - Detects recurring behavioral/cognitive/emotional patterns |
| `register-analysis.ts` | 435 | **Register Sensor** - Analyzes Real/Imaginary/Symbolic psychological registers |
| `symbolic-mapping.ts` | 531 | **Connection Sensor** - Maps present to historical material (trauma connections) |
| `movement-assessment.ts` | 674 | **Progress Sensor** - Tracks therapeutic trajectory + CSS stages + anticipation |
| `guidance-generator.ts` | 735 | **Guidance Engine** - Generates therapeutic posture and direction |
| `guidance-injector.ts` | 351 | **Output Handler** - Injects guidance into VAPI voice model |
| `knowledge-base.ts` | 279 | **RAG Service** - Vector search for PCA/PCP methodology guidance |
| `session-state.ts` | 336 | **Memory Manager** - In-memory session accumulation (minimal DB writes) |
| `call-state.ts` | 171 | **Call Tracker** - VAPI control URLs and conversation history per call |

---

## 3. Core Data Types

### 3.1 TurnInput (Processing Input)

```typescript
interface TurnInput {
  utterance: string;           // User's speech text
  sessionId: string;           // Unique session identifier
  callId: string;              // VAPI call identifier
  userId: string;              // User identifier
  exchangeCount: number;       // Turn number in session
  conversationHistory: ConversationTurn[];  // Prior conversation
}
```

### 3.2 UserTherapeuticProfile (User Context)

```typescript
interface UserTherapeuticProfile {
  patterns: UserPattern[];              // Known behavioral patterns
  historicalMaterial: HistoricalMaterial[];  // Disclosed trauma/history
  symbolicMappings: SymbolicMapping[];  // Known connections (pattern → history)
  registerHistory: RegisterHistoryEntry[];   // Past register readings
  cssHistory: CSSHistoryEntry[];        // CSS stage history
}
```

### 3.3 OrientationStateRegister (OSR - Unified Output)

```typescript
interface OrientationStateRegister {
  patterns: PatternDetectionResult;     // Active & emerging patterns
  register: RegisterAnalysisResult;     // Current register state
  symbolic: SymbolicMappingResult;      // Symbolic connections
  movement: MovementAssessmentResult;   // Therapeutic trajectory
}
```

### 3.4 TherapeuticGuidance (Final Output)

```typescript
interface TherapeuticGuidance {
  posture: TherapeuticPosture;          // probe|hold|challenge|support|reflect|silent|wait_and_track
  registerDirection: RegisterDirection | null;  // Guide from X → Y register
  strategicDirection: string;           // 1-2 sentence direction
  avoidances: string[];                 // What NOT to do
  framing: string | null;               // Specific phrasing suggestion
  urgency: GuidanceUrgency;             // low|moderate|high|immediate
  confidence: number;                   // 0-1 confidence score
}
```

---

## 4. Processing Pipeline

### 4.1 Main Entry Point: `processUtterance()`

Location: `index.ts:63-158`

```typescript
async processUtterance(input: TurnInput): Promise<TherapeuticGuidance>
```

**Step-by-step execution:**

| Step | Action | Timing |
|------|--------|--------|
| 1 | Initialize/retrieve session state | ~1ms |
| 2 | Load user profile from database | ~50-200ms |
| 3 | **Run 4 sensing modules in PARALLEL** | ~100-300ms |
| 4 | Build Orientation State Register (OSR) | ~1ms |
| 5 | Generate therapeutic guidance | ~50-8000ms |
| 6 | Update in-memory session state | ~1ms |
| 7 | Check for significant moments | ~1ms |
| 8 | Inject guidance into VAPI | ~50-200ms |

**Total typical processing time: 200-500ms** (without Claude)
**With Claude enhancement: 500-8000ms** (8s timeout)

### 4.2 Parallel Sensing Execution

```typescript
const [patterns, register, symbolic, movement] = await Promise.all([
  detectPatterns(input, profile),
  analyzeRegister(input, profile),
  mapSymbolic(input, profile),
  assessMovement(input, profile)
]);
```

All four modules execute simultaneously for maximum speed.

---

## 5. Module Deep Dives

### 5.1 Pattern Detection

**File:** `pattern-detection.ts`

**Purpose:** Detect recurring patterns in user's speech and match against known patterns.

#### Pattern Types (Taxonomy)

```typescript
type PatternType =
  | 'behavioral'      // Repeated actions/behaviors (e.g., "I always shut down")
  | 'cognitive'       // Thought patterns (e.g., "I can't stop worrying")
  | 'relational'      // Relationship dynamics (e.g., "I push people away")
  | 'emotional'       // Emotional responses (e.g., "I get angry when...")
  | 'avoidance'       // Avoidance patterns (e.g., "I never let myself feel...")
  | 'protective';     // Defense mechanisms (e.g., "I need to control everything")
```

#### Detection Methods

**1. User Explicit Identification** (`detectUserExplicitPattern`)

Detects when user explicitly names their own pattern:

```typescript
const explicitPatternMarkers = [
  { regex: /i always (do|feel|think|say|end up|find myself)/i, type: 'always' },
  { regex: /i never (seem to|can|manage to|let myself)/i, type: 'never' },
  { regex: /this is a pattern/i, type: 'direct' },
  { regex: /i (notice|realize|see) (that )?i (always|tend to|keep)/i, type: 'insight' },
  { regex: /i keep doing (this|the same thing)/i, type: 'repetition' },
  // ... more patterns
];
```

Confidence scores:
- Direct identification ("this is a pattern"): **0.95**
- Other markers: **0.75**

**2. Existing Pattern Matching** (`matchExistingPatterns`)

Matches utterance against user's known patterns from database:

```typescript
function calculatePatternMatch(utterance, pattern): { confidence, evidence }
```

**Matching algorithm:**
1. **Keyword matching (40% weight):** Extract keywords from pattern description, count matches
2. **Example similarity (30% weight):** Compare against stored pattern examples using word overlap
3. **Thematic matching (30% weight):** Check if utterance contains pattern type indicators

**Threshold:** Pattern recorded if `confidence > 0.4`

**3. Emerging Pattern Detection** (`detectEmergingPatterns`)

Analyzes conversation history for new patterns (2-3 occurrences):

```typescript
const themePatterns = [
  { regex: /feeling (alone|isolated|lonely)/gi, theme: 'isolation and loneliness' },
  { regex: /(not|never) (good enough|worthy|deserving)/gi, theme: 'self-worth struggles' },
  { regex: /(control|controlling|controlled)/gi, theme: 'control dynamics' },
  { regex: /(trust|trusting|trusted|distrust)/gi, theme: 'trust issues' },
  { regex: /(abandon|left|leaving|leave me)/gi, theme: 'abandonment fears' },
  // ... 14 total theme patterns
];
```

**4. Pattern Resonance Calculation** (`calculatePatternResonance`)

Measures how strongly utterance "activates" existing patterns:

| Resonance Type | What it measures |
|----------------|------------------|
| `direct` | Word overlap with pattern description |
| `thematic` | Same topic area |
| `emotional` | Same emotional tone |
| `structural` | Same sentence structures ("I always...", "Part of me...") |

**Output threshold:** Resonance recorded if `strength > 0.2`

---

### 5.2 Register Analysis

**File:** `register-analysis.ts`

**Purpose:** Determine which psychological register the user is operating in, based on Lacanian psychoanalytic theory.

#### The Three Registers

| Register | Description | Therapeutic Implication |
|----------|-------------|------------------------|
| **Real** | Body-based, sensations, present-moment experience | Grounded, embodied insight |
| **Imaginary** | Stories, narratives, what-ifs, identity statements | May be avoiding deeper work |
| **Symbolic** | Pattern recognition, abstraction, metacognition | Intellectual understanding |

#### Marker Detection

**Real Register Markers:**

```typescript
const REAL_MARKERS = {
  bodyWords: [
    'body', 'chest', 'stomach', 'gut', 'throat', 'shoulders', 'back', 'neck',
    'hands', 'heart', 'breath', 'breathing', 'muscles', 'tension', 'jaw',
    'belly', 'head', 'legs', 'arms', 'skin', 'face'
  ],
  sensationWords: [
    'tight', 'tightness', 'heavy', 'heaviness', 'light', 'lightness', 'warm',
    'cold', 'hot', 'tingling', 'numb', 'pressure', 'ache', 'pain', 'pounding',
    'racing', 'churning', 'knot', 'constricted', 'open', 'closed', 'flowing',
    'stuck', 'frozen', 'shaking', 'trembling', 'hollow', 'empty', 'full'
  ],
  presentMomentPhrases: [
    'right now', 'in this moment', 'i notice', 'i feel', 'as i sit here',
    "i'm aware", 'i can sense', 'something in my'
  ],
  physiologicalPhrases: [
    "i don't know why", "i can't explain", 'it just', 'my body',
    'physical', 'sensation', 'felt sense'
  ]
};
```

**Imaginary Register Markers:**

```typescript
const IMAGINARY_MARKERS = {
  storyTellingPhrases: [
    'and then', 'so i said', 'he said', 'she said', 'they said', 'and i was like',
    'it was like', 'the thing is', 'basically', 'so basically', 'you know how'
  ],
  whatIfPhrases: [
    'what if', 'imagine if', 'what would happen if', 'if only', 'maybe if',
    'could have', 'should have', 'would have', 'might have', 'if i had'
  ],
  identityStatements: [
    "i'm the kind of person", "i'm just someone who", "that's just who i am",
    "i've always been", "i'm not the type", "people like me", "i'm just"
  ],
  elaborationMarkers: [
    'anyway', 'so anyway', 'the point is', 'going back to', 'as i was saying'
  ],
  externalFocus: [
    'they always', 'he always', 'she always', 'people always', 'everyone',
    'nobody', 'the world', 'society', 'they think', 'everyone thinks'
  ]
};
```

**Symbolic Register Markers:**

```typescript
const SYMBOLIC_MARKERS = {
  patternRecognition: [
    'i always', 'i never', 'every time', 'the same thing', 'pattern',
    'cycle', 'again and again', 'i keep', 'it keeps happening', 'recurring'
  ],
  contradictionAwareness: [
    'part of me', 'on one hand', 'on the other hand', 'both', 'and also',
    'but at the same time', 'conflicted', 'torn', 'ambivalent', 'mixed'
  ],
  abstractionPhrases: [
    'in general', 'overall', 'fundamentally', 'essentially', 'at the core',
    'underlying', 'deep down', 'represents', 'symbolizes', 'means that'
  ],
  intellectualization: [
    'i think that', 'logically', 'rationally', 'objectively', 'theoretically',
    'intellectually', 'from a psychological perspective', 'if you analyze'
  ],
  metaCognition: [
    'i realize', 'i notice that i', 'i see myself', 'watching myself',
    'aware that i', 'conscious that', 'it occurs to me', 'i can see now'
  ]
};
```

#### Distribution Calculation

```typescript
function calculateDistribution(indicators: RegisterIndicators): RegisterDistribution {
  const realCount = indicators.realIndicators.length;
  const imaginaryCount = indicators.imaginaryIndicators.length;
  const symbolicCount = indicators.symbolicIndicators.length;

  // Weight different indicator types
  const realScore = realCount * 1.0;      // Body/sensation heavily weighted
  const imaginaryScore = imaginaryCount * 0.8;  // Stories slightly less weighted
  const symbolicScore = symbolicCount * 1.2;    // Pattern recognition highly weighted

  const totalWeighted = realScore + imaginaryScore + symbolicScore;

  return {
    Real: realScore / totalWeighted,
    Imaginary: imaginaryScore / totalWeighted,
    Symbolic: symbolicScore / totalWeighted
  };
}
```

#### Stuckness Score Calculation

Measures how "stuck" a user is in one register:

```typescript
function calculateFluidityMetrics(input, registerHistory, currentRegister) {
  // Count consecutive same registers
  let consecutiveSame = 0;
  let maxConsecutive = 0;

  for (const entry of sessionHistory) {
    if (entry.dominantRegister === prevRegister) {
      consecutiveSame++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveSame);
    } else {
      consecutiveSame = 0;
    }
  }

  // Stuckness increases with consecutive same registers
  const stucknessScore = Math.min(1, maxConsecutive / 6);

  // Fluidity based on transition rate
  const transitionRate = transitions / (sessionHistory.length - 1);
  const fluidityScore = Math.min(1, transitions / (sessionHistory.length * 0.5));
}
```

**Interpretation:**
- `stucknessScore < 0.3` = Fluid, healthy movement
- `stucknessScore 0.3-0.6` = Moderate stuckness
- `stucknessScore > 0.6` = Highly stuck, intervention needed

---

### 5.3 Symbolic Mapping

**File:** `symbolic-mapping.ts`

**Purpose:** Connect present patterns to disclosed historical/trauma material. This is the "depth" work of therapy - making unconscious connections conscious.

#### Connection Types (Taxonomy)

```typescript
type SymbolicConnectionType =
  | 'figure_substitution'     // Partner acting like parent figure
  | 'situation_echo'          // Current conflict mirrors historical structure
  | 'emotional_rhyme'         // Present feeling echoes unprocessed historical feeling
  | 'behavioral_repetition';  // Current action repeats learned survival pattern
```

#### Awareness Levels

```typescript
type AwarenessLevel = 'unconscious' | 'preconscious' | 'emerging' | 'conscious';
```

| Level | Description | Therapeutic Approach |
|-------|-------------|---------------------|
| `unconscious` | User has no awareness of connection | Do NOT interpret |
| `preconscious` | Connection is available but not conscious | Gently guide |
| `emerging` | User is beginning to sense connection | Support discovery |
| `conscious` | User explicitly recognizes connection | Process and integrate |

#### Detection Methods

**1. Activation Assessment** (`calculateMappingActivation`)

Checks how strongly current utterance activates known mappings:

```typescript
function calculateMappingActivation(utterance, mapping, historical): number {
  let activation = 0;

  // Keywords from symbolic connection description (+0.15 each)
  // Related figures mentioned (+0.3)
  // Emotional valence match (+0.2)
  // Connection type specific activators (+0.15 each)

  return Math.min(1, activation);
}
```

**Type-specific activators:**

```typescript
const typeActivators = {
  figure_substitution: [
    'reminds me of', 'just like', 'same as', 'similar to',
    'the way they', 'when they do that', 'makes me think of'
  ],
  situation_echo: [
    'happening again', 'same thing', 'feels familiar', 'deja vu',
    'this always happens', 'same pattern', 'history repeating'
  ],
  emotional_rhyme: [
    'felt this before', 'same feeling', 'takes me back',
    'brings up', 'triggers', 'that old feeling'
  ],
  behavioral_repetition: [
    'i always do this', 'there i go again', 'same old',
    'my usual', 'typical me', 'default mode'
  ]
};
```

**2. Heuristic Connection Detection** (`detectHeuristicConnections`)

Fast, rule-based detection for:
- Figure mentions in current context
- Emotional pattern matching (abandonment, betrayal, rejection, control, fear, shame)
- Pattern repetition indicators

**3. Claude-Enhanced Analysis** (`analyzeSymbolicWithClaude`)

For complex situations, uses Claude to identify:
- Novel connections not in database
- Symbolic weight of current material
- Connected themes
- Intervention timing recommendations

**Prompt structure:**
```
You are a depth psychologist. Analyze this utterance for symbolic connections...

CURRENT UTTERANCE: "..."
HISTORICAL MATERIAL: [...]
PATTERNS: [...]
EXISTING MAPPINGS: [...]

Respond in JSON: { connections, elaboration, potentialConnection }
```

#### Generative Symbolic Insight

Novel real-time connections generated by Claude:

```typescript
interface GenerativeSymbolicInsight {
  currentElaboration: {
    topic: string;              // What user is discussing
    symbolicWeight: number;     // 0-1, how loaded this material is
    connectedThemes: string[];  // Themes like "control", "perfection"
  };
  potentialConnection?: {
    fromCurrent: string;        // Present pattern
    toPotential: string;        // Potential historical link
    connectionInsight: string;  // For therapist awareness (NOT to say)
    confidence: number;
    suggestedIntervention?: string;  // Question/reflection
    interventionTiming: 'not_ready' | 'approaching' | 'ready' | 'passed';
  };
}
```

---

### 5.4 Movement Assessment

**File:** `movement-assessment.ts`

**Purpose:** Track therapeutic progress and determine optimal intervention timing.

#### Movement Indicators

```typescript
const MOVEMENT_MARKERS = {
  // POSITIVE movement
  deepening: [
    'deeper', 'more than', 'underneath', 'behind that', 'what\'s really',
    'actually', 'truth is', 'if i\'m honest', 'really feeling', 'at my core'
  ],
  integration: [
    'i see now', 'makes sense', 'connecting', 'understanding', 'clarity',
    'coming together', 'realize', 'both can be true', 'i get it'
  ],

  // CONCERNING movement
  resistance: [
    'but', 'however', 'i don\'t know', 'maybe', 'i guess', 'whatever',
    'it doesn\'t matter', 'not a big deal', 'i\'m fine', 'moving on'
  ],
  flooding: [
    'overwhelmed', 'too much', 'can\'t handle', 'falling apart', 'drowning',
    'spinning', 'out of control', 'losing it', 'breaking down', 'panicking'
  ],
  intellectualizing: [
    'logically', 'rationally', 'objectively', 'theoretically', 'in principle',
    'psychology says', 'i read that', 'the research', 'technically'
  ],
  looping: [
    'like i said', 'as i mentioned', 'i keep saying', 'same thing',
    'round and round', 'here we go again', 'every time', 'always'
  ]
};
```

#### Trajectory Determination

```typescript
type TherapeuticTrajectory =
  | 'toward_mastery'      // Making progress
  | 'away_from_mastery'   // Retreating/defending
  | 'holding'             // Stable but not moving
  | 'cycling';            // Going in circles

function determineTrajectory(indicators, conversationHistory): TherapeuticTrajectory {
  const positiveScore = (indicators.deepening + indicators.integration) / 2;
  const negativeScore = (indicators.resistance + indicators.flooding + indicators.looping) / 3;

  if (positiveScore < 0.2 && negativeScore < 0.2) return 'holding';
  if (indicators.looping > 0.4 && detectThematicRepetition(history)) return 'cycling';
  if (indicators.flooding > 0.4) return 'away_from_mastery';
  if (positiveScore > negativeScore + 0.1) return 'toward_mastery';
  if (negativeScore > positiveScore + 0.1) return 'away_from_mastery';

  return 'holding';
}
```

#### CSS Stage Assessment (Conversational State Sensing)

PCA methodology stages of therapeutic progress:

```typescript
type CSSStage =
  | 'pointed_origin'    // Initial engagement with problem
  | 'focus_bind'        // Contradiction identified
  | 'suspension'        // Holding multiple perspectives
  | 'gesture_toward'    // Movement toward integration
  | 'completion'        // Active choice emerging
  | 'terminal';         // Full recursive awareness
```

**Stage markers:**

```typescript
const CSS_STAGE_MARKERS = {
  pointed_origin: ['problem', 'issue', 'struggle', 'difficult', 'hard time', 'stuck', 'help'],
  focus_bind: ['contradiction', 'torn', 'both', 'but also', 'part of me', 'conflicted'],
  suspension: ['sitting with', 'holding', 'allowing', 'accepting', 'noticing', 'without judging'],
  gesture_toward: ['starting to', 'beginning', 'maybe i could', 'what if i', 'possibility'],
  completion: ['choose', 'decided', 'commit', 'action', 'doing', 'taking steps', 'different now'],
  terminal: ['integrated', 'whole', 'peaceful', 'acceptance', 'wisdom', 'growth', 'transformed']
};
```

#### Session Position

```typescript
type SessionPosition = 'opening' | 'developing' | 'working' | 'integrating' | 'closing';

function determineSessionPosition(exchangeCount: number): SessionPosition {
  if (exchangeCount <= 3) return 'opening';
  if (exchangeCount <= 8) return 'developing';
  if (exchangeCount <= 18) return 'working';
  if (exchangeCount <= 23) return 'integrating';
  return 'closing';
}
```

#### Anticipation Tracking (Strategic Patience)

**The most sophisticated sensing feature** - determines when to intervene vs. wait.

```typescript
interface AnticipationState {
  trajectory: {
    buildingToward: string;         // "connecting precision pattern to relationships"
    trajectoryConfidence: number;   // 0-1
    evidencePoints: string[];
  };
  timing: {
    phase: 'early_elaboration' | 'building' | 'approaching_readiness' | 'ready' | 'moment_passed';
    waitReasons: string[];
    readyIndicators: string[];
    estimatedTurnsToReady: number;
  };
  patience: {
    shouldWait: boolean;
    waitingFor: string;
    riskOfPrematureIntervention: string;
  };
}
```

**Phase definitions:**

| Phase | Description | Action |
|-------|-------------|--------|
| `early_elaboration` | User just starting to explore | Wait, let them build material |
| `building` | User developing material | Wait, track trajectory |
| `approaching_readiness` | User getting close to insight | Prepare intervention |
| `ready` | User has built enough material | Intervention can land |
| `moment_passed` | Optimal moment was missed | Regroup, wait for next opportunity |

---

### 5.5 Guidance Generation

**File:** `guidance-generator.ts`

**Purpose:** Transform OSR into actionable therapeutic guidance for the voice AI.

#### Therapeutic Postures

```typescript
type TherapeuticPosture =
  | 'probe'          // Ask deepening questions
  | 'hold'           // Stay with what's present
  | 'challenge'      // Gently confront contradiction
  | 'support'        // Validate and encourage
  | 'reflect'        // Mirror back
  | 'silent'         // Allow space
  | 'wait_and_track'; // Strategic patience - let user build material
```

#### Posture Determination Logic

```typescript
function determinePosture(osr: OrientationStateRegister): TherapeuticPosture {
  // Priority 1: Safety
  if (movement.indicators.flooding > 0.4) return 'support';

  // Priority 2: Honor defenses
  if (movement.indicators.resistance > 0.4) return 'hold';

  // Priority 3: Break loops
  if (movement.indicators.looping > 0.4 && sessionPosition === 'working') return 'challenge';

  // Priority 4: Reflect explicit patterns
  if (patterns.userExplicitIdentification) return 'reflect';

  // Priority 5: Support depth
  if (movement.indicators.deepening > 0.3) return 'probe';
  if (movement.indicators.integration > 0.3) return 'hold';

  // Priority 6: Address register stuckness
  if (register.currentRegister === 'Imaginary' && register.stucknessScore > 0.4) return 'probe';

  // Default based on session position
  if (sessionPosition === 'opening' || sessionPosition === 'developing') return 'probe';
  return 'hold';
}
```

#### Register Direction Guidance

When user is "stuck" in one register, guide them to another:

```typescript
function determineRegisterDirection(osr): RegisterDirection | null {
  if (register.stucknessScore < 0.4) return null;  // Not stuck enough

  // Stuck in Imaginary → guide toward Real (body)
  if (register.currentRegister === 'Imaginary') {
    return {
      from: 'Imaginary',
      toward: 'Real',
      technique: 'Invite body awareness: "What do you notice in your body as you share this?"'
    };
  }

  // Stuck in Symbolic (intellectualizing) → guide toward Real
  if (register.currentRegister === 'Symbolic' && isIntellectualizing) {
    return {
      from: 'Symbolic',
      toward: 'Real',
      technique: 'Ground the insight: "Where do you feel that understanding in your body?"'
    };
  }

  // Stuck in Real (can't make meaning) → guide toward Symbolic
  if (register.currentRegister === 'Real' && stucknessScore > 0.5) {
    return {
      from: 'Real',
      toward: 'Symbolic',
      technique: 'Invite meaning-making: "What might this sensation be trying to tell you?"'
    };
  }
}
```

#### Complexity Detection

Determines whether to use Claude for enhanced guidance:

```typescript
function isComplexSituation(osr: OrientationStateRegister): boolean {
  if (osr.patterns.activePatterns.length >= 2) return true;    // Multiple patterns
  if (osr.symbolic.activeMappings.length > 0) return true;     // Active symbolic
  if (osr.symbolic.awarenessShift) return true;                // Awareness shift
  if (osr.register.stucknessScore > 0.6) return true;          // High stuckness
  if (osr.movement.indicators.flooding > 0.4) return true;     // Flooding
  if (osr.movement.indicators.resistance > 0.4) return true;   // Resistance
  if (['gesture_toward', 'completion', 'terminal'].includes(cssStage)) return true;  // Late CSS
  return false;
}
```

#### RAG Integration

Retrieves relevant PCA/PCP methodology guidance:

```typescript
async function getRelevantGuidance(osr: OrientationStateRegister) {
  const query = buildRagQuery(osr);  // Builds query from OSR state
  const types = determineRelevantTypes(osr);  // theory, example, technique, guideline
  const tags = determineRelevantTags(osr);    // register, cssStage, patternType

  const chunks = await queryKnowledgeBase(query, { types, tags, limit: 4 });
  return { chunks, context: buildRetrievedContext(chunks) };
}
```

---

## 6. State Management

### 6.1 In-Memory Session State

**File:** `session-state.ts`

**Purpose:** Minimize database writes by accumulating data in memory during a call.

```typescript
interface SessionAccumulator {
  callId: string;
  userId: string;
  sessionId: string;
  startTime: Date;
  exchangeCount: number;

  // Aggregated data
  registerReadings: Array<{ exchange: number; register: Register; timestamp: Date }>;
  registerTally: RegisterDistribution;

  // Significant moments only
  significantMoments: Array<{
    exchange: number;
    type: 'css_shift' | 'pattern_detected' | 'symbolic_connection' | 'flooding' | 'breakthrough' | 'resistance';
    description: string;
  }>;

  // Latest state for real-time guidance
  latestRegister: RegisterAnalysisResult | null;
  latestMovement: MovementAssessmentResult | null;
  latestGuidance: TherapeuticGuidance | null;

  // Session-level aggregates
  patternsThisSession: string[];
  connectionsThisSession: string[];
}
```

**Database write strategy:**
- **Per-turn:** NO database writes (except flooding/breakthrough)
- **Significant moments:** Written immediately for flooding (>0.7) or breakthrough
- **Session end:** Single comprehensive write with summary

### 6.2 Significant Moment Detection

```typescript
function isSignificantMoment(movement, previousMovement): { isSignificant, type, description } {
  // CSS stage shift
  if (previousMovement && movement.cssStage !== previousMovement.cssStage) {
    return { isSignificant: true, type: 'css_shift', ... };
  }

  // Flooding detected
  if (movement.indicators.flooding > 0.7) {
    return { isSignificant: true, type: 'flooding', ... };
  }

  // Breakthrough moment
  if (movement.indicators.integration > 0.7 && movement.indicators.deepening > 0.6) {
    return { isSignificant: true, type: 'breakthrough', ... };
  }

  // High resistance
  if (movement.indicators.resistance > 0.7) {
    return { isSignificant: true, type: 'resistance', ... };
  }
}
```

### 6.3 Call State (VAPI Integration)

**File:** `call-state.ts`

Tracks per-call state:
- Control URL for VAPI injection
- Conversation history (last 50 messages)
- Exchange count
- Auto-cleanup after 2 hours

---

## 7. Integration Points

### 7.1 Webhook Integration

The sensing layer is triggered by VAPI webhooks:

```typescript
// In webhook-routes.ts
processSensingLayerAsync(callId, userId, utterance, conversationHistory)
```

**Rate limiting:** Minimum 5 seconds between processing calls
**Caching:** 30-second cache for similar utterances

### 7.2 VAPI Control URL Injection

**File:** `guidance-injector.ts`

Injects guidance as system message:

```typescript
await fetch(controlUrl, {
  method: 'POST',
  body: JSON.stringify({
    type: 'add-message',
    message: {
      role: 'system',
      content: formatGuidanceAsSystemMessage(guidance)
    },
    triggerResponseEnabled: false
  })
});
```

**Formatted message structure:**
```
[THERAPEUTIC GUIDANCE]

POSTURE: PROBE
Ask deepening questions to explore further. Be curious about what lies beneath.

REGISTER DIRECTION:
Guide from Imaginary → Real
Technique: Invite body awareness: "What do you notice in your body as you share this?"

DIRECTION:
Explore whether current abandonment feelings connect to earlier abandonment experiences.

DO NOT:
• Avoid deepening questions - user may be overwhelmed
• Do not probe for more emotional content right now

---
Confidence: 75%
Remember: Speak warmly and naturally. This guidance shapes WHAT you explore, not HOW you sound.
```

### 7.3 Database Schema

**Tables used:**

| Table | Purpose |
|-------|---------|
| `user_patterns` | Stored user patterns |
| `user_historical_material` | Disclosed trauma/history |
| `symbolic_mappings` | Known pattern-to-history connections |
| `session_register_analysis` | Session summaries |
| `significant_moments` | High-priority therapeutic moments |
| `css_patterns` | CSS stage history |
| `knowledge_chunks` | RAG knowledge base (PCA/PCP content) |

---

## 8. Performance Optimizations

### 8.1 Parallel Processing

All four sensing modules run simultaneously:

```typescript
const [patterns, register, symbolic, movement] = await Promise.all([
  detectPatterns(input, profile),
  analyzeRegister(input, profile),
  mapSymbolic(input, profile),
  assessMovement(input, profile)
]);
```

### 8.2 Timeouts

| Operation | Timeout |
|-----------|---------|
| Full Claude guidance | 8 seconds |
| RAG embedding | 3 seconds |
| RAG query total | 5 seconds |
| Profile load | ~200ms (no explicit timeout) |

### 8.3 Caching & Rate Limiting

- **Guidance cache:** 30-second TTL for similar utterances
- **Rate limit:** 5-second minimum between sensing calls
- **Conversation history:** Limited to last 50 messages

### 8.4 Fallback Strategy

```
1. Try Claude-enhanced guidance (complex situations)
   ↓ timeout/failure
2. Fall back to rule-based guidance
   ↓ failure
3. Return safe default: { posture: 'hold', confidence: 0.3 }
```

---

## 9. Key Algorithms

### 9.1 Pattern Confidence Calculation

```
confidence = (keyword_matches / total_keywords) * 0.4  // 40% weight
           + (example_similarity) * 0.3                // 30% weight
           + (thematic_match) * 0.3                    // 30% weight
```

### 9.2 Register Distribution Weighting

```
Real_weight = 1.0      // Body/sensation heavily weighted
Imaginary_weight = 0.8 // Stories slightly less weighted
Symbolic_weight = 1.2  // Pattern recognition highly weighted
```

### 9.3 Stuckness Score

```
stucknessScore = min(1, maxConsecutiveSameRegister / 6)
```

### 9.4 Fluidity Score

```
transitionRate = transitions / (readings - 1)

if transitionRate < 0.2: fluidityScore = transitionRate * 2.5
if transitionRate > 0.6: fluidityScore = 1 - (transitionRate - 0.6)
else: fluidityScore = 0.5 + (transitionRate - 0.2) * 1.25
```

### 9.5 Symbolic Mapping Activation

```
activation = keyword_overlap * 0.15 (per word)
           + figure_mentioned * 0.3 (per figure)
           + emotional_valence_match * 0.2
           + type_activator_match * 0.15 (per activator)
```

### 9.6 Movement Trajectory

```
positiveScore = (deepening + integration) / 2
negativeScore = (resistance + flooding + looping) / 3

if flooding > 0.4: return 'away_from_mastery'
if positiveScore > negativeScore + 0.1: return 'toward_mastery'
if negativeScore > positiveScore + 0.1: return 'away_from_mastery'
return 'holding'
```

---

## Summary

The VASA Sensing Layer is a sophisticated real-time therapeutic intelligence system that:

1. **Monitors** user speech for patterns, registers, symbolic connections, and movement
2. **Analyzes** therapeutic state through 4 parallel sensing modules
3. **Generates** context-aware guidance with anticipation tracking
4. **Injects** guidance into VAPI voice model via controlUrl
5. **Optimizes** for speed through parallelization, caching, and minimal DB writes
6. **Falls back** gracefully when AI services are slow/unavailable

The system embodies PCA (Person-Centered Approach) methodology while using modern AI to track therapeutic dynamics in real-time, enabling an AI voice therapist to respond with clinical sophistication.

---

*Document generated from source code analysis of VASA-PLUS sensing layer.*
*Last updated: 2026-02-01*
