// Location: client/src/pages/MeditationLibrary.tsx
// Meditation library page with audio players for guided meditations

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { ArrowLeft, Clock, User, Waves } from "lucide-react";
import Header from "@/components/shared/Header";

interface Meditation {
  id: string;
  title: string;
  description: string;
  instructor: string;
  duration: string;
  category: string;
  audioUrl: string;
}

export default function MeditationLibrary() {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState<string>("all");

  useEffect(() => {
    document.title = 'Meditation Library - iVASA';
  }, []);

  const meditations: Meditation[] = [
    {
      id: "campfire",
      title: "Campfire Meditation",
      description: "A soothing meditation by the warmth of a virtual campfire",
      instructor: "Mathew",
      duration: "10:00",
      category: "Relaxation",
      audioUrl: "/meditations/mathew/campfire_meditation.mp3"
    },
    {
      id: "ocean",
      title: "Ocean Waves",
      description: "Find peace with the gentle rhythm of ocean waves",
      instructor: "Sarah",
      duration: "12:00",
      category: "Nature",
      audioUrl: "/meditations/sarah/ocean_meditation.mp3"
    },
    {
      id: "forest",
      title: "Forest Walk",
      description: "A peaceful journey through a serene forest setting",
      instructor: "Sarah",
      duration: "15:00",
      category: "Nature",
      audioUrl: "/meditations/sarah/forest_meditation.mp3"
    },
    {
      id: "morning",
      title: "Morning Mindfulness",
      description: "Start your day with clarity and intention",
      instructor: "Mathew",
      duration: "8:00",
      category: "Mindfulness",
      audioUrl: "/meditations/mathew/morning_meditation.mp3"
    },
    {
      id: "evening",
      title: "Evening Wind Down",
      description: "Release the day's tension and prepare for restful sleep",
      instructor: "Mathew",
      duration: "12:00",
      category: "Relaxation",
      audioUrl: "/meditations/mathew/evening_meditation.mp3"
    },
    {
      id: "breath",
      title: "Breath Awareness",
      description: "Focus on your breath to center and calm your mind",
      instructor: "Mathew",
      duration: "10:00",
      category: "Mindfulness",
      audioUrl: "/meditations/mathew/breath_meditation.mp3"
    }
  ];

  const categories = ["all", ...Array.from(new Set(meditations.map(m => m.category)))];

  const filteredMeditations = activeCategory === "all"
    ? meditations
    : meditations.filter(m => m.category === activeCategory);

  return (
    <div className="min-h-screen gradient-bg">
      <Header showDashboardLink={true} />

      {/* Custom CSS for audio players */}
      <style>{`
        .meditation-audio {
          width: 100%;
          height: 40px;
          border-radius: 8px;
        }

        .meditation-audio::-webkit-media-controls-panel {
          background-color: rgba(16, 185, 129, 0.1);
          border-radius: 8px;
        }

        .meditation-audio::-webkit-media-controls-play-button {
          filter: sepia(1) saturate(5) hue-rotate(100deg);
        }

        .meditation-audio::-webkit-media-controls-current-time-display,
        .meditation-audio::-webkit-media-controls-time-remaining-display {
          color: #10B981;
        }

        .meditation-audio::-webkit-media-controls-timeline {
          filter: sepia(1) saturate(3) hue-rotate(100deg);
        }

        .meditation-audio::-webkit-media-controls-volume-slider {
          filter: sepia(1) saturate(3) hue-rotate(100deg);
        }
      `}</style>

      <div className="max-w-4xl mx-auto py-12 px-4">
        {/* Breadcrumb / Back Navigation */}
        <Button
          variant="ghost"
          onClick={() => setLocation('/learn-more')}
          className="mb-6 text-purple-200 hover:text-white hover:bg-emerald-500/10"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Learn More
        </Button>

        {/* Header Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <Waves className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">Meditation Library</h1>
          <p className="text-xl text-purple-200">
            Guided meditations for relaxation, mindfulness, and inner peace
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
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30"
                  : "bg-transparent border-white/20 text-purple-200 hover:bg-white/10 hover:border-white/30"
              }
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </Button>
          ))}
        </div>

        {/* Meditations Grid */}
        <div className="space-y-6">
          {filteredMeditations.map((meditation) => (
            <Card key={meditation.id} className="glass">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl text-white mb-1">
                      {meditation.title}
                    </CardTitle>
                    <p className="text-purple-200 text-sm">
                      {meditation.description}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 text-emerald-400 w-fit"
                  >
                    {meditation.category}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Audio Player */}
                <div className="mb-4">
                  <audio controls className="meditation-audio">
                    <source src={meditation.audioUrl} type="audio/mpeg" />
                    Your browser does not support the audio element.
                  </audio>
                </div>

                {/* Meta Information */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-purple-300">
                  <div className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {meditation.instructor}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {meditation.duration}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-purple-300 text-sm mb-4">
            New meditations added regularly
          </p>
          <Button
            variant="outline"
            onClick={() => setLocation('/learn-more')}
            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Learn More
          </Button>
        </div>
      </div>
    </div>
  );
}
