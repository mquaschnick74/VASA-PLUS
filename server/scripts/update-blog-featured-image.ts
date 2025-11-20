// Script to update the featured image for a blog post
// Usage: npx tsx server/scripts/update-blog-featured-image.ts

import { supabase } from '../services/supabase-service';

async function updateBlogPostImage() {
  const slug = 'how-vasa-listens-differently-when-therapy-meets-technology';
  const featuredImageUrl = '/images/your-post-image.png';

  console.log(`Updating blog post: ${slug}`);
  console.log(`Setting featured_image_url to: ${featuredImageUrl}`);

  // First, check if the post exists
  const { data: posts, error: fetchError } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .limit(1);

  if (fetchError) {
    console.error('Error fetching blog post:', fetchError);
    process.exit(1);
  }

  if (!posts || posts.length === 0) {
    console.error(`Blog post with slug "${slug}" not found`);
    process.exit(1);
  }

  const post = posts[0];
  console.log(`Found post: "${post.title}"`);
  console.log(`Current featured_image_url: ${post.featured_image_url || 'none'}`);

  // Update the featured_image_url
  const { data: updatedPost, error: updateError } = await supabase
    .from('blog_posts')
    .update({
      featured_image_url: featuredImageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('slug', slug)
    .select()
    .single();

  if (updateError) {
    console.error('Error updating blog post:', updateError);
    process.exit(1);
  }

  console.log('\n✅ Successfully updated blog post!');
  console.log(`New featured_image_url: ${updatedPost.featured_image_url}`);
  console.log('\nNow test your URL at:');
  console.log(`https://beta.ivasa.ai/blog/${slug}`);
  console.log('\nAnd refresh the Facebook cache at:');
  console.log(`https://developers.facebook.com/tools/debug/?q=https://beta.ivasa.ai/blog/${slug}`);
}

updateBlogPostImage().catch(console.error);
