import { useParams, useLocation } from 'wouter';
import { useClientSessions } from '@/hooks/use-client-sessions';
import { useClientStats } from '@/hooks/use-client-stats';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';

export function ClientSessionsView() {
  const { clientId } = useParams<{ clientId: string }>();
  const [, setLocation] = useLocation();
  const { data: sessions, isLoading: sessionsLoading } = useClientSessions(clientId);
  const { data: stats, isLoading: statsLoading } = useClientStats(clientId);

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
            <div className="text-2xl font-bold">{stats.total_sessions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Minutes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_minutes}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Length</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.average_session_length} min</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Last Session</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">{new Date(stats.last_session_date).toLocaleDateString()}</div>
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
              <div key={session.id} className="border rounded-lg p-4">
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
                      <Button variant="outline" size="sm">
                        View Summary
                      </Button>
                    )}
                    {session.has_transcript && (
                      <Button variant="outline" size="sm">
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
    </div>
  );
}