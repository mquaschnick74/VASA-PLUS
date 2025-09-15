import { supabase } from './supabase-service';
import { detectCSSPatterns } from './css-pattern-service';

/**
 * Get CSS progression context for a user
 */
export async function getCSSProgressionContext(userId: string): Promise<string> {
  try {
    // Get the latest CSS summary
    const { data: latestSummary } = await supabase
      .from('therapeutic_context')
      .select('content, created_at')
      .eq('user_id', userId)
      .eq('context_type', 'css_summary')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!latestSummary) {
      return 'No previous CSS progression data available.';
    }

    // Parse metadata from content if it exists
    let metadata: any = null;
    if (latestSummary.content.includes('---METADATA---')) {
      const parts = latestSummary.content.split('---METADATA---');
      try {
        metadata = JSON.parse(parts[1]);
      } catch (e) {
        console.log('Could not parse embedded metadata');
      }
    }
    let context = `CSS PROGRESSION CONTEXT:\n`;
    
    if (metadata?.currentStage) {
      context += `Current Stage: ${metadata.currentStage}\n`;
    }
    
    if (metadata?.patterns) {
      context += `\nPattern Counts:\n`;
      context += `- CVDC (Contradictions): ${metadata.patterns.cvdc || 0}\n`;
      context += `- IBM (Behavioral Gaps): ${metadata.patterns.ibm || 0}\n`;
      context += `- Thend (Integration): ${metadata.patterns.thend || 0}\n`;
      context += `- CYVC (Resolution): ${metadata.patterns.cyvc || 0}\n`;
    }

    if (metadata?.keyThemes && metadata.keyThemes.length > 0) {
      context += `\nKey Themes:\n`;
      metadata.keyThemes.forEach((theme: any) => {
        context += `- ${theme.title}: ${theme.description}\n`;
      });
    }

    if (metadata?.contradictions && metadata.contradictions.length > 0) {
      context += `\nCore Contradictions:\n`;
      metadata.contradictions.forEach((c: string) => {
        context += `- "${c}"\n`;
      });
    }

    if (metadata?.somaticMarkers && metadata.somaticMarkers.length > 0) {
      context += `\nSomatic Experiences:\n`;
      metadata.somaticMarkers.forEach((s: string) => {
        context += `- "${s}"\n`;
      });
    }

    if (metadata?.therapeuticQuotes && metadata.therapeuticQuotes.length > 0) {
      context += `\nSignificant Quotes:\n`;
      metadata.therapeuticQuotes.forEach((q: string) => {
        context += `- "${q}"\n`;
      });
    }

    return context;

  } catch (error) {
    console.error('Error getting CSS progression context:', error);
    return 'Unable to retrieve CSS progression data.';
  }
}

/**
 * Generate CSS progression summary after session ends
 */
export async function generateCSSProgressionSummary(
  userId: string,
  callId: string,
  transcript: string,
  agentName: string
): Promise<void> {
  try {
    console.log(`📊 Generating CSS progression summary for call ${callId}`);
    
    // Detect CSS patterns in the transcript
    const patterns = detectCSSPatterns(transcript, true);
    
    // Extract key themes and quotes
    const keyThemes = extractKeyThemes(transcript, patterns);
    const contradictions = extractContradictions(patterns);
    const somaticMarkers = extractSomaticMarkers(transcript);
    const therapeuticQuotes = extractTherapeuticQuotes(transcript, patterns);
    
    // Build the summary metadata
    const summaryMetadata = {
      currentStage: patterns.currentStage,
      patterns: {
        cvdc: patterns.cvdcPatterns.length,
        ibm: patterns.ibmPatterns.length,
        thend: patterns.thendIndicators.length,
        cyvc: patterns.cyvcPatterns.length
      },
      keyThemes,
      contradictions: contradictions.slice(0, 3), // Top 3
      somaticMarkers: somaticMarkers.slice(0, 3), // Top 3
      therapeuticQuotes: therapeuticQuotes.slice(0, 5), // Top 5
      agentName,
      sessionDate: new Date().toISOString()
    };
    
    // Generate a coherent text summary
    const textSummary = generateTextSummary(summaryMetadata, transcript);
    
    // Create enhanced content with embedded metadata
    const enhancedContent = `${textSummary}\n\n---METADATA---\n${JSON.stringify(summaryMetadata, null, 2)}`;
    
    // Store the CSS summary (metadata embedded in content since column might not exist)
    const { error } = await supabase
      .from('therapeutic_context')
      .insert({
        user_id: userId,
        call_id: callId,
        context_type: 'css_summary',
        content: enhancedContent,
        css_stage: patterns.currentStage,
        confidence: 0.85
      });
    
    if (error) {
      console.error('Error storing CSS summary:', error);
      throw error;
    }
    
    console.log('✅ CSS progression summary stored successfully');
    
  } catch (error) {
    console.error('Error generating CSS progression summary:', error);
    throw error;
  }
}

/**
 * Extract key themes from transcript based on CSS patterns
 */
