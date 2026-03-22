# UNA Files Audit Report — Keyword and Lexical Matching

**Date:** 2026-03-22
**Scope:** All files related to the UNA agent and shared detection logic UNA depends on
**Auditor:** Automated code audit
**Purpose:** Identify every instance where clinical signal detection uses keyword/lexical matching instead of semantic analysis

---

## 1. Complete List of UNA Files Examined

### Primary UNA Files (filename contains "una")
| # | File | Role |
|---|------|------|
| 1 | `server/services/una-orchestrator.ts` | Core UNA orchestration logic — decides mode, depth, pacing, speaker |
| 2 | `client/public/agents/una.jpg` | Asset (image) — no code |
| 3 | `client/public/agents/una-intro.mp3` | Asset (audio) — no code |

### Files Referencing UNA by Content
| # | File | Role |
|---|------|------|
| 4 | `server/routes/custom-llm-routes.ts` | Main request handler — calls `decideUNAOrchestration()`, injects UNA orchestration block |
| 5 | `server/prompts/layers/agent-prefixes.json` | UNA personality prefix and convergence calibration |
| 6 | `server/prompts/layers/layer-6.txt` | Crisis protocol — references UNA by name |
| 7 | `client/src/config/agent-configs.ts` | UNA agent config (voice, model, first message) |
| 8 | `client/src/components/DemoVoiceCard.tsx` | UI component referencing UNA |
| 9 | `server/services/memory-service.ts` | Memory service (UNA mentioned in context) |

### Sensing Layer Files (Shared Detection Logic UNA Depends On)
| # | File | Role |
|---|------|------|
| 10 | `server/services/sensing-layer/fast-sense.ts` | Fast-path processor — runs BEFORE LLM on every utterance |
| 11 | `server/services/sensing-layer/pattern-detection.ts` | Pattern detection (LLM + keyword hybrid) |
| 12 | `server/services/sensing-layer/register-analysis.ts` | Register analysis (Real/Imaginary/Symbolic) |
| 13 | `server/services/sensing-layer/movement-assessment.ts` | Movement/trajectory + CSS signal detection |
| 14 | `server/services/sensing-layer/symbolic-mapping.ts` | Symbolic connection mapping (LLM + keyword hybrid) |
| 15 | `server/services/sensing-layer/guidance-generator.ts` | Therapeutic guidance generation |
| 16 | `server/services/sensing-layer/guidance-injector.ts` | Formats and injects guidance into VAPI |
| 17 | `server/services/sensing-layer/meta-instruction-detector.ts` | Meta-instruction detection (pure LLM) |
| 18 | `server/services/sensing-layer/origin-adjacency-detector.ts` | Origin adjacency detection (pure LLM) |
| 19 | `server/services/sensing-layer/silence-monitor.ts` | Silence monitoring and tier escalation |
| 20 | `server/services/sensing-layer/index.ts` | Main sensing layer orchestrator |
| 21 | `server/services/sensing-layer/state-vector.ts` | State vector coupling (pure math) |
| 22 | `server/services/sensing-layer/narrative-web.ts` | Narrative fragment retrieval (embedding-based) |
| 23 | `server/services/sensing-layer/fragment-extractor.ts` | Post-session fragment extraction (pure LLM) |
| 24 | `server/services/sensing-layer/knowledge-base.ts` | RAG knowledge base retrieval |
| 25 | `server/services/sensing-layer/types.ts` | Type definitions |
| 26 | `server/services/sensing-layer/call-state.ts` | Call state tracking |
| 27 | `server/services/sensing-layer/session-state.ts` | Session state management |
| 28 | `server/services/sensing-layer/profile-writer.ts` | Profile persistence |
| 29 | `server/services/css-pattern-service.ts` | CSS pattern detection (transcript-level) |

### Prompt Layer Files
| # | File | Role |
|---|------|------|
| 30 | `server/prompts/layers/layer-2.txt` | Behavioral operationalization (clinical framework) |
| 31 | `server/prompts/layers/layer-3.txt` | Voice-session infrastructure |
| 32 | `server/prompts/pca-core.ts` | System prompt assembly |

---

## 2. CLINICAL Keyword/Lexical Detection Violations

