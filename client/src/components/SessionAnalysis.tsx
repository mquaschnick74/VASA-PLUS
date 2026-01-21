// client/src/components/SessionAnalysis.tsx
// Session Analysis component with multiple analysis types

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  FileText,
  MessageSquare,
  Lightbulb,
  Brain,
  AlertCircle,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronUp,
  History,
  Trash2,
  Eye
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getApiUrl } from '@/lib/platform';
import ReactMarkdown from 'react-markdown';

interface SessionAnalysisProps {
  userId: string;
}

type AnalysisType = 'session_summary' | 'intent_analysis' | 'concept_insights' | 'pca_master';

interface AnalysisTypeOption {
  value: AnalysisType;
  label: string;
  description: string;
  icon: React.ReactNode;
  sessionMode: 'count' | 'single';  // count = 1-5 recent, single = pick one
}

interface SessionOption {
  callId: string;
  date: string;
  agentName: string;
  durationMinutes: number;
}

interface AnalysisResult {
  analysisId: string;
  analysisType: AnalysisType;
  content?: string;
  message?: string;
  createdAt?: string;
}

interface HistoryItem {
  id: string;
  analysisType: AnalysisType;
  sessionCount: number;
  content: string;
  createdAt: string;
}

const ANALYSIS_TYPES: AnalysisTypeOption[] = [
  {
    value: 'session_summary',
    label: 'Session Summary',
    description: 'Clinical-style summary of your recent sessions',
    icon: <FileText className="h-4 w-4" />,
    sessionMode: 'count'
  },
  {
    value: 'intent_analysis',
    label: 'Intent Analysis',
    description: 'Understand the communication dynamics of a session',
    icon: <MessageSquare className="h-4 w-4" />,
    sessionMode: 'single'
  },
  {
    value: 'concept_insights',
    label: 'Concept Insights',
    description: 'Extract the key concept or mental model from a session',
    icon: <Lightbulb className="h-4 w-4" />,
    sessionMode: 'single'
  },
  {
    value: 'pca_master',
    label: 'Advanced Analysis',
    description: 'Enhance future sessions with deep pattern analysis',
    icon: <Brain className="h-4 w-4" />,
    sessionMode: 'count'
  }
];

