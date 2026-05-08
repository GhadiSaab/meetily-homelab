import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnboardingContainer } from '../OnboardingContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { toast } from 'sonner';

export function DownloadProgressStep() {
  const { goNext, completeOnboarding } = useOnboarding();
  const [isMac, setIsMac] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  React.useEffect(() => {
    const checkPlatform = async () => {
      try {
        const { platform } = await import('@tauri-apps/plugin-os');
        setIsMac(platform() === 'macos');
      } catch (e) {
        setIsMac(navigator.userAgent.includes('Mac'));
      }
    };

    checkPlatform();
  }, []);

  const handleContinue = async () => {
    if (isMac) {
      goNext();
      return;
    }

    setIsCompleting(true);
    try {
      await completeOnboarding();
      await new Promise((resolve) => setTimeout(resolve, 100));
      window.location.reload();
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      toast.error('Failed to complete setup', {
        description: 'Please try again.',
      });
      setIsCompleting(false);
    }
  };

  return (
    <OnboardingContainer
      title="Transcription Setup"
      description="No model download needed. API-based transcription is already configured."
      step={3}
      totalSteps={isMac ? 4 : 3}
    >
      <div className="flex flex-col items-center space-y-6">
        <div className="w-full max-w-lg rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">API-only transcription mode</p>
              <p>Local Whisper and Parakeet model downloads are disabled in this build.</p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-xs">
          <Button
            onClick={handleContinue}
            disabled={isCompleting}
            className="w-full h-11 bg-gray-900 hover:bg-gray-800 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCompleting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Finishing...
              </>
            ) : (
              'Continue'
            )}
          </Button>
        </div>
      </div>
    </OnboardingContainer>
  );
}