### VIOLATION 1: `fast-sense.ts` — SOMATIC_INDICATORS word list
**File:** `server/services/sensing-layer/fast-sense.ts:38-42`
```typescript
const SOMATIC_INDICATORS = [
  'feel', 'feeling', 'felt', 'body', 'chest', 'stomach', 'tight', 'tense',
  'shaking', 'heart', 'breath', 'breathing', 'heavy', 'weight', 'numb',
  'pain', 'ache', 'sick', 'dizzy', 'cold', 'hot', 'tingling', 'pressure', 'knot',
];
```
**Used at lines 94-101** via `SOMATIC_INDICATORS.some((word) => utteranceLower.includes(word))`

**What it detects:** Register shift from Imaginary to Real — somatic/body language.

**Why keyword matching is wrong here:** "Feel" appears in non-somatic contexts ("I feel like that's unfair"), "cold" in narrative ("it was cold outside"), "heart" in metaphor ("my heart's not in it"). `.includes('hot')` matches "photography", "shot", "hotel". This conflates lexical surface with embodied experience.

---

### VIOLATION 2: `fast-sense.ts` — SELF_IDENTIFICATION_PATTERNS phrase list
**File:** `server/services/sensing-layer/fast-sense.ts:44-48`
```typescript
const SELF_IDENTIFICATION_PATTERNS = [
  'i always', 'i never', 'i realize', 'i just realized', 'i keep doing',
  'pattern', 'every time i', 'i notice that i', 'what i\'m doing is',
  'i think the reason', 'it\'s because i',
];
```
**Used at lines 113-121** — triggers `isCriticalMoment = true` with deep-path processing.

**What it detects:** Whether the client is naming their own psychological pattern.

**Why keyword matching is wrong here:** "I always go to that restaurant" is not self-identification. "I never said that" is defensive speech. The word "pattern" appears in "knitting pattern." Marking a critical moment (adding 1-3s latency) based on substring "pattern" anywhere is a high-cost false-positive path.

---

### VIOLATION 3: `register-analysis.ts` — REAL/IMAGINARY/SYMBOLIC_MARKERS
**File:** `server/services/sensing-layer/register-analysis.ts:21-103`

Three extensive word/phrase lists:
- `REAL_MARKERS`: 21 body words, 34 sensation words, 8 present-moment phrases, 7 physiological phrases
- `IMAGINARY_MARKERS`: 14 storytelling phrases, 10 what-if phrases, 11 identity statements, 12 elaboration markers, 10 external-focus phrases
- `SYMBOLIC_MARKERS`: 13 pattern recognition phrases, 14 contradiction awareness phrases, 12 abstraction phrases, 12 intellectualization phrases, 10 meta-cognition phrases

**Used at lines 159-213** in `detectRegisterIndicators()` — all via `utterance.includes()`.

**What it detects:** The entire register analysis system — the foundational clinical signal that UNA's orchestration decisions depend on.

**Why keyword matching is wrong here:** This is the most consequential violation. "I don't know why" is classified as Real register, but "I don't know why I bother" is Imaginary. "I think that" is Symbolic intellectualization, but "I think that's what happened" is narrative. "And then" inflates Imaginary score but is basic speech connective tissue. Register is a structural-phenomenological position, not a lexical frequency distribution.

---

### VIOLATION 4: `movement-assessment.ts` — MOVEMENT_MARKERS
**File:** `server/services/sensing-layer/movement-assessment.ts:30-61`
```typescript
const MOVEMENT_MARKERS = {
  deepening: ['deeper', 'more than', 'underneath', ...],
  integration: ['i see now', 'makes sense', 'connecting', ...],
  resistance: ['but', 'however', 'i don\'t know', 'maybe', ...],
  flooding: ['overwhelmed', 'too much', 'can\'t handle', ...],
  intellectualizing: ['logically', 'rationally', 'objectively', ...],
  looping: ['like i said', 'as i mentioned', ...],
};
```
**Used at lines 486-502** via `calculateIndicatorScore()` with `utterance.includes(marker)`.

**What it detects:** All six therapeutic movement indicators — directly feed into UNA orchestration (flooding >= 0.65 triggers stabilize, resistance >= 0.55 triggers ibmHeavy).

**Why keyword matching is wrong here:** "But" is the most common conjunction in English. "Maybe" in "maybe I should try that" is movement, not resistance. "More than" in "I ate more than usual" is not deepening. These directly alter whether UNA enters ibmHeavy mode, changing hypothesis handling from implicit to cautious.

---

### VIOLATION 5: `movement-assessment.ts` — CSS Signal Detection via regex
**File:** `server/services/sensing-layer/movement-assessment.ts:137-427`

