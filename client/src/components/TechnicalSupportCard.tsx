import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Mail, Phone } from 'lucide-react';

export function TechnicalSupportCard() {
  return (
    <Card className="glass-card border-yellow-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-yellow-500">
          <AlertCircle className="h-5 w-5" />
          Glitching?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          While we are Beta, we appreciate any technical feedback, such as glitches, breakages or mis-steps you may run into! Please feel free to be as detailed as possible.
        </p>
        
        <div className="space-y-2">
          <a
            href="mailto:tech.support@ivasa.ai"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
            data-testid="link-tech-support-email"
          >
            <Mail className="h-4 w-4" />
            tech.support@ivasa.ai
          </a>
          
          <a
            href="tel:+19526580606"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
            data-testid="link-tech-support-phone"
          >
            <Phone className="h-4 w-4" />
            1 (952) 658 0606
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
