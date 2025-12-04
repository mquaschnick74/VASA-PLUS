// Location: server/routes/blog-routes.ts
// Blog management routes for admin dashboard and public blog pages

import { Router, Request, Response } from 'express';
import { supabase } from '../services/supabase-service';

const router = Router();

// Helper function to generate slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ============================================================================
// PUBLIC ROUTES (No auth required)
// ============================================================================

// Get all published blog posts (for public blog listing page)
router.get('/public/posts', async (req: Request, res: Response) => {
  try {
    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('id, title, slug, excerpt, featured_image_url, author_name, published_at, view_count')
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    if (error) throw error;

    res.json({ posts: posts || [] });
  } catch (error) {
    console.error('Error fetching published blog posts:', error);
    res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

// Get single published blog post by slug (for individual blog post page)
router.get('/public/posts/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .limit(1);

    if (error) throw error;

    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    const post = posts[0];

    // Increment view count
    await supabase
      .from('blog_posts')
      .update({ view_count: (post.view_count || 0) + 1 })
      .eq('id', post.id);

    res.json({ post });
  } catch (error) {
    console.error('Error fetching blog post:', error);
    res.status(500).json({ error: 'Failed to fetch blog post' });
  }
});

// ============================================================================
// ADMIN ROUTES (Auth required)
// ============================================================================

// Middleware to check if user is admin
async function isAdmin(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Look up the application user by their auth_user_id to get the correct users.id
  // This is needed because author_id foreign key references users.id, not auth.users.id
  const { data: appUser, error: userError } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .single();

  if (userError || !appUser) {
    console.error('Failed to find application user for auth user:', user.id, userError);
    return res.status(401).json({ error: 'User not found in application database' });
  }

  // Optionally check if user has admin role
  if (appUser.role !== 'admin' && appUser.role !== 'therapist') {
    // For now, allow therapists too as they may need to blog
    // You can make this stricter by only checking for 'admin'
  }

  // @ts-ignore - Add userId (application user ID) to request
  req.userId = appUser.id;
  next();
}

// Get all blog posts (including drafts) - Admin only
router.get('/admin/posts', isAdmin, async (req: Request, res: Response) => {
  try {
    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ posts: posts || [] });
  } catch (error) {
    console.error('Error fetching all blog posts:', error);
    res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

// Get single blog post by ID - Admin only
router.get('/admin/posts/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('id', id)
      .limit(1);

    if (error) throw error;

    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    res.json({ post: posts[0] });
  } catch (error) {
    console.error('Error fetching blog post:', error);
    res.status(500).json({ error: 'Failed to fetch blog post' });
  }
});

// Create new blog post - Admin only
router.post('/admin/posts', isAdmin, async (req: Request, res: Response) => {
  try {
    const {
      title,
      excerpt,
      content,
      meta_title,
      meta_description,
      meta_keywords,
      featured_image_url,
      status,
      author_name
    } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    // Generate slug from title
    const slug = generateSlug(title);

    // Check if slug already exists
    const { data: existingPost } = await supabase
      .from('blog_posts')
      .select('id')
      .eq('slug', slug)
      .limit(1);

    if (existingPost && existingPost.length > 0) {
      return res.status(400).json({ error: 'A blog post with this title already exists' });
    }

    // Create blog post
    const { data: newPost, error } = await supabase
      .from('blog_posts')
      .insert({
        title,
        slug,
        excerpt: excerpt || null,
        content,
        meta_title: meta_title || title,
        meta_description: meta_description || excerpt || null,
        meta_keywords: meta_keywords || null,
        featured_image_url: featured_image_url || null,
        status: status || 'draft',
        published_at: status === 'published' ? new Date().toISOString() : null,
        // @ts-ignore
        author_id: req.userId,
        author_name: author_name || 'iVASA Team',
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ post: newPost, message: 'Blog post created successfully' });
  } catch (error) {
    console.error('Error creating blog post:', error);
    res.status(500).json({ error: 'Failed to create blog post' });
  }
});