Extensive regex patterns for all six CSS stages: Pointed Origin, Focus/Bind, Suspension, Gesture Toward, Completion, Terminal.

**What it detects:** CSS stage signals that accumulate in session state to determine the session-level CSS stage.

**Why keyword matching is wrong here:** CSS stages are phenomenological positions. "I don't know what to do" may be Focus/Bind, not Pointed Origin. "Something changed" could be narrative report. "I can hold both" in "I can hold both bags" generates a Completion signal at confidence 0.55. Repeated false positives systematically advance CSS stage assessment.

---

### VIOLATION 6: `movement-assessment.ts` — Cross-turn implicit contradiction detection
**File:** `server/services/sensing-layer/movement-assessment.ts:436-480`

Regex patterns check if prior turn has an "ending claim" and current turn has "continuation behavior."

**What it detects:** Focus/Bind CSS signal — behavioral contradiction across turns.

**Why keyword matching is wrong here:** "I'm done with" could be "I'm done with dinner." "I went back" could be "I went back to the store." Function treats any co-occurrence across adjacent turns as contradiction regardless of referent.

---

### VIOLATION 7: `movement-assessment.ts` — Anticipation heuristic markers
**File:** `server/services/sensing-layer/movement-assessment.ts:634-671`
```typescript
const insightMarkers = ['i realize', 'i see', 'it\'s like', 'i think i', 'maybe it\'s'];
const connectionMarkers = ['reminds me', 'same as', 'just like', 'similar to'];
const groundingMarkers = ['i feel', 'in my body', 'notice', 'sensation'];
const elaborationMarkers = ['and then', 'also', 'another thing', 'let me tell you'];
```

**What it detects:** Whether client is approaching readiness for intervention — controls whether UNA waits or engages.

**Why keyword matching is wrong here:** "I see" in "I see what you mean" is acknowledgment, not insight. "It's like" is ubiquitous simile. "I feel" may precede "like pizza." High-stakes clinical timing decision driven by substring matching.

---

### VIOLATION 8: `pattern-detection.ts` — `detectUserExplicitPattern()`
**File:** `server/services/sensing-layer/pattern-detection.ts:231-263`

11 regex patterns for explicit pattern identification (e.g., `i always (do|feel|think|say|end up|find myself)`).

**What it detects:** Whether client is explicitly identifying their own psychological pattern. Assigns 0.75-0.95 confidence.

**Why keyword matching is wrong here:** "I always do the dishes" matches. "I can't stop the car" matches `i can't stop`. The result changes guidance posture to 'reflect'.

---

### VIOLATION 9: `pattern-detection.ts` — `matchPatternType()` word lists
**File:** `server/services/sensing-layer/pattern-detection.ts:373-391`

Type indicator word lists (e.g., behavioral: `['do', 'act', 'behavior', ...]`, avoidance: `['avoid', 'escape', 'ignore', 'hide', 'run', 'away', ...]`).

**What it detects:** What type of psychological pattern is present.

**Why keyword matching is wrong here:** "Do" matches in essentially every utterance. "Away" matches "give away", "right away." "Run" matches "run the business." Contributes directly to pattern match confidence scores.

---

### VIOLATION 10: `pattern-detection.ts` — `extractThemes()`
**File:** `server/services/sensing-layer/pattern-detection.ts:425-462`

14 theme regex patterns (e.g., `/(please|pleasing|approval)/gi` → "people pleasing", `/(abandon|left|leaving|leave me)/gi` → "abandonment fears").

**What it detects:** Emerging therapeutic themes across conversation.

**Why keyword matching is wrong here:** "Please" in "please pass the salt" triggers people pleasing. "Left" in "I left the office" triggers abandonment fears. "Control" in "remote control" triggers control dynamics. Two occurrences create an EmergingPattern.

---

### VIOLATION 11: `pattern-detection.ts` — `calculateEmotionalResonance()`
**File:** `server/services/sensing-layer/pattern-detection.ts:557-581`

28 emotion words checked via `utteranceWords.some(w => w.includes(word))`.

**What it detects:** Emotional resonance between utterance and existing patterns.

**Why keyword matching is wrong here:** "Down" matches in "sit down", "downtown." "Empty" matches "empty parking lot." Measures lexical coincidence, not emotional resonance.

---

### VIOLATION 12: `pattern-detection.ts` — `calculatePatternMatch()` keyword matching
**File:** `server/services/sensing-layer/pattern-detection.ts:302-338`

Extracts keywords from pattern descriptions and checks `utteranceLower.includes(keyword)`. Contributes 40% of match confidence.

