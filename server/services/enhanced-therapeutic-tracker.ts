// server/services/enhanced-therapeutic-tracker.ts
// Process-based therapeutic tracking using webhook data
// FIXED: Now properly separates therapeutic movements from CSS stages

import { supabase } from './supabase-service';

interface ConversationExchange {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface TherapeuticState {
  narrativeDepth: number;
  emotionalRange: string[];
  somaticReferences: number;
  contradictionCount: number;
  lastMovement?: 'deepening' | 'resistance' | 'integration';
  exchangeCount: number;
}

class EnhancedTherapeuticTracker {
  private sessionStates = new Map<string, TherapeuticState>();
  private conversationHistory = new Map<string, ConversationExchange[]>();
  private processedMovements = new Map<string, Set<string>>(); // Track what we've already processed
  private processedContent = new Map<string, Set<string>>(); // Track processed content per session

  /**
   * Process conversation-update events for therapeutic movement
   */
  async processConversationUpdate(
    callId: string,
    userId: string,
    conversation: any[]
  ): Promise<void> {
    if (!conversation || conversation.length === 0) return;

    // Initialize tracking sets if needed
    if (!this.processedContent.has(callId)) {
      this.processedContent.set(callId, new Set<string>());
    }
    const processed = this.processedContent.get(callId)!;

    // Initialize state if needed
    if (!this.sessionStates.has(callId)) {
      this.sessionStates.set(callId, {
        narrativeDepth: 0,
        emotionalRange: [],
        somaticReferences: 0,
        contradictionCount: 0,
        exchangeCount: 0
      });
    }

    const state = this.sessionStates.get(callId)!;

    // Store conversation history
    const exchanges: ConversationExchange[] = conversation.map(msg => ({
      role: msg.role,
      content: msg.content || msg.text || '',
      timestamp: new Date(msg.timestamp || Date.now())
    }));

    this.conversationHistory.set(callId, exchanges);

    // Analyze the latest exchange
    const lastUserMessage = exchanges.filter(e => e.role === 'user').pop();
    const previousUserMessage = exchanges.filter(e => e.role === 'user').slice(-2, -1)[0];

    if (lastUserMessage) {
      // Create a content hash to check for duplicates
      const contentHash = this.hashContent(lastUserMessage.content);

      // Skip if we've already processed this exact content
      if (processed.has(contentHash)) {
        console.log(`⏭️ Skipping duplicate content for ${callId}`);
        return;
      }

      // Mark as processed
      processed.add(contentHash);

      // Track therapeutic movement between exchanges
      const movement = this.detectMovement(
        previousUserMessage?.content || '',
        lastUserMessage.content
      );

      if (movement) {
        state.lastMovement = movement;
        await this.storeMovement(callId, userId, movement, lastUserMessage.content);
      }

      // Update state metrics
      state.exchangeCount = exchanges.filter(e => e.role === 'user').length;
      state.narrativeDepth = this.assessNarrativeDepth(exchanges);
      state.emotionalRange = this.extractEmotionalRange(exchanges);
      state.somaticReferences = this.countSomaticReferences(lastUserMessage.content);

      // Log progress for debugging
      console.log(`🧠 Therapeutic State for ${callId}:`, {
        exchangeCount: state.exchangeCount,
        narrativeDepth: state.narrativeDepth.toFixed(2),
        emotions: state.emotionalRange.length,
        somatic: state.somaticReferences,
        lastMovement: state.lastMovement
      });
    }

    // Check if we should progress CSS stage based on process
    await this.assessStageProgression(callId, userId, state);
  }

  /**
   * Create a hash of content for duplicate detection
   */
  private hashContent(content: string): string {
    // Simple hash: first 100 chars + length
    return content.substring(0, 100) + '_' + content.length;
  }

