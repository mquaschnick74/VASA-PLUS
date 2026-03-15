// Location: server/middleware/blog-social-meta.ts
// Middleware to inject Open Graph, Twitter Card meta tags, AND pre-rendered body
// content for blog posts. The body injection is critical for search engine indexing —
// without it, crawlers that do not execute JavaScript see only an empty <div id="root">.

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

// Escape HTML special characters to prevent XSS
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

// Truncate text to a specific length
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Strip markdown formatting for plain text descriptions
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/```[^`]*```/gs, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*>\s+/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Convert markdown to semantic HTML for pre-rendering in the body.
// This does not need to be styled — it exists solely for crawler readability.
// React will replace it when JavaScript loads in the browser.
function markdownToSemanticHtml(markdown: string): string {
  if (!markdown) return '';

  let html = markdown;

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Unordered list items — collect them then wrap
  html = html.replace(/^- (.+)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  // Paragraphs — double newlines become <p> tags
  html = html.split('\n\n').map(para => {
    const trimmed = para.trim();
    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<li')) {
      return trimmed;
    }
    if (trimmed === '') return '';
    return `<p>${trimmed}</p>`;
  }).join('\n');

  return html;
}

// Generate the <head> meta tags HTML to inject
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

  let imageUrl = 'https://beta.ivasa.ai/og-image.png';
  if (post.featured_image_url) {
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
    ${process.env.FACEBOOK_APP_ID ? `<meta property="fb:app_id" content="${process.env.FACEBOOK_APP_ID}" />` : '<!-- fb:app_id not configured (optional) -->'}

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

// Generate pre-rendered body HTML for the blog post.
// This is injected inside <div id="root"> so that crawlers that do not
// execute JavaScript can read the full article content.
// React replaces this content when JavaScript loads in the browser.
function generateBodyHtml(post: BlogPost, postUrl: string): string {
  const publishedDate = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : '';

  const featuredImageHtml = post.featured_image_url
    ? `<img src="${escapeHtml(post.featured_image_url)}" alt="${escapeHtml(post.title)}" style="max-width:100%;height:auto;display:block;margin-bottom:2rem;" />`
    : '';

  const contentHtml = markdownToSemanticHtml(post.content || '');

  return `
    <article itemscope itemtype="https://schema.org/BlogPosting" style="max-width:860px;margin:0 auto;padding:2rem 1rem;font-family:sans-serif;color:#fff;">
      ${featuredImageHtml}
      <header>
        <h1 itemprop="headline" style="font-size:2.5rem;font-weight:700;margin-bottom:1rem;">${escapeHtml(post.title)}</h1>
        <div style="display:flex;gap:1.5rem;font-size:0.9rem;opacity:0.75;margin-bottom:2rem;flex-wrap:wrap;">
          <span itemprop="author" itemscope itemtype="https://schema.org/Person">
            By <span itemprop="name">${escapeHtml(post.author_name || 'iVASA Team')}</span>
          </span>
          ${publishedDate ? `<time itemprop="datePublished" datetime="${post.published_at || ''}">${publishedDate}</time>` : ''}
        </div>
      </header>
      <div itemprop="articleBody">
        ${contentHtml}
      </div>
      <footer style="margin-top:3rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,0.2);">
        <a href="/blog" style="color:#00d062;text-decoration:none;">\u2190 Back to Blog</a>
      </footer>
    </article>`;
}

// Replace meta tags in HTML template AND inject pre-rendered body content
function injectMetaTags(html: string, metaTags: string, bodyHtml: string): string {
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
  modifiedHtml = modifiedHtml.replace(/<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/g, '');

  // Insert new meta tags after the viewport meta tag
  const viewportMetaMatch = modifiedHtml.match(/<meta\s+name="viewport"[^>]*>/);
  if (viewportMetaMatch) {
    const insertPosition = modifiedHtml.indexOf(viewportMetaMatch[0]) + viewportMetaMatch[0].length;
    modifiedHtml =
      modifiedHtml.substring(0, insertPosition) +
      metaTags +
      modifiedHtml.substring(insertPosition);
  } else {
    modifiedHtml = modifiedHtml.replace('<head>', '<head>' + metaTags);
  }

  // Inject pre-rendered article HTML inside <div id="root">
  // React replaces this when JavaScript loads. Crawlers read it directly.
  modifiedHtml = modifiedHtml.replace(
    '<div id="root"></div>',
    `<div id="root">${bodyHtml}</div>`
  );

  return modifiedHtml;
}

// Main middleware function
export async function blogSocialMetaMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
  getHtmlTemplate: () => Promise<string>
) {
  const url = req.originalUrl || req.url;

  // Only handle blog post URLs (not the blog index /blog)
  const blogPostMatch = url.match(/^\/blog\/([^/?#]+)/);

  if (!blogPostMatch) {
    return next();
  }

  const slug = blogPostMatch[1];

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
      return next();
    }

    const post = posts[0] as BlogPost;
    const postUrl = `https://beta.ivasa.ai/blog/${slug}`;

    const htmlTemplate = await getHtmlTemplate();

    const metaTags = generateMetaTags(post, postUrl);
    const bodyHtml = generateBodyHtml(post, postUrl);

    const modifiedHtml = injectMetaTags(htmlTemplate, metaTags, bodyHtml);

    res.status(200).set({ 'Content-Type': 'text/html' }).end(modifiedHtml);

  } catch (error) {
    console.error('Error in blog social meta middleware:', error);
    return next();
  }
}

export default blogSocialMetaMiddleware;