**What it detects:** Whether current utterance matches an existing pattern.

**Why keyword matching is wrong here:** A pattern "avoids emotional vulnerability in relationships" matching keywords "emotional" and "relationships" in "I'm in a relationship and it's emotional" says nothing about avoidance.

---

### VIOLATION 13: `symbolic-mapping.ts` — `getTypeActivators()` phrase lists
**File:** `server/services/sensing-layer/symbolic-mapping.ts:284-305`

Connection type activator phrase lists (e.g., figure_substitution: `['reminds me of', 'just like', 'same as', ...]`).

**What it detects:** Whether existing symbolic mappings are activated.

**Why keyword matching is wrong here:** "Just like" appears in simile ("just like a movie"). "Same thing" in "I'll have the same thing." Adds 0.15 to activation scores.

---

### VIOLATION 14: `symbolic-mapping.ts` — `detectHeuristicConnections()` emotional markers
**File:** `server/services/sensing-layer/symbolic-mapping.ts:333-358`

Six emotion-word groups mapped to clinical emotions (e.g., `['abandoned', 'left', 'alone']` → abandonment).

**What it detects:** Emotional connections to historical material.

**Why keyword matching is wrong here:** "Left" matches abandonment. "Trust" in "trust fund" matches betrayal. "Alone" in "alone at the office" matches abandonment. Produces PotentialConnection with 0.5 confidence.

---

### VIOLATION 15: `symbolic-mapping.ts` — `detectAwarenessShift()`
**File:** `server/services/sensing-layer/symbolic-mapping.ts:569-576`

14 insight phrases checked via `utteranceLower.includes(phrase)`.

**What it detects:** Whether client is experiencing an awareness shift (unconscious → conscious).

**Why keyword matching is wrong here:** "That's why" in "that's why I was late" is routine explanation. Triggers `isComplexSituation()` (forcing a Claude call) and sets guidance urgency to 'high'.

---

### VIOLATION 16: `symbolic-mapping.ts` — Repetition pattern markers
**File:** `server/services/sensing-layer/symbolic-mapping.ts:361-382`

9 repetition markers checked via `utteranceLower.includes(marker)`.

**What it detects:** Behavioral repetition connecting to historical material.

**Why keyword matching is wrong here:** "As usual" in "I went to work as usual" triggers a 0.4-confidence connection to first historical material in profile.

---

### VIOLATION 17: `css-pattern-service.ts` — Full CVDC/IBM/Thend/CYVC detection
**File:** `server/services/css-pattern-service.ts:79-295`

Extensive regex-based detection of all four CSS clinical constructs used to determine CSS stage from transcript.

**What it detects:** CVDC (contradiction), IBM (intention-behavior mismatch), Thend (integration), CYVC (contextual flexibility).

**Why keyword matching is wrong here:** "Simultaneously" alone matches CVDC ("simultaneously working and eating"). "I know...but...I still" matches IBM ("I know it's late but I still need to finish"). "Flexibility" matches CYVC. Raw counts determine CSS stage.

---

### VIOLATION 18: `guidance-injector.ts` — Structural flag detection
**File:** `server/services/sensing-layer/guidance-injector.ts:230-233` and `340-343`
```typescript
const psychoticFlags = ['hallucination', 'psychotic', 'dissociative', 'voices', 'reality'];
const structuralFlag = accumulatedPatterns.some(p =>
  psychoticFlags.some(flag => p.toLowerCase().includes(flag))
);
```

**What it detects:** Whether client shows signs of psychotic structure — triggers stabilization priority.

**Why keyword matching is wrong here:** Most safety-critical false-positive in the system. A pattern described as "reality of the situation" or "voices their concerns" triggers psychotic structure flag. This changes the entire clinical approach.

---

## 3. Permissible Technical Routing (Not Violations)

