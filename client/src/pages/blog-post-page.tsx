// Location: client/src/pages/blog-post-page.tsx
// Individual blog post page with markdown rendering

import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Eye, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

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

        // Update page title and meta tags
        if (data.post.meta_title) {
          document.title = data.post.meta_title;
        } else {
          document.title = `${data.post.title} | iVASA Blog`;
        }

        // Update meta description
        if (data.post.meta_description) {
          let metaDesc = document.querySelector('meta[name="description"]');
          if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.setAttribute('name', 'description');
            document.head.appendChild(metaDesc);
          }
          metaDesc.setAttribute('content', data.post.meta_description);
        }
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
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-emerald-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-emerald-900 flex items-center justify-center px-4">
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
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-emerald-900 py-12 px-4">
      <div className="max-w-4xl mx-auto">
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
            </div>

            {/* Post Content */}
            <div 
              className="prose prose-invert prose-purple max-w-none"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(post.content) }}
            />
          </CardContent>
        </Card>

        {/* Back to Blog Link */}
        <div className="mt-8 text-center">
          <Button
            onClick={() => setLocation('/blog')}
            variant="ghost"
            className="text-purple-300 hover:text-white hover:bg-white/10"
          >
            ← Back to All Posts
          </Button>
        </div>
      </div>
    </div>
  );
}