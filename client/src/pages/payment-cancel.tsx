import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { XCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PaymentCancel() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center gradient-bg px-4">
      <Card className="w-full max-w-md glass">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
              <XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <CardTitle className="text-2xl">Payment Cancelled</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Your payment was cancelled. No charges have been made to your account.
          </p>
          <p className="text-sm text-muted-foreground">
            If you experienced any issues, please contact our support team at support@ivasa.com.
          </p>
          <Button 
            onClick={() => setLocation('/pricing')}
            className="w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return to Pricing
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}