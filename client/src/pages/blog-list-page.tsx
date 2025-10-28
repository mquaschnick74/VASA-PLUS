// Location: client/src/pages/blog-list-page.tsx
// Public blog listing page showing all published posts

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { Calendar, Eye } from "lucide-react";
import Header from "@/components/shared/Header";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  featured_image_url: string | null;
  author_name: string;
  published_at: string;
  view_count: number;
}

export default function BlogListPage() {
  const [, setLocation] = useLocation();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      const res = await fetch('/api/blog/public/posts');
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts);
      }
    } catch (error) {
      console.error('Failed to load blog posts:', error);
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

  return (
    <div className="min-h-screen gradient-bg">
      <Header showDashboardLink={true} />
      <div className="max-w-4xl mx-auto py-12 px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">iVASA Blog</h1>
          <p className="text-xl text-purple-200">
            Insights on AI-powered therapeutic voice assistance
          </p>
        </div>

        {/* Blog Posts Grid */}
        {posts.length === 0 ? (
          <Card className="glass">
            <CardContent className="p-12 text-center">
              <p className="text-lg text-muted-foreground">
                No blog posts published yet. Check back soon!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {posts.map((post) => (
              <Card
                key={post.id}
                className="glass hover:bg-white/10 transition-all cursor-pointer"
                onClick={() => setLocation(`/blog/${post.slug}`)}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Featured Image (if exists) */}
                    {post.featured_image_url && (
                      <div className="md:w-1/3">
                        <img
                          src={post.featured_image_url}
                          alt={post.title}
                          className="w-full h-48 object-cover rounded-lg"
                        />
                      </div>
                    )}

                    {/* Post Content */}
                    <div className={post.featured_image_url ? "md:w-2/3" : "w-full"}>
                      <h2 className="text-2xl font-bold text-white mb-3 hover:text-purple-300 transition-colors">
                        {post.title}
                      </h2>

                      {post.excerpt && (
                        <p className="text-purple-200 mb-4 line-clamp-3">
                          {post.excerpt}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-sm text-purple-300">
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

                        <Badge variant="secondary" className="bg-purple-500/20 text-purple-200">
                          By {post.author_name}
                        </Badge>
                      </div>

                      <div className="mt-4">
                        <span className="text-emerald-400 hover:text-emerald-300 font-medium">
                          Read more →
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}