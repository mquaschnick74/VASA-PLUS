-- Migration: Create blog_comments table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS blog_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  post_id UUID NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Comment content
  author_name VARCHAR(255) NOT NULL,
  author_email VARCHAR(255),
  content TEXT NOT NULL,

  -- Parent comment for nested replies (optional)
  parent_id UUID REFERENCES blog_comments(id) ON DELETE CASCADE,

  -- Moderation status: 'pending', 'approved', 'rejected'
  status VARCHAR(20) DEFAULT 'approved',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_blog_comments_post_id ON blog_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_blog_comments_parent_id ON blog_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_blog_comments_status ON blog_comments(status);
CREATE INDEX IF NOT EXISTS idx_blog_comments_created_at ON blog_comments(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE blog_comments ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read approved comments
CREATE POLICY "Anyone can read approved comments"
  ON blog_comments
  FOR SELECT
  USING (status = 'approved');

-- Policy: Anyone can insert comments
CREATE POLICY "Anyone can insert comments"
  ON blog_comments
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can delete their own comments
CREATE POLICY "Users can delete own comments"
  ON blog_comments
  FOR DELETE
  USING (auth.uid() = user_id);

-- Policy: Authenticated users can update their own comments
CREATE POLICY "Users can update own comments"
  ON blog_comments
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Grant access to authenticated and anonymous users
GRANT SELECT ON blog_comments TO anon, authenticated;
GRANT INSERT ON blog_comments TO anon, authenticated;
GRANT UPDATE ON blog_comments TO authenticated;
GRANT DELETE ON blog_comments TO authenticated;
