import { useState } from 'react';
import AssessmentIframe from '@/components/AssessmentIframe';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';

export default function AssessmentEmbed() {
  const [, setLocation] = useLocation();
  const [assessmentData, setAssessmentData] = useState<any>(null);

  const handleAssessmentComplete = (data: any) => {
    console.log('Assessment completed with data:', data);
    setAssessmentData(data);

    // You can also make an API call here to save the assessment
    // results to your database if needed
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/dashboard')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
              <h1 className="text-xl font-semibold">Inner Landscape Assessment</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Introduction Card */}
          <Card className="p-6">
            <h2 className="text-2xl font-bold mb-4">Discover Your Therapeutic Pattern</h2>
            <p className="text-muted-foreground mb-4">
              This 5-question assessment will help identify your unique inner landscape and provide 
              personalized therapeutic insights based on Pure Contextual Perception (PCP) methodology.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                <span>Takes 90 seconds</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                <span>Completely confidential</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-primary">✓</span>
                <span>Instant results</span>
              </div>
            </div>
          </Card>

          {/* Assessment Iframe */}
          <AssessmentIframe 
            onComplete={handleAssessmentComplete}
            className="rounded-lg overflow-hidden shadow-lg"
          />

          {/* Debug Info (only in development) */}
          {assessmentData && process.env.NODE_ENV === 'development' && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2">Debug: Assessment Data Received</h3>
              <pre className="text-xs bg-muted p-4 rounded overflow-auto">
                {JSON.stringify(assessmentData, null, 2)}
              </pre>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}