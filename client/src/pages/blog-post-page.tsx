// Location: client/src/pages/blog-post-page.tsx
// Individual blog post page with markdown rendering

import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Eye, ArrowLeft, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/shared/Header";
import BlogComments from "@/components/BlogComments";

// Social media icons as SVG components
const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
  </svg>
);

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  featured_image_url: string | null;
  author_name: string;
  published_at: string;
  view_count: number;
  meta_title: string;
  meta_description: string;
  meta_keywords: string;
}

// Simple markdown to HTML converter
function markdownToHtml(markdown: string): string {
  if (!markdown) return '';

  let html = markdown;

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold text-white mt-6 mb-3">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold text-white mt-8 mb-4">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold text-white mt-10 mb-5">$1</h1>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em class="italic">$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-emerald-400 hover:text-emerald-300 underline" target="_blank" rel="noopener noreferrer">$1</a>');

  // Bullet points
  html = html.replace(/^\- (.+)$/gim, '<li class="ml-6 mb-2">$1</li>');
  html = html.replace(/(<li.*<\/li>)/s, '<ul class="list-disc text-purple-200 mb-4">$1</ul>');

  // Line breaks (convert double newlines to paragraphs)
  html = html.split('\n\n').map(para => {
    if (para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<li')) {
      return para;
    }
    return `<p class="text-purple-200 mb-4 leading-relaxed">${para}</p>`;
  }).join('\n');

  return html;
}