// Update blog post - Admin only
router.put('/admin/posts/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      excerpt,
      content,
      meta_title,
      meta_description,
      meta_keywords,
      featured_image_url,
      status,
      author_name
    } = req.body;

    // Check if post exists
    const { data: existingPost, error: fetchError } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingPost) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    // Generate new slug if title changed
    let slug = existingPost.slug;
    if (title && title !== existingPost.title) {
      slug = generateSlug(title);

      // Check if new slug conflicts with another post
      const { data: slugConflict } = await supabase
        .from('blog_posts')
        .select('id')
        .eq('slug', slug)
        .neq('id', id)
        .limit(1);

      if (slugConflict && slugConflict.length > 0) {
        return res.status(400).json({ error: 'A blog post with this title already exists' });
      }
    }

    // Determine published_at
    let published_at = existingPost.published_at;
    if (status === 'published' && !published_at) {
      published_at = new Date().toISOString();
    }

    // Update blog post
    const { data: updatedPost, error: updateError } = await supabase
      .from('blog_posts')
      .update({
        title: title || existingPost.title,
        slug,
        excerpt: excerpt !== undefined ? excerpt : existingPost.excerpt,
        content: content || existingPost.content,
        meta_title: meta_title !== undefined ? meta_title : existingPost.meta_title,
        meta_description: meta_description !== undefined ? meta_description : existingPost.meta_description,
        meta_keywords: meta_keywords !== undefined ? meta_keywords : existingPost.meta_keywords,
        featured_image_url: featured_image_url !== undefined ? featured_image_url : existingPost.featured_image_url,
        status: status || existingPost.status,
        published_at,
        author_name: author_name || existingPost.author_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ post: updatedPost, message: 'Blog post updated successfully' });
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({ error: 'Failed to update blog post' });
  }
});

// Delete blog post - Admin only
router.delete('/admin/posts/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('blog_posts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({ error: 'Failed to delete blog post' });
  }
});

// ============================================================================
// COMMENT ROUTES
// ============================================================================

// Get comments for a blog post (public)
router.get('/public/posts/:slug/comments', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    // First get the post ID from the slug
    const { data: posts, error: postError } = await supabase
      .from('blog_posts')
      .select('id')
      .eq('slug', slug)
      .eq('status', 'published')
      .limit(1);

    if (postError) throw postError;

    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    const postId = posts[0].id;

    // Get approved comments for this post
    const { data: comments, error: commentsError } = await supabase
      .from('blog_comments')
      .select('id, author_name, content, parent_id, created_at')
      .eq('post_id', postId)
      .eq('status', 'approved')
      .order('created_at', { ascending: true });

    if (commentsError) throw commentsError;

    res.json({ comments: comments || [] });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Add a comment to a blog post (public - allows guest comments)
router.post('/public/posts/:slug/comments', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { author_name, author_email, content, parent_id } = req.body;

    // Validate required fields
    if (!author_name || !content) {
      return res.status(400).json({ error: 'Name and comment are required' });
    }

    // Validate content length
    if (content.length > 2000) {
      return res.status(400).json({ error: 'Comment is too long (max 2000 characters)' });
    }

    // Get the post ID from the slug
    const { data: posts, error: postError } = await supabase
      .from('blog_posts')
      .select('id')
      .eq('slug', slug)
      .eq('status', 'published')
      .limit(1);

    if (postError) throw postError;

    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    const postId = posts[0].id;

    // If parent_id is provided, verify it exists and belongs to the same post
    if (parent_id) {
      const { data: parentComment, error: parentError } = await supabase
        .from('blog_comments')
        .select('id, post_id')
        .eq('id', parent_id)
        .limit(1);

      if (parentError || !parentComment || parentComment.length === 0) {
        return res.status(400).json({ error: 'Parent comment not found' });
      }

      if (parentComment[0].post_id !== postId) {
        return res.status(400).json({ error: 'Parent comment does not belong to this post' });
      }
    }

    // Check for authenticated user
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    // Create the comment (auto-approved for now, can add moderation later)
    const { data: newComment, error: insertError } = await supabase
      .from('blog_comments')
      .insert({
        post_id: postId,
        user_id: userId,
        author_name,
        author_email: author_email || null,
        content,
        parent_id: parent_id || null,
        status: 'approved', // Auto-approve for now
      })
      .select('id, author_name, content, parent_id, created_at')
      .single();

    if (insertError) throw insertError;

    res.json({ comment: newComment, message: 'Comment added successfully' });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Delete a comment (authenticated users can delete their own comments)
router.delete('/public/comments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if comment exists and belongs to the user
    const { data: comment, error: fetchError } = await supabase
      .from('blog_comments')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (fetchError || !comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.user_id !== user.id) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    // Delete the comment
    const { error: deleteError } = await supabase
      .from('blog_comments')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Admin: Get all comments with moderation options
router.get('/admin/comments', isAdmin, async (req: Request, res: Response) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from('blog_comments')
      .select(`
        id,
        author_name,
        author_email,
        content,
        status,
        created_at,
        post_id,
        blog_posts (title, slug)
      `)
      .order('created_at', { ascending: false });

    if (status && typeof status === 'string') {
      query = query.eq('status', status);
    }

    const { data: comments, error } = await query;

    if (error) throw error;

    res.json({ comments: comments || [] });
  } catch (error) {
    console.error('Error fetching admin comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Admin: Update comment status (approve/reject)
router.put('/admin/comments/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be pending, approved, or rejected' });
    }

    const { data: updatedComment, error } = await supabase
      .from('blog_comments')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ comment: updatedComment, message: 'Comment status updated' });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// Admin: Delete any comment
router.delete('/admin/comments/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('blog_comments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

export default router;
