// Location: client/src/pages/VideoLibrary.tsx
// Video library page with YouTube embedded videos

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { ArrowLeft, Clock, PlayCircle } from "lucide-react";
import Header from "@/components/shared/Header";
import SmartBackButton from "@/components/SmartBackButton";

interface VideoItem {
  youtubeId: string;
  title: string;
  description: string;
  category: string;
  duration: string;
}

export default function VideoLibrary() {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState<string>("all");

  useEffect(() => {
    document.title = 'Video Library - iVASA';
  }, []);

  // Placeholder video data - replace youtubeId with actual YouTube video IDs
  const videos: VideoItem[] = [
    {
      youtubeId: 'ZeXBf6YkDuk', // Replace with real YouTube ID
      title: 'Frictionless Account Creation',
      description: 'Learn how easy it is to create an account and other features of iVASA.',
      category: 'Getting Started',
      duration: '1:43'
    },
    {
      youtubeId: '9gPCGf9XPCo', // Replace with real YouTube ID
      title: 'Introduction to VASA',
      description: 'Learn the foundations of our therapeutic approach and how voice analysis can support your mental wellness journey.',
      category: 'Getting Started',
      duration: '1:21'
    },
    {
      youtubeId: 'VIDEO_ID_2', // Replace with real YouTube ID
      title: 'Understanding Your Inner Landscape',
      description: 'Explore the assessment framework and discover what your voice patterns reveal about your emotional state.',
      category: 'Education',
      duration: '15:45'
    },
    {
      youtubeId: 'Oc_TCQNyqO8', // Replace with real YouTube ID
      title: 'Guided Meditation Practice: Singing Bowl',
      description: 'A comprehensive 10-minute guided meditation session to help you develop a consistent mindfulness practice.',
      category: 'Practice',
      duration: '12:35'
    }
  ];

  const categories = ["all", ...Array.from(new Set(videos.map(v => v.category)))];

  const filteredVideos = activeCategory === "all"
    ? videos
    : videos.filter(v => v.category === activeCategory);

  return (
    <div className="min-h-screen gradient-bg">
      <Header showDashboardLink={true} />

      {/* Custom CSS for responsive video containers */}
      <style>{`
        .video-container {
          position: relative;
          padding-bottom: 56.25%; /* 16:9 aspect ratio */
          height: 0;
          overflow: hidden;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.3);
        }

        .video-container iframe {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: none;
          border-radius: 12px;
        }
      `}</style>

      <div className="max-w-5xl mx-auto py-12 px-4">
        {/* Smart Back Button - shows Dashboard or Resources based on auth */}
        <SmartBackButton className="mb-6 text-purple-200 hover:text-white hover:bg-purple-500/10" />

        {/* Header Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 mb-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
            <PlayCircle className="w-8 h-8 text-purple-400" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">Video Library</h1>
          <p className="text-xl text-purple-200">
            Educational videos and guided practice sessions
          </p>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {categories.map((category) => (
            <Button
              key={category}
              variant={activeCategory === category ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(category)}
              className={
                activeCategory === category
                  ? "bg-purple-500/20 border-purple-500/50 text-purple-400 hover:bg-purple-500/30"
                  : "bg-transparent border-white/20 text-purple-200 hover:bg-white/10 hover:border-white/30"
              }
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </Button>
          ))}
        </div>

        {/* Videos Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {filteredVideos.map((video, index) => (
            <Card key={index} className="glass overflow-hidden">
              <CardContent className="p-0">
                {/* Responsive YouTube Embed */}
                <div className="video-container">
                  <iframe
                    src={`https://www.youtube.com/embed/${video.youtubeId}`}
                    title={video.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                {/* Video Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-white">
                      {video.title}
                    </h3>
                  </div>

                  <p className="text-purple-200 text-sm mb-3 line-clamp-2">
                    {video.description}
                  </p>

                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className="border-purple-500/30 text-purple-400"
                    >
                      {video.category}
                    </Badge>
                    <div className="flex items-center gap-1 text-sm text-purple-300">
                      <Clock className="w-4 h-4" />
                      {video.duration}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredVideos.length === 0 && (
          <div className="text-center py-12">
            <p className="text-purple-300">No videos found in this category.</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-purple-300 text-sm mb-4">
            New videos added regularly
          </p>
        </div>
      </div>
    </div>
  );
}