  /**
   * Detect therapeutic movement between exchanges
   */
  private detectMovement(
    previous: string,
    current: string
  ): 'deepening' | 'resistance' | 'integration' | null {
    // Check for deepening FIRST (most specific patterns)
    if (/empty|heavy|hollow|grief|pain|numb|echoing|lost|missing/i.test(current)) {
      return 'deepening';
    }

    // Then check for integration (but more strict)
    if (/I see now|makes sense now|I realize|I understand now|both.*true/i.test(current)) {
      return 'integration';
    }

    // Resistance: Shorter, deflective, minimizing
    if (current.length < previous.length * 0.5) {
      if (/fine|whatever|doesn't matter|don't know|nothing|never mind/i.test(current)) {
        return 'resistance';
      }
    }

    // Integration: Connecting, realizing, understanding
    if (/see now|makes sense|realize|understand|connect|both true|can see how/i.test(current)) {
      return 'integration';
    }

    // Additional deepening indicators from Alex's session
    if (/remind(s|ed) me of|same pattern|always been|used to|my (grandmother|mother|father|family)/i.test(current)) {
      return 'deepening';
    }

    return null;
  }

  /**
   * Extract emotions from text
   */
  private extractEmotions(text: string): string[] {
    const emotionPatterns = [
      /feel(?:ing|s)?\s+(\w+)/gi,
      /I'm\s+(\w+)/gi,
      /makes? me\s+(\w+)/gi,
      /I feel\s+(\w+)/gi,
      /felt\s+(\w+)/gi,
      /feeling\s+(\w+)/gi
    ];

    const emotions = new Set<string>();
    for (const pattern of emotionPatterns) {
      const matches = Array.from(text.matchAll(pattern));  // ← CHANGED: Convert iterator to array
      for (const match of matches) {
        const emotion = match[1].toLowerCase();
        // Filter out non-emotion words
        if (!/like|that|this|it|the|a|an/.test(emotion)) {
          emotions.add(emotion);
        }
      }
    }

    // Also check for emotion words without "feel"
    const directEmotions = text.match(/\b(angry|sad|happy|scared|anxious|worried|relieved|furious|grieving|ashamed|guilty|lost|empty|hollow)\b/gi);
    if (directEmotions) {
      directEmotions.forEach(e => emotions.add(e.toLowerCase()));
    }

    return Array.from(emotions);
  }

  /**
   * Assess narrative depth from conversation
   */
  private assessNarrativeDepth(exchanges: ConversationExchange[]): number {
    const userExchanges = exchanges.filter(e => e.role === 'user');
    if (userExchanges.length === 0) return 0;

    let depth = 0;

    // Temporal references (past-present connections)
    const temporalPattern = /when I was|used to|always been|reminds me|remembered|after my|since|years ago/gi;
    if (userExchanges.some(e => temporalPattern.test(e.content))) depth += 0.25;

    // Personal disclosure
    const disclosurePattern = /my (mother|father|family|partner|relationship|grandmother|childhood|past)/gi;
    if (userExchanges.some(e => disclosurePattern.test(e.content))) depth += 0.25;

    // Emotional vocabulary richness
    const emotionalVocab = new Set<string>();
    userExchanges.forEach(e => {
      this.extractEmotions(e.content).forEach(emotion => emotionalVocab.add(emotion));
    });
    if (emotionalVocab.size > 3) depth += 0.25;

    // Increasing response length (engagement)
    const avgLength = userExchanges.reduce((sum, e) => sum + e.content.length, 0) / userExchanges.length;
    if (avgLength > 100) depth += 0.25;

    return Math.min(1, depth);
  }

  /**
   * Extract emotional range from conversation
   */
  private extractEmotionalRange(exchanges: ConversationExchange[]): string[] {
    const emotions = new Set<string>();
    exchanges
      .filter(e => e.role === 'user')
      .forEach(e => {
        this.extractEmotions(e.content).forEach(emotion => emotions.add(emotion));
      });
    return Array.from(emotions);
  }

