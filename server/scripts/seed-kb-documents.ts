import { supabase } from '../services/supabase-service';

const seedDocuments = [
  {
    document_id: 'crisis_grounding_001',
    document_type: 'crisis_protocol',
    title: 'Crisis Grounding Protocol',
    content: `[Full content from Document 1 you provided]`,
    metadata: {
      crisis_type: 'acute_overwhelm',
      priority: 9,
      immediate_inject: true
    },
    trigger_keywords: ['overwhelmed', 'panic', 'losing control', 'can\'t breathe'],
    css_stage: null, // Applies to all stages
    pattern_type: null,
    crisis_type: 'acute_overwhelm',
    priority: 9,
    immediate_inject: true,
    agent_recommendation: null,
    token_count: 465,
    is_active: true
  },
  // ... 9 more documents
];

async function seedKB() {
  console.log('🌱 Seeding knowledge base...');

  const { data, error } = await supabase
    .from('knowledge_base_documents')
    .insert(seedDocuments);

  if (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }

  console.log(`✅ Successfully seeded ${seedDocuments.length} KB documents`);
  process.exit(0);
}

seedKB();