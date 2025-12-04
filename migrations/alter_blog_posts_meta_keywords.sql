-- Migration: Change meta_keywords column from varchar(500) to text
-- Run this in your Supabase SQL Editor
-- This allows longer keyword lists for SEO optimization

ALTER TABLE blog_posts
ALTER COLUMN meta_keywords TYPE TEXT;

-- Verify the change
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'blog_posts' AND column_name = 'meta_keywords';