  /**
   * Count somatic references
   */
  private countSomaticReferences(text: string): number {
    const somaticPattern = /\b(chest|throat|stomach|shoulders|breath|breathing|body|heart|head|tension|tight|heavy|hollow|clammy|sore|floaty|punched|dropped)\b/gi;
    const matches = text.match(somaticPattern);
    return matches ? matches.length : 0;
  }

  /**
   * Assess if CSS stage should progress based on process
   */
  private async assessStageProgression(
    callId: string,
    userId: string,
    state: TherapeuticState
  ): Promise<void> {
    // Don't progress until minimum engagement
    if (state.exchangeCount < 5) return;

    // Determine stage based on therapeutic process, not patterns
    let suggestedStage = 'pointed_origin';
    let confidence = 0.5;

    if (state.narrativeDepth > 0.3 && state.emotionalRange.length > 2) {
      suggestedStage = 'focus_bind';
      confidence = 0.6;
    }

    if (state.narrativeDepth > 0.5 && state.lastMovement === 'deepening') {
      suggestedStage = 'suspension';
      confidence = 0.7;
    }

    if (state.lastMovement === 'integration' && state.emotionalRange.length > 4) {
      suggestedStage = 'gesture_toward';
      confidence = 0.8;
    }

    if (state.somaticReferences > 3 && state.lastMovement === 'integration') {
      suggestedStage = 'completion';
      confidence = 0.85;
    }

    // Only store if we have meaningful progress (not every conversation update)
    // Store only when exchange count is at key milestones
    const milestones = [5, 10, 15, 20, 30, 40, 50];
    if (milestones.includes(state.exchangeCount)) {
      // Store as a process-based pattern - THIS IS CORRECT, USES PROPER CSS STAGES
      await supabase.from('css_patterns').insert({
        user_id: userId,
        call_id: callId,
        pattern_type: 'PROCESS',
        content: `Process metrics: depth=${state.narrativeDepth.toFixed(2)}, emotions=${state.emotionalRange.length}, somatic=${state.somaticReferences}, exchanges=${state.exchangeCount}`,
        css_stage: suggestedStage, // This correctly uses CSS stages like 'pointed_origin', 'focus_bind', etc.
        confidence: confidence,
        detected_at: new Date().toISOString(),
        emotional_intensity: this.calculateIntensity(state)
      });

      console.log(`📊 Process-based stage assessment: ${suggestedStage} (confidence: ${confidence}) at exchange ${state.exchangeCount}`);
    }
  }

  /**
   * Calculate emotional intensity from state
   */
  private calculateIntensity(state: TherapeuticState): string {
    if (state.emotionalRange.length > 5 || state.somaticReferences > 3) {
      return 'high';
    }
    if (state.emotionalRange.length > 2) {
      return 'moderate';
    }
    return 'low';
  }

  /**
   * FIXED: Store therapeutic movement in the correct table
   * Movements (deepening, resistance, integration) are NOT CSS stages!
   * They go in the therapeutic_movements table, not css_patterns
   */
  private async storeMovement(
    callId: string,
    userId: string,
    movement: string,
    content: string
  ): Promise<void> {
    try {
      // Initialize processed movements tracking for this call if needed
      if (!this.processedMovements.has(callId)) {
        this.processedMovements.set(callId, new Set());
      }

      // Create a hash of the content to check for duplicates
      const contentHash = this.hashContent(content);
      const processedSet = this.processedMovements.get(callId)!;

      // Skip if we've already processed this exact content
      if (processedSet.has(contentHash)) {
        console.log(`⏭️ Skipping duplicate movement for ${callId}`);
        return;
      }

      // Mark as processed
      processedSet.add(contentHash);

      // FIXED: Store in the therapeutic_movements table, NOT css_patterns!
      await supabase.from('therapeutic_movements').insert({
        user_id: userId,
        call_id: callId,
        movement_type: movement, // 'deepening', 'resistance', or 'integration'
        content: content.substring(0, 500),
        detected_at: new Date().toISOString()
      });
      console.log(`💫 Stored therapeutic movement: ${movement} in therapeutic_movements table`);
    } catch (error) {
      console.error('Error storing movement:', error);
    }
  }

