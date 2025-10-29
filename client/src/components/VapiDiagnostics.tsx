import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

export function VapiDiagnostics() {
  const checks = {
    vapiPublicKey: !!import.meta.env.VITE_VAPI_PUBLIC_KEY,
    serverUrl: import.meta.env.VITE_SERVER_URL || window.location.origin,
    vapiSecretConfigured: !!import.meta.env.VITE_VAPI_SERVER_SECRET,
  };

  const hasPublicKey = checks.vapiPublicKey;
  const webhookUrl = `${checks.serverUrl}/api/vapi/webhook`;

  return (
    <Card className="glass rounded-xl border-0">
      <CardContent className="p-4">
        <h3 className="text-lg font-semibold mb-4">VAPI Configuration Status</h3>

        <div className="space-y-3">
          {/* VAPI Public Key Check */}
          <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
            <div className="flex items-center space-x-3">
              {hasPublicKey ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              <div>
                <p className="text-sm font-medium">VAPI Public Key</p>
                <p className="text-xs text-muted-foreground">
                  {hasPublicKey
                    ? `Configured (${import.meta.env.VITE_VAPI_PUBLIC_KEY?.substring(0, 10)}...)`
                    : 'Not configured'}
                </p>
              </div>
            </div>
          </div>

          {/* Webhook URL Check */}
          <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <div>
                <p className="text-sm font-medium">Webhook URL</p>
                <p className="text-xs text-muted-foreground break-all">
                  {webhookUrl}
                </p>
              </div>
            </div>
          </div>

          {/* Server Secret Check */}
          <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
            <div className="flex items-center space-x-3">
              {checks.vapiSecretConfigured ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              )}
              <div>
                <p className="text-sm font-medium">VAPI Server Secret</p>
                <p className="text-xs text-muted-foreground">
                  {checks.vapiSecretConfigured ? 'Configured (optional)' : 'Not configured (optional)'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {!hasPublicKey && (
          <Alert className="mt-4 bg-red-500/10 border-red-500/50">
            <XCircle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-xs">
              <strong>Action Required:</strong> Add VITE_VAPI_PUBLIC_KEY to your environment variables.
              <br />
              In Replit: Tools → Secrets → Add new secret
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-400">
            💡 <strong>Tip:</strong> Open browser console (F12) and click "Start Session" to see detailed
            error logs that will help diagnose any issues.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
