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
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    console.log('[AssessmentIframe] Component mounted, dashboardMode:', dashboardMode);

    // Show iframe quickly after a brief delay (perceived as instant but allows for smooth render)
    const quickShowTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 800); // Show after 800ms instead of waiting for IFRAME_READY

    const handleMessage = async (event: MessageEvent) => {
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
          clearTimeout(quickShowTimeout);
          setIsLoading(false);
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
        console.log('[AssessmentIframe] Calling onComplete callback, skipping built-in navigation');
        onComplete(data);
        return; // Let parent handle navigation
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
      clearTimeout(quickShowTimeout);
      window.removeEventListener('message', handleMessage);
      if (iframe) {
        iframe.removeEventListener('load', handleIframeLoad);
        iframe.removeEventListener('error', handleIframeError);
      }
    };
  }, [setLocation, onComplete, toast, dashboardMode]);

  return (
    <div className={className} style={{ position: 'relative' }}>
      {/* Minimal loading overlay with fade out */}
      {isLoading && !loadError && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 10,
            animation: 'fadeOut 0.5s ease-out forwards',
            animationDelay: '0.3s'
          }}
        >
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-white">Loading assessment...</p>
          </div>
        </div>
      )}

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

      <iframe
        ref={iframeRef}
        src={dashboardMode ? "https://start.ivasa.ai?mode=dashboard" : "https://start.ivasa.ai"}
        style={{
          width: '100%',
          height: '100%',
          minHeight: `${iframeHeight}px`,
          border: 'none',
          display: loadError ? 'none' : 'block',
          opacity: isLoading ? 0.3 : 1,
          transition: 'opacity 0.5s ease-in-out',
        }}
        scrolling="auto"
        sandbox="allow-scripts allow-same-origin allow-forms"
        title="iVASA Inner Landscape Assessment"
        onLoad={() => console.log('[AssessmentIframe] onLoad event fired')}
        onError={() => console.error('[AssessmentIframe] onError event fired')}
      />

      <style>{`
        @keyframes fadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
            pointer-events: none;
          }
        }
      `}</style>
    </div>
  );
}