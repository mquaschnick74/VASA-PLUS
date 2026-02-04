// client/src/components/UserContentPanel.tsx
// Panel for users to upload documents and submit notes between sessions

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  Upload,
  StickyNote,
  Loader2,
  CheckCircle,
  AlertCircle,
  Trash2,
  Clock,
  FileUp,
  X
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { getApiUrl } from '@/lib/platform';

interface UserContentPanelProps {
  userId: string;
}

interface ContentItem {
  id: string;
  title: string;
  content_type: 'note' | 'document';
  source: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed' | 'analyzing';
  chunk_count: number;
  created_at: string;
  original_filename?: string;
  processing_error?: string;
  analysis_mode?: 'analyze' | 'record';
}

type AnalysisMode = 'analyze' | 'record';

export default function UserContentPanel({ userId }: UserContentPanelProps) {
  // Panel state
  const [isExpanded, setIsExpanded] = useState(false);

  // Content list state
  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [contentCount, setContentCount] = useState(0);
  const CONTENT_LIMIT = 20;

  // Note form state
  const [noteText, setNoteText] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSuccess, setNoteSuccess] = useState(false);
  const NOTE_MAX_LENGTH = 10000;

  // File upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Analysis mode state - 'analyze' triggers PCA analysis, 'record' just stores content
  const [noteAnalysisMode, setNoteAnalysisMode] = useState<AnalysisMode>('analyze');
  const [fileAnalysisMode, setFileAnalysisMode] = useState<AnalysisMode>('record');

  // Polling for processing status
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Track analysis start time for extended processing message
  const [analysisStartTime, setAnalysisStartTime] = useState<number | null>(null);
  const [showExtendedMessage, setShowExtendedMessage] = useState(false);

  // Load content list when panel is expanded
  useEffect(() => {
    if (isExpanded) {
      loadContentList();
    }
  }, [isExpanded]);

  // Start polling when there are pending/processing/analyzing items
  useEffect(() => {
    const hasPendingItems = contentList.some(
      item => item.processing_status === 'pending' ||
              item.processing_status === 'processing' ||
              item.processing_status === 'analyzing'
    );

    const hasAnalyzingItems = contentList.some(
      item => item.processing_status === 'analyzing'
    );

    // Track when analysis starts for extended message
    if (hasAnalyzingItems && !analysisStartTime) {
      setAnalysisStartTime(Date.now());
      setShowExtendedMessage(false);
    } else if (!hasAnalyzingItems && analysisStartTime) {
      setAnalysisStartTime(null);
      setShowExtendedMessage(false);
    }

    if (hasPendingItems && isExpanded) {
      pollingRef.current = setInterval(() => {
        loadContentList(true); // silent refresh
      }, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [contentList, isExpanded, analysisStartTime]);

  // Show extended message after 15 seconds of analysis
  useEffect(() => {
    if (analysisStartTime && !showExtendedMessage) {
      const timer = setTimeout(() => {
        setShowExtendedMessage(true);
      }, 15000);
      return () => clearTimeout(timer);
    }
  }, [analysisStartTime, showExtendedMessage]);

  const loadContentList = async (silent = false) => {
    if (!silent) setIsLoadingList(true);
    setListError(null);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(getApiUrl('/api/content/list'), {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to load content');
      }

      const data = await response.json();
      setContentList(data.items || []);
      setContentCount(data.count || 0);
    } catch (err: any) {
      if (!silent) {
        setListError(err.message || 'Failed to load content');
      }
    } finally {
      if (!silent) setIsLoadingList(false);
    }
  };

  const submitNote = async () => {
    if (!noteText.trim()) return;

    setIsSubmittingNote(true);
    setNoteError(null);
    setNoteSuccess(false);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(getApiUrl('/api/content/note'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({
          text: noteText.trim(),
          title: noteTitle.trim() || undefined,
          analysisMode: noteAnalysisMode
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to save note');
      }

      setNoteSuccess(true);
      setNoteText('');
      setNoteTitle('');
      loadContentList();

      // Clear success message after 3 seconds
      setTimeout(() => setNoteSuccess(false), 3000);
    } catch (err: any) {
      setNoteError(err.message || 'Failed to save note');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (500KB)
      if (file.size > 500 * 1024) {
        setUploadError('File too large. Maximum size is 500KB.');
        return;
      }

      // Validate file type
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['txt', 'md', 'json', 'docx'].includes(ext || '')) {
        setUploadError('File type not supported. Allowed: .txt, .md, .json, .docx');
        return;
      }

      setSelectedFile(file);
      setUploadError(null);
    }
  };

  const uploadFile = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('analysisMode', fileAnalysisMode);

      const response = await fetch(getApiUrl('/api/content/upload'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to upload file');
      }

      setUploadSuccess(true);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      loadContentList();

      // Clear success message after 3 seconds
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const deleteContent = async (contentId: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) {
      return;
    }

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(getApiUrl(`/api/content/${contentId}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to delete');
      }

      loadContentList();
    } catch (err: any) {
      console.error('Delete error:', err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-900/30 text-yellow-400">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-900/30 text-blue-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing
          </span>
        );
      case 'analyzing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-900/30 text-purple-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Analyzing
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-900/30 text-green-400">
            <CheckCircle className="w-3 h-3" />
            Ready
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-900/30 text-red-400">
            <AlertCircle className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  // Analysis mode toggle component
  const AnalysisModeToggle = ({
    value,
    onChange,
    disabled = false
  }: {
    value: AnalysisMode;
    onChange: (mode: AnalysisMode) => void;
    disabled?: boolean;
  }) => (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-zinc-400">How should VASA use this content?</div>
      <div className="flex rounded-lg overflow-hidden border border-zinc-600 bg-zinc-800/50">
        <button
          type="button"
          onClick={() => onChange('analyze')}
          disabled={disabled}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-all ${
            value === 'analyze'
              ? 'bg-purple-600/80 text-white'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex flex-col items-center gap-0.5">
            <span>Analyze</span>
            <span className="text-[10px] opacity-70 font-normal">Discuss in session</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChange('record')}
          disabled={disabled}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-all ${
            value === 'record'
              ? 'bg-emerald-600/80 text-white'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex flex-col items-center gap-0.5">
            <span>Add to Record</span>
            <span className="text-[10px] opacity-70 font-normal">Background info</span>
          </div>
        </button>
      </div>
    </div>
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });

  // Check if there are items being analyzed
  const hasAnalyzingItems = contentList.some(item => item.processing_status === 'analyzing');

  // Processing indicator component with glassmorphic animation
  const AnalysisIndicator = () => {
    if (!hasAnalyzingItems) return null;

    return (
      <div className="relative overflow-hidden rounded-lg border border-purple-500/30 bg-purple-900/10 p-4">
        {/* Animated gradient background */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(147, 51, 234, 0.3), transparent)',
            animation: 'shimmer 2s infinite'
          }}
        />
        <style>{`
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 10px rgba(147, 51, 234, 0.3); }
            50% { box-shadow: 0 0 20px rgba(147, 51, 234, 0.5); }
          }
        `}</style>

        <div className="relative flex items-center gap-3">
          {/* Pulsing orb */}
          <div
            className="w-3 h-3 rounded-full bg-purple-500"
            style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}
          />

          <div className="flex-1">
            <p className="text-sm text-purple-200 font-medium">
              Preparing your content for your next session...
            </p>
            {showExtendedMessage && (
              <p className="text-xs text-purple-300/70 mt-1">
                This is taking a moment — we're being thorough.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="glass">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-emerald-500" />
            <CardTitle>My Notes & Documents</CardTitle>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        {!isExpanded && (
          <CardDescription>
            Share content that helps your VASA agent understand you better
          </CardDescription>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6">
          {/* Privacy Disclaimer */}
          <Alert className="bg-emerald-900/20 border-emerald-800">
            <FileText className="h-4 w-4 text-emerald-400" />
            <AlertDescription className="text-emerald-200 text-sm">
              Content you share here becomes part of your therapeutic record and will be
              accessible to your VASA agent during sessions.
            </AlertDescription>
          </Alert>

          {/* Content Count */}
          <div className="text-sm text-muted-foreground">
            {contentCount} / {CONTENT_LIMIT} items used
          </div>

          {/* Quick Note Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <StickyNote className="h-4 w-4" />
              Quick Note
            </h3>
            <input
              type="text"
              placeholder="Title (optional)"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-800 border-zinc-600 text-zinc-100 placeholder:text-zinc-400"
              disabled={isSubmittingNote || contentCount >= CONTENT_LIMIT}
            />
            <textarea
              placeholder="Share thoughts, reflections, or anything you'd like your VASA agent to know..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm border rounded-lg bg-zinc-800 border-zinc-600 text-zinc-100 placeholder:text-zinc-400 resize-none"
              disabled={isSubmittingNote || contentCount >= CONTENT_LIMIT}
              maxLength={NOTE_MAX_LENGTH}
            />
            <AnalysisModeToggle
              value={noteAnalysisMode}
              onChange={setNoteAnalysisMode}
              disabled={isSubmittingNote || contentCount >= CONTENT_LIMIT}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {noteText.length.toLocaleString()} / {NOTE_MAX_LENGTH.toLocaleString()} characters
              </span>
              <Button
                size="sm"
                onClick={submitNote}
                disabled={!noteText.trim() || isSubmittingNote || contentCount >= CONTENT_LIMIT}
              >
                {isSubmittingNote ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <StickyNote className="w-4 h-4 mr-2" />
                    Save Note
                  </>
                )}
              </Button>
            </div>
            {noteError && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{noteError}</AlertDescription>
              </Alert>
            )}
            {noteSuccess && (
              <Alert className="py-2 bg-green-900/20 border-green-800">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-200">
                  Note saved! It will be available in your next session.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* File Upload Section */}
          <div className="space-y-3 pt-4 border-t border-zinc-700">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Document
            </h3>
            <div className="text-xs text-muted-foreground">
              Supported: .txt, .md, .json (ChatGPT export), .docx | Max 500KB
            </div>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json,.docx"
                onChange={handleFileSelect}
                className="hidden"
                disabled={isUploading || contentCount >= CONTENT_LIMIT}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || contentCount >= CONTENT_LIMIT}
              >
                <FileUp className="w-4 h-4 mr-2" />
                Choose File
              </Button>
              {selectedFile && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-lg">
                  <FileText className="w-4 h-4 text-zinc-300" />
                  <span className="text-sm truncate max-w-[200px] text-zinc-100">{selectedFile.name}</span>
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-zinc-400 hover:text-zinc-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            {selectedFile && (
              <>
                <AnalysisModeToggle
                  value={fileAnalysisMode}
                  onChange={setFileAnalysisMode}
                  disabled={isUploading}
                />
                <Button
                  size="sm"
                  onClick={uploadFile}
                  disabled={isUploading}
                  className="w-full"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload {selectedFile.name}
                    </>
                  )}
                </Button>
              </>
            )}
            {uploadError && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}
            {uploadSuccess && (
              <Alert className="py-2 bg-green-900/20 border-green-800">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-200">
                  Document uploaded! Processing will complete shortly.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Content List */}
          <div className="space-y-3 pt-4 border-t border-zinc-700">
            <h3 className="text-sm font-medium text-zinc-100">Your Content</h3>
            {isLoadingList ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400 py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </div>
            ) : listError ? (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{listError}</AlertDescription>
              </Alert>
            ) : contentList.length === 0 ? (
              <p className="text-sm text-zinc-400 py-4">
                No content yet. Add a note or upload a document to get started.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {contentList.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-700"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.content_type === 'note' ? (
                        <StickyNote className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                      ) : (
                        <FileText className="w-4 h-4 flex-shrink-0 text-blue-500" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-100 truncate">
                          {item.title || item.original_filename || 'Untitled'}
                        </div>
                        <div className="text-xs text-zinc-400">
                          {formatDate(item.created_at)}
                          {item.processing_status === 'completed' && item.chunk_count > 0 && (
                            <span> · {item.chunk_count} chunks</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {getStatusBadge(item.processing_status)}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteContent(item.id, item.title || 'this item')}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Limit Warning */}
          {contentCount >= CONTENT_LIMIT && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You've reached the limit of {CONTENT_LIMIT} items. Delete some content to add more.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      )}
    </Card>
  );
}