  /**
   * Process end-of-call for final analysis
   */
  async processEndOfCall(
    callId: string,
    userId: string,
    fullTranscript: string
  ): Promise<void> {
    const state = this.sessionStates.get(callId);
    const history = this.conversationHistory.get(callId) || [];

    if (!state) {
      console.log(`⚠️ No session state found for end-of-call: ${callId}`);
      return;
    }

    // Generate comprehensive session assessment
    const assessment = {
      exchangeCount: state.exchangeCount,
      narrativeDepth: state.narrativeDepth,
      emotionalRange: state.emotionalRange,
      somaticAwareness: state.somaticReferences > 0,
      therapeuticArc: this.assessTherapeuticArc(history),
      dominantMovement: state.lastMovement || 'exploratory',
      processInsights: this.generateProcessInsights(state, history)
    };

    // Store in therapeutic_context
    try {
      await supabase.from('therapeutic_context').insert({
        user_id: userId,
        call_id: callId,
        context_type: 'process_assessment',
        content: JSON.stringify(assessment),
        confidence: 0.8,
        importance: 7
      });
      console.log(`✅ Stored process assessment for session ${callId}`);
    } catch (error) {
      console.error('Error storing process assessment:', error);
    }

    // Clean up session data
    this.sessionStates.delete(callId);
    this.conversationHistory.delete(callId);
    this.processedMovements.delete(callId); // Clean up movement tracking
    this.processedContent.delete(callId);
  }

  /**
   * Assess therapeutic arc
   */
  private assessTherapeuticArc(history: ConversationExchange[]): string {
    if (history.length < 10) return 'Brief exploratory session';

    const userExchanges = history.filter(e => e.role === 'user');
    if (userExchanges.length < 3) return 'Limited engagement';

    // Check progression of response lengths
    const firstThirdAvg = this.averageLength(userExchanges.slice(0, Math.floor(userExchanges.length / 3)));
    const lastThirdAvg = this.averageLength(userExchanges.slice(-Math.floor(userExchanges.length / 3)));

    if (lastThirdAvg > firstThirdAvg * 1.5) {
      return 'Progressive deepening arc';
    } else if (lastThirdAvg < firstThirdAvg * 0.7) {
      return 'Defensive closure arc';
    }
    return 'Stable exploration arc';
  }

  /**
   * Calculate average length of exchanges
   */
  private averageLength(exchanges: ConversationExchange[]): number {
    if (exchanges.length === 0) return 0;
    return exchanges.reduce((sum, e) => sum + e.content.length, 0) / exchanges.length;
  }

  /**
   * Generate process insights
   */
  private generateProcessInsights(state: TherapeuticState, history: ConversationExchange[]): string[] {
    const insights: string[] = [];

    if (state.narrativeDepth > 0.5) {
      insights.push('Strong narrative engagement with personal history integration');
    }

    if (state.emotionalRange.length > 4) {
      insights.push(`Rich emotional vocabulary: ${state.emotionalRange.slice(0, 4).join(', ')}`);
    }

    if (state.somaticReferences > 2) {
      insights.push('Good somatic awareness and body-emotion connection');
    }

    if (state.lastMovement === 'integration') {
      insights.push('Session ended with integrative understanding');
    } else if (state.lastMovement === 'resistance') {
      insights.push('Session ended with defensive patterns - needs safety');
    }

    if (insights.length === 0) {
      insights.push('Early-stage therapeutic engagement');
    }

    return insights;
  }
}

// Export singleton instance
export const enhancedTherapeuticTracker = new EnhancedTherapeuticTracker();