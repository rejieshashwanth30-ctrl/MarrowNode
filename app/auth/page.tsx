'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MarrowNodeLogo } from '@/components/MarrowNodeLogo';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Github, ShieldCheck, Check, AlertCircle, Info, ExternalLink } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

type AuthMode = 'signin' | 'signup' | 'forgot';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [configNotice, setConfigNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setConfigNotice(null);

    try {
      const supabase = createClient();

      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          if (error.message.toLowerCase().includes('email not confirmed')) {
            setConfigNotice(
              'This account was created while email confirmation was enabled. In Supabase Dashboard → Authentication → Users, delete or confirm this user, or ensure "Confirm email" is switched OFF in Providers → Email.'
            );
          } else {
            setErrorMessage(error.message);
          }
          setIsSubmitting(false);
          return;
        }

        // Sync profile into Neon PostgreSQL
        try {
          await fetch('/api/auth/sync-profile', { method: 'POST' });
        } catch (_) {}

        router.push('/dashboard');
        router.refresh();
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
              display_name: name.trim(),
            },
          },
        });

        if (error) {
          if (error.message.toLowerCase().includes('rate limit')) {
            setConfigNotice(
              'Supabase email rate limit exceeded because email confirmation is still active in your project settings. Please open Supabase Dashboard → Authentication → Providers → Email, turn "Confirm email" OFF, and click the green "Save" button.'
            );
            setIsSubmitting(false);
            return;
          }

          setErrorMessage(error.message);
          setIsSubmitting(false);
          return;
        }

        // 1. If Supabase returned an active session directly:
        if (data.session) {
          try {
            await fetch('/api/auth/sync-profile', { method: 'POST' });
          } catch (_) {}

          router.push('/dashboard');
          router.refresh();
          return;
        }

        // 2. If session is null, attempt immediate sign-in with password:
        const loginRes = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (loginRes.data?.session) {
          try {
            await fetch('/api/auth/sync-profile', { method: 'POST' });
          } catch (_) {}

          router.push('/dashboard');
          router.refresh();
          return;
        }

        // 3. Check if user already exists
        const isExistingUser =
          data.user && (!data.user.identities || data.user.identities.length === 0);

        if (isExistingUser) {
          if (loginRes.error?.message?.toLowerCase().includes('invalid login credentials')) {
            setErrorMessage(
              'An account with this email address already exists. Please enter your password to sign in.'
            );
            setMode('signin');
            setIsSubmitting(false);
            return;
          }
        }

        // 4. Check if email confirmation is blocking this account
        if (loginRes.error?.message?.toLowerCase().includes('email not confirmed')) {
          setConfigNotice(
            'This email account was registered previously while email confirmation was active. In Supabase Dashboard → Authentication → Users, delete or confirm this user to allow sign in, and ensure "Confirm email" is switched OFF in Providers → Email.'
          );
          setIsSubmitting(false);
          return;
        }

        if (loginRes.error) {
          setErrorMessage(loginRes.error.message);
          setIsSubmitting(false);
          return;
        }

        setErrorMessage('Unable to establish authenticated session.');
        setIsSubmitting(false);
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth`,
        });

        if (error) {
          setErrorMessage(error.message);
          setIsSubmitting(false);
          return;
        }

        setForgotSent(true);
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Authentication service temporarily unavailable.'
      );
      setIsSubmitting(false);
    }
  };

  const handleGitHubAuth = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setConfigNotice(null);

    try {
      const supabase = createClient();
      const origin =
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${origin}/api/auth/callback?next=/dashboard`,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Failed to initiate GitHub OAuth connection.'
      );
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
                {mode === 'signin' && 'Sign in to Workstation'}
                {mode === 'signup' && 'Create Developer Account'}
                {mode === 'forgot' && 'Reset Access Password'}
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-5 sm:p-6 space-y-4 font-sans">
            {/* Error banner */}
            {errorMessage && (
              <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-start gap-2 font-sans">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            {/* Supabase Configuration Notice banner */}
            {configNotice && (
              <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs space-y-2 font-sans">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Info className="w-4 h-4 shrink-0" />
                  <span>Supabase Action Required</span>
                </div>
                <p className="leading-relaxed text-[11px]">{configNotice}</p>
                <div className="pt-1 flex flex-col gap-1 text-[11px]">
                  <a
                    href="https://supabase.com/dashboard/project/fcccmfnyvignzdpplknc/auth/providers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-forest underline font-medium flex items-center gap-1 hover:text-forest-dark"
                  >
                    <span>Open Supabase Auth Providers Settings</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href="https://supabase.com/dashboard/project/fcccmfnyvignzdpplknc/auth/users"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-forest underline font-medium flex items-center gap-1 hover:text-forest-dark"
                  >
                    <span>Open Supabase Users List</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}

            {/* Primary GitHub CTA */}
            <Button
              type="button"
              variant="primary"
              onClick={handleGitHubAuth}
              loading={isSubmitting}
              className="w-full h-10 text-xs font-medium flex items-center justify-center gap-2 font-sans"
            >
              <Github className="w-4 h-4" />
              <span>Continue with GitHub</span>
            </Button>

            {/* Divider */}
            <div className="relative flex items-center justify-center">
              <div className="border-t border-border w-full dark:border-border-dark" />
              <span className="bg-surface px-2 text-[11px] uppercase tracking-wider text-text-muted absolute dark:bg-[#151C17] font-medium font-sans">
                or with credentials
              </span>
            </div>

            {/* Form */}
            {mode === 'forgot' && forgotSent ? (
              <div className="p-4 bg-forest/10 border border-forest/30 rounded text-center space-y-2 text-xs font-sans dark:bg-forest/20">
                <div className="flex items-center justify-center text-forest">
                  <Check className="w-5 h-5" />
                </div>
                <div className="font-semibold text-text-primary dark:text-white">
                  Reset Link Dispatched
                </div>
                <p className="text-text-secondary text-xs leading-relaxed dark:text-[#A7AFA9]">
                  We sent password reset instructions to <strong>{email || 'your email'}</strong> if an account exists.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setForgotSent(false);
                    setMode('signin');
                  }}
                  className="text-forest hover:underline text-xs pt-1 block mx-auto font-medium"
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3 font-sans">
                {mode === 'signup' && (
                  <div>
                    <label className="text-xs font-medium text-text-secondary block mb-1 dark:text-[#A7AFA9] font-sans">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full h-8 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#1A221D] dark:border-border-dark dark:text-white"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-text-secondary block mb-1 dark:text-[#A7AFA9] font-sans">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="developer@domain.com"
                    className="w-full h-8 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#1A221D] dark:border-border-dark dark:text-white"
                  />
                </div>

                {mode !== 'forgot' && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-text-secondary dark:text-[#A7AFA9] font-sans">
                        Password
                      </label>
                      {mode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMessage(null);
                            setConfigNotice(null);
                            setMode('forgot');
                          }}
                          className="text-xs text-text-muted hover:text-text-primary dark:hover:text-white font-sans"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full h-8 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#1A221D] dark:border-border-dark dark:text-white"
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  variant="secondary"
                  loading={isSubmitting}
                  className="w-full h-8 text-xs font-medium font-sans mt-2"
                >
                  {mode === 'signin' && 'Sign In'}
                  {mode === 'signup' && 'Create Account'}
                  {mode === 'forgot' && 'Send Reset Link'}
                </Button>
              </form>
            )}

            {/* Toggle Modes Footer */}
            <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted dark:border-border-dark font-sans">
              {mode === 'signin' && (
                <>
                  <span>No account yet?</span>
                  <button
                    onClick={() => {
                      setErrorMessage(null);
                      setConfigNotice(null);
                      setMode('signup');
                    }}
                    className="text-forest hover:underline font-medium"
                  >
                    Create one
                  </button>
                </>
              )}
              {mode === 'signup' && (
                <>
                  <span>Have an account?</span>
                  <button
                    onClick={() => {
                      setErrorMessage(null);
                      setConfigNotice(null);
                      setMode('signin');
                    }}
                    className="text-forest hover:underline font-medium"
                  >
                    Sign in
                  </button>
                </>
              )}
              {mode === 'forgot' && !forgotSent && (
                <button
                  onClick={() => {
                    setErrorMessage(null);
                    setConfigNotice(null);
                    setMode('signin');
                  }}
                  className="text-forest hover:underline font-medium text-center w-full"
                >
                  Back to Sign In
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Security Assurance */}
        <div className="text-center text-xs text-text-muted flex items-center justify-center gap-1.5 font-sans">
          <ShieldCheck className="w-3.5 h-3.5 text-forest shrink-0" />
          <span>Read-only GitHub OAuth · Strict AST symbol isolation</span>
        </div>
      </div>
    </div>
  );
}
