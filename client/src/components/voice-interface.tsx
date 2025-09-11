import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import useVapi from '@/hooks/use-vapi';
import AgentSelector from './AgentSelector';
import { DeleteAccount } from './DeleteAccount';
import { getAgentById } from '../config/agent-configs';

interface VoiceInterfaceProps {
  userId: string;
  setUserId: (id: string | null) => void;
}

interface UserContext {
  profile: any;
  memoryContext: string;
  verbalAcknowledgment?: string;
  sessions: any[];
  firstName: string;
  sessionCount: number;
}

export default function VoiceInterface({ userId, setUserId }: VoiceInterfaceProps) {
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState('sarah'); // Default to Sarah

  const selectedAgent = getAgentById(selectedAgentId);

  const {
    isSessionActive,
    isLoading,
    startSession,
    endSession,
    connectionStatus
  } = useVapi({
    userId,
    memoryContext: userContext?.memoryContext || '',
    firstName: userContext?.firstName || 'there',
    selectedAgent: selectedAgent!,
    verbalAcknowledgment: userContext?.verbalAcknowledgment
  });

  // Load memory context
  useEffect(() => {
    const loadUserContext = async () => {
      if (!userId) return;
      
      setMemoryLoading(true);
      try {
        const response = await fetch(`/api/auth/user-context/${userId}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setUserContext(data);
          console.log(`✅ Loaded ${data.sessionCount} previous sessions`);
          if (data.verbalAcknowledgment) {
            console.log(`💬 Verbal acknowledgment: ${data.verbalAcknowledgment}`);
          }
        }
      } catch (error) {
        console.error('Error loading user context:', error);
      } finally {
        setMemoryLoading(false);
      }
    };
    
    loadUserContext();
  }, [userId]);

  // Call timer effect
  useEffect(() => {
    if (isSessionActive) {
      const interval = setInterval(() => {
        setCallTimer(prev => prev + 1);
      }, 1000);
      setTimerInterval(interval);
    } else {
      if (timerInterval) {
        clearInterval(timerInterval);
        setTimerInterval(null);
      }
      setCallTimer(0);
    }

    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [isSessionActive]);

  const handleStartSession = () => {
    if (!memoryLoading && userContext && selectedAgent) {
      startSession();
    }
  };

  const handleSignOut = () => {
    setUserId(null);
    localStorage.removeItem('userId');
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (memoryLoading || !userContext) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your therapeutic space...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen gradient-bg">
      {/* Navigation Header */}
      <nav className="sticky top-0 z-50 glass-strong">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="flex items-center space-x-1 sm:space-x-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full glass flex items-center justify-center">
                  <i className="fas fa-microphone-alt text-accent text-sm sm:text-base"></i>
                </div>
                <span className="text-lg sm:text-xl font-semibold">VASA</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className="hidden sm:block glass rounded-full px-3 sm:px-4 py-1 sm:py-2">
                <span className="text-xs sm:text-sm text-muted-foreground">Welcome, {userContext.firstName}</span>
              </div>
              <DeleteAccount 
                userId={userId}
                userEmail={userContext.profile?.email}
                sessionCount={userContext.sessionCount}
                onAccountDeleted={() => {
                  setUserId(null);
                  window.location.href = '/';
                }}
              />
              <Button 
                onClick={handleSignOut}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full glass hover:glass-strong transition-all duration-200 p-0"
                data-testid="button-signOut"
              >
                <i className="fas fa-user text-muted-foreground text-sm sm:text-base"></i>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Dashboard Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          
          {/* Voice Assistant Interface - Main Column */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6 lg:space-y-8">
            
            {/* Agent Selection */}
            <AgentSelector 
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              disabled={isSessionActive || isLoading}
            />

            {/* Voice Call Interface */}
            <Card className="glass-strong rounded-2xl sm:rounded-3xl border-0">
              <CardContent className="p-4 sm:p-6 lg:p-8">
                <div className="text-center space-y-4 sm:space-y-6">
                  {/* Agent Avatar and Status */}
                  <div className="relative inline-block">
                    <div className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full shadow-lg border-4 border-${selectedAgent?.color || 'primary'}/30 bg-gradient-to-br from-${selectedAgent?.color || 'primary'}/20 to-${selectedAgent?.color || 'primary'}/10 flex items-center justify-center text-4xl sm:text-6xl`}>
                      {selectedAgent?.icon || '💜'}
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-6 h-6 sm:w-8 sm:h-8 bg-green-500 rounded-full border-4 border-background flex items-center justify-center">
                      <div className="w-2 h-2 sm:w-3 sm:h-3 bg-green-400 rounded-full animate-pulse"></div>
                    </div>
                  </div>

                  <div className="space-y-1 sm:space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-bold">{selectedAgent?.name || 'Sarah'}</h2>
                    <p className="text-sm sm:text-base text-muted-foreground px-4 sm:px-0">{selectedAgent?.description || 'Your Therapeutic Voice Assistant'}</p>
                    <div className="inline-flex items-center space-x-2 text-sm text-accent">
                      <div className={`w-2 h-2 rounded-full animate-pulse ${
                        isSessionActive ? 'bg-red-500' : 'bg-accent'
                      }`}></div>
                      <span data-testid="status-call">
                        {isSessionActive ? `Connected with ${selectedAgent?.name}` : 'Ready to chat'}
                      </span>
                    </div>
                  </div>

                  {/* Voice Call Controls */}
                  <div className="flex justify-center space-x-4 sm:space-x-6">
                    <Button
                      onClick={isSessionActive ? endSession : handleStartSession}
                      disabled={isLoading || memoryLoading}
                      className={`group relative w-16 h-16 sm:w-20 sm:h-20 rounded-full hover:shadow-xl transition-all duration-300 flex items-center justify-center ${
                        isSessionActive 
                          ? 'bg-gradient-to-r from-red-500 to-red-600 hover:shadow-red-500/25' 
                          : 'bg-gradient-to-r from-primary to-accent hover:shadow-primary/25'
                      }`}
                      data-testid="button-call"
                    >
                      <i className={`text-xl sm:text-2xl text-white group-hover:scale-110 transition-transform duration-200 ${
                        isSessionActive ? 'fas fa-phone-slash' : 'fas fa-phone'
                      }`}></i>
                    </Button>

                    <Button className="w-12 h-12 sm:w-16 sm:h-16 glass rounded-full hover:glass-strong transition-all duration-200 flex items-center justify-center group">
                      <i className="fas fa-microphone text-lg sm:text-xl text-muted-foreground group-hover:text-foreground transition-colors duration-200"></i>
                    </Button>

                    <Button className="w-12 h-12 sm:w-16 sm:h-16 glass rounded-full hover:glass-strong transition-all duration-200 flex items-center justify-center group">
                      <i className="fas fa-volume-up text-xl text-muted-foreground group-hover:text-foreground transition-colors duration-200"></i>
                    </Button>
                  </div>

                  {/* Call Duration Display */}
                  {isSessionActive && (
                    <Card className="glass rounded-xl border-0">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                          <span className="text-xl font-mono" data-testid="text-callTimer">
                            {formatTime(callTimer)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Live Conversation Transcript */}
            <Card className="glass rounded-xl sm:rounded-2xl border-0">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
                  <i className="fas fa-comments text-accent text-sm sm:text-base"></i>
                  <h3 className="text-lg sm:text-xl font-semibold">Live Conversation</h3>
                </div>
                
                <div className="space-y-4 max-h-80 overflow-y-auto" data-testid="transcript-container">
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-sm font-medium text-accent">Sarah</span>
                      <span className="text-xs text-muted-foreground">AI Therapist</span>
                    </div>
                    <p className="text-sm">Hello! I'm Sarah, your therapeutic voice assistant. How are you feeling today?</p>
                  </div>
                  
                  <div className="bg-primary/20 rounded-lg p-3 ml-8">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="text-sm font-medium text-primary-foreground">You</span>
                    </div>
                    <p className="text-sm text-muted-foreground italic">Start a conversation to see live transcription here...</p>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Real-time transcription enabled</span>
                    <span className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>Active</span>
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Session History and Insights */}
          <div className="space-y-4 sm:space-y-6">
            
            {/* Session Stats */}
            <Card className="glass rounded-xl sm:rounded-2xl border-0">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center space-x-2">
                  <i className="fas fa-chart-bar text-accent text-sm sm:text-base"></i>
                  <span>Your Progress</span>
                </h3>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Sessions</span>
                    <span className="text-2xl font-bold text-accent" data-testid="text-sessionCount">
                      {userContext.sessionCount}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">This Week</span>
                    <span className="text-lg font-semibold">
                      {userContext.sessions.filter(s => {
                        const sessionDate = new Date(s.created_at);
                        const weekAgo = new Date();
                        weekAgo.setDate(weekAgo.getDate() - 7);
                        return sessionDate > weekAgo;
                      }).length}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Average Duration</span>
                    <span className="text-lg font-semibold">
                      {userContext.sessions.length > 0 
                        ? Math.round(userContext.sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0) / userContext.sessions.length / 60)
                        : 0} min
                    </span>
                  </div>
                  
                  <div className="w-full bg-muted rounded-full h-2 mt-4">
                    <div className="bg-gradient-to-r from-primary to-accent h-2 rounded-full w-3/4"></div>
                  </div>
                  <p className="text-xs text-muted-foreground">Weekly goal: 4 sessions</p>
                </div>
              </CardContent>
            </Card>

            {/* Memory Context */}
            <Card className="glass rounded-xl sm:rounded-2xl border-0">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center space-x-2">
                  <i className="fas fa-brain text-accent text-sm sm:text-base"></i>
                  <span>Session Memory</span>
                </h3>
                
                <div className="space-y-3">
                  {userContext.memoryContext.split('\n').filter(line => line.trim()).map((line, index) => (
                    <div key={index} className="bg-secondary/30 rounded-lg p-3">
                      <p className="text-sm">{line}</p>
                    </div>
                  ))}
                </div>
                
                <Button variant="ghost" className="mt-4 text-sm text-accent hover:text-accent/80 transition-colors duration-200 p-0">
                  View full session history →
                </Button>
              </CardContent>
            </Card>

            {/* Recent Sessions */}
            <Card className="glass rounded-xl sm:rounded-2xl border-0">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center space-x-2">
                  <i className="fas fa-history text-accent text-sm sm:text-base"></i>
                  <span>Recent Sessions</span>
                </h3>
                
                <div className="space-y-3">
                  {userContext.sessions.slice(0, 3).map((session, index) => (
                    <div key={session.id} className="flex items-center justify-between py-2 border-b border-border/50">
                      <div>
                        <p className="text-sm font-medium">
                          {new Date(session.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {session.duration_seconds ? Math.floor(session.duration_seconds / 60) : 0} minutes
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      </div>
                    </div>
                  ))}
                  
                  {userContext.sessions.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No sessions yet. Start your first conversation with Sarah!
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
