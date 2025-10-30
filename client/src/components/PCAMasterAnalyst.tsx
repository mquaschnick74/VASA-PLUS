// Location: client/src/components/PCAMasterAnalyst.tsx
// PCA Master Analyst component for triggering and viewing analysis

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Brain, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

interface PCAMasterAnalystProps {
  userId: string;
}

interface AnalysisResult {
  analysisId: string;
  currentCssStage: string;
  safetyAssessment: string;
  registerDominance: string;
  fullAnalysis?: string;
  therapeuticContext?: string;
}

export default function PCAMasterAnalyst({ userId }: PCAMasterAnalystProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [sessionCount, setSessionCount] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [showContext, setShowContext] = useState(false);

  const triggerAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      // Trigger analysis
      const response = await fetch('/api/analysis/pca-master', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sessionCount })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Analysis failed');
      }

      if (result.success && result.data) {
        // Fetch full analysis details
        const detailsResponse = await fetch(`/api/analysis/pca-master/${result.data.analysisId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (detailsResponse.ok) {
          const detailsData = await detailsResponse.json();
          setAnalysis({
            analysisId: result.data.analysisId,
            currentCssStage: result.data.currentCssStage,
            safetyAssessment: result.data.safetyAssessment,
            registerDominance: result.data.registerDominance,
            fullAnalysis: detailsData.data?.full_analysis,
            therapeuticContext: detailsData.data?.therapeutic_context
          });
        } else {
          setAnalysis(result.data);
        }
      }
    } catch (err: any) {
      console.error('Analysis failed:', err);
      setError(err.message || 'Failed to complete analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getStageBadgeColor = (stage: string) => {
    const stageLower = stage.toLowerCase();
    if (stageLower.includes('origin')) return 'bg-blue-500';
    if (stageLower.includes('bind')) return 'bg-purple-500';
    if (stageLower.includes('suspension')) return 'bg-yellow-500';
    if (stageLower.includes('gesture')) return 'bg-green-500';
    if (stageLower.includes('completion')) return 'bg-teal-500';
    if (stageLower.includes('terminal')) return 'bg-indigo-500';
    return 'bg-gray-500';
  };

  const getSafetyBadgeColor = (level: string) => {
    const levelLower = level.toLowerCase();
    if (levelLower.includes('low')) return 'bg-green-500';
    if (levelLower.includes('moderate')) return 'bg-yellow-500';
    if (levelLower.includes('high')) return 'bg-red-500';
    return 'bg-gray-500';
  };

  return (
    <Card className="glass">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <CardTitle>PCA Master Analysis</CardTitle>
        </div>
        <CardDescription>
          Get a comprehensive PsychoContextual Analysis of your recent sessions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Analysis Controls */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Sessions to analyze:</label>
              <select
                value={sessionCount}
                onChange={(e) => setSessionCount(Number(e.target.value))}
                disabled={isAnalyzing}
                className="border rounded px-3 py-1.5 bg-background text-sm"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'session' : 'sessions'}
                  </option>
                ))}
              </select>
            </div>

            <Button
              onClick={triggerAnalysis}
              disabled={isAnalyzing}
              className="w-full sm:w-auto"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="mr-2 h-4 w-4" />
                  Run Analysis
                </>
              )}
            </Button>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Analysis Results */}
          {analysis && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Analysis Complete</span>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    CSS Stage
                  </label>
                  <Badge className={`${getStageBadgeColor(analysis.currentCssStage)} text-white`}>
                    {analysis.currentCssStage}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Safety Assessment
                  </label>
                  <Badge className={`${getSafetyBadgeColor(analysis.safetyAssessment)} text-white`}>
                    {analysis.safetyAssessment}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Register Dominance
                  </label>
                  <Badge variant="outline">
                    {analysis.registerDominance}
                  </Badge>
                </div>
              </div>

              {/* Full Analysis */}
              {analysis.fullAnalysis && (
                <div className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowFullAnalysis(!showFullAnalysis)}
                    className="w-full flex items-center justify-between p-4 bg-muted hover:bg-muted/80 transition-colors"
                  >
                    <span className="font-semibold">View Comprehensive Analysis</span>
                    {showFullAnalysis ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </button>
                  {showFullAnalysis && (
                    <div className="p-4 bg-background">
                      <pre className="whitespace-pre-wrap text-sm text-foreground font-mono overflow-auto max-h-96">
                        {analysis.fullAnalysis}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Therapeutic Context */}
              {analysis.therapeuticContext && (
                <div className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowContext(!showContext)}
                    className="w-full flex items-center justify-between p-4 bg-muted hover:bg-muted/80 transition-colors"
                  >
                    <span className="font-semibold">View VASA Agent Context</span>
                    {showContext ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </button>
                  {showContext && (
                    <div className="p-4 bg-background">
                      <pre className="whitespace-pre-wrap text-sm text-foreground font-mono overflow-auto max-h-96">
                        {analysis.therapeuticContext}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Info Note */}
              <Alert>
                <AlertDescription className="text-xs">
                  This analysis has been stored and will be used to enhance your next therapeutic session.
                  The VASA agent will have access to these insights to provide more contextually informed support.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Help Text */}
          {!analysis && !error && (
            <div className="text-sm text-muted-foreground">
              <p>
                The PCA Master Analyst reviews your recent session transcripts and provides:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>Current CSS (Contextual Symbol Systems) stage assessment</li>
                <li>CVDC (Contextual-Value Dissonance Circulation) identification</li>
                <li>Perceptual structure analysis (Real/Symbolic/Imaginary registers)</li>
                <li>Safety assessment and therapeutic recommendations</li>
              </ul>
              <p className="mt-3 text-xs italic">
                Note: Analysis can take 30-60 seconds to complete.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
