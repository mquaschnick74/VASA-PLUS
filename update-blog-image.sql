-- SQL to update the blog post featured image
-- Run this in your Supabase SQL editor at: https://supabase.com/dashboard/project/_/sql

UPDATE blog_posts
SET
  featured_image_url = '/images/blog-post.jpg',
  updated_at = NOW()
WHERE
  slug = 'how-vasa-listens-differently-when-therapy-meets-technology';

-- Verify the update
SELECT id, title, slug, featured_image_url
FROM blog_posts
WHERE slug = 'how-vasa-listens-differently-when-therapy-meets-technology';
