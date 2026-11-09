'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MarrowNodeLogo } from '@/components/MarrowNodeLogo';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Github, ShieldCheck, AlertCircle } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { getAppOrigin } from '@/lib/origin';

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // If an error query parameter was passed from the OAuth callback:
    const errorParam = searchParams.get('error');
    if (errorParam) {
      if (errorParam === 'access_denied') {
        setErrorMessage('GitHub authorization was cancelled. Please try again.');
      } else {
        setErrorMessage('GitHub connection could not be completed. Please try again.');
      }
    }

    // Check if session is already active
    const checkActiveSession = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          router.replace('/dashboard');
        }
      } catch (_) {}
    };

    checkActiveSession();
  }, [searchParams, router]);

  const handleGitHubAuth = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const supabase = createClient();
      const origin = getAppOrigin();

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${origin}/auth/callback?next=/dashboard`,
        },
      });

      if (error) {
        setErrorMessage('GitHub connection could not be completed. Please try again.');
        setIsSubmitting(false);
      }
    } catch (_) {
      setErrorMessage('GitHub connection could not be completed. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ivory dark:bg-[#0E1310] flex flex-col justify-center items-center p-4 sm:p-6 bg-grid-pattern font-sans">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-block">
            <MarrowNodeLogo variant="full" size="lg" />
          </Link>
          <p className="text-xs text-text-muted font-sans">
            The Memory Layer for Software
          </p>
        </div>

        {/* Main Auth Card */}
        <Card className="shadow-card border-border dark:bg-[#151C17] dark:border-border-dark overflow-hidden font-sans">
          <CardHeader className="bg-surface-subtle dark:bg-[#1A221D] p-3.5 text-center border-b border-border dark:border-border-dark">
            <div className="w-full text-center">
              <span className="text-xs font-semibold text-text-primary dark:text-white uppercase tracking-wider font-sans">
                Sign in to Workstation
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-6 sm:p-7 space-y-4 font-sans">
            {/* Error banner */}
            {errorMessage && (
              <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-start gap-2 font-sans">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            <div className="text-center space-y-1 pb-1">
              <h2 className="text-sm font-semibold text-text-primary dark:text-white">
                Developer Access
              </h2>
              <p className="text-xs text-text-secondary dark:text-[#A7AFA9] leading-relaxed">
                Connect with GitHub to access your repositories, codebase intelligence, and architectural context.
              </p>
            </div>

            {/* Single Primary Action: Continue with GitHub */}
            <Button
              type="button"
              variant="primary"
              onClick={handleGitHubAuth}
              loading={isSubmitting}
              className="w-full h-10 text-xs font-medium flex items-center justify-center gap-2 font-sans"
            >
              <Github className="w-4 h-4" />
              <span>{isSubmitting ? 'Connecting to GitHub…' : 'Continue with GitHub'}</span>
            </Button>

            {/* Security Guarantee */}
            <div className="pt-2 text-center text-[11px] text-text-muted flex items-center justify-center gap-1.5 font-sans leading-relaxed border-t border-border dark:border-border-dark">
              <ShieldCheck className="w-3.5 h-3.5 text-forest shrink-0" />
              <span>Secure GitHub OAuth · Repository access is controlled by GitHub</span>
            </div>
          </CardContent>
        </Card>

        {/* Back to Home Link */}
        <div className="text-center">
          <Link
            href="/"
            className="text-xs text-text-muted hover:text-text-primary dark:hover:text-white transition-colors"
          >
            ← Back to MarrowNode Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-ivory dark:bg-[#0E1310] flex items-center justify-center font-sans text-xs text-text-muted">
          <span>Loading authentication…</span>
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}
