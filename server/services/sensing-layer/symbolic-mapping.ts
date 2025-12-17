// server/services/sensing-layer/symbolic-mapping.ts
// Symbolic Mapping module for the Sensing Layer
// Connects present patterns to disclosed historical/trauma material

import Anthropic from '@anthropic-ai/sdk';
import {
  TurnInput,
  UserTherapeuticProfile,
  SymbolicMappingResult,
  ActiveSymbolicMapping,
  PotentialConnection,
  AwarenessShift,
  SymbolicConnectionType,
  AwarenessLevel,
  HistoricalMaterial,
  SymbolicMapping
} from './types';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

/**
 * Map symbolic connections between present patterns and historical material
 */
export async function mapSymbolic(
  input: TurnInput,
  profile: UserTherapeuticProfile
): Promise<SymbolicMappingResult> {
  console.log(`🔗 [Symbolic Mapping] Processing for user: ${input.userId}`);

  const startTime = Date.now();

  // 1. Get active mappings that may be relevant to current utterance
  const activeMappings = assessActiveMappings(input, profile.symbolicMappings, profile.historicalMaterial);

  // 2. Check for potential new connections using heuristics first
  const heuristicConnections = detectHeuristicConnections(input, profile);

  // 3. If we have historical material and the utterance is substantive, use Claude for deeper analysis
  let potentialConnections: PotentialConnection[] = heuristicConnections;

  if (profile.historicalMaterial.length > 0 && input.utterance.length > 50) {
    try {
      const claudeConnections = await analyzeSymbolicConnectionsWithClaude(input, profile);
      potentialConnections = mergeConnections(heuristicConnections, claudeConnections);
    } catch (error) {
      console.error('🔗 [Symbolic Mapping] Claude analysis failed, using heuristics only:', error);
    }
  }

  // 4. Check for awareness shifts
  const awarenessShift = detectAwarenessShift(input, profile.symbolicMappings);

  console.log(`🔗 [Symbolic Mapping] Found ${activeMappings.length} active, ${potentialConnections.length} potential (${Date.now() - startTime}ms)`);

  return {
    activeMappings,
    potentialConnections,
    awarenessShift
  };
}

/**
 * Assess which existing symbolic mappings are currently active
 */
function assessActiveMappings(
  input: TurnInput,
  mappings: SymbolicMapping[],
  historicalMaterial: HistoricalMaterial[]
): ActiveSymbolicMapping[] {
  const active: ActiveSymbolicMapping[] = [];
  const utteranceLower = input.utterance.toLowerCase();

  for (const mapping of mappings) {
    // Find related historical material
    const historical = historicalMaterial.find(h => h.id === mapping.historicalMaterialId);
    if (!historical) continue;

    // Calculate activation based on keyword overlap and thematic resonance
    const activation = calculateMappingActivation(utteranceLower, mapping, historical);

    if (activation > 0.2) {
      active.push({
        mappingId: mapping.id,
        presentPattern: mapping.symbolicConnection,
        historicalMaterial: historical.content.substring(0, 100),
        connectionType: mapping.connectionType,
        currentActivation: activation,
        userAwareness: mapping.userAwareness
      });
    }
  }

  return active.sort((a, b) => b.currentActivation - a.currentActivation);
}

/**
 * Calculate how activated a mapping is by the current utterance
 */
function calculateMappingActivation(
  utterance: string,
  mapping: SymbolicMapping,
  historical: HistoricalMaterial
): number {
  let activation = 0;

  // Check for keywords from the symbolic connection
  const connectionWords = mapping.symbolicConnection.toLowerCase().split(/\s+/);
  for (const word of connectionWords) {
    if (word.length > 3 && utterance.includes(word)) {
      activation += 0.15;
    }
  }

  // Check for related figures mentioned
  for (const figure of historical.relatedFigures) {
    if (utterance.includes(figure.toLowerCase())) {
      activation += 0.3;
    }
  }

  // Check for emotional valence match
  if (historical.emotionalValence && utterance.includes(historical.emotionalValence.toLowerCase())) {
    activation += 0.2;
  }

  // Connection type specific activators
  const typeActivators = getTypeActivators(mapping.connectionType);
  for (const activator of typeActivators) {
    if (utterance.includes(activator)) {
      activation += 0.15;
    }
  }

  return Math.min(1, activation);
}

/**
 * Get activating phrases for each connection type
 */
