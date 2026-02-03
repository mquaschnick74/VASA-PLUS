// Location: client/src/App.tsx
import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import ResetPassword from '@/pages/reset-password';
import Pricing from '@/pages/pricing';
import PublicPricing from '@/pages/public-pricing';
import PaymentSuccess from '@/pages/payment-success';
import PaymentCancel from '@/pages/payment-cancel';
import FAQPage from '@/pages/faq';
import Settings from '@/pages/settings';
import { ClientSessionsView } from '@/components/therapist/ClientSessionsView';
import BlogListPage from '@/pages/blog-list-page';
import BlogPostPage from '@/pages/blog-post-page';
import AssessmentEmbed from '@/pages/assessment-embed';
import LearnMore from '@/pages/LearnMore';
import MeditationLibrary from '@/pages/MeditationLibrary';
import VideoLibrary from '@/pages/VideoLibrary';
import IndividualSignup from '@/pages/signup/IndividualSignup';
import TherapistSignup from '@/pages/signup/TherapistSignup';
import ClientSignup from '@/pages/signup/ClientSignup';
import AIAssistedTherapy from '@/pages/AIAssistedTherapy';
import Login from '@/pages/Login';

// Wrapper components for signup pages that handle userId state and redirect
function IndividualSignupWrapper() {
  const [, setLocation] = useLocation();
  const handleSetUserId = (id: string) => {
    localStorage.setItem('userId', id);
    setLocation('/dashboard');
  };
  return <IndividualSignup setUserId={handleSetUserId} />;
}

function TherapistSignupWrapper() {
  const [, setLocation] = useLocation();
  const handleSetUserId = (id: string) => {
    localStorage.setItem('userId', id);
    setLocation('/dashboard');
  };
  return <TherapistSignup setUserId={handleSetUserId} />;
}

function ClientSignupWrapper() {
  const [, setLocation] = useLocation();
  const handleSetUserId = (id: string) => {
    localStorage.setItem('userId', id);
    setLocation('/dashboard');
  };
  return <ClientSignup setUserId={handleSetUserId} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/login" component={Login} />
      <Route path="/signup/individual" component={IndividualSignupWrapper} />
      <Route path="/signup/therapist" component={TherapistSignupWrapper} />
      <Route path="/signup/client" component={ClientSignupWrapper} />
      <Route path="/ai-assisted-therapy" component={AIAssistedTherapy} />
      <Route path="/settings" component={Settings} />
      <Route path="/settings/:section" component={Settings} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/public-pricing" component={PublicPricing} />
      <Route path="/payment-success" component={PaymentSuccess} />
      <Route path="/payment-cancel" component={PaymentCancel} />
      <Route path="/faq" component={FAQPage} />
      <Route path="/therapist/client/:clientId/sessions" component={ClientSessionsView} />
      <Route path="/blog" component={BlogListPage} />
      <Route path="/blog/:slug" component={BlogPostPage} />
      <Route path="/assessment" component={AssessmentEmbed} />
      <Route path="/learn-more" component={LearnMore} />
      <Route path="/meditations" component={MeditationLibrary} />
      <Route path="/videos" component={VideoLibrary} />
      {/* Catch-all route that redirects to dashboard */}
      <Route component={Dashboard} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;