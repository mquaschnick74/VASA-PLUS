// Location: client/src/components/InstallAppButton.tsx
// PWA Install button component - shows for Chrome/Android (native prompt) and iOS (instructions modal)

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, Share, PlusSquare } from 'lucide-react';

// Extend Window interface for beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

// Detect iOS device
function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Check if running in standalone mode (already installed)
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (isStandalone()) {
      setIsInstallable(false);
      return;
    }

    // Check if iOS device
    const iosDevice = isIOS();
    setIsIOSDevice(iosDevice);

    if (iosDevice) {
      // On iOS, always show the button (will open instructions modal)
      setIsInstallable(true);
      return;
    }

    // For non-iOS devices, listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOSDevice) {
      // Show iOS instructions modal
      setShowIOSModal(true);
      return;
    }

    if (!deferredPrompt) return;

    // Trigger the native install prompt
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };

  // Don't render if not installable
  if (!isInstallable) {
    return null;
  }

  return (
    <>
      <Button
        variant="ghost"
        className="text-sm backdrop-filter backdrop-blur-md bg-emerald-500/10 border border-emerald-500/40 hover:border-emerald-500/60 hover:bg-emerald-500/20 shadow-[0_0_15px_rgba(0,208,98,0.2)] transition-all"
        onClick={handleInstallClick}
      >
        <Download className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Install App</span>
        <span className="sm:hidden">Install</span>
      </Button>

      {/* iOS Installation Instructions Modal */}
      <Dialog open={showIOSModal} onOpenChange={setShowIOSModal}>
        <DialogContent className="glass-strong border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-emerald-400 text-center">
              Install VASA on iOS
            </DialogTitle>
            <DialogDescription className="text-gray-300 text-center">
              Add VASA to your home screen for the best experience
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Step 1 */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-semibold">
                1
              </div>
              <div className="flex-1">
                <p className="text-white font-medium flex items-center gap-2">
                  Tap the Share button
                  <Share className="h-5 w-5 text-blue-400" />
                </p>
                <p className="text-gray-400 text-sm">
                  Located at the bottom of Safari
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-semibold">
                2
              </div>
              <div className="flex-1">
                <p className="text-white font-medium flex items-center gap-2">
                  Tap "Add to Home Screen"
                  <PlusSquare className="h-5 w-5 text-gray-300" />
                </p>
                <p className="text-gray-400 text-sm">
                  Scroll down in the share menu to find it
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-semibold">
                3
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">Tap "Add"</p>
                <p className="text-gray-400 text-sm">
                  VASA will appear on your home screen
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={() => setShowIOSModal(false)}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
          >
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
