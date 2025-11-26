import { supabase } from './supabase-service';

/**
 * PHASE 1B AUDIT: Query PCA master analysis context size
 * Call this to check the size of therapeutic context being stored
 */
export async function auditPCAContextSize(userId: string): Promise<void> {
  console.log('\n📊 ===== PCA CONTEXT SIZE AUDIT =====');

  // Query recent PCA analyses
  const { data: pcaData, error: pcaError } = await supabase
    .from('pca_master_analysis')
    .select('analysis_id, therapeutic_context, full_analysis, current_css_stage, register_dominance, safety_assessment, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (pcaError) {
    console.error('❌ Error fetching PCA data:', pcaError);
    return;
  }

  if (!pcaData || pcaData.length === 0) {
    console.log('⚠️ No PCA master analyses found for this user');
    console.log('===== END PCA AUDIT =====\n');
    return;
  }

  console.log(`📄 Found ${pcaData.length} PCA analyses:`);
  pcaData.forEach((analysis, i) => {
    const contextChars = analysis.therapeutic_context?.length || 0;
    const fullChars = analysis.full_analysis?.length || 0;
    console.log(`\n  📋 Analysis ${i + 1} (${analysis.analysis_id}):`);
    console.log(`     - Created: ${analysis.created_at}`);
    console.log(`     - CSS Stage: ${analysis.current_css_stage}`);
    console.log(`     - Register: ${analysis.register_dominance}`);
    console.log(`     - Safety: ${analysis.safety_assessment}`);
    console.log(`     - therapeutic_context: ${contextChars} chars (~${Math.ceil(contextChars / 4)} tokens)`);
    console.log(`     - full_analysis: ${fullChars} chars (~${Math.ceil(fullChars / 4)} tokens)`);
  });
  console.log('\n===== END PCA AUDIT =====\n');
}

/**
 * PHASE 1D AUDIT: Compare PCA context with existing injected data
 * Shows what's redundant and what's unique
 */
/**
 * Get condensed PCA context for agent injection
 * Extracts unique therapeutic guidance not available from other sources
 * @param userId - The user ID to fetch context for
 * @param maxChars - Maximum characters to inject (default 2500 ≈ 625 tokens)
 */
export async function getPCAContextForAgent(userId: string, maxChars: number = 2500): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('pca_master_analysis')
      .select('therapeutic_context, current_css_stage, safety_assessment, register_dominance')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data?.therapeutic_context) {
      // PGRST116 = no rows returned, not an error for new users
      if (error?.code !== 'PGRST116') {
        console.log('📋 No PCA context available for injection');
      }
      return null;
    }

    // Extract only the unique sections not redundant with css_patterns
    const uniqueSections = extractUniquePCASections(data.therapeutic_context, data.safety_assessment);

    if (!uniqueSections || uniqueSections.length === 0) {
      console.log('📋 PCA context exists but no unique sections extracted');
      return null;
    }

    // Apply character limit with smart truncation
    if (uniqueSections.length > maxChars) {
      console.log(`⚠️ PCA context truncated from ${uniqueSections.length} to ${maxChars} chars`);
      return truncatePCAByPriority(uniqueSections, maxChars);
    }

    console.log(`✅ PCA context extracted: ${uniqueSections.length} chars (~${Math.ceil(uniqueSections.length / 4)} tokens)`);
    return uniqueSections;

  } catch (error) {
    console.error('Error fetching PCA context:', error);
    return null;
  }
}

/**
 * Extract sections from PCA context that provide unique value
 * Skips CSS Stage and CVDC (already in css_patterns)
 * Keeps: therapeutic approach, key quotes, safety details, protocols
 */
