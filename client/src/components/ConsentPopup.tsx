// Location: client/src/components/ConsentPopup.tsx
// Consent popup for first-time sign-in acknowledgment

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { getApiUrl } from '@/lib/platform';

interface ConsentPopupProps {
  userId: string;
  userEmail: string;
  userType?: string;
  onConsentAccepted: () => void;
}

export default function ConsentPopup({ userId, userEmail, userType = 'individual', onConsentAccepted }: ConsentPopupProps) {
  const [aiLimitationsChecked, setAiLimitationsChecked] = useState(false);
  const [dataSecurityChecked, setDataSecurityChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    if (!aiLimitationsChecked || !dataSecurityChecked) {
      setError('Please acknowledge both sections before continuing');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(getApiUrl('/api/auth/accept-consent'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        body: JSON.stringify({ userId })
      });

      if (!response.ok) {
        throw new Error('Failed to record consent');
      }

      onConsentAccepted();
    } catch (err) {
      console.error('Error accepting consent:', err);
      setError('Failed to save consent. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <Card className="glass max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-2xl border-0">
        <CardContent className="p-8">
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold">Welcome to VASA</h2>
              <p className="text-muted-foreground">
                Before we begin, please review and acknowledge the following information
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-500 text-sm">
                {error}
              </div>
            )}

            {/* AI Limitations Section */}
            <div className="space-y-4 border border-border/50 rounded-xl p-6 bg-background/30">
              <div className="flex items-start gap-3">
                <i className="fas fa-robot text-primary text-xl mt-1"></i>
                <div className="flex-1 space-y-3">
                  <h3 className="font-semibold text-lg">AI Therapy Limitations</h3>

                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      <strong className="text-foreground">VASA is an AI assistant, not a replacement for professional therapy.</strong> This platform provides therapeutic conversation and support, but it cannot replace the expertise of a licensed mental health professional.
                    </p>

                    <p>
                      <strong className="text-foreground">Not for crisis situations:</strong> If you are experiencing a mental health crisis, thoughts of self-harm, or suicidal ideation, please contact emergency services immediately:
                    </p>

                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 space-y-1">
                      <p className="font-semibold text-foreground">Crisis Resources:</p>
                      <p>• <strong>988</strong> - Suicide & Crisis Lifeline</p>
                      <p>• <strong>911</strong> - Emergency Services</p>
                      <p>• <strong>741741</strong> - Crisis Text Line (text "HELLO")</p>
                    </div>

                    <p>
                      VASA should complement, not replace, care from licensed professionals. Clinical decisions should be made with qualified healthcare providers.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Checkbox 
                  id="ai-limitations" 
                  checked={aiLimitationsChecked}
                  onCheckedChange={(checked) => setAiLimitationsChecked(checked as boolean)}
                />
                <label
                  htmlFor="ai-limitations"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  I understand the limitations of AI therapy and when to seek professional help
                </label>
              </div>
            </div>

            {/* Data Security Section */}
            <div className="space-y-4 border border-border/50 rounded-xl p-6 bg-background/30">
              <div className="flex items-start gap-3">
                <i className="fas fa-shield-halved text-primary text-xl mt-1"></i>
                <div className="flex-1 space-y-3">
                  <h3 className="font-semibold text-lg">Data Security & Privacy</h3>

                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      <strong className="text-foreground">Your conversations are stored securely.</strong> We take your privacy seriously and implement industry-standard security measures:
                    </p>

                    {userType === 'client' ? (
                      <>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>All data is encrypted in transit and at rest</li>
                          <li>Conversations are used only for therapeutic purposes</li>
                          <li>We do not share your data with third parties without consent</li>
                          <li>Your assigned therapist has read access to your session summaries, transcripts, and therapeutic patterns</li>
                          <li>You may request disconnection from your therapist at any time by speaking with them directly</li>
                        </ul>

                        <p>
                          <strong className="text-foreground">Clinical record retention:</strong> If your therapeutic relationship ends, your therapist retains a read-only archive of session records from the period of your relationship, consistent with clinical record-keeping requirements. This archived data remains part of your therapist's clinical record and is not affected by subsequent changes to your account.
                        </p>

                        <p>
                          <strong className="text-foreground">Your rights:</strong> You retain full access to your own session history. To end your therapeutic relationship, speak with your therapist directly. Once disconnected, you become an individual user with independent account management.
                        </p>
                      </>
                    ) : userType === 'therapist' ? (
                      <>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>All data is encrypted in transit and at rest</li>
                          <li>Your personal therapy sessions are private and separate from client data</li>
                          <li>Client session data you access is logged for HIPAA compliance</li>
                          <li>We do not share your data with third parties without consent</li>
                        </ul>

                        <p>
                          <strong className="text-foreground">Clinical record obligations:</strong> When you disconnect a client, their session records from the relationship period are archived and retained as part of your clinical record. You maintain read-only access to these archives. Client data from after the disconnection is not accessible to you.
                        </p>

                        <p>
                          <strong className="text-foreground">Account retention:</strong> Therapist accounts are subject to a 7-year clinical record retention period. You may archive your account at any time, but it cannot be permanently deleted until the retention period expires. You may reopen an archived account at any point during this period.
                        </p>

                        <p>
                          <strong className="text-foreground">Your rights:</strong> You maintain ownership of your personal therapeutic content. Your account and client archives are retained per clinical record-keeping requirements.
                        </p>
                      </>
                    ) : (
                      <>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>All data is encrypted in transit and at rest</li>
                          <li>Conversations are used only for therapeutic purposes</li>
                          <li>We do not share your data with third parties without consent</li>
                          <li>You have the right to access, export, or delete your data at any time</li>
                        </ul>

                        <p>
                          <strong className="text-foreground">Your rights:</strong> You maintain full ownership of your therapeutic content and can request account deletion at any time through your account settings.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Checkbox 
                  id="data-security" 
                  checked={dataSecurityChecked}
                  onCheckedChange={(checked) => setDataSecurityChecked(checked as boolean)}
                />
                <label
                  htmlFor="data-security"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  I understand how my data is stored and my privacy rights
                </label>
              </div>
            </div>

            {/* Digital Signature */}
            <div className="border-t border-border/50 pt-6">
              <div className="text-center space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">By clicking "I Understand and Accept" below, you acknowledge:</p>
                  <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                    <p className="font-medium text-foreground">{userEmail}</p>
                    <p className="text-xs mt-1">{new Date().toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}</p>
                  </div>
                </div>

                <Button
                  onClick={handleAccept}
                  disabled={loading || !aiLimitationsChecked || !dataSecurityChecked}
                  className="w-full bg-gradient-to-r from-primary to-accent py-6 rounded-xl text-lg"
                >
                  {loading ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check-circle mr-2"></i>
                      I Understand and Accept
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground">
                  This acknowledgment will be recorded with your account
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}