export default function SessionAnalysis({ userId }: SessionAnalysisProps) {
  // State
  const [selectedType, setSelectedType] = useState<AnalysisType>('session_summary');
  const [sessionCount, setSessionCount] = useState(3);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [availableSessions, setAvailableSessions] = useState<SessionOption[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showContent, setShowContent] = useState(true);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [viewingHistoryItem, setViewingHistoryItem] = useState<HistoryItem | null>(null);

  // Get current type config
  const currentTypeConfig = ANALYSIS_TYPES.find(t => t.value === selectedType)!;

  // Load available sessions when type changes to single-session mode
  useEffect(() => {
    if (currentTypeConfig.sessionMode === 'single') {
      loadAvailableSessions();
    }
  }, [selectedType]);

  const loadAvailableSessions = async () => {
    setIsLoadingSessions(true);
    setError(null);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(getApiUrl('/api/analysis/sessions'), {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to load sessions');
      }

      const data = await response.json();
      setAvailableSessions(data.data || []);

      // Auto-select first session if available
      if (data.data?.length > 0 && !selectedSessionId) {
        setSelectedSessionId(data.data[0].callId);
      }
    } catch (err: any) {
      console.error('Error loading sessions:', err);
      setError('Unable to load sessions. Please try again.');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const loadHistory = async () => {
    setIsLoadingHistory(true);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(getApiUrl('/api/analysis/history?limit=20'), {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to load history');
      }

      const data = await response.json();
      setHistory(data.data || []);
    } catch (err: any) {
      console.error('Error loading history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const deleteHistoryItem = async (analysisId: string) => {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;

      const response = await fetch(`/api/analysis/${analysisId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setHistory(prev => prev.filter(item => item.id !== analysisId));
        if (viewingHistoryItem?.id === analysisId) {
          setViewingHistoryItem(null);
        }
      }
    } catch (err) {
      console.error('Error deleting analysis:', err);
    }
  };

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Build request body based on analysis type
      const body: any = {
        analysisType: selectedType
      };

      if (currentTypeConfig.sessionMode === 'single') {
        if (!selectedSessionId) {
          throw new Error('Please select a session to analyze');
        }
        body.sessionIds = [selectedSessionId];
      } else {
        body.sessionCount = sessionCount;
      }

      const response = await fetch(getApiUrl('/api/analysis/run'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Analysis failed');
      }

      setResult({
        analysisId: data.data.analysisId,
        analysisType: selectedType,
        content: data.data.content,
        message: data.data.message,
        createdAt: new Date().toISOString()
      });

      // Reload history if it's open
      if (showHistory) {
        loadHistory();
      }

    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.message || 'Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatSessionDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getIconForType = (type: AnalysisType) => {
    const config = ANALYSIS_TYPES.find(t => t.value === type);
    return config?.icon || <FileText className="h-4 w-4" />;
  };

  return (
    <Card className="glass">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle>Session Analysis</CardTitle>
        </div>
        <CardDescription>
          Get insights from your therapeutic sessions
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Analysis Type Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Analysis Type</label>
          <Select
            value={selectedType}
            onValueChange={(value) => {
              setSelectedType(value as AnalysisType);
              setResult(null);  // Clear previous results
              setError(null);
            }}
            disabled={isAnalyzing}
          >
            <SelectTrigger className="w-full bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100">
              <SelectValue>
                <div className="flex items-center gap-2">
                  {getIconForType(selectedType)}
                  <span>{ANALYSIS_TYPES.find(t => t.value === selectedType)?.label}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700">
              {ANALYSIS_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value} className="text-zinc-900 dark:text-zinc-100 focus:bg-zinc-100 dark:focus:bg-zinc-800">
                  <div className="flex items-center gap-2">
                    {type.icon}
                    <div>
                      <div className="font-medium">{type.label}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">{type.description}</div>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Session Selection - Conditional based on type */}
        {currentTypeConfig.sessionMode === 'count' ? (
          // Session Count Selector (for summary, pca_master)
          <div className="space-y-2">
            <label className="text-sm font-medium">Sessions to analyze</label>
            <Select
              value={sessionCount.toString()}
              onValueChange={(value) => setSessionCount(parseInt(value))}
              disabled={isAnalyzing}
            >
              <SelectTrigger className="w-full bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700">
                {[1, 2, 3, 4, 5].map((n) => (
                  <SelectItem key={n} value={n.toString()} className="text-zinc-900 dark:text-zinc-100 focus:bg-zinc-100 dark:focus:bg-zinc-800">
                    {n} {n === 1 ? 'session' : 'sessions'} (most recent)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          // Single Session Selector (for intent, concept)
          <div className="space-y-2">
            <label className="text-sm font-medium">Select session</label>
            {isLoadingSessions ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 border rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading sessions...
              </div>
            ) : availableSessions.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No sessions available for analysis. Complete a session first.
                </AlertDescription>
              </Alert>
            ) : (
              <Select
                value={selectedSessionId}
                onValueChange={setSelectedSessionId}
                disabled={isAnalyzing}
              >
                <SelectTrigger className="w-full bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100">
                  <SelectValue placeholder="Select a session..." />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700">
                  {availableSessions.map((session) => (
                    <SelectItem key={session.callId} value={session.callId} className="text-zinc-900 dark:text-zinc-100 focus:bg-zinc-100 dark:focus:bg-zinc-800">
                      <div className="flex items-center justify-between gap-4">
                        <span>{formatSessionDate(session.date)}</span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {session.agentName} - {session.durationMinutes} min
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Saved Notice - analyses are now persistent */}
        {selectedType !== 'pca_master' && (
          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
              <strong>Note:</strong> Your analysis will be saved and accessible in your history.
            </AlertDescription>
          </Alert>
        )}

        {/* PCA Master IP Notice */}
        {selectedType === 'pca_master' && (
          <Alert className="bg-violet-50 dark:bg-violet-950 border-violet-300 dark:border-violet-700">
            <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <AlertDescription className="text-violet-800 dark:text-violet-200 text-sm">
              <strong>Proprietary Analysis:</strong> This uses our advanced therapeutic
              framework to enhance your future sessions. Results are processed internally
              and improve your AI companion's understanding. The analysis is not displayed
              due to intellectual property considerations.
            </AlertDescription>
          </Alert>
        )}

        {/* Run Button */}
        <Button
          onClick={runAnalysis}
          disabled={isAnalyzing || (currentTypeConfig.sessionMode === 'single' && !selectedSessionId)}
          className="w-full"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              {currentTypeConfig.icon}
              <span className="ml-2">Run {currentTypeConfig.label}</span>
            </>
          )}
        </Button>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results Display */}
        {result && (
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Analysis Complete</span>
              </div>
              {result.createdAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(result.createdAt).toLocaleString()}
                </span>
              )}
            </div>

            {/* Content for user-visible types - HIGH CONTRAST */}
            {result.content && (
              <div className="border-2 border-zinc-300 dark:border-zinc-600 rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowContent(!showContent)}
                  className="w-full flex items-center justify-between p-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-zinc-900 dark:text-zinc-100"
                >
                  <span className="font-semibold">View Analysis</span>
                  {showContent ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </button>
                {showContent && (
                  <div className="p-6 bg-white dark:bg-zinc-900">
                    <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:text-zinc-900 dark:prose-headings:text-zinc-100 prose-p:text-zinc-700 dark:prose-p:text-zinc-300 prose-li:text-zinc-700 dark:prose-li:text-zinc-300 prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100">
                      <ReactMarkdown>{result.content}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Confirmation message for pca_master */}
            {result.message && !result.content && (
              <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  {result.message}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Help Text - Show when no analysis has been run */}
        {!result && !error && !isAnalyzing && !viewingHistoryItem && (
          <div className="text-sm text-muted-foreground pt-2">
            <p className="font-medium mb-2">Analysis Types:</p>
            <ul className="space-y-1 ml-2">
              <li><strong>Session Summary:</strong> Clinical-style notes from your sessions</li>
              <li><strong>Intent Analysis:</strong> Communication dynamics and patterns</li>
              <li><strong>Concept Insights:</strong> Key mental models and takeaways</li>
              <li><strong>Advanced Analysis:</strong> Deep pattern analysis (enhances future sessions)</li>
            </ul>
          </div>
        )}

        {/* History Section */}
        <div className="border-t pt-4 mt-4">
          <button
            onClick={() => {
              setShowHistory(!showHistory);
              if (!showHistory && history.length === 0) {
                loadHistory();
              }
            }}
            className="flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <History className="h-4 w-4" />
            <span>Analysis History</span>
            {showHistory ? (
              <ChevronUp className="h-4 w-4 ml-auto" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-auto" />
            )}
          </button>

          {showHistory && (
            <div className="mt-4 space-y-3">
              {isLoadingHistory ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading history...
                </div>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3">
                  No analyses yet. Run an analysis to see it here.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700"
                    >
                      <div className="flex items-center gap-3">
                        {getIconForType(item.analysisType)}
                        <div>
                          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {ANALYSIS_TYPES.find(t => t.value === item.analysisType)?.label || item.analysisType}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {new Date(item.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                            {' · '}
                            {item.sessionCount} session{item.sessionCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {item.analysisType !== 'pca_master' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingHistoryItem(item)}
                            className="h-8 w-8 p-0"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteHistoryItem(item.id)}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Viewing History Item */}
        {viewingHistoryItem && (
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {getIconForType(viewingHistoryItem.analysisType)}
                <span className="font-medium">
                  {ANALYSIS_TYPES.find(t => t.value === viewingHistoryItem.analysisType)?.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(viewingHistoryItem.createdAt).toLocaleDateString()}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewingHistoryItem(null)}
              >
                Close
              </Button>
            </div>
            <div className="border-2 border-zinc-300 dark:border-zinc-600 rounded-lg p-6 bg-white dark:bg-zinc-900">
              <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:text-zinc-900 dark:prose-headings:text-zinc-100 prose-p:text-zinc-700 dark:prose-p:text-zinc-300 prose-li:text-zinc-700 dark:prose-li:text-zinc-300 prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100">
                <ReactMarkdown>{viewingHistoryItem.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
