import { supabase } from '../services/supabase-service';
import { seedDocuments } from './kb-seed-data';

async function seedKB() {
  console.log('🌱 Seeding knowledge base with 10 therapeutic protocols...');

  try {
    // Clear existing documents (optional - remove this if you want to keep existing)
    const { error: deleteError } = await supabase
      .from('knowledge_base_documents')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.warn('⚠️ Could not clear existing documents:', deleteError.message);
    }

    // Insert all 10 documents
    const { data, error } = await supabase
      .from('knowledge_base_documents')
      .insert(seedDocuments);

    if (error) {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    }

    console.log(`✅ Successfully seeded ${seedDocuments.length} KB documents`);
    console.log('\nDocuments seeded:');
    seedDocuments.forEach((doc, i) => {
      console.log(`  ${i + 1}. ${doc.title} (${doc.token_count} tokens)`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
}

seedKB();