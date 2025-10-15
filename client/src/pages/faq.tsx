import { useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { ArrowLeft, HelpCircle, Users, Briefcase, Settings, CreditCard, Wrench } from 'lucide-react';

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState('general');

  const categories = [
    { id: 'general', label: 'General', icon: HelpCircle },
    { id: 'therapist', label: 'Therapist', icon: Briefcase },
    { id: 'client', label: 'Client', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'technical', label: 'Technical', icon: Wrench },
  ];

  const faqs = {
    general: [
      {
        q: "How do I reset my password?",
        a: "Click 'Forgot Password' on the login page. Enter your registered email address, and you'll receive a password reset link via email. The system uses secure email verification for password resets."
      },
      {
        q: "Why can't I log in to my account?",
        a: "Common reasons include: incorrect username or password (passwords are case-sensitive), account may need email verification (check your inbox), browser cache issues (try clearing cache or using incognito mode), or ensure you're selecting the correct user type (Individual, Client, or Therapist)."
      },
      {
        q: "Can I use VASA on multiple devices?",
        a: "Yes, VASA features cross-device sync. You can access the platform from any device with a web browser. The responsive design works on desktops, tablets, and smartphones. Your session history and progress sync automatically across all devices."
      },
      {
        q: "Which AI voice agents are available?",
        a: "VASA offers two specialized AI therapeutic agents: Sarah (empathetic and nurturing companion) and Mathew (analytical pattern recognition specialist). Each agent maintains conversation memory and provides continuity across your sessions."
      },
      {
        q: "Do the AI agents remember our previous conversations?",
        a: "Yes! All AI agents feature memory persistence. They remember your previous conversations, personal details, and can reference past sessions to provide continuity in your therapeutic journey."
      },
      {
        q: "Is my information secure?",
        a: "Yes, VASA uses encrypted storage for all voice sessions and data, secure multi-layer authentication, session privacy protection, HIPAA-compliant data handling, and complete activity logging for security."
      },
      {
        q: "Who can see my voice therapy sessions?",
        a: "Session visibility depends on your account type. Individual users: sessions are completely private. Clients: your assigned therapist can view session summaries and therapeutic patterns. Therapists: only you can access your personal therapy sessions."
      }
    ],
    therapist: [
      {
        q: "How do I invite clients to VASA?",
        a: "Navigate to your Therapist Dashboard, click 'Invite Client', enter the client's email address, and the system sends a secure invitation link. Track pending invitations in your dashboard. Clients can easily onboard using the link without complex setup."
      },
      {
        q: "How many clients can I manage?",
        a: "Client limits depend on your subscription tier: Basic ($99/month) supports 3 clients with 180 minutes, Premium ($199/month) supports 10 clients with 600 minutes. Clients inherit your subscription benefits for their sessions."
      },
      {
        q: "Can I view my clients' therapy sessions?",
        a: "Yes, you have access to client session summaries, CSS pattern progression, session statistics and analytics, and transformation metrics. You can view detailed summaries and full transcripts through the client sessions view."
      },
      {
        q: "What is CSS pattern detection?",
        a: "CSS (Core Symbol Set) pattern detection automatically identifies therapeutic patterns including CVDC (contradiction), IBM (intention-behavior mismatch), Thend (therapeutic shift), and CYVC (choice/flexibility) patterns. Patterns update during client voice sessions and help track therapeutic progress."
      },
      {
        q: "Can I monitor client patterns in real-time?",
        a: "Yes! The platform features live pattern detection during sessions, pattern analytics dashboard, visual therapeutic journey mapping, and instant pattern notifications when significant shifts occur."
      },
      {
        q: "Can I use VASA for my own therapy sessions?",
        a: "Absolutely! Therapists have full access to both AI voice agents (Sarah and Mathew), personal voice sessions with memory persistence, your own therapeutic journey tracking, and private session storage separate from client data."
      },
      {
        q: "How do I track client progress?",
        a: "The platform provides CSS journey visualization for each client, progress charts and metrics, session statistics and weekly trends, transformation insights, and a comprehensive pattern analytics dashboard."
      }
    ],
    client: [
      {
        q: "How do I join VASA as a client?",
        a: "Your therapist will send you an email invitation with a secure link. The signup process is simple and automatically connects you to your therapist with inherited subscription benefits. No payment is required - you use your therapist's subscription."
      },
      {
        q: "Which AI agents can I access as a client?",
        a: "Clients have full access to both AI therapeutic agents: Sarah (empathetic companion) and Mathew (analytical specialist). Each maintains conversation memory and continuity across your sessions."
      },
      {
        q: "Can my therapist see everything I discuss in sessions?",
        a: "Your therapist can view session summaries and insights, CSS pattern progression, and overall therapeutic progress. The detailed conversation transcripts and full session content are accessible to your therapist for collaborative care."
      },
      {
        q: "How do voice sessions work?",
        a: "Voice sessions feature natural, human-like conversations with real-time voice recognition and response. Sessions are automatically recorded and transcribed, with context-aware empathetic responses and smooth conversation flow with memory of past sessions."
      },
      {
        q: "How long can my sessions be?",
        a: "Session length depends on your therapist's subscription. Minutes are shared from your therapist's plan, with real-time usage tracking showing remaining time. Sessions can continue as long as minutes are available, with automatic alerts before time expires."
      },
      {
        q: "How do I track my progress?",
        a: "Your Client Dashboard shows CSS journey visualization, session history with summaries, pattern detection insights, progress charts, and therapeutic stage progression. This information is shared with your therapist for collaborative care."
      },
      {
        q: "Can I access my session history?",
        a: "Yes, you have complete access to all past session summaries, AI-generated insights, progress tracking over time, pattern evolution history, and therapeutic context from all sessions."
      }
    ],
    settings: [
      {
        q: "How do I change my account information?",
        a: "Access account settings through your dashboard. Click your profile/avatar in the navigation header, select 'Account Settings', update your name or email, and save changes to apply immediately."
      },
      {
        q: "How do I delete my account?",
        a: "Account deletion can be requested through Settings > Delete Account in your dashboard. Note: This action is irreversible and will delete all session data, therapeutic context, and progress history."
      },
      {
        q: "How do I manage my data sharing preferences?",
        a: "Data sharing controls vary by user type. Individual: all data remains private by default. Client: information is shared with your assigned therapist. Therapist: manage client data access through professional settings and HIPAA-compliant audit logs track all access."
      },
      {
        q: "Can I change my user type?",
        a: "User types (Individual, Therapist, Client) are set during account creation and cannot be changed directly. Contact support if you need to change your user type, as this may require creating a new account with proper verification."
      }
    ],
    billing: [
      {
        q: "What subscription options are available?",
        a: "Individual plans: Trial (15 min), Plus (100 min), Pro (unlimited). Therapist plans: Basic ($99/month, 3 clients, 180 min), Premium ($199/month, 10 clients, 600 min). All plans include full access to AI agents and therapeutic features."
      },
      {
        q: "How do I upgrade my plan?",
        a: "Go to Settings > Subscription in your dashboard, select 'Upgrade Plan', choose your new plan level, and complete payment through secure Stripe checkout. New benefits apply immediately."
      },
      {
        q: "What happens when my trial expires?",
        a: "When your trial ends, voice sessions will be disabled and you'll receive upgrade prompts. Historical data remains accessible, and you can purchase a plan to continue sessions at any time."
      },
      {
        q: "How is usage tracked for therapists?",
        a: "Usage tracking features a shared minute pool across all your clients, real-time consumption monitoring, per-client usage breakdowns, usage alerts before limits, and live updates of remaining time."
      },
      {
        q: "How do I cancel my subscription?",
        a: "Click the Settings icon in navigation, select 'Cancel Subscription', and confirm cancellation. Your subscription remains active until the end of your current billing period, then voice sessions become unavailable (historical data remains accessible)."
      },
      {
        q: "What payment methods are accepted?",
        a: "VASA accepts major credit cards (Visa, MasterCard, American Express, Discover) and debit cards with major network logos. All payments are processed securely through Stripe. International cards are accepted subject to bank approval."
      },
      {
        q: "When am I charged for my subscription?",
        a: "Monthly plans are charged monthly on your signup date. Trial-to-paid conversion: first charge occurs when trial ends. Upgrades: prorated charges apply immediately with credit for unused time on previous plan."
      }
    ],
    technical: [
      {
        q: "What browsers work best with VASA?",
        a: "VASA supports Chrome, Firefox, Safari, and Edge (desktop and mobile). The platform uses WebSocket technology for real-time features, so ensure JavaScript is enabled and your browser is up to date."
      },
      {
        q: "What if I have technical issues during a session?",
        a: "The platform includes robust error handling and retry mechanisms, automatic reconnection features, session recovery if disconnected, and complete mobile support for backup devices. If issues persist, try refreshing your browser or switching devices."
      },
      {
        q: "How are voice sessions recorded and stored?",
        a: "Voice sessions are automatically transcribed and stored securely with complete context preservation. You can access your full session history, including AI-generated summaries and insights, through your dashboard. All data is encrypted and HIPAA-compliant."
      },
      {
        q: "Why is my microphone not working?",
        a: "Ensure your browser has microphone permissions enabled for VASA. Check your device microphone settings and try refreshing the page. If using headphones, ensure they're properly connected. For persistent issues, try a different browser or device."
      },
      {
        q: "Can I use VASA on mobile devices?",
        a: "Yes! VASA is fully mobile-responsive and works on smartphones and tablets. The voice interface adapts to mobile screens, and all features including session history and analytics are accessible on mobile devices."
      },
      {
        q: "What if I get disconnected during a session?",
        a: "VASA features automatic reconnection if your connection drops. Your session progress is saved continuously, and you can resume where you left off. If reconnection fails, refresh your browser to continue your session."
      }
    ]
  };

  return (
    <div className="min-h-screen gradient-bg px-4 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/dashboard">
            <Button variant="ghost" className="mb-4 text-white/80 hover:text-white" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <h1 className="text-4xl font-bold text-white mb-2">Frequently Asked Questions</h1>
          <p className="text-white/70 text-lg">Find answers to common questions about VASA</p>
        </div>

        {/* Category Navigation */}
        <div className="flex flex-wrap gap-2 mb-8">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Button
                key={category.id}
                variant={activeCategory === category.id ? "default" : "outline"}
                onClick={() => setActiveCategory(category.id)}
                className={activeCategory === category.id ? "" : "bg-white/10 border-white/20 text-white hover:bg-white/20"}
                data-testid={`button-category-${category.id}`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {category.label}
              </Button>
            );
          })}
        </div>

        {/* FAQ Content */}
        <Card className="glass border-white/10" data-testid="card-faq-content">
          <CardHeader>
            <CardTitle className="text-2xl text-white">
              {categories.find(c => c.id === activeCategory)?.label} Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {faqs[activeCategory as keyof typeof faqs].map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`} className="border-white/10">
                  <AccordionTrigger className="text-white hover:text-white/80 text-left" data-testid={`accordion-trigger-${index}`}>
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-white/70" data-testid={`accordion-content-${index}`}>
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* Get Help & Customer Support */}
        <Card className="glass border-white/10 mt-8" data-testid="card-support">
          <CardHeader>
            <CardTitle className="text-2xl text-white text-center">Get Help & Customer Support</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Technical Questions */}
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/20">
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Technical Questions</h4>
                  <a href="mailto:tech@ivasa.ai" className="text-primary hover:underline">tech@ivasa.ai</a>
                </div>
              </div>

              {/* Phone Support */}
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/20">
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-1">Non-Therapy Support</h4>
                  <a href="tel:+19526580606" className="text-primary hover:underline">+1 (952) 658 0606</a>
                  <p className="text-xs text-yellow-400 mt-1">NOT a therapeutic support line</p>
                </div>
              </div>
            </div>

            {/* Support Hours */}
            <div className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
              <h4 className="text-white font-semibold mb-2">Support Hours</h4>
              <p className="text-white/70 text-sm">
                Weekday: 9:00 AM - 6:00 PM CST
              </p>
              <p className="text-white/70 text-sm">
                Weekend: Emergency customer support only
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
