// Location: client/src/components/settings/SupportSettings.tsx
// Support and help resources for users

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Phone, HelpCircle, BookOpen, MessageCircle, ExternalLink } from 'lucide-react';
import { useLocation } from 'wouter';
import { TechnicalSupportCard } from '../TechnicalSupportCard';

interface SupportSettingsProps {
  userType: string;
}

export default function SupportSettings({ userType }: SupportSettingsProps) {
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Support & Help</h2>
        <p className="text-muted-foreground text-sm">
          Get help, access resources, and contact support
        </p>
      </div>

      {/* Technical Support Card for specific user types */}
      {['partner', 'influencer', 'admin'].includes(userType) && (
        <TechnicalSupportCard />
      )}

      {/* Contact Support Card */}
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-purple-500" />
            Contact Support
          </CardTitle>
          <CardDescription>
            Get help from our support team
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Support
              </label>
              <a
                href="mailto:support@ivasa.ai"
                className="text-base font-medium text-purple-500 hover:text-purple-400 transition-colors flex items-center gap-2"
              >
                support@ivasa.ai
                <ExternalLink className="h-3 w-3" />
              </a>
              <p className="text-xs text-muted-foreground">
                We typically respond within 24 hours
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Support
              </label>
              <a
                href="tel:+1234567890"
                className="text-base font-medium text-purple-500 hover:text-purple-400 transition-colors"
              >
                +1 (234) 567-8900
              </a>
              <p className="text-xs text-muted-foreground">
                Mon-Fri, 9am-5pm EST
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Help Resources Card */}
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-purple-500" />
            Help Resources
          </CardTitle>
          <CardDescription>
            Quick access to helpful resources
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setLocation('/faq')}
          >
            <HelpCircle className="h-4 w-4 mr-2" />
            Frequently Asked Questions
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => setLocation('/blog')}
          >
            <BookOpen className="h-4 w-4 mr-2" />
            Blog & Learning Resources
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => window.open('https://docs.ivasa.ai', '_blank')}
          >
            <BookOpen className="h-4 w-4 mr-2" />
            Documentation
            <ExternalLink className="h-3 w-3 ml-auto" />
          </Button>
        </CardContent>
      </Card>

      {/* Common Issues Card */}
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-purple-500" />
            Common Issues & Solutions
          </CardTitle>
          <CardDescription>
            Quick fixes for common problems
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="pb-3 border-b border-white/10">
              <h4 className="font-medium text-sm mb-1">Voice not working?</h4>
              <p className="text-xs text-muted-foreground">
                Check your microphone permissions in browser settings and ensure your subscription is active.
              </p>
            </div>

            <div className="pb-3 border-b border-white/10">
              <h4 className="font-medium text-sm mb-1">Can't access features?</h4>
              <p className="text-xs text-muted-foreground">
                Verify your subscription status and ensure you haven't exceeded your usage limits.
              </p>
            </div>

            <div className="pb-3 border-b border-white/10">
              <h4 className="font-medium text-sm mb-1">Billing questions?</h4>
              <p className="text-xs text-muted-foreground">
                Use the "Manage Subscription" button in the Subscription & Billing section to access your billing portal.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-sm mb-1">Account issues?</h4>
              <p className="text-xs text-muted-foreground">
                Contact support at support@ivasa.ai for help with account-related problems.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Status Card */}
      <Card className="glass border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
            System Status
          </CardTitle>
          <CardDescription>
            Current system operational status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">All Systems Operational</p>
              <p className="text-xs text-muted-foreground">Last checked: Just now</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://status.ivasa.ai', '_blank')}
            >
              View Status Page
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