function getTypeActivators(connectionType: SymbolicConnectionType): string[] {
  const activators: Record<SymbolicConnectionType, string[]> = {
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

  return activators[connectionType] || [];
}

/**
 * Detect potential connections using heuristics
 */
function detectHeuristicConnections(
  input: TurnInput,
  profile: UserTherapeuticProfile
): PotentialConnection[] {
  const connections: PotentialConnection[] = [];
  const utteranceLower = input.utterance.toLowerCase();

  // Heuristic 1: Figure mentions in current context
  for (const material of profile.historicalMaterial) {
    for (const figure of material.relatedFigures) {
      if (utteranceLower.includes(figure.toLowerCase())) {
        connections.push({
          utteranceContent: input.utterance.substring(0, 100),
          possibleHistoricalLink: material.content.substring(0, 100),
          connectionType: 'figure_substitution',
          confidence: 0.6,
          suggestedExploration: `Consider exploring connection to ${figure} mentioned in historical context`
        });
      }
    }
  }

  // Heuristic 2: Emotional pattern matching
  const emotionalMarkers = [
    { words: ['abandoned', 'left', 'alone'], emotion: 'abandonment' },
    { words: ['betrayed', 'trust', 'lied'], emotion: 'betrayal' },
    { words: ['rejected', 'unwanted', 'not good enough'], emotion: 'rejection' },
    { words: ['controlled', 'trapped', 'suffocated'], emotion: 'control' },
    { words: ['unsafe', 'scared', 'afraid', 'terrified'], emotion: 'fear' },
    { words: ['ashamed', 'embarrassed', 'humiliated'], emotion: 'shame' }
  ];

  for (const marker of emotionalMarkers) {
    if (marker.words.some(word => utteranceLower.includes(word))) {
      // Check if this emotion connects to any historical material
      for (const material of profile.historicalMaterial) {
        if (material.emotionalValence?.toLowerCase().includes(marker.emotion) ||
            material.content.toLowerCase().includes(marker.emotion)) {
          connections.push({
            utteranceContent: `Current ${marker.emotion} feelings`,
            possibleHistoricalLink: material.content.substring(0, 100),
            connectionType: 'emotional_rhyme',
            confidence: 0.5,
            suggestedExploration: `Explore whether current ${marker.emotion} connects to earlier ${marker.emotion} experiences`
          });
        }
      }
    }
  }

  // Heuristic 3: Pattern repetition indicators
  const repetitionMarkers = [
    'always happens', 'every time', 'same thing', 'pattern', 'cycle',
    'keep doing', 'there i go again', 'typical', 'as usual'
  ];

  for (const marker of repetitionMarkers) {
    if (utteranceLower.includes(marker)) {
      // This might connect to learned behavioral patterns
      for (const material of profile.historicalMaterial) {
        connections.push({
          utteranceContent: input.utterance.substring(0, 100),
          possibleHistoricalLink: material.content.substring(0, 100),
          connectionType: 'behavioral_repetition',
          confidence: 0.4,
          suggestedExploration: 'Explore origins of this repeated pattern'
        });
        break; // Only one general connection
      }
    }
  }

  return connections;
}

/**
 * Use Claude to analyze deeper symbolic connections
 */
async function analyzeSymbolicConnectionsWithClaude(
  input: TurnInput,
  profile: UserTherapeuticProfile
): Promise<PotentialConnection[]> {
  // Don't call if no API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('🔗 [Symbolic Mapping] No ANTHROPIC_API_KEY, skipping Claude analysis');
    return [];
  }

  // Prepare context
  const historicalContext = profile.historicalMaterial
    .slice(0, 5)
    .map(m => `- ${m.content} (Figures: ${m.relatedFigures.join(', ')}, Emotion: ${m.emotionalValence})`)
    .join('\n');

  const existingMappings = profile.symbolicMappings
    .slice(0, 5)
    .map(m => `- ${m.symbolicConnection} (Type: ${m.connectionType}, Awareness: ${m.userAwareness})`)
    .join('\n');

  const prompt = `You are a psychodynamic therapist analyzing symbolic connections between a client's current utterance and their historical material.

CURRENT UTTERANCE:
"${input.utterance}"

DISCLOSED HISTORICAL MATERIAL:
${historicalContext || 'No historical material disclosed yet.'}

EXISTING SYMBOLIC MAPPINGS:
${existingMappings || 'No mappings established yet.'}

Analyze for potential symbolic connections. Look for:
1. FIGURE_SUBSTITUTION: Is the client relating to someone in the present the way they did to a historical figure?
2. SITUATION_ECHO: Does the current situation structurally mirror a historical conflict?
3. EMOTIONAL_RHYME: Are present feelings echoing unprocessed historical emotions?
4. BEHAVIORAL_REPETITION: Is the client enacting a learned survival pattern?

Respond in JSON format:
{
  "connections": [
    {
      "utteranceContent": "relevant part of current utterance",
      "possibleHistoricalLink": "relevant historical material",
      "connectionType": "one of the four types",
      "confidence": 0.0-1.0,
      "suggestedExploration": "therapeutic direction to explore this"
    }
  ]
}

Only include connections with confidence > 0.3. If no meaningful connections, return empty array.
Be concise and clinically relevant.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    // Extract text content
    const content = response.content[0];
    if (content.type !== 'text') return [];

    // Parse JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return (parsed.connections || []).map((c: any) => ({
      utteranceContent: c.utteranceContent || '',
      possibleHistoricalLink: c.possibleHistoricalLink || '',
      connectionType: validateConnectionType(c.connectionType),
      confidence: Math.min(1, Math.max(0, c.confidence || 0.5)),
      suggestedExploration: c.suggestedExploration || ''
    }));
  } catch (error) {
    console.error('🔗 [Symbolic Mapping] Claude API error:', error);
    return [];
  }
}

/**
 * Validate and normalize connection type
 */
function validateConnectionType(type: string): SymbolicConnectionType {
  const normalized = type?.toLowerCase().replace(/[^a-z_]/g, '');
  const valid: SymbolicConnectionType[] = [
    'figure_substitution',
    'situation_echo',
    'emotional_rhyme',
    'behavioral_repetition'
  ];

  if (valid.includes(normalized as SymbolicConnectionType)) {
    return normalized as SymbolicConnectionType;
  }
  return 'emotional_rhyme'; // Default
}

/**
 * Merge heuristic and Claude connections, removing duplicates
 */
function mergeConnections(
  heuristic: PotentialConnection[],
  claude: PotentialConnection[]
): PotentialConnection[] {
  const merged: PotentialConnection[] = [...claude]; // Claude gets priority

  for (const h of heuristic) {
    // Check if similar connection already exists
    const exists = merged.some(c =>
      c.connectionType === h.connectionType &&
      c.possibleHistoricalLink.substring(0, 50) === h.possibleHistoricalLink.substring(0, 50)
    );

    if (!exists) {
      merged.push(h);
    }
  }

  return merged.slice(0, 5); // Limit to 5 connections
}

/**
 * Detect if user is showing increased awareness of a symbolic connection
 */
function detectAwarenessShift(
  input: TurnInput,
  mappings: SymbolicMapping[]
): AwarenessShift | null {
  const utteranceLower = input.utterance.toLowerCase();

  // Awareness shift indicators
  const insightPhrases = [
    'i just realized', 'it hits me', 'i see now', 'i never noticed',
    'makes sense now', 'connecting the dots', 'i understand now',
    'that\'s why', 'no wonder', 'it\'s because', 'i get it now',
    'just like with', 'reminds me of when', 'same thing happened'
  ];

  const hasInsightMarker = insightPhrases.some(phrase => utteranceLower.includes(phrase));

  if (!hasInsightMarker) return null;

  // Check if this insight relates to an existing mapping
  for (const mapping of mappings) {
    const connectionWords = mapping.symbolicConnection.toLowerCase().split(/\s+/);
    const hasRelevance = connectionWords.some(word =>
      word.length > 3 && utteranceLower.includes(word)
    );

    if (hasRelevance && mapping.userAwareness !== 'conscious') {
      return {
        mappingId: mapping.id,
        fromLevel: mapping.userAwareness,
        toLevel: getNextAwarenessLevel(mapping.userAwareness),
        evidenceStatement: input.utterance.substring(0, 100)
      };
    }
  }

  return null;
}

/**
 * Get the next awareness level
 */
function getNextAwarenessLevel(current: AwarenessLevel): AwarenessLevel {
  const progression: AwarenessLevel[] = ['unconscious', 'preconscious', 'emerging', 'conscious'];
  const currentIndex = progression.indexOf(current);

  if (currentIndex < progression.length - 1) {
    return progression[currentIndex + 1];
  }
  return 'conscious';
}
