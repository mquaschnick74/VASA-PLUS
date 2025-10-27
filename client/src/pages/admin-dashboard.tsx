  // Location: client/src/pages/admin-dashboard.tsx
  // Admin dashboard for managing partners, influencers, content, and blog

  import { useState, useEffect } from "react";
  import { Button } from "@/components/ui/button";
  import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
  import { Badge } from "@/components/ui/badge";
  import { TechnicalSupportCard } from "@/components/TechnicalSupportCard";
  import { supabase } from "@/lib/supabaseClient";
  import { handleLogout } from "@/lib/auth-helpers";
  import {
    Users,
    TrendingUp,
    Clock,
    Award,
    Eye,
    UserPlus,
    CheckCircle,
    XCircle,
    FileText,
    Edit,
    Trash2,
  } from "lucide-react";

  interface AdminDashboardProps {
    userId: string;
    setUserId: (id: string | null) => void;
  }

  interface OverviewStats {
    partners: { total: number; active: number };
    influencers: { total: number; active: number };
    users: { total: number };
    sessions: { total: number; totalMinutes: number };
  }

  interface Partner {
    id: string;
    organization_name: string;
    organization_type: string;
    status: string;
    model_type: string;
    revenue_share_percentage: number;
    equity_percentage: number;
    created_at: string;
    partner_users: any[];
  }

  interface Influencer {
    id: string;
    influencer_name: string;
    platform: string;
    platform_handle: string;
    influencer_status: string;
    influencer_tier: string;
    follower_count: number;
    commission_percentage: number;
    total_conversions: number;
    total_earnings_cents: number;
    unique_promo_code: string;
    users: {
      email: string;
      first_name: string;
    };
  }

  interface ContentItem {
    id: string;
    content_type: string;
    content_url: string | null;
    post_date: string;
    approval_status: string;
    views: number;
    engagement_rate: number;
    influencer_profiles: {
      influencer_name: string;
      platform: string;
      platform_handle: string;
    };
  }

  interface BlogPost {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    content: string;
    meta_title: string | null;
    meta_description: string | null;
    meta_keywords?: string | null;
    status: "draft" | "published";
    author_name: string;
    published_at: string | null;
    view_count: number;
    created_at: string;
  }

  export default function AdminDashboard({ userId, setUserId }: AdminDashboardProps) {
    const [activeTab, setActiveTab] = useState<"overview" | "partners" | "influencers" | "content" | "blog">("overview");
    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState<OverviewStats | null>(null);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [influencers, setInfluencers] = useState<Influencer[]>([]);
    const [pendingContent, setPendingContent] = useState<ContentItem[]>([]);
    const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
    const [showBlogForm, setShowBlogForm] = useState(false);
    const [editingBlogPost, setEditingBlogPost] = useState<BlogPost | null>(null);

    // Onboarding forms
    const [showPartnerForm, setShowPartnerForm] = useState(false);
    const [showInfluencerForm, setShowInfluencerForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
      void loadData();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const loadData = async () => {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;

      if (!session) {
        setLoading(false);
        return;
      }

      const token = session.access_token;

      try {
        switch (activeTab) {
          case "overview": {
            const overviewRes = await fetch("/api/admin/overview", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (overviewRes.ok) {
              const data: OverviewStats = await overviewRes.json();
              setOverview(data);
            }
            break;
          }

          case "partners": {
            const partnersRes = await fetch("/api/admin/partners", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (partnersRes.ok) {
              const data = (await partnersRes.json()) as { partners: Partner[] };
              setPartners(data.partners ?? []);
            }
            break;
          }

          case "influencers": {
            const influencersRes = await fetch("/api/admin/influencers", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (influencersRes.ok) {
              const data = (await influencersRes.json()) as { influencers: Influencer[] };
              setInfluencers(data.influencers ?? []);
            }
            break;
          }

          case "content": {
            const contentRes = await fetch("/api/admin/content/pending", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (contentRes.ok) {
              const data = (await contentRes.json()) as { content: ContentItem[] };
              setPendingContent(data.content ?? []);
            }
            break;
          }

          case "blog": {
            const blogRes = await fetch("/api/blog/admin/posts", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (blogRes.ok) {
              const data = (await blogRes.json()) as { posts: BlogPost[] };
              setBlogPosts(data.posts ?? []);
            }
            break;
          }
        }
      } catch (error) {
        console.error("Failed to load admin data:", error);
      } finally {
        setLoading(false);
      }
    };

    const viewAs = async (type: "partner" | "influencer", id: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) return;

      try {
        const res = await fetch(`/api/admin/view-as/${type}/${id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
          const data: {
            userId: string;
            userType: string;
            viewAsName: string;
          } = await res.json();

          sessionStorage.setItem(
            "adminViewAs",
            JSON.stringify({
              adminUserId: userId,
              targetUserId: data.userId,
              targetUserType: data.userType,
              viewAsName: data.viewAsName,
              partnerId: type === "partner" ? id : null,
              influencerId: type === "influencer" ? id : null,
            })
          );

          window.location.reload();
        } else {
          const error = await res.json();
          alert(`Failed to switch view: ${error.error ?? "Unknown error"}`);
        }
      } catch (error) {
        console.error("View-as error:", error);
        alert("Failed to switch view");
      }
    };

    const onboardPartner = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitting(true);

      const formData = new FormData(e.currentTarget);
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) {
        setSubmitting(false);
        return;
      }

      try {
        const res = await fetch("/api/admin/partners/onboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            userEmail: formData.get("userEmail"),
            organizationName: formData.get("organizationName"),
            organizationType: formData.get("organizationType"),
            contactEmail: formData.get("contactEmail"),
            contactPhone: formData.get("contactPhone"),
            modelType: formData.get("modelType"),
            revenueSharePercentage: parseFloat((formData.get("revenueSharePercentage") as string) ?? "0"),
            equityPercentage: parseFloat((formData.get("equityPercentage") as string) ?? "0"),
          }),
        });

        if (res.ok) {
          alert("Partner onboarded successfully!");
          setShowPartnerForm(false);
          void loadData();
        } else {
          const error = await res.json();
          alert(`Failed to onboard partner: ${error.error ?? "Unknown error"}`);
        }
      } catch (error) {
        console.error("Partner onboarding error:", error);
        alert("Failed to onboard partner");
      } finally {
        setSubmitting(false);
      }
    };

    const onboardInfluencer = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitting(true);

      const formData = new FormData(e.currentTarget);
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) {
        setSubmitting(false);
        return;
      }

      try {
        const res = await fetch("/api/admin/influencers/onboard", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            userEmail: formData.get("userEmail"),
            influencerName: formData.get("influencerName"),
            platform: formData.get("platform"),
            platformHandle: formData.get("platformHandle"),
            platformUrl: formData.get("platformUrl"),
            followerCount: parseInt((formData.get("followerCount") as string) ?? "0", 10),
            niche: formData.get("niche"),
            tier: formData.get("tier"),
            commissionPercentage: parseFloat((formData.get("commissionPercentage") as string) ?? "0"),
            equityPercentage: parseFloat((formData.get("equityPercentage") as string) ?? "0"),
          }),
        });

        if (res.ok) {
          alert("Influencer onboarded successfully!");
          setShowInfluencerForm(false);
          void loadData();
        } else {
          const error = await res.json();
          alert(`Failed to onboard influencer: ${error.error ?? "Unknown error"}`);
        }
      } catch (error) {
        console.error("Influencer onboarding error:", error);
        alert("Failed to onboard influencer");
      } finally {
        setSubmitting(false);
      }
    };

    const approveContent = async (contentId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) return;

      try {
        const res = await fetch(`/api/admin/content/${contentId}/approve`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
          alert("Content approved");
          void loadData();
        } else {
          const error = await res.json();
          alert(`Failed to approve content: ${error.error ?? "Unknown error"}`);
        }
      } catch (error) {
        console.error("Approval error:", error);
        alert("Failed to approve content");
      }
    };

    const rejectContent = async (contentId: string) => {
      const reason = prompt("Reason for rejection:");
      if (!reason) return;

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) return;

      try {
        const res = await fetch(`/api/admin/content/${contentId}/reject`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ reason }),
        });

        if (res.ok) {
          alert("Content rejected");
          void loadData();
        } else {
          const error = await res.json();
          alert(`Failed to reject content: ${error.error ?? "Unknown error"}`);
        }
      } catch (error) {
        console.error("Rejection error:", error);
        alert("Failed to reject content");
      }
    };

    const createBlogPost = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitting(true);

      const formData = new FormData(e.currentTarget);
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) {
        setSubmitting(false);
        return;
      }

      try {
        const res = await fetch("/api/blog/admin/posts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            title: formData.get("title"),
            excerpt: formData.get("excerpt"),
            content: formData.get("content"),
            meta_title: formData.get("meta_title"),
            meta_description: formData.get("meta_description"),
            meta_keywords: formData.get("meta_keywords"),
            status: formData.get("status"),
            author_name: formData.get("author_name"),
          }),
        });

        if (res.ok) {
          alert("Blog post created successfully!");
          setShowBlogForm(false);
          void loadData();
        } else {
          const error = await res.json();
          alert(`Failed: ${error.error ?? "Unknown error"}`);
        }
      } catch (error) {
        console.error("Create blog post error:", error);
        alert("Failed to create blog post");
      } finally {
        setSubmitting(false);
      }
    };

    const updateBlogPost = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitting(true);

      const formData = new FormData(e.currentTarget);
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session || !editingBlogPost) {
        setSubmitting(false);
        return;
      }

      try {
        const res = await fetch(`/api/blog/admin/posts/${editingBlogPost.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            title: formData.get("title"),
            excerpt: formData.get("excerpt"),
            content: formData.get("content"),
            meta_title: formData.get("meta_title"),
            meta_description: formData.get("meta_description"),
            meta_keywords: formData.get("meta_keywords"),
            status: formData.get("status"),
            author_name: formData.get("author_name"),
          }),
        });

        if (res.ok) {
          alert("Blog post updated successfully!");
          setEditingBlogPost(null);
          void loadData();
        } else {
          const error = await res.json();
          alert(`Failed: ${error.error ?? "Unknown error"}`);
        }
      } catch (error) {
        console.error("Update blog post error:", error);
        alert("Failed to update blog post");
      } finally {
        setSubmitting(false);
      }
    };

    const deleteBlogPost = async (postId: string) => {
      if (!confirm("Are you sure you want to delete this blog post?")) return;

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) return;

      try {
        const res = await fetch(`/api/blog/admin/posts/${postId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (res.ok) {
          alert("Blog post deleted successfully!");
          void loadData();
        } else {
          const error = await res.json();
          alert(`Failed: ${error.error ?? "Unknown error"}`);
        }
      } catch (error) {
        console.error("Delete blog post error:", error);
        alert("Failed to delete blog post");
      }
    };

    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center gradient-bg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading admin dashboard...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen gradient-bg p-4 sm:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold">Admin Dashboard</h1>
            <Button onClick={() => handleLogout(setUserId)}>Sign Out</Button>
          </div>

          {/* Technical Support Card */}
          <TechnicalSupportCard />

          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            <Button variant={activeTab === "overview" ? "default" : "outline"} onClick={() => setActiveTab("overview")}>
              Overview
            </Button>
            <Button variant={activeTab === "partners" ? "default" : "outline"} onClick={() => setActiveTab("partners")}>
              Partners
            </Button>
            <Button
              variant={activeTab === "influencers" ? "default" : "outline"}
              onClick={() => setActiveTab("influencers")}
            >
              Influencers
            </Button>
            <Button variant={activeTab === "content" ? "default" : "outline"} onClick={() => setActiveTab("content")}>
              Content Review
            </Button>
            <Button variant={activeTab === "blog" ? "default" : "outline"} onClick={() => setActiveTab("blog")}>
              Blog Posts
            </Button>
            <Button variant="outline" disabled className="opacity-50">
              Commissions (Coming Soon)
            </Button>
            <Button variant="outline" disabled className="opacity-50">
              Analytics (Coming Soon)
            </Button>
          </div>

          {/* Overview */}
          {activeTab === "overview" && overview && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="glass">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3">
                    <Users className="w-8 h-8 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">{overview.partners.total}</p>
                      <p className="text-sm text-muted-foreground">
                        Partners ({overview.partners.active} active)
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3">
                    <Award className="w-8 h-8 text-accent" />
                    <div>
                      <p className="text-2xl font-bold">{overview.influencers.total}</p>
                      <p className="text-sm text-muted-foreground">
                        Influencers ({overview.influencers.active} active)
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3">
                    <Users className="w-8 h-8 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold">{overview.users.total}</p>
                      <p className="text-sm text-muted-foreground">Total Users</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3">
                    <Clock className="w-8 h-8 text-blue-500" />
                    <div>
                      <p className="text-2xl font-bold">{overview.sessions.totalMinutes}</p>
                      <p className="text-sm text-muted-foreground">
                        Total Minutes ({overview.sessions.total} sessions)
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Partners */}
          {activeTab === "partners" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Partners</h2>
                <Button onClick={() => setShowPartnerForm((s) => !s)}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Onboard Partner
                </Button>
              </div>

              {showPartnerForm && (
                <Card className="glass">
                  <CardHeader>
                    <CardTitle>Onboard New Partner</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={onboardPartner} className="space-y-4">
                      <input
                        name="userEmail"
                        type="email"
                        placeholder="User Email (must already have account)"
                        required
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <input
                        name="organizationName"
                        placeholder="Organization Name"
                        required
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <select name="organizationType" required className="w-full px-3 py-2 rounded-lg glass border border-white/10">
                        <option value="">Select Type</option>
                        <option value="university">University</option>
                        <option value="clinic">Clinic</option>
                        <option value="hospital">Hospital</option>
                        <option value="private_practice">Private Practice</option>
                        <option value="corporate">Corporate</option>
                      </select>
                      <input
                        name="contactEmail"
                        type="email"
                        placeholder="Contact Email"
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <input
                        name="contactPhone"
                        placeholder="Contact Phone"
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <select name="modelType" required className="w-full px-3 py-2 rounded-lg glass border border-white/10">
                        <option value="">Select Model</option>
                        <option value="revenue_share">Revenue Share</option>
                        <option value="equity">Equity</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                      <input
                        name="revenueSharePercentage"
                        type="number"
                        step="0.01"
                        placeholder="Revenue Share %"
                        defaultValue="0"
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <input
                        name="equityPercentage"
                        type="number"
                        step="0.01"
                        placeholder="Equity %"
                        defaultValue="0"
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <div className="flex gap-2">
                        <Button type="submit" disabled={submitting}>
                          {submitting ? "Creating..." : "Create Partner"}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setShowPartnerForm(false)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-3">
                {partners.map((partner) => (
                  <Card key={partner.id} className="glass">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{partner.organization_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {partner.organization_type} • {partner.model_type}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Status: {partner.status} | Revenue: {partner.revenue_share_percentage}% | Equity:{" "}
                            {partner.equity_percentage}%
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => viewAs("partner", partner.id)}>
                          <Eye className="w-4 h-4 mr-1" />
                          View As
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Influencers */}
          {activeTab === "influencers" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Influencers</h2>
                <Button onClick={() => setShowInfluencerForm((s) => !s)}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Onboard Influencer
                </Button>
              </div>

              {showInfluencerForm && (
                <Card className="glass">
                  <CardHeader>
                    <CardTitle>Onboard New Influencer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={onboardInfluencer} className="space-y-4">
                      <input
                        name="userEmail"
                        type="email"
                        placeholder="User Email (must already have account)"
                        required
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <input
                        name="influencerName"
                        placeholder="Influencer Name"
                        required
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <select name="platform" required className="w-full px-3 py-2 rounded-lg glass border border-white/10">
                        <option value="">Select Platform</option>
                        <option value="twitter">Twitter</option>
                        <option value="instagram">Instagram</option>
                        <option value="tiktok">TikTok</option>
                        <option value="youtube">YouTube</option>
                        <option value="linkedin">LinkedIn</option>
                      </select>
                      <input
                        name="platformHandle"
                        placeholder="@handle"
                        required
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <input
                        name="platformUrl"
                        placeholder="Profile URL"
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <input
                        name="followerCount"
                        type="number"
                        placeholder="Follower Count"
                        defaultValue="0"
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <input
                        name="niche"
                        placeholder="Niche (e.g. mental_health)"
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <select name="tier" required className="w-full px-3 py-2 rounded-lg glass border border-white/10">
                        <option value="nano">Nano (&lt;10K)</option>
                        <option value="micro">Micro (10K-100K)</option>
                        <option value="macro">Macro (100K-1M)</option>
                        <option value="mega">Mega (&gt;1M)</option>
                      </select>
                      <input
                        name="commissionPercentage"
                        type="number"
                        step="0.01"
                        placeholder="Commission %"
                        defaultValue="15"
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <input
                        name="equityPercentage"
                        type="number"
                        step="0.01"
                        placeholder="Equity %"
                        defaultValue="0"
                        className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                      />
                      <div className="flex gap-2">
                        <Button type="submit" disabled={submitting}>
                          {submitting ? "Creating..." : "Create Influencer"}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setShowInfluencerForm(false)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-3">
                {influencers.map((influencer) => (
                  <Card key={influencer.id} className="glass">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{influencer.influencer_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {influencer.platform} • @{influencer.platform_handle} • {influencer.influencer_tier}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {influencer.follower_count.toLocaleString()} followers • {influencer.total_conversions} conversions
                            • ${(influencer.total_earnings_cents / 100).toFixed(2)} earned
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Promo: {influencer.unique_promo_code} • Commission: {influencer.commission_percentage}%
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => viewAs("influencer", influencer.id)}>
                          <Eye className="w-4 h-4 mr-1" />
                          View As
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Content Review */}
          {activeTab === "content" && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Pending Content Review</h2>
              {pendingContent.length === 0 ? (
                <Card className="glass">
                  <CardContent className="p-8 text-center text-muted-foreground">No pending content to review</CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {pendingContent.map((content) => (
                    <Card key={content.id} className="glass">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-semibold">{content.influencer_profiles.influencer_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {content.content_type} on {content.influencer_profiles.platform}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Posted: {new Date(content.post_date).toLocaleDateString()} • Views:{" "}
                              {content.views.toLocaleString()} • Engagement: {content.engagement_rate}%
                            </p>
                            {content.content_url ? (
                              <a
                                href={content.content_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline"
                              >
                                View Content →
                              </a>
                            ) : null}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="default" onClick={() => approveContent(content.id)}>
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => rejectContent(content.id)}>
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Blog Posts */}
          {activeTab === "blog" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Blog Posts</h2>
                <Button
                  onClick={() => {
                    setEditingBlogPost(null);
                    setShowBlogForm((s) => !s);
                  }}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  New Blog Post
                </Button>
              </div>

              {(showBlogForm || editingBlogPost) && (
                <Card className="glass">
                  <CardHeader>
                    <CardTitle>{editingBlogPost ? "Edit Blog Post" : "Create New Blog Post"}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={editingBlogPost ? updateBlogPost : createBlogPost} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Title *</label>
                        <input
                          name="title"
                          placeholder="Blog Post Title"
                          required
                          defaultValue={editingBlogPost?.title ?? ""}
                          className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Excerpt</label>
                        <textarea
                          name="excerpt"
                          placeholder="Short description (appears on blog listing page)"
                          rows={2}
                          defaultValue={editingBlogPost?.excerpt ?? ""}
                          className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Content * (Markdown supported)</label>
                        <textarea
                          name="content"
                          placeholder="Write your blog post content here. You can use Markdown formatting."
                          rows={12}
                          required
                          defaultValue={editingBlogPost?.content ?? ""}
                          className="w-full px-3 py-2 rounded-lg glass border border-white/10 font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Tip: Use **bold**, *italic*, # headers, - bullet points, [links](url)
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Meta Title (SEO)</label>
                          <input
                            name="meta_title"
                            placeholder="SEO title (defaults to post title)"
                            defaultValue={editingBlogPost?.meta_title ?? ""}
                            className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">Author Name</label>
                          <input
                            name="author_name"
                            placeholder="Author name"
                            defaultValue={editingBlogPost?.author_name ?? "iVASA Team"}
                            className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Meta Description (SEO)</label>
                        <textarea
                          name="meta_description"
                          placeholder="SEO description (defaults to excerpt)"
                          rows={2}
                          defaultValue={editingBlogPost?.meta_description ?? ""}
                          className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Keywords (SEO)</label>
                        <input
                          name="meta_keywords"
                          placeholder="keyword1, keyword2, keyword3"
                          defaultValue={editingBlogPost?.meta_keywords ?? ""}
                          className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Status</label>
                        <select
                          name="status"
                          defaultValue={editingBlogPost?.status ?? "draft"}
                          className="w-full px-3 py-2 rounded-lg glass border border-white/10"
                        >
                          <option value="draft">Draft (not visible to public)</option>
                          <option value="published">Published (visible to public)</option>
                        </select>
                      </div>

                      <div className="flex gap-2">
                        <Button type="submit" disabled={submitting}>
                          {submitting ? "Saving..." : editingBlogPost ? "Update Post" : "Create Post"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setShowBlogForm(false);
                            setEditingBlogPost(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-3">
                {blogPosts.length === 0 ? (
                  <Card className="glass">
                    <CardContent className="p-8 text-center text-muted-foreground">
                      No blog posts yet. Create your first one!
                    </CardContent>
                  </Card>
                ) : (
                  blogPosts.map((post) => (
                    <Card key={post.id} className="glass">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold">{post.title}</p>
                              <Badge variant={post.status === "published" ? "default" : "secondary"}>{post.status}</Badge>
                            </div>
                            {post.excerpt ? (
                              <p className="text-sm text-muted-foreground mb-2">{post.excerpt}</p>
                            ) : null}
                            <p className="text-xs text-muted-foreground">
                              By {post.author_name} •
                              {post.published_at
                                ? ` Published ${new Date(post.published_at).toLocaleDateString()}`
                                : " Not published yet"}{" "}
                              • {post.view_count} views
                            </p>
                            {post.status === "published" && (
                              <a
                                href={`/blog/${post.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline"
                              >
                                View live post →
                              </a>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setEditingBlogPost(post)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => deleteBlogPost(post.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