function extractKeyThemes(transcript: string, patterns: any): Array<{title: string, description: string}> {
  const themes = [];
  
  // Theme based on dominant pattern type
  if (patterns.cvdcPatterns.length > 0) {
    themes.push({
      title: 'Internal Contradictions',
      description: 'Exploring opposing truths and conflicting parts of self'
    });
  }
  
  if (patterns.ibmPatterns.length > 0) {
    themes.push({
      title: 'Behavioral Gaps',
      description: 'Noticing differences between intentions and actions'
    });
  }
  
  if (patterns.thendIndicators.length > 0) {
    themes.push({
      title: 'Integration Moments',
      description: 'Finding ways to hold contradictions without resolving them'
    });
  }
  
  // Look for emotional themes
  if (transcript.match(/\b(angry|sad|hurt|scared|anxious|overwhelmed)\b/gi)) {
    themes.push({
      title: 'Emotional Processing',
      description: 'Working with difficult feelings and emotional experiences'
    });
  }
  
  // Look for somatic themes
  if (transcript.match(/\b(throat|chest|stomach|body|tight|tense|heavy)\b/gi)) {
    themes.push({
      title: 'Somatic Awareness',
      description: 'Connecting with body sensations and physical experiences'
    });
  }
  
  return themes.slice(0, 3); // Return top 3 themes
}

/**
 * Extract contradictions from CSS patterns
 */
function extractContradictions(patterns: any): string[] {
  const contradictions = [];
  
  // Extract from CVDC patterns
  for (const pattern of patterns.cvdcPatterns) {
    const match = pattern.match(/(.+?)\s+BUT\s+(.+)/i);
    if (match) {
      contradictions.push(`${match[1].trim()} BUT ${match[2].trim()}`);
    } else if (pattern.includes('part of me')) {
      contradictions.push(pattern);
    }
  }
  
  // Extract from IBM patterns
  for (const pattern of patterns.ibmPatterns) {
    if (pattern.includes('want') && pattern.includes('but')) {
      contradictions.push(pattern);
    }
  }
  
  return contradictions;
}

/**
 * Extract somatic markers from transcript
 */
function extractSomaticMarkers(transcript: string): string[] {
  const somaticPatterns = [
    /my (\w+) feels? (tight|heavy|tense|numb|hot|cold|stuck)/gi,
    /(throat|chest|stomach|shoulders?|neck|jaw) (is|feels?) \w+/gi,
    /feel(s|ing)? it in my (\w+)/gi,
    /physical(ly)? (\w+)/gi,
    /body (is|feels?) (\w+)/gi
  ];
  
  const markers = new Set<string>();
  
  for (const pattern of somaticPatterns) {
    const matches = transcript.match(pattern);
    if (matches) {
      matches.forEach(m => {
        if (m.length < 100) { // Avoid long passages
          markers.add(m);
        }
      });
    }
  }
  
  return Array.from(markers);
}

/**
 * Extract therapeutic quotes that capture key insights
 */
function extractTherapeuticQuotes(transcript: string, patterns: any): string[] {
  const quotes = [];
  const sentences = transcript.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  
  for (const sentence of sentences) {
    // High-value therapeutic content
    if (sentence.match(/\b(realize|understand|notice|see|feel|discover)\b/i) &&
        sentence.match(/\b(I|me|my)\b/i)) {
      quotes.push(sentence);
    }
    
    // Contradictions and tensions
    if (sentence.match(/\bbut\b/i) && sentence.match(/\b(want|need|feel)\b/i)) {
      quotes.push(sentence);
    }
    
    // Integration moments
    if (sentence.match(/\b(both|and also|at the same time|together)\b/i)) {
      quotes.push(sentence);
    }
    
    // Somatic awareness
    if (sentence.match(/\b(body|throat|chest|stomach)\b/i) && 
        sentence.match(/\b(feel|notice|sense)\b/i)) {
      quotes.push(sentence);
    }
  }
  
  // Deduplicate and return most relevant
  return Array.from(new Set(quotes))
    .filter(q => q.length > 20 && q.length < 200)
    .slice(0, 10);
}

/**
 * Generate coherent text summary from metadata
 */
function generateTextSummary(metadata: any, transcript: string): string {
  let summary = `Session Summary (${metadata.agentName}):\n\n`;
  
  // Stage and progression
  summary += `CSS Stage: ${metadata.currentStage}\n`;
  summary += `Pattern Distribution: CVDC(${metadata.patterns.cvdc}), IBM(${metadata.patterns.ibm}), Thend(${metadata.patterns.thend}), CYVC(${metadata.patterns.cyvc})\n\n`;
  
  // Key themes
  if (metadata.keyThemes.length > 0) {
    summary += `Key Themes:\n`;
    metadata.keyThemes.forEach((theme: any) => {
      summary += `• ${theme.title}: ${theme.description}\n`;
    });
    summary += '\n';
  }
  
  // Core contradictions
  if (metadata.contradictions.length > 0) {
    summary += `Core Contradictions:\n`;
    metadata.contradictions.forEach((c: string) => {
      summary += `• ${c}\n`;
    });
    summary += '\n';
  }
  
  // Somatic experiences
  if (metadata.somaticMarkers.length > 0) {
    summary += `Somatic Experiences:\n`;
    metadata.somaticMarkers.forEach((s: string) => {
      summary += `• ${s}\n`;
    });
    summary += '\n';
  }
  
  // Therapeutic progress note
  summary += `Progress Note: Client engaged with ${metadata.agentName} in exploring `;
  if (metadata.patterns.cvdc > 0) {
    summary += 'internal contradictions ';
  }
  if (metadata.patterns.ibm > 0) {
    summary += 'behavioral patterns ';
  }
  if (metadata.patterns.thend > 0) {
    summary += 'integration possibilities ';
  }
  summary += 'through therapeutic dialogue.';
  
  return summary;
}