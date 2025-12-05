// Location: client/src/pages/LearnMore.tsx
// Hub page with navigation cards to Meditations, Blog, and Videos

import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Music, BookOpen, Video, ArrowLeft, ChevronRight } from "lucide-react";
import Header from "@/components/shared/Header";

interface ResourceCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  count?: string;
}

export default function LearnMore() {
  const [, setLocation] = useLocation();
  const isLoggedIn = !!localStorage.getItem('userId');

  useEffect(() => {
    document.title = 'Learn More - iVASA';
  }, []);

  const resources: ResourceCard[] = [
    {
      title: "Meditation Library",
      description: "Guided meditations for relaxation and mindfulness",
      icon: <Music className="w-8 h-8 text-emerald-400" />,
      path: "/meditations",
      count: "6 meditations"
    },
    {
      title: "Blog",
      description: "Articles and insights on therapeutic voice analysis",
      icon: <BookOpen className="w-8 h-8 text-emerald-400" />,
      path: "/blog",
      count: "Latest articles"
    },
    {
      title: "Video Library",
      description: "Educational videos and practice sessions",
      icon: <Video className="w-8 h-8 text-emerald-400" />,
      path: "/videos",
      count: "3 videos"
    }
  ];

  return (
    <div className="min-h-screen gradient-bg">
      <Header showDashboardLink={true} />

      <div className="max-w-4xl mx-auto py-12 px-4">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => setLocation(isLoggedIn ? '/dashboard' : '/')}
          className="mb-6 text-purple-200 hover:text-white hover:bg-emerald-500/10"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {isLoggedIn ? 'Back to Dashboard' : 'Back to Main Page'}
        </Button>

        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">Learn More</h1>
          <p className="text-xl text-purple-200">
            Explore our resources to deepen your understanding and practice
          </p>
          <p className="text-purple-300 text-sm mt-3">
            Need help? Check out our{" "}
            <span
              onClick={() => setLocation('/faq')}
              className="text-emerald-400 hover:text-emerald-300 cursor-pointer underline"
            >
              FAQ page
            </span>
          </p>
        </div>

        {/* Resource Cards Grid */}
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
          {resources.map((resource) => (
            <Card
              key={resource.path}
              className="glass hover:bg-white/10 transition-all cursor-pointer group"
              onClick={() => setLocation(resource.path)}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                    {resource.icon}
                  </div>
                  <ChevronRight className="w-5 h-5 text-purple-300 group-hover:text-emerald-400 transition-colors" />
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-xl text-white mb-2">
                  {resource.title}
                </CardTitle>
                <CardDescription className="text-purple-200 mb-3">
                  {resource.description}
                </CardDescription>
                {resource.count && (
                  <span className="text-sm text-emerald-400 font-medium">
                    {resource.count}
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
