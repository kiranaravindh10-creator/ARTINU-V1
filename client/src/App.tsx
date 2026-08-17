import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { HelmetProvider } from 'react-helmet-async';
import { AppErrorBoundary } from '@/components/layout/AppErrorBoundary';
import { TooltipProvider } from '@/components/ui/menu';
import { AuthProvider } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';
import { ContentSSEProvider } from '@/components/ContentSSEProvider';
import { queryClient } from '@/lib/query';
import { router } from '@/routes/router';

export default function App() {
  return (
    <HelmetProvider>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <CartProvider>
              <TooltipProvider delayDuration={200} skipDelayDuration={400}>
                <div className="bg-noise" />
                <ContentSSEProvider />
                <RouterProvider router={router} />
                <Toaster
                  position="bottom-right"
                  gap={10}
                  toastOptions={{
                    classNames: {
                      toast:
                        'rounded-md border border-line bg-surface text-ink shadow-lifted font-sans text-sm',
                      description: 'text-muted',
                      actionButton: 'bg-ink text-canvas rounded-sm',
                      cancelButton: 'bg-sand text-ink rounded-sm',
                      error: 'border-danger/30',
                      success: 'border-success/30',
                    },
                  }}
                />
              </TooltipProvider>
            </CartProvider>
          </AuthProvider>
        </QueryClientProvider>
      </AppErrorBoundary>
    </HelmetProvider>
  );
}
