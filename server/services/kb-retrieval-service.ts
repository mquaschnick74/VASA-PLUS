// Main retrieval function signature
async function retrieve(params: {
  userId: string;
  cssStage?: string;
  baseline?: boolean;
  keywords?: string[];
  agentName?: string;
}): Promise<string>

// Helper functions needed:
- matchByKeywords(userMessage: string, documents: KBDocument[]): KBDocument[]
- matchByCSSStage(cssStage: string, documents: KBDocument[]): KBDocument[]
- prioritizeDocuments(documents: KBDocument[]): KBDocument[]
- formatForSystemPrompt(documents: KBDocument[]): string
- calculateTokenBudget(documents: KBDocument[], maxTokens: number): KBDocument[]