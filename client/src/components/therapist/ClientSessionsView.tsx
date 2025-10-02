import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useClientSessions } from '@/hooks/use-client-sessions';
import { useClientStats } from '@/hooks/use-client-stats';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export function ClientSessionsView() {
  const { clientId } = useParams<{ clientId: string }>();
  const [, setLocation] = useLocation();
  const { data: sessions, isLoading: sessionsLoading } = useClientSessions(clientId);
  const { data: stats, isLoading: statsLoading } = useClientStats(clientId);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'summary' | 'transcript' | null>(null);
  const [modalContent, setModalContent] = useState<any>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const fetchSummary = async (sessionId: string) => {
    setModalLoading(true);
    setModalType('summary');
    setModalOpen(true);
    setModalContent(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `/api/therapist/client/${clientId}/session/${sessionId}/summary`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch summary');
      }

      const data = await response.json();
      setModalContent(data);
    } catch (error) {
      console.error('Error fetching summary:', error);
      setModalContent({ error: 'Failed to load summary' });
    } finally {
      setModalLoading(false);
    }
  };

  const fetchTranscript = async (sessionId: string) => {
    setModalLoading(true);
    setModalType('transcript');
    setModalOpen(true);
    setModalContent(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `/api/therapist/client/${clientId}/session/${sessionId}/transcript`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch transcript');
      }

      const data = await response.json();
      setModalContent(data);
    } catch (error) {
      console.error('Error fetching transcript:', error);
      setModalContent({ error: 'Failed to load transcript' });
    } finally {
      setModalLoading(false);
    }
  };

  if (sessionsLoading || statsLoading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!sessions || !stats) {
    return <div className="p-8">No data found</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <Button 
        variant="ghost" 
        onClick={() => setLocation('/dashboard')}
        className="mb-4"
        data-testid="button-back"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Clients
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-sessions">{stats.total_sessions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Minutes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-minutes">{stats.total_minutes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Length</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-average-length">{stats.average_session_length} min</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Last Session</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm" data-testid="text-last-session">{new Date(stats.last_session_date).toLocaleDateString()}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sessions.sessions.map((session, index) => (
              <div key={session.id} className="border rounded-lg p-4" data-testid={`card-session-${session.id}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">Session #{sessions.sessions.length - index}</h3>
                    <p className="text-sm text-muted-foreground">
                      {new Date(session.date).toLocaleDateString()} at {session.start_time}
                    </p>
                    <p className="text-sm mt-1">
                      Duration: {session.duration_minutes} minutes • Agent: {session.agent_name}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {session.has_summary && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => fetchSummary(session.id)}
                        data-testid={`button-summary-${session.id}`}
                      >
                        View Summary
                      </Button>
                    )}
                    {session.has_transcript && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => fetchTranscript(session.id)}
                        data-testid={`button-transcript-${session.id}`}
                      >
                        View Transcript
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modalType === 'summary' ? 'Session Summary' : 'Session Transcript'}
            </DialogTitle>
          </DialogHeader>
          
          {modalLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : modalContent?.error ? (
            <div className="p-4 text-red-500">{modalContent.error}</div>
          ) : modalContent ? (
            <div className="space-y-4">
              {modalType === 'summary' && (
                <div className="prose dark:prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap text-sm">
                    {JSON.stringify(modalContent, null, 2)}
                  </pre>
                </div>
              )}
              {modalType === 'transcript' && (
                <div className="space-y-2">
                  {modalContent.transcript ? (
                    <div className="prose dark:prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap text-sm">
                        {JSON.stringify(modalContent, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No transcript data available</p>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