function extractUniquePCASections(fullContext: string, safetyLevel?: string): string {
  if (!fullContext) return '';

  let extracted = '';

  // 1. SAFETY SECTION - Include if not "low" risk (unique detailed guidance)
  const safetyMatch = fullContext.match(/## SAFETY STATUS:[\s\S]*?(?=##|\n===|$)/i);
  if (safetyMatch) {
    const safetyText = safetyMatch[0];
    // Only include if there's meaningful safety content (not just "low risk")
    const isLowRisk = safetyText.toLowerCase().includes('low risk') ||
                      safetyText.toLowerCase().includes('no immediate') ||
                      (safetyLevel && safetyLevel.toLowerCase() === 'low');

    if (!isLowRisk) {
      extracted += '## SAFETY ALERT\n';
      extracted += safetyText.trim() + '\n\n';
    }
  }

  // 2. PERCEPTUAL STRUCTURE - Unique register dominance details
  const perceptualMatch = fullContext.match(/## PERCEPTUAL STRUCTURE:[\s\S]*?(?=##|\n===|$)/i);
  if (perceptualMatch) {
    // Extract just the key info, not the full section
    const perceptualText = perceptualMatch[0];
    const clinicalPattern = perceptualText.match(/\*\*Clinical Pattern\*\*:([^\n]+)/i);
    if (clinicalPattern) {
      extracted += `Perceptual Focus: ${clinicalPattern[1].trim()}\n\n`;
    }
  }

  // 3. KEY QUOTES TO REFERENCE - Unique and high value for continuity
  const quotesMatch = fullContext.match(/## KEY QUOTES TO REFERENCE[\s\S]*?(?=##|\n===|$)/i);
  if (quotesMatch) {
    extracted += quotesMatch[0].trim() + '\n\n';
  }

  // 4. THERAPEUTIC APPROACH - The most unique and valuable section
  const approachMatch = fullContext.match(/## YOUR THERAPEUTIC APPROACH[\s\S]*?(?=\n===|$)/i);
  if (approachMatch) {
    extracted += approachMatch[0].trim() + '\n';
  }

  // Fallback: If we couldn't extract structured sections, take a condensed version
  if (extracted.trim().length < 100) {
    // Look for any intervention or protocol content
    const interventionMatch = fullContext.match(/Intervention[^:]*:[\s\S]{0,500}/gi);
    if (interventionMatch && interventionMatch.length > 0) {
      extracted = '## Therapeutic Interventions\n';
      extracted += interventionMatch.slice(0, 3).join('\n\n');
    }
  }

  return extracted.trim();
}

/**
 * Truncate PCA context by priority
 * Priority order: Safety > Therapeutic Approach > Key Quotes > Perceptual
 */
function truncatePCAByPriority(content: string, maxChars: number): string {
  // If content is already under limit, return as-is
  if (content.length <= maxChars) return content;

  // Split into sections by ## headers
  const sections: { name: string; content: string; priority: number }[] = [];
  const sectionMatches = content.split(/(?=## )/);

  sectionMatches.forEach(section => {
    if (!section.trim()) return;

    const headerMatch = section.match(/^## ([^\n]+)/);
    const name = headerMatch ? headerMatch[1].toUpperCase() : 'OTHER';

    // Assign priority (lower = higher priority)
    let priority = 5;
    if (name.includes('SAFETY')) priority = 1;
    else if (name.includes('THERAPEUTIC') || name.includes('APPROACH')) priority = 2;
    else if (name.includes('QUOTE')) priority = 3;
    else if (name.includes('PERCEPTUAL') || name.includes('INTERVENTION')) priority = 4;

    sections.push({ name, content: section, priority });
  });

  // Sort by priority
  sections.sort((a, b) => a.priority - b.priority);

  // Build result respecting character limit
  let result = '';
  for (const section of sections) {
    if (result.length + section.content.length <= maxChars) {
      result += section.content;
    } else {
      // Add truncated section if there's room for at least 200 chars
      const remaining = maxChars - result.length;
      if (remaining > 200) {
        result += section.content.substring(0, remaining - 50);
        result += '\n[Truncated for brevity]\n';
      }
      break;
    }
  }

  return result.trim();
}

export async function auditRedundancy(userId: string): Promise<void> {
  console.log('\n📊 ===== REDUNDANCY ANALYSIS =====');

  // 1. Get CSS patterns (already injected)
  const { data: cssPatterns } = await supabase
    .from('css_patterns')
    .select('css_stage, pattern_type, content, extracted_contradiction')
    .eq('user_id', userId)
    .order('detected_at', { ascending: false })
    .limit(5);

  console.log('\n🔵 CSS_PATTERNS (currently injected):');
  if (cssPatterns && cssPatterns.length > 0) {
    cssPatterns.forEach((p, i) => {
      console.log(`   ${i + 1}. Stage: ${p.css_stage}, Type: ${p.pattern_type}`);
      console.log(`      Content: ${(p.content || '').substring(0, 100)}...`);
      if (p.extracted_contradiction) {
        console.log(`      Contradiction: ${p.extracted_contradiction.substring(0, 80)}...`);
      }
    });
  } else {
    console.log('   No CSS patterns found');
  }

  // 2. Get therapeutic_context (existing types that ARE injected)
  const { data: existingContext } = await supabase
    .from('therapeutic_context')
    .select('context_type, content, created_at')
    .eq('user_id', userId)
    .in('context_type', ['session_insight', 'call_summary', 'conversational_summary'])
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n🟢 THERAPEUTIC_CONTEXT (currently injected types):');
  if (existingContext && existingContext.length > 0) {
    existingContext.forEach((c, i) => {
      console.log(`   ${i + 1}. Type: ${c.context_type}`);
      console.log(`      Content: ${(c.content || '').substring(0, 150)}...`);
    });
  } else {
    console.log('   No existing therapeutic context found');
  }

  // 3. Get PCA master analysis (NOT injected - the gap!)
  const { data: pcaAnalysis } = await supabase
    .from('pca_master_analysis')
    .select('therapeutic_context, current_css_stage, register_dominance, safety_assessment')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  console.log('\n🔴 PCA_MASTER_ANALYSIS (NOT currently injected):');
  if (pcaAnalysis) {
    const contextLen = pcaAnalysis.therapeutic_context?.length || 0;
    console.log(`   CSS Stage: ${pcaAnalysis.current_css_stage}`);
    console.log(`   Register: ${pcaAnalysis.register_dominance}`);
    console.log(`   Safety: ${pcaAnalysis.safety_assessment}`);
    console.log(`   Context length: ${contextLen} chars (~${Math.ceil(contextLen / 4)} tokens)`);

    // Show unique sections in PCA therapeutic_context
    console.log('\n   📑 PCA Therapeutic Context Preview:');
    const lines = (pcaAnalysis.therapeutic_context || '').split('\n').slice(0, 30);
    lines.forEach(line => {
      if (line.trim()) console.log(`      ${line.substring(0, 100)}`);
    });

    // Analyze unique value
    console.log('\n   🔍 UNIQUE VALUE ANALYSIS:');
    const content = pcaAnalysis.therapeutic_context || '';
    const hasApproach = content.includes('YOUR THERAPEUTIC APPROACH') || content.includes('THERAPEUTIC APPROACH');
    const hasQuotes = content.includes('KEY QUOTES TO REFERENCE') || content.includes('KEY QUOTES');
    const hasSafety = content.includes('SAFETY STATUS');
    const hasProtocol = content.includes('SESSION CLOSING') || content.includes('CLOSING PROTOCOL');
    const hasIntervention = content.includes('Intervention') || content.includes('INTERVENTION');

    console.log(`      - Has therapeutic approach scripts: ${hasApproach ? '✅ YES (UNIQUE)' : '❌ NO'}`);
    console.log(`      - Has key quotes to reference: ${hasQuotes ? '✅ YES (UNIQUE)' : '❌ NO'}`);
    console.log(`      - Has safety status: ${hasSafety ? '✅ YES (may duplicate css_patterns)' : '❌ NO'}`);
    console.log(`      - Has session protocols: ${hasProtocol ? '✅ YES (UNIQUE)' : '❌ NO'}`);
    console.log(`      - Has specific interventions: ${hasIntervention ? '✅ YES (UNIQUE)' : '❌ NO'}`);
  } else {
    console.log('   No PCA analysis found');
  }

  console.log('\n===== END REDUNDANCY ANALYSIS =====\n');
}

/**
 * Builds memory context for display to users AND AI agents
 * Now filters insights to only show user-friendly content
 */
export async function buildMemoryContext(userId: string): Promise<string> {
  try {
    // === PHASE 1A AUDIT LOGGING ===
    const auditSizes: Record<string, number> = {};

    // Fetch user's name for proper display
    const { data: userProfile } = await supabase
      .from('users')
      .select('first_name')
      .eq('id', userId)
      .single();

    const userName = userProfile?.first_name || 'there';

    // Fetch assessment data from user_profiles
    const { data: assessmentData } = await supabase
      .from('user_profiles')
      .select('assessment_completed_at, assessment_responses, inner_landscape_type, assessment_insights')
      .eq('id', userId)
      .single();

    // Fetch recent sessions
    const { data: sessions, error: sessionsError } = await supabase
      .from('therapeutic_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (sessionsError) {
      console.error('Error fetching sessions:', sessionsError);
      return '';
    }

    // MODIFIED: Fetch ONLY user-friendly insights (exclude technical metadata)
    const { data: insights, error: insightsError } = await supabase
      .from('therapeutic_context')
      .select('*')
      .eq('user_id', userId)
      .in('context_type', ['session_insight', 'call_summary', 'conversational_summary'])  // Only user-friendly types
      .order('created_at', { ascending: false })
      .limit(5);

    if (insightsError) {
      console.error('Error fetching insights:', insightsError);
      return '';
    }

    // Get CSS-specific patterns (for agent context, not displayed to user)
    const { data: cssPatterns } = await supabase
      .from('css_patterns')
      .select('css_stage, pattern_type, content, extracted_contradiction')
      .eq('user_id', userId)
      .order('detected_at', { ascending: false })
      .limit(3);

    // Format memory context
    let memoryContext = '';

    // Include assessment data if available
    const preAssessmentLen = memoryContext.length;
    if (assessmentData?.assessment_completed_at) {
      const isFirstSession = !sessions || sessions.length === 0;

      if (isFirstSession) {
        // FIRST SESSION: Include detailed assessment data
        memoryContext += `\n===== PRE-SESSION ASSESSMENT =====\n`;
        memoryContext += `Before this first session, ${userName} completed an Inner Landscape Assessment.\n\n`;

        if (assessmentData.inner_landscape_type) {
          memoryContext += `🔍 Identified Pattern: ${assessmentData.inner_landscape_type}\n\n`;
        }

        if (assessmentData.assessment_responses) {
          memoryContext += `Assessment Responses:\n`;
          const responses = assessmentData.assessment_responses as Record<string, any>;
          Object.entries(responses).forEach(([question, answer], index) => {
            memoryContext += `  Q${index + 1}. ${question}\n`;
            memoryContext += `      → ${answer}\n\n`;
          });
        }

        if (assessmentData.assessment_insights) {
          memoryContext += `📋 Key Insights:\n${assessmentData.assessment_insights}\n`;
        }

        memoryContext += `\n💡 Use this assessment data to inform your therapeutic approach and build on ${userName}'s self-identified patterns.\n`;
        memoryContext += `===== END ASSESSMENT =====\n\n`;
      } else {
        // SUBSEQUENT SESSIONS: Include lighter version
        memoryContext += `\n📋 Note: ${userName} completed a pre-session assessment identifying their pattern as "${assessmentData.inner_landscape_type || 'exploring their inner landscape'}". `;
        memoryContext += `This provides foundational context for your ongoing work together.\n\n`;
      }
    }
    auditSizes['assessment_data'] = memoryContext.length - preAssessmentLen;

    const preSessionHistoryLen = memoryContext.length;
    if (sessions && sessions.length > 0) {
      // Use actual user name instead of "this user"
      memoryContext += `You have had ${sessions.length} previous sessions with ${userName}. `;

      const lastSession = sessions[0];
      const lastDate = new Date(lastSession.created_at).toLocaleDateString();
      memoryContext += `The last session was on ${lastDate}. `;

      if (lastSession.duration_seconds) {
        const minutes = Math.floor(lastSession.duration_seconds / 60);
        memoryContext += `It lasted ${minutes} minutes. `;
      }
    }
    auditSizes['session_history'] = memoryContext.length - preSessionHistoryLen;

    // MODIFIED: Better filtering and formatting of insights
    const preInsightsLen = memoryContext.length;
    if (insights && insights.length > 0) {
      memoryContext += '\n\nKey insights from previous sessions:\n';

      // Filter out duplicate or technical-looking content
      const userFriendlyInsights = insights.filter(insight => {
        const content = insight.content.toLowerCase();
        // Exclude entries that look like technical metadata
        return !content.includes('"exchangecount"') &&
               !content.includes('"narrativedepth"') &&
               !content.includes('"therapeuticarc"') &&
               !content.includes('"dominantmovement"') &&
               !content.includes('session with sarah') && // Avoid duplicate summaries
               !content.includes('session with mathew') &&
               content.length > 20; // Exclude very short entries
      });

      // Display only the most relevant insights
      userFriendlyInsights.slice(0, 3).forEach((insight, index) => {
        // Replace generic terms with actual names
        let content = insight.content;
        const sessionForInsight = sessions?.find(s => s.call_id === insight.call_id);
        const agentName = sessionForInsight?.agent_name || 'Sarah';

        content = content
          .replace(/\b(the |this )?user\b/gi, userName)
          .replace(/\b(the )?AI\b/gi, agentName);

        memoryContext += `${index + 1}. ${content}\n`;
      });
    }
    auditSizes['insights'] = memoryContext.length - preInsightsLen;

    // Add CSS patterns for agent context (but keep it subtle for user display)
    const preCssPatternsLen = memoryContext.length;
    if (cssPatterns && cssPatterns.length > 0) {
      const currentStage = cssPatterns[0].css_stage;
      memoryContext += `\n\nTherapeutic Progress: Currently in ${formatStageName(currentStage)} stage. `;

      const cvdcPattern = cssPatterns.find(p => p.pattern_type === 'CVDC');
      if (cvdcPattern) {
        const contradiction = cvdcPattern.extracted_contradiction || cvdcPattern.content;
        memoryContext += `Key pattern: "${contradiction}" `;
      }
    }
    auditSizes['css_patterns'] = memoryContext.length - preCssPatternsLen;

    // ADDED: CSS Stage Guidance from Process Metrics
    const preCssGuidanceLen = memoryContext.length;
    const { data: processMetrics } = await supabase
      .from('css_patterns')
      .select('css_stage, confidence, content')
      .eq('user_id', userId)
      .eq('pattern_type', 'PROCESS')
      .order('detected_at', { ascending: false })
      .limit(1)
      .single();

    if (processMetrics && processMetrics.css_stage) {
      const suggestedStage = processMetrics.css_stage;
      const confidence = processMetrics.confidence || 0.5;

      // Parse the content to get metrics
      let metricsInfo = '';
      if (processMetrics.content) {
        const match = processMetrics.content.match(/exchanges=(\d+)/);
        if (match) {
          metricsInfo = ` (${match[1]} exchanges)`;
        }
      }

      memoryContext += `\n\n===== CSS STAGE GUIDANCE =====\n`;
      memoryContext += `Clinical metrics suggest CSS stage: ${suggestedStage}${metricsInfo}\n`;
      memoryContext += `Confidence: ${(confidence * 100).toFixed(0)}%\n`;
      memoryContext += `\nThis is a suggestion based on therapeutic metrics (narrative depth, emotional range, exchange count). `;
      memoryContext += `You should verify this matches your observations before progressing stages. `;
      memoryContext += `Remember: Stage progression should be organic and therapeutically appropriate, not automatic.\n`;
      memoryContext += `===== END GUIDANCE =====\n`;
    }
    auditSizes['css_stage_guidance'] = memoryContext.length - preCssGuidanceLen;

    // ========================================
    // NEW: Add PCA Clinical Context if available
    // This injects unique therapeutic guidance from master PCA analysis
    // ========================================
    const prePcaLen = memoryContext.length;
    const pcaContext = await getPCAContextForAgent(userId);
    if (pcaContext) {
      memoryContext += `\n\n===== PCA CLINICAL GUIDANCE =====\n`;
      memoryContext += `The following is specialized therapeutic guidance from the most recent clinical analysis:\n\n`;
      memoryContext += pcaContext;
      memoryContext += `\n===== END PCA GUIDANCE =====\n`;
    }
    auditSizes['pca_context'] = memoryContext.length - prePcaLen;

    // ========================================
    // TOTAL CONTEXT LIMIT - prevent token overflow
    // ========================================
    const MAX_CONTEXT_CHARS = 12000; // ~3000 tokens - safe limit for VAPI
    if (memoryContext.length > MAX_CONTEXT_CHARS) {
      console.warn(`⚠️ Memory context exceeds limit (${memoryContext.length} chars). Truncating to ${MAX_CONTEXT_CHARS}.`);
      memoryContext = memoryContext.substring(0, MAX_CONTEXT_CHARS) +
        '\n\n[Context truncated for token efficiency - focus on most recent therapeutic guidance]';
    }

    // === PHASE 1A AUDIT: Log sizes ===
    const totalChars = memoryContext.length;
    const estimatedTokens = Math.ceil(totalChars / 4);
    console.log('\n📊 ===== MEMORY CONTEXT SIZE AUDIT =====');
    console.log(`📏 Assessment data:      ${auditSizes['assessment_data'] || 0} chars (~${Math.ceil((auditSizes['assessment_data'] || 0) / 4)} tokens)`);
    console.log(`📏 Session history:      ${auditSizes['session_history'] || 0} chars (~${Math.ceil((auditSizes['session_history'] || 0) / 4)} tokens)`);
    console.log(`📏 Insights:             ${auditSizes['insights'] || 0} chars (~${Math.ceil((auditSizes['insights'] || 0) / 4)} tokens)`);
    console.log(`📏 CSS patterns:         ${auditSizes['css_patterns'] || 0} chars (~${Math.ceil((auditSizes['css_patterns'] || 0) / 4)} tokens)`);
    console.log(`📏 CSS stage guidance:   ${auditSizes['css_stage_guidance'] || 0} chars (~${Math.ceil((auditSizes['css_stage_guidance'] || 0) / 4)} tokens)`);
    console.log(`📏 PCA context:          ${auditSizes['pca_context'] || 0} chars (~${Math.ceil((auditSizes['pca_context'] || 0) / 4)} tokens)`);
    console.log(`📏 TOTAL memoryContext:  ${totalChars} chars (~${estimatedTokens} tokens)`);
    if (totalChars > MAX_CONTEXT_CHARS - 1000) {
      console.log(`⚠️ WARNING: Approaching token limit!`);
    }
    console.log('===== END SIZE AUDIT =====\n');

    return memoryContext || 'This is your first session together.';
  } catch (error) {
    console.error('Error building memory context:', error);
    return 'Welcome to your session.';
  }
}

/**
 * Build memory context specifically for user display (simpler, cleaner)
 */
export async function buildUserDisplayContext(userId: string): Promise<string[]> {
  try {
    // Get only the most recent narrative insights (excluding call_summary)
    const { data: insights, error } = await supabase
      .from('therapeutic_context')
      .select('content, created_at')
      .eq('user_id', userId)
      .in('context_type', ['session_insight', 'conversational_summary'])
      .neq('context_type', 'process_assessment')
      .order('created_at', { ascending: false })
      .limit(3);

    if (error || !insights || insights.length === 0) {
      return ['Starting your therapeutic journey'];
    }

    // Filter and format for display
    return insights
      .filter(insight => {
        const content = insight.content.toLowerCase();
        return !content.includes('exchangecount') && 
               !content.includes('narrativedepth') &&
               !content.includes('session with') &&
               content.length > 20;
      })
      .map(insight => insight.content)
      .slice(0, 2); // Show max 2 insights on the UI
  } catch (error) {
    console.error('Error building user display context:', error);
    return ['Welcome to your therapeutic space'];
  }
}

/**
 * Format CSS stage names for user-friendly display
 */
function formatStageName(stage: string): string {
  const stageMap: { [key: string]: string } = {
    'pointed_origin': 'early exploration',
    'focus_bind': 'pattern recognition',
    'thend': 'therapeutic shift',
    'cyvc': 'emerging flexibility',
    'CVDC': 'pattern awareness',
    'IBM': 'behavior mapping',
    'SUSPENSION': 'reflection'
  };

  return stageMap[stage] || stage.toLowerCase().replace('_', ' ');
}

/**
 * Enhanced memory context builder that includes last session summary
 * for natural conversation continuity
 */
export async function buildMemoryContextWithSummary(userId: string): Promise<{
  memoryContext: string;
  lastSessionSummary: string | null;
  shouldReferenceLastSession: boolean;
}> {
  try {
    console.log(`📚 Building enhanced memory context for user: ${userId}`);

    // Fetch the most recent conversational summary
    const { data: lastSummary, error: summaryError } = await supabase
      .from('therapeutic_context')
      .select('*')
      .eq('user_id', userId)
      .eq('context_type', 'conversational_summary')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (summaryError && summaryError.code !== 'PGRST116') {
      console.error('Error fetching last summary:', summaryError);
    }

    // Also check for regular call_summary if no conversational_summary exists
    let fallbackSummary = null;
    if (!lastSummary) {
      const { data: callSummary } = await supabase
        .from('therapeutic_context')
        .select('*')
        .eq('user_id', userId)
        .eq('context_type', 'call_summary')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (callSummary) {
        fallbackSummary = callSummary;
        console.log('📝 Using call_summary as fallback for conversation continuity');
      }
    }

    // Get the existing base memory context
    const baseContext = await buildMemoryContext(userId);

    // Use either conversational_summary or call_summary
    const summaryToUse = lastSummary || fallbackSummary;

    // Determine if we should reference the last session
    let shouldReference = false;
    let timeSinceLastSession = null;

    if (summaryToUse) {
      const lastSessionTime = new Date(summaryToUse.created_at).getTime();
      const currentTime = Date.now();
      const daysSinceLastSession = (currentTime - lastSessionTime) / (1000 * 60 * 60 * 24);

      // Reference if within 7 days
      shouldReference = daysSinceLastSession <= 7;

      // Log time since last session for debugging
      if (daysSinceLastSession < 1) {
        timeSinceLastSession = 'earlier today';
      } else if (daysSinceLastSession === 1) {
        timeSinceLastSession = 'yesterday';
      } else if (daysSinceLastSession < 7) {
        timeSinceLastSession = `${Math.floor(daysSinceLastSession)} days ago`;
      } else if (daysSinceLastSession < 30) {
        timeSinceLastSession = `${Math.floor(daysSinceLastSession / 7)} weeks ago`;
      } else {
        timeSinceLastSession = 'over a month ago';
      }

      console.log(`⏰ Last session was ${timeSinceLastSession} - Reference: ${shouldReference}`);
    }

    // Process the summary for better conversational use
    let processedSummary = null;
    if (summaryToUse?.content) {
      processedSummary = enhanceSummaryForConversation(summaryToUse.content);
    }

    // Add timing context to the summary if relevant
    if (processedSummary && timeSinceLastSession && shouldReference) {
      processedSummary = `Last session (${timeSinceLastSession}): ${processedSummary}`;
    }

    console.log(`✅ Enhanced memory context built:`);
    console.log(`   - Has base context: ${baseContext.length > 0}`);
    console.log(`   - Has last summary: ${!!processedSummary}`);
    console.log(`   - Should reference: ${shouldReference}`);

    return {
      memoryContext: baseContext,
      lastSessionSummary: processedSummary,
      shouldReferenceLastSession: shouldReference
    };

  } catch (error) {
    console.error('Error building enhanced memory context:', error);

    // Fallback to basic context if enhanced version fails
    const basicContext = await buildMemoryContext(userId);
    return {
      memoryContext: basicContext,
      lastSessionSummary: null,
      shouldReferenceLastSession: false
    };
  }
}

/**
 * Helper function to enhance summary for more natural conversation
 */
function enhanceSummaryForConversation(summary: string): string {
  // Transform technical/clinical language to conversational
  let enhanced = summary;

  // Replace clinical terms with conversational ones
  const replacements = [
    ['User expressed conflicting feelings:', 'They were working with'],
    ['Noticed gap between intentions and actions around', 'We explored the gap between what they want and what happens with'],
    ['Key emotions:', 'They mentioned feeling'],
    ['Session with', 'In our conversation with'],
    ['detected pattern', 'noticed'],
    ['CSS Stage:', 'Therapeutic progress:'],
    ['CVDC pattern:', 'Contradiction:'],
    ['IBM pattern:', 'Intention-behavior gap:'],
    ['pointed_origin', 'early exploration'],
    ['focus_bind', 'deepening awareness'],
    ['thend', 'therapeutic shift'],
    ['cyvc', 'emerging flexibility']
  ];

  replacements.forEach(([from, to]) => {
    enhanced = enhanced.replace(new RegExp(from, 'gi'), to);
  });

  // Clean up any remaining technical artifacts
  enhanced = enhanced
    .replace(/\s+/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();

  return enhanced;
}

export async function storeSessionContext(
  userId: string,
  callId: string,
  content: string,
  contextType: string = 'session_insight',
  agentName?: string
): Promise<void> {
  try {
    // Process content to use actual names if needed
    let processedContent = content;

    // Only fetch names if we're storing a summary that might have generic terms
    if (contextType === 'call_summary' || contextType === 'session_insight' || contextType === 'conversational_summary') {
      const { data: userProfile } = await supabase
        .from('users')
        .select('first_name')
        .eq('id', userId)
        .single();

      const userName = userProfile?.first_name || 'the user';

      // Get agent name if not provided
      if (!agentName) {
        const { data: session } = await supabase
          .from('therapeutic_sessions')
          .select('agent_name')
          .eq('call_id', callId)
          .single();
        agentName = session?.agent_name || 'Sarah';
      }

      // Replace generic terms
      processedContent = processedContent
        .replace(/\b(the |this )?user\b/gi, userName)
        .replace(/\b(the )?AI\b/gi, agentName || 'Sarah');
    }

    await supabase
      .from('therapeutic_context')
      .insert({
        user_id: userId,
        call_id: callId,
        context_type: contextType,
        content: processedContent,
        confidence: 0.8,
        importance: 5
      });

    console.log(`✅ Stored therapeutic context (${contextType})`);
  } catch (error) {
    console.error('Error storing context:', error);
  }
}

/**
 * Store both regular and conversational summaries
 * Used after enhanced summary generation from Phase 1
 */
export async function storeEnhancedSessionContext(
  userId: string,
  callId: string,
  regularSummary: string,
  conversationalSummary: string
): Promise<void> {
  try {
    // Get names for proper storage
    const { data: userProfile } = await supabase
      .from('users')
      .select('first_name')
      .eq('id', userId)
      .single();

    const userName = userProfile?.first_name || 'the user';

    const { data: session } = await supabase
      .from('therapeutic_sessions')
      .select('agent_name')
      .eq('call_id', callId)
      .single();

    const agentName = session?.agent_name || 'Sarah';

    // Process both summaries to use actual names
    const processedRegularSummary = regularSummary
      .replace(/\b(the |this )?user\b/gi, userName)
      .replace(/\b(the )?AI\b/gi, agentName);

    const processedConversationalSummary = conversationalSummary
      .replace(/\b(the |this )?user\b/gi, userName)
      .replace(/\b(the )?AI\b/gi, agentName);

    const contexts = [
      {
        user_id: userId,
        call_id: callId,
        context_type: 'call_summary',
        content: processedRegularSummary,
        confidence: 0.8,
        importance: 5
      },
      {
        user_id: userId,
        call_id: callId,
        context_type: 'conversational_summary',
        content: processedConversationalSummary,
        confidence: 0.85,
        importance: 8
      }
    ];

    const { error } = await supabase
      .from('therapeutic_context')
      .insert(contexts);

    if (error) throw error;

    console.log('✅ Stored enhanced therapeutic context (both summaries)');
  } catch (error) {
    console.error('Error storing enhanced context:', error);
  }
}