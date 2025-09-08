import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, Phone } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AIDisclosureCardProps {
  className?: string;
}

export function AIDisclosureCard({ className }: AIDisclosureCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <Collapsible 
        open={isOpen} 
        onOpenChange={setIsOpen}
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="p-1 h-auto hover:bg-red-500/10 transition-colors relative z-50"
            data-testid="button-ai-disclosure"
          >
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <ChevronDown 
                className={cn(
                  "w-4 h-4 text-red-500 transition-transform duration-200",
                  isOpen && "rotate-180"
                )}
              />
            </div>
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="absolute z-40 mt-2 left-0 md:left-auto md:right-0 w-screen md:w-96 px-4 md:px-0">
          <div className="bg-red-950/90 backdrop-blur-xl border border-red-500/30 rounded-lg p-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h3 className="text-sm font-semibold text-white">AI Therapy Limitations</h3>
            </div>

            {/* Main Content */}
            <div className="space-y-3 text-xs text-white/80">
              <div className="space-y-2">
                <p>
                  <strong className="text-red-400">Important:</strong> VASA provides AI-powered therapeutic support designed to complement, not replace, professional mental health care.
                </p>
                
                <div className="space-y-1 pl-3 border-l-2 border-red-500/30">
                  <p>• <strong>Not for emergencies</strong> - Cannot provide crisis intervention</p>
                  <p>• <strong>No diagnosis</strong> - Cannot diagnose mental health conditions</p>
                  <p>• <strong>No prescriptions</strong> - Cannot prescribe medications</p>
                  <p>• <strong>Limited understanding</strong> - May not fully grasp complex situations</p>
                </div>
              </div>

              {/* Emergency Box */}
              <div className="bg-red-500/20 border border-red-500/40 rounded p-2">
                <p className="text-white/90 font-medium text-xs mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  Emergency Support
                </p>
                <p className="text-white/80">
                  Crisis or thoughts of self-harm? Call <strong className="text-white">911</strong> or 
                  <strong className="text-white"> 988</strong> (Suicide & Crisis Lifeline) immediately.
                </p>
              </div>

              {/* Footer */}
              <p className="text-[10px] text-white/60 italic pt-2 border-t border-white/10">
                By using VASA, you acknowledge this service is not a substitute for professional medical advice, diagnosis, or treatment.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}