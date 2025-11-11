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
}

export default function AssessmentIframe({ onComplete, className }: AssessmentIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(700);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation(); // Fixed: useLocation returns [location, setLocation]
  const { toast } = useToast(); // Fixed: destructure toast from hook

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Only accept messages from the quiz domain
      if (event.origin !== 'https://start.ivasa.ai' && event.origin !== 'http://localhost:5173') {
        return;
      }

      console.log('[AssessmentIframe] Received message:', event.data);

      switch (event.data.type) {
        case 'IFRAME_READY':
          setIsLoading(false);
          toast({
            title: 'Assessment Ready',
            description: 'You can now begin the assessment.',
            duration: 2000,
          });
          break;

        case 'RESIZE_IFRAME':
          if (event.data.height && typeof event.data.height === 'number') {
            setIframeHeight(event.data.height);
          }
          break;

        case 'ASSESSMENT_COMPLETE':
          handleAssessmentComplete(event.data.data);
          break;
      }
    };

    const handleAssessmentComplete = async (data: AssessmentData) => {
      console.log('[AssessmentIframe] Assessment completed:', data);

      // Call parent callback if provided
      if (onComplete) {
        onComplete(data);
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

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [setLocation, onComplete, toast]);

  return (
    <div className={className}>
      {isLoading && (
        <Card className="p-8 text-center">
          <div className="space-y-4">
            <div className="animate-pulse">
              <div className="h-8 bg-muted rounded w-3/4 mx-auto mb-4"></div>
              <div className="h-4 bg-muted rounded w-1/2 mx-auto"></div>
            </div>
            <p className="text-muted-foreground">Loading assessment...</p>
          </div>
        </Card>
      )}

      <iframe
        ref={iframeRef}
        src="https://start.ivasa.ai"
        style={{
          width: '100%',
          height: `${iframeHeight}px`,
          border: 'none',
          minHeight: '600px',
          display: isLoading ? 'none' : 'block',
          transition: 'height 0.3s ease',
        }}
        sandbox="allow-scripts allow-same-origin allow-forms"
        title="iVASA Inner Landscape Assessment"
      />
    </div>
  );
}