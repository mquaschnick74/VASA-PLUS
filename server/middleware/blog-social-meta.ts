// Location: server/middleware/blog-social-meta.ts
// Middleware to inject Open Graph and Twitter Card meta tags for blog posts
// This enables rich link previews when blog posts are shared on social media

import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { supabase } from '../services/supabase-service';

// Type definition for blog post data
interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
  featured_image_url: string | null;
  status: string;
  published_at: string | null;
  author_name: string | null;
  view_count: number;
}

// Function to escape HTML special characters to prevent XSS
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

// Function to truncate text to a specific length
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Function to strip markdown formatting for plain text descriptions
function stripMarkdown(text: string): string {
  return text
    // Remove headers
    .replace(/#{1,6}\s+/g, '')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    // Remove code blocks
    .replace(/```[^`]*```/gs, '')
    .replace(/`([^`]+)`/g, '$1')
    // Remove blockquotes
    .replace(/^\s*>\s+/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove list markers
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Generate the meta tags HTML to inject
function generateMetaTags(post: BlogPost, postUrl: string): string {
  const title = escapeHtml(post.meta_title || `${post.title} | iVASA Blog`);
  const description = escapeHtml(
    truncateText(
      post.meta_description ||
      post.excerpt ||
      stripMarkdown(post.content) ||
      'Read this article on the iVASA Blog',
      300
    )
  );
  const keywords = post.meta_keywords ? escapeHtml(post.meta_keywords) : '';

  // Use absolute URL for the image
  let imageUrl = 'https://beta.ivasa.ai/og-image.png'; // Default fallback
  if (post.featured_image_url) {
    // If it's already an absolute URL, use it; otherwise, make it absolute
    if (post.featured_image_url.startsWith('http')) {
      imageUrl = post.featured_image_url;
    } else {
      imageUrl = `https://beta.ivasa.ai${post.featured_image_url}`;
    }
  }

  const authorName = escapeHtml(post.author_name || 'iVASA Team');
  const publishedDate = post.published_at || new Date().toISOString();

  return `
    <!-- Basic Page Info (Blog Post Specific) -->
    <title>${title}</title>
    <meta name="description" content="${description}" />
    ${keywords ? `<meta name="keywords" content="${keywords}" />` : ''}
    <meta name="author" content="${authorName}" />
    <link rel="canonical" href="${postUrl}" />

    <!-- Open Graph Tags (Facebook, LinkedIn, Discord, Slack, WhatsApp) -->
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:url" content="${postUrl}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="iVASA" />
    <meta property="article:published_time" content="${publishedDate}" />
    <meta property="article:author" content="${authorName}" />

    <!-- Twitter Card Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${imageUrl}" />

    <!-- Schema.org Structured Data for Blog Post -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": "${postUrl}"
      },
      "headline": "${escapeHtml(post.title)}",
      "description": "${description}",
      "image": "${imageUrl}",
      "author": {
        "@type": "Person",
        "name": "${authorName}"
      },
      "publisher": {
        "@type": "Organization",
        "name": "iVASA",
        "logo": {
          "@type": "ImageObject",
          "url": "https://beta.ivasa.ai/og-image.png"
        }
      },
      "datePublished": "${publishedDate}",
      "dateModified": "${publishedDate}",
      "url": "${postUrl}"
    }
    </script>`;
}

// Function to replace meta tags in HTML template
function injectMetaTags(html: string, metaTags: string): string {
  // Remove existing meta tags that we're replacing
  let modifiedHtml = html;

  // Remove existing title
  modifiedHtml = modifiedHtml.replace(/<title>[^<]*<\/title>/g, '');

  // Remove existing meta description
  modifiedHtml = modifiedHtml.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/g, '');

  // Remove existing meta keywords
  modifiedHtml = modifiedHtml.replace(/<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/g, '');

  // Remove existing meta author
  modifiedHtml = modifiedHtml.replace(/<meta\s+name="author"\s+content="[^"]*"\s*\/?>/g, '');

  // Remove existing Open Graph tags
  modifiedHtml = modifiedHtml.replace(/<meta\s+property="og:[^"]*"\s+content="[^"]*"\s*\/?>/g, '');

  // Remove existing Twitter Card tags
  modifiedHtml = modifiedHtml.replace(/<meta\s+name="twitter:[^"]*"\s+content="[^"]*"\s*\/?>/g, '');

  // Remove existing canonical link
  modifiedHtml = modifiedHtml.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/g, '');

  // Remove existing JSON-LD structured data (the default SoftwareApplication one)
  modifiedHtml = modifiedHtml.replace(/<script\s+type="application\/ld\+json">[^<]*<\/script>/gs, '');

  // Insert new meta tags after the viewport meta tag
  const viewportMetaMatch = modifiedHtml.match(/<meta\s+name="viewport"[^>]*>/);
  if (viewportMetaMatch) {
    const insertPosition = modifiedHtml.indexOf(viewportMetaMatch[0]) + viewportMetaMatch[0].length;
    modifiedHtml =
      modifiedHtml.substring(0, insertPosition) +
      metaTags +
      modifiedHtml.substring(insertPosition);
  } else {
    // Fallback: insert after <head>
    modifiedHtml = modifiedHtml.replace('<head>', '<head>' + metaTags);
  }

  return modifiedHtml;
}

// Main middleware function to handle blog post meta tag injection
export async function blogSocialMetaMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
  getHtmlTemplate: () => Promise<string>
) {
  const url = req.originalUrl || req.url;

  // Check if this is a blog post URL
  const blogPostMatch = url.match(/^\/blog\/([^/?#]+)/);

  if (!blogPostMatch) {
    return next();
  }

  const slug = blogPostMatch[1];

  // Skip if it's just /blog without a slug
  if (!slug || slug === '') {
    return next();
  }

  try {
    // Fetch the blog post from Supabase
    const { data: posts, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .limit(1);

    if (error) {
      console.error('Error fetching blog post for social meta:', error);
      return next();
    }

    if (!posts || posts.length === 0) {
      // Post not found, let the app handle the 404
      return next();
    }

    const post = posts[0] as BlogPost;
    const postUrl = `https://beta.ivasa.ai/blog/${slug}`;

    // Get the HTML template
    const htmlTemplate = await getHtmlTemplate();

    // Generate meta tags for this post
    const metaTags = generateMetaTags(post, postUrl);

    // Inject meta tags into the HTML
    const modifiedHtml = injectMetaTags(htmlTemplate, metaTags);

    // Send the modified HTML
    res.status(200).set({ 'Content-Type': 'text/html' }).end(modifiedHtml);

  } catch (error) {
    console.error('Error in blog social meta middleware:', error);
    return next();
  }
}

// Export for use in vite.ts
export default blogSocialMetaMiddleware;
