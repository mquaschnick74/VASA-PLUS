// Location: server/routes/blog-routes.ts
// Blog management routes for admin dashboard and public blog pages

import { Router, Request, Response } from 'express';
import { db } from '../db';
import { blogPosts } from '../../shared/schema';
import { eq, desc, and } from 'drizzle-orm';
import { supabase } from '../supabaseClient';

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
    const posts = await db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        excerpt: blogPosts.excerpt,
        featured_image_url: blogPosts.featured_image_url,
        author_name: blogPosts.author_name,
        published_at: blogPosts.published_at,
        view_count: blogPosts.view_count,
      })
      .from(blogPosts)
      .where(eq(blogPosts.status, 'published'))
      .orderBy(desc(blogPosts.published_at));

    res.json({ posts });
  } catch (error) {
    console.error('Error fetching published blog posts:', error);
    res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

// Get single published blog post by slug (for individual blog post page)
router.get('/public/posts/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const post = await db
      .select()
      .from(blogPosts)
      .where(and(
        eq(blogPosts.slug, slug),
        eq(blogPosts.status, 'published')
      ))
      .limit(1);

    if (!post || post.length === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    // Increment view count
    await db
      .update(blogPosts)
      .set({ 
        view_count: (post[0].view_count || 0) + 1 
      })
      .where(eq(blogPosts.id, post[0].id));

    res.json({ post: post[0] });
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

  // Check if user has admin role or is specific admin email
  // You can customize this logic based on your needs
  req.userId = user.id;
  next();
}

// Get all blog posts (including drafts) - Admin only
router.get('/admin/posts', isAdmin, async (req: Request, res: Response) => {
  try {
    const posts = await db
      .select()
      .from(blogPosts)
      .orderBy(desc(blogPosts.created_at));

    res.json({ posts });
  } catch (error) {
    console.error('Error fetching all blog posts:', error);
    res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

// Get single blog post by ID - Admin only
router.get('/admin/posts/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const post = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.id, id))
      .limit(1);

    if (!post || post.length === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    res.json({ post: post[0] });
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
    const existingPost = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.slug, slug))
      .limit(1);

    if (existingPost && existingPost.length > 0) {
      return res.status(400).json({ error: 'A blog post with this title already exists' });
    }

    // Create blog post
    const newPost = await db
      .insert(blogPosts)
      .values({
        title,
        slug,
        excerpt: excerpt || null,
        content,
        meta_title: meta_title || title,
        meta_description: meta_description || excerpt || null,
        meta_keywords: meta_keywords || null,
        featured_image_url: featured_image_url || null,
        status: status || 'draft',
        published_at: status === 'published' ? new Date() : null,
        author_id: req.userId,
        author_name: author_name || 'iVASA Team',
      })
      .returning();

    res.json({ post: newPost[0], message: 'Blog post created successfully' });
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
    const existingPost = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.id, id))
      .limit(1);

    if (!existingPost || existingPost.length === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    // Generate new slug if title changed
    let slug = existingPost[0].slug;
    if (title && title !== existingPost[0].title) {
      slug = generateSlug(title);

      // Check if new slug conflicts with another post
      const slugConflict = await db
        .select()
        .from(blogPosts)
        .where(and(
          eq(blogPosts.slug, slug),
          // Exclude current post
          // Note: Using != doesn't work with UUID, so we check if they're different
        ))
        .limit(1);

      if (slugConflict && slugConflict.length > 0 && slugConflict[0].id !== id) {
        return res.status(400).json({ error: 'A blog post with this title already exists' });
      }
    }

    // Determine published_at
    let published_at = existingPost[0].published_at;
    if (status === 'published' && !published_at) {
      published_at = new Date();
    }

    // Update blog post
    const updatedPost = await db
      .update(blogPosts)
      .set({
        title: title || existingPost[0].title,
        slug,
        excerpt: excerpt !== undefined ? excerpt : existingPost[0].excerpt,
        content: content || existingPost[0].content,
        meta_title: meta_title !== undefined ? meta_title : existingPost[0].meta_title,
        meta_description: meta_description !== undefined ? meta_description : existingPost[0].meta_description,
        meta_keywords: meta_keywords !== undefined ? meta_keywords : existingPost[0].meta_keywords,
        featured_image_url: featured_image_url !== undefined ? featured_image_url : existingPost[0].featured_image_url,
        status: status || existingPost[0].status,
        published_at,
        author_name: author_name || existingPost[0].author_name,
        updated_at: new Date(),
      })
      .where(eq(blogPosts.id, id))
      .returning();

    res.json({ post: updatedPost[0], message: 'Blog post updated successfully' });
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({ error: 'Failed to update blog post' });
  }
});

// Delete blog post - Admin only
router.delete('/admin/posts/:id', isAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deletedPost = await db
      .delete(blogPosts)
      .where(eq(blogPosts.id, id))
      .returning();

    if (!deletedPost || deletedPost.length === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    res.json({ message: 'Blog post deleted successfully' });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({ error: 'Failed to delete blog post' });
  }
});

export default router;