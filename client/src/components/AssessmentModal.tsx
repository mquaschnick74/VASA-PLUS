// client/src/components/AssessmentModal.tsx
// Modal component for displaying the Inner Landscape Assessment in an iframe

import { X } from 'lucide-react';

interface AssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

export default function AssessmentModal({ isOpen, onClose, userEmail }: AssessmentModalProps) {
  if (!isOpen) return null;

  // Construct assessment URL with user email if available
  const assessmentUrl = userEmail
    ? `https://start.ivasa.ai?email=${encodeURIComponent(userEmail)}`
    : 'https://start.ivasa.ai';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-4xl h-[90vh] mx-4 bg-background rounded-2xl shadow-2xl overflow-hidden border border-purple-400/30">
        {/* Header with Close Button */}
        <div className="absolute top-0 right-0 z-10 p-4">
          <button
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-purple-400/30 hover:bg-purple-400/10 hover:border-purple-400/60 transition-all duration-200 group"
            aria-label="Close assessment"
          >
            <X className="w-5 h-5 text-muted-foreground group-hover:text-purple-400 transition-colors" />
          </button>
        </div>

        {/* Iframe */}
        <iframe
          src={assessmentUrl}
          className="w-full h-full"
          title="Inner Landscape Assessment"
          allow="clipboard-write"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  );
}
