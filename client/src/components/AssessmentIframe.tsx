import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter'; // Fixed: wouter uses useLocation, not useNavigate
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast'; // Fixed: correct import path
import { queryClient } from '@/lib/queryClient';

interface AssessmentData {
  encoded: string;
  profile: {
    pattern: string;
    metaphor: string;
    description: string;
    register: string;
    cvdcPattern: string;
    chronicity: string;
    restCapacity: string;
    goal: string;
  };
  answers: Record<string, string>;
  email?: string;
  action: 'signup' | 'email_capture';
}

interface AssessmentIframeProps {
  onComplete?: (data: AssessmentData) => void;
  className?: string;
  dashboardMode?: boolean; // Skip built-in navigation for logged-in users
}

export default function AssessmentIframe({ onComplete, className, dashboardMode = false }: AssessmentIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(700);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, setLocation] = useLocation(); // Fixed: useLocation returns [location, setLocation]
  const { toast } = useToast(); // Fixed: destructure toast from hook

  useEffect(() => {
    console.log('[AssessmentIframe] Component mounted, dashboardMode:', dashboardMode);

    // Add a timeout to show the iframe even if IFRAME_READY never arrives
    const timeout = setTimeout(() => {
      if (isLoading) {
        console.warn('[AssessmentIframe] Timeout waiting for IFRAME_READY, showing iframe anyway');
        setIsLoading(false);
      }
    }, 5000); // 5 second timeout

    const handleMessage = async (event: MessageEvent) => {
      // Log ALL messages for debugging
      console.log('[AssessmentIframe] Received postMessage:', {
        origin: event.origin,
        data: event.data,
        type: event.data?.type
      });

      // Only accept messages from the quiz domain
      if (event.origin !== 'https://start.ivasa.ai' && event.origin !== 'http://localhost:5173') {
        console.warn('[AssessmentIframe] Rejected message from origin:', event.origin);
        return;
      }

      console.log('[AssessmentIframe] Accepted message:', event.data);

      switch (event.data.type) {
        case 'IFRAME_READY':
          console.log('[AssessmentIframe] Quiz is ready!');
          clearTimeout(timeout);
          setIsLoading(false);
          toast({
            title: 'Assessment Ready',
            description: 'You can now begin the assessment.',
            duration: 2000,
          });
          break;

        case 'RESIZE_IFRAME':
          if (event.data.height && typeof event.data.height === 'number') {
            console.log('[AssessmentIframe] Resizing to:', event.data.height);
            setIframeHeight(event.data.height);
          }
          break;

        case 'ASSESSMENT_COMPLETE':
          console.log('[AssessmentIframe] Assessment complete event received');
          handleAssessmentComplete(event.data.data);
          break;

        default:
          console.log('[AssessmentIframe] Unknown message type:', event.data.type);
      }
    };

    const handleAssessmentComplete = async (data: AssessmentData) => {
      console.log('[AssessmentIframe] Assessment completed:', data);

      // Call parent callback if provided
      if (onComplete) {
        onComplete(data);
      }

      // Skip built-in navigation if in dashboard mode (parent handles it)
      if (dashboardMode) {
        console.log('[AssessmentIframe] Dashboard mode - skipping built-in navigation');
        return;
      }

      // Handle based on action type
      if (data.action === 'signup') {
        // Store assessment data temporarily in sessionStorage
        sessionStorage.setItem('assessmentData', JSON.stringify(data));

        // Navigate to signup with encoded profile
        setLocation(`/signup?source=assessment&profile=${data.encoded}`);

        toast({
          title: 'Assessment Complete!',
          description: 'Redirecting to create your account...',
          duration: 3000,
        });
      } else if (data.action === 'email_capture' && data.email) {
        // Store email and assessment data for later processing
        try {
          // You can make an API call here to save the email and assessment
          const response = await fetch('/api/assessment/save-for-later', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: data.email,
              assessmentData: data,
            }),
          });

          if (response.ok) {
            toast({
              title: 'Results Saved!',
              description: `We'll send your assessment results to ${data.email}`,
              duration: 5000,
            });
          } else {
            throw new Error('Failed to save assessment');
          }
        } catch (error) {
          console.error('Error saving assessment for later:', error);
          toast({
            title: 'Error',
            description: 'Failed to save your results. Please try again.',
            variant: 'destructive',
          });
        }
      }
    };

    // Add iframe load event listeners
    const iframe = iframeRef.current;

    const handleIframeLoad = () => {
      console.log('[AssessmentIframe] Iframe loaded successfully');
    };

    const handleIframeError = () => {
      console.error('[AssessmentIframe] Iframe failed to load');
      setLoadError('Failed to load assessment. Please check your connection and try again.');
      setIsLoading(false);
    };

    if (iframe) {
      iframe.addEventListener('load', handleIframeLoad);
      iframe.addEventListener('error', handleIframeError);
    }

    window.addEventListener('message', handleMessage);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('message', handleMessage);
      if (iframe) {
        iframe.removeEventListener('load', handleIframeLoad);
        iframe.removeEventListener('error', handleIframeError);
      }
    };
  }, [setLocation, onComplete, toast, dashboardMode, isLoading]);

  return (
    <div className={className}>
      {loadError && (
        <Card className="p-8 text-center border-destructive">
          <div className="space-y-4">
            <p className="text-destructive font-semibold">Error Loading Assessment</p>
            <p className="text-muted-foreground">{loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Reload Page
            </button>
          </div>
        </Card>
      )}

      {isLoading && !loadError && (
        <Card className="p-8 text-center">
          <div className="space-y-4">
            <div className="animate-pulse">
              <div className="h-8 bg-muted rounded w-3/4 mx-auto mb-4"></div>
              <div className="h-4 bg-muted rounded w-1/2 mx-auto"></div>
            </div>
            <p className="text-muted-foreground">Loading assessment...</p>
            <p className="text-xs text-muted-foreground mt-2">If this takes too long, the iframe will appear automatically</p>
          </div>
        </Card>
      )}

      <iframe
        ref={iframeRef}
        src={dashboardMode ? "https://start.ivasa.ai?mode=dashboard" : "https://start.ivasa.ai"}
        style={{
          width: '100%',
          height: `${iframeHeight}px`,
          border: 'none',
          minHeight: '600px',
          display: isLoading || loadError ? 'none' : 'block',
          transition: 'height 0.3s ease',
        }}
        sandbox="allow-scripts allow-same-origin allow-forms"
        title="iVASA Inner Landscape Assessment"
        onLoad={() => console.log('[AssessmentIframe] onLoad event fired')}
        onError={() => console.error('[AssessmentIframe] onError event fired')}
      />
    </div>
  );
}