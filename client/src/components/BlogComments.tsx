// Location: client/src/components/BlogComments.tsx
// Comment section component for blog posts

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send, User, Reply, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

interface Comment {
  id: string;
  author_name: string;
  content: string;
  parent_id: string | null;
  created_at: string;
}

interface BlogCommentsProps {
  slug: string;
}

export default function BlogComments({ slug }: BlogCommentsProps) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [content, setContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");

  // Get current auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.email) {
        setAuthorEmail(session.user.email);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    loadComments();
  }, [slug]);

  const loadComments = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/blog/public/posts/${slug}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setLoading(false);
    }
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!authorName.trim() || !content.trim()) {
      setError("Name and comment are required");
      return;
    }

    try {
      setSubmitting(true);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Include auth token if available
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/blog/public/posts/${slug}/comments`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          author_name: authorName.trim(),
          author_email: authorEmail.trim() || null,
          content: content.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setComments([...comments, data.comment]);
        setContent("");
        // Keep name and email for future comments
      } else {
        const data = await res.json();
        setError(data.error || "Failed to submit comment");
      }
    } catch (err) {
      setError("Failed to submit comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitReply = async (parentId: string) => {
    setError(null);

    if (!authorName.trim() || !replyContent.trim()) {
      setError("Name and reply are required");
      return;
    }

    try {
      setSubmitting(true);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`/api/blog/public/posts/${slug}/comments`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          author_name: authorName.trim(),
          author_email: authorEmail.trim() || null,
          content: replyContent.trim(),
          parent_id: parentId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setComments([...comments, data.comment]);
        setReplyContent("");
        setReplyingTo(null);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to submit reply");
      }
    } catch (err) {
      setError("Failed to submit reply. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!session?.access_token) return;

    try {
      const res = await fetch(`/api/blog/public/comments/${commentId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
        },
      });

      if (res.ok) {
        setComments(comments.filter(c => c.id !== commentId && c.parent_id !== commentId));
      }
    } catch (err) {
      console.error("Failed to delete comment:", err);
    }
  };

  // Organize comments into threads (parent comments with their replies)
  const parentComments = comments.filter(c => !c.parent_id);
  const getReplies = (parentId: string) => comments.filter(c => c.parent_id === parentId);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Card className="glass mt-8">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          Comments ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Comment Form */}
        <form onSubmit={submitComment} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                placeholder="Your name *"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-purple-300/50"
                required
              />
            </div>
            <div>
              <Input
                type="email"
                placeholder="Your email (optional)"
                value={authorEmail}
                onChange={(e) => setAuthorEmail(e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-purple-300/50"
              />
            </div>
          </div>
          <Textarea
            placeholder="Write a comment..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="bg-white/5 border-white/10 text-white placeholder:text-purple-300/50 min-h-[100px]"
            required
          />
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          <Button
            type="submit"
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Send className="w-4 h-4 mr-2" />
            {submitting ? "Posting..." : "Post Comment"}
          </Button>
        </form>

        {/* Comments List */}
        {loading ? (
          <div className="text-center py-8">
            <p className="text-purple-300">Loading comments...</p>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-purple-300">No comments yet. Be the first to comment!</p>
          </div>
        ) : (
          <div className="space-y-6 pt-4 border-t border-white/10">
            {parentComments.map((comment) => (
              <div key={comment.id} className="space-y-4">
                {/* Parent Comment */}
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-purple-500/30 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-purple-300" />
                      </div>
                      <div>
                        <p className="text-white font-medium">{comment.author_name}</p>
                        <p className="text-purple-300/70 text-xs">{formatDate(comment.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                        className="text-purple-300 hover:text-white hover:bg-white/10 h-8 px-2"
                      >
                        <Reply className="w-4 h-4" />
                      </Button>
                      {user && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteComment(comment.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 px-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-purple-200 whitespace-pre-wrap">{comment.content}</p>
                </div>

                {/* Reply Form */}
                {replyingTo === comment.id && (
                  <div className="ml-8 space-y-3">
                    <Textarea
                      placeholder={`Reply to ${comment.author_name}...`}
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      className="bg-white/5 border-white/10 text-white placeholder:text-purple-300/50 min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => submitReply(comment.id)}
                        disabled={submitting}
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Send className="w-3 h-3 mr-1" />
                        Reply
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyContent("");
                        }}
                        className="text-purple-300 hover:text-white"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Replies */}
                {getReplies(comment.id).map((reply) => (
                  <div key={reply.id} className="ml-8 bg-white/3 rounded-lg p-4 border-l-2 border-purple-500/30">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center">
                          <User className="w-3 h-3 text-purple-300" />
                        </div>
                        <div>
                          <p className="text-white font-medium text-sm">{reply.author_name}</p>
                          <p className="text-purple-300/70 text-xs">{formatDate(reply.created_at)}</p>
                        </div>
                      </div>
                      {user && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteComment(reply.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-6 px-2"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <p className="text-purple-200 text-sm whitespace-pre-wrap">{reply.content}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