| # | Location | What It Does | Why Permissible |
|---|----------|-------------|-----------------|
| 1 | `custom-llm-routes.ts:42-45,457-549` | Footer delimiter detection (`---STATE:`) | Mechanical protocol parsing, not clinical |
| 2 | `custom-llm-routes.ts:83-103` | Silence signal parsing (`[SILENCE...`) | Structured system message extraction |
| 3 | `custom-llm-routes.ts:164` | Ultra-short utterance detection (≤24 chars) | Performance optimization gate |
| 4 | `una-orchestrator.ts:58-61` | Utterance length check for silence staleness | Infrastructure freshness check |
| 5 | `pattern-detection.ts:29` | Utterance length gate for LLM calls (<30 chars) | Cost/performance gate |
| 6 | `fragment-extractor.ts:42-66` | Transcript normalization (split by role prefix) | Mechanical text processing |
| 7 | `css-pattern-service.ts:18-29` | Agent response marker filtering | Role identification, not clinical |
| 8 | `meta-instruction-detector.ts` (entire file) | Pure LLM detection | Architecturally sound |
| 9 | `origin-adjacency-detector.ts` (entire file) | Pure LLM detection with context | Architecturally sound |
| 10 | `guidance-generator.ts` (all logic) | Operates on structured scores | No direct utterance matching |
| 11 | `narrative-web.ts` (entire file) | Embedding-based semantic similarity | Architecturally sound |
| 12 | `fragment-extractor.ts` (Claude extraction) | LLM-based extraction | Architecturally sound |
| 13 | `pattern-detection.ts:detectIBMWithLLM()` | LLM-based IBM detection | Architecturally sound |
| 14 | `pattern-detection.ts:detectSemanticPatternsWithLLM()` | LLM-based pattern detection | Architecturally sound |

---

## 4. Files With No Violations Found (Confirmed Read)

| File | Confirmed | Notes |
|------|-----------|-------|
| `server/services/una-orchestrator.ts` | Read in full | Operates on pre-computed numeric scores only |
| `server/services/sensing-layer/index.ts` | Read (200 lines) | Orchestration only, delegates to modules |
| `server/services/sensing-layer/state-vector.ts` | Read in full | Pure mathematical coupling |
| `server/services/sensing-layer/narrative-web.ts` | Read in full | Embedding-based semantic search |
| `server/services/sensing-layer/fragment-extractor.ts` | Read in full | LLM-based extraction |
| `server/services/sensing-layer/meta-instruction-detector.ts` | Read in full | Pure LLM |
| `server/services/sensing-layer/origin-adjacency-detector.ts` | Read in full | Pure LLM |
| `server/services/sensing-layer/silence-monitor.ts` | Read in full | Timer/infrastructure logic |
| `server/services/sensing-layer/guidance-generator.ts` | Read in full | Operates on structured scores |
| `server/services/sensing-layer/knowledge-base.ts` | Read in full | RAG/embedding retrieval |
| `server/services/sensing-layer/types.ts` | Read via imports | Type definitions only |
| `server/services/sensing-layer/call-state.ts` | Read via imports | State tracking only |
| `server/services/sensing-layer/session-state.ts` | Read via imports | State management only |
| `server/services/sensing-layer/profile-writer.ts` | Read via imports | Persistence only |
| `server/prompts/layers/layer-6.txt` | Read in full | Text content, no code |
| `server/prompts/layers/agent-prefixes.json` | Read in full | Text content, no code |
| `server/prompts/layers/layer-2.txt` | Read (100 lines) | Text content, no code |
| `server/prompts/layers/layer-3.txt` | Read (100 lines) | Text content, no code |
| `client/src/config/agent-configs.ts` | Read in full | Configuration only |
| `server/services/memory-service.ts` | Read (50 lines) | Database queries only |

---

## 5. Summary

**Total clinical keyword/lexical violations: 18**

**Violation distribution by file:**

| File | Count | Severity |
|------|-------|----------|
| `register-analysis.ts` | 1 | **Critical** — entire register system is keyword-based |
| `movement-assessment.ts` | 4 | **Critical** — movement indicators + CSS signals |
| `pattern-detection.ts` | 5 | **High** — pattern matching + theme detection |
| `symbolic-mapping.ts` | 4 | **High** — symbolic connections + awareness shifts |
| `fast-sense.ts` | 2 | **High** — fast-path critical moment detection |
| `css-pattern-service.ts` | 1 | **High** — full CSS construct detection |
| `guidance-injector.ts` | 1 | **Critical (safety)** — psychotic structure flag |

**Architecturally sound components already in place:**
- `detectIBMWithLLM()` — LLM-based IBM detection
- `detectSemanticPatternsWithLLM()` — LLM-based pattern detection
- `detectMetaInstruction()` — LLM-based meta-instruction detection
- `detectOriginAdjacency()` — LLM-based origin adjacency detection
- `detectSymbolicContentWithLLM()` — LLM-based symbolic content detection
- `narrative-web.ts` — Embedding-based semantic fragment matching
- `fragment-extractor.ts` — LLM-based post-session extraction