export default function BlogPostPage() {
  const [, params] = useRoute("/blog/:slug");
  const [, setLocation] = useLocation();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (params?.slug) {
      loadPost(params.slug);
    }
  }, [params?.slug]);

  const loadPost = async (slug: string) => {
    try {
      const res = await fetch(`/api/blog/public/posts/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setPost(data.post);

        const postUrl = `https://beta.ivasa.ai/blog/${slug}`;
        const postTitle = data.post.meta_title || `${data.post.title} | iVASA Blog`;
        const postDescription = data.post.meta_description || data.post.excerpt || 'Read this article on the iVASA Blog';

        // Update page title
        document.title = postTitle;

        // Helper function to set meta tag
        const setMetaTag = (selector: string, attribute: string, content: string) => {
          let tag = document.querySelector(selector);
          if (!tag) {
            tag = document.createElement('meta');
            if (attribute === 'name') {
              tag.setAttribute('name', selector.replace('meta[name="', '').replace('"]', ''));
            } else if (attribute === 'property') {
              tag.setAttribute('property', selector.replace('meta[property="', '').replace('"]', ''));
            }
            document.head.appendChild(tag);
          }
          tag.setAttribute('content', content);
        };

        // Standard meta tags
        setMetaTag('meta[name="description"]', 'name', postDescription);
        if (data.post.meta_keywords) {
          setMetaTag('meta[name="keywords"]', 'name', data.post.meta_keywords);
        }

        // Canonical URL
        let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
        if (!canonical) {
          canonical = document.createElement('link');
          canonical.setAttribute('rel', 'canonical');
          document.head.appendChild(canonical);
        }
        canonical.setAttribute('href', postUrl);

        // Open Graph tags for social sharing
        setMetaTag('meta[property="og:title"]', 'property', postTitle);
        setMetaTag('meta[property="og:description"]', 'property', postDescription);
        setMetaTag('meta[property="og:url"]', 'property', postUrl);
        setMetaTag('meta[property="og:type"]', 'property', 'article');
        if (data.post.featured_image_url) {
          setMetaTag('meta[property="og:image"]', 'property', data.post.featured_image_url);
        }
        setMetaTag('meta[property="og:site_name"]', 'property', 'iVASA');

        // Twitter Card tags
        setMetaTag('meta[name="twitter:card"]', 'name', 'summary_large_image');
        setMetaTag('meta[name="twitter:title"]', 'name', postTitle);
        setMetaTag('meta[name="twitter:description"]', 'name', postDescription);
        if (data.post.featured_image_url) {
          setMetaTag('meta[name="twitter:image"]', 'name', data.post.featured_image_url);
        }

        // Article-specific Open Graph tags
        if (data.post.published_at) {
          setMetaTag('meta[property="article:published_time"]', 'property', data.post.published_at);
        }
        if (data.post.author_name) {
          setMetaTag('meta[property="article:author"]', 'property', data.post.author_name);
        }

        // Schema.org structured data for blog post
        let scriptTag = document.querySelector('script[type="application/ld+json"][data-blog-post]') as HTMLScriptElement;
        if (!scriptTag) {
          scriptTag = document.createElement('script');
          scriptTag.setAttribute('type', 'application/ld+json');
          scriptTag.setAttribute('data-blog-post', 'true');
          document.head.appendChild(scriptTag);
        }
        scriptTag.textContent = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          "headline": data.post.title,
          "description": postDescription,
          "image": data.post.featured_image_url || "https://beta.ivasa.ai/og-image.png",
          "author": {
            "@type": "Person",
            "name": data.post.author_name || "iVASA Team"
          },
          "publisher": {
            "@type": "Organization",
            "name": "iVASA",
            "logo": {
              "@type": "ImageObject",
              "url": "https://beta.ivasa.ai/og-image.png"
            }
          },
          "datePublished": data.post.published_at,
          "url": postUrl
        });
      } else {
        setNotFound(true);
      }
    } catch (error) {
      console.error('Failed to load blog post:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen gradient-bg">
        <Header showDashboardLink={true} />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-white text-xl">Loading...</div>
        </div>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="min-h-screen gradient-bg">
        <Header showDashboardLink={true} />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
          <Card className="glass max-w-md w-full">
            <CardContent className="p-12 text-center">
              <h1 className="text-3xl font-bold text-white mb-4">Post Not Found</h1>
              <p className="text-purple-200 mb-6">
                The blog post you're looking for doesn't exist or has been removed.
              </p>
              <Button onClick={() => setLocation('/blog')} variant="default">
                ← Back to Blog
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      <Header showDashboardLink={true} />
      <div className="max-w-4xl mx-auto py-12 px-4">
        {/* Back Button */}
        <Button
          onClick={() => setLocation('/blog')}
          variant="ghost"
          className="mb-6 text-purple-300 hover:text-white hover:bg-white/10"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Blog
        </Button>

        {/* Blog Post Card */}
        <Card className="glass">
          <CardContent className="p-8 md:p-12">
            {/* Featured Image */}
            {post.featured_image_url && (
              <img
                src={post.featured_image_url}
                alt={post.title}
                className="w-full h-64 md:h-96 object-cover rounded-lg mb-8"
              />
            )}

            {/* Post Header */}
            <div className="mb-8">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                {post.title}
              </h1>

              {/* Meta Info */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-purple-300">
                <Badge variant="secondary" className="bg-purple-500/20 text-purple-200">
                  By {post.author_name}
                </Badge>

                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(post.published_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>

                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {post.view_count} views
                </div>
              </div>

              {/* Social Share Buttons */}
              <div className="flex items-center gap-3 mt-4">
                <span className="text-sm text-purple-300 flex items-center gap-1">
                  <Share2 className="w-4 h-4" />
                  Share:
                </span>

                {/* X (Twitter) Share */}
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(`https://beta.ivasa.ai/blog/${post.slug}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white hover:text-emerald-400"
                  title="Share on X (Twitter)"
                >
                  <XIcon className="w-4 h-4" />
                </a>

                {/* Facebook Share */}
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`https://beta.ivasa.ai/blog/${post.slug}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white hover:text-blue-400"
                  title="Share on Facebook"
                >
                  <FacebookIcon className="w-4 h-4" />
                </a>

                {/* Instagram - Copy link (Instagram doesn't support direct URL sharing) */}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://beta.ivasa.ai/blog/${post.slug}`);
                    alert('Link copied! You can paste it in your Instagram story or bio.');
                  }}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white hover:text-pink-400"
                  title="Copy link for Instagram"
                >
                  <InstagramIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Post Content */}
            <div
              className="prose prose-invert prose-purple max-w-none"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(post.content) }}
            />
          </CardContent>
        </Card>

        {/* Comments Section */}
        {params?.slug && <BlogComments slug={params.slug} />}
      </div>
    </div>
  );
}