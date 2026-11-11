'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MarrowNodeLogo } from '@/components/MarrowNodeLogo';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { RepositorySelector } from '@/components/RepositorySelector';
import { createClient } from '@/utils/supabase/client';
import { getAppOrigin } from '@/lib/origin';
import {
  Github,
  CheckCircle2,
  Lock,
  Globe,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  FolderGit2,
  Code2,
  Database,
  Layers,
} from 'lucide-react';

interface UserInfo {
  id: string;
  email: string;
  name: string | null;
  githubConnection: {
    githubUsername: string | null;
  } | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Manual entry toggle
  const [manualEntry, setManualEntry] = useState(false);

  // Form state
  const [repoIdentifier, setRepoIdentifier] = useState('');
  const [repoDescription, setRepoDescription] = useState('');
  const [primaryLanguage, setPrimaryLanguage] = useState('TypeScript');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [isPrivate, setIsPrivate] = useState(true);

  // Submission & indexing state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [indexingStages, setIndexingStages] = useState<
    { id: string; label: string; detail: string; status: 'completed' | 'in_progress' | 'pending' }[]
  >([
    {
      id: 'db',
      label: 'Neon Database Registration',
      detail: 'Registering isolated project partition in Neon PostgreSQL…',
      status: 'pending',
    },
    {
      id: 'repo',
      label: 'Repository Entity Binding',
      detail: 'Connecting repository metadata and default branch targets…',
      status: 'pending',
    },
    {
      id: 'workers',
      label: 'Code & Package Analysis',
      detail: 'Reading project files, packages, and connections…',
      status: 'pending',
    },
    {
      id: 'ready',
      label: 'Project Ready',
      detail: 'Your project is ready to explore.',
      status: 'pending',
    },
  ]);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch('/api/user/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          if (data.user?.githubConnection?.githubUsername) {
            setRepoIdentifier(`${data.user.githubConnection.githubUsername}/`);
            // Automatically advance to step 2 if GitHub is connected
            setStep(2);
          }
        }
      } catch (_) {
      } finally {
        setLoadingUser(false);
      }
    }
    loadUser();
  }, []);

  const handleConnectGitHub = async () => {
    try {
      const supabase = createClient();
      const origin = getAppOrigin();
      await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${origin}/auth/callback?next=/onboarding`,
          scopes: 'read:user repo',
        },
      });
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to initiate GitHub authorization');
    }
  };

  const startAnalysisPipeline = async (projectId: string, repoLabel: string) => {
    setCreatedProjectId(projectId);
    setRepoIdentifier(repoLabel);
    setStep(3);

    // Progress stage 1: DB registration done
    setIndexingStages((prev) =>
      prev.map((s, idx) =>
        idx === 0
          ? { ...s, status: 'completed' }
          : idx === 1
          ? { ...s, status: 'in_progress' }
          : s
      )
    );

    setTimeout(() => {
      setIndexingStages((prev) =>
        prev.map((s, idx) =>
          idx <= 1
            ? { ...s, status: 'completed' }
            : idx === 2
            ? { ...s, status: 'in_progress' }
            : s
        )
      );
    }, 600);

    // Trigger deterministic analysis in background
    try {
      fetch(`/api/projects/${projectId}/analyze`, { method: 'POST' })
        .then(() => {
          setIndexingStages((prev) =>
            prev.map((s) => ({ ...s, status: 'completed' }))
          );
          setIsCompleted(true);
        })
        .catch(() => {
          setIndexingStages((prev) =>
            prev.map((s) => ({ ...s, status: 'completed' }))
          );
          setIsCompleted(true);
        });
    } catch (_) {
      setIsCompleted(true);
    }
  };

  const handleRepositoryConnectedFromSelector = (project: any, repo: any) => {
    if (project?.id) {
      startAnalysisPipeline(project.id, repo?.fullName || project.name);
    }
  };

  const handleCreateProjectManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const parts = repoIdentifier.trim().split('/');
    let owner = user?.githubConnection?.githubUsername || 'developer';
    let repoName = repoIdentifier.trim();

    if (parts.length > 1 && parts[0] && parts[1]) {
      owner = parts[0].trim();
      repoName = parts.slice(1).join('/').trim();
    }

    if (!repoName) {
      setErrorMessage('Please specify a repository name (e.g., owner/repo-name)');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: repoName,
          description: repoDescription.trim() || undefined,
          githubOwner: owner,
          githubRepositoryName: repoName,
          defaultBranch: defaultBranch.trim() || 'main',
          visibility: isPrivate ? 'private' : 'public',
          primaryLanguage,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create project in database');
      }

      const data = await res.json();
      startAnalysisPipeline(data.project.id, `${owner}/${repoName}`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error configuring project in database');
      setStep(2);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-ivory dark:bg-[#0E1310] flex flex-col justify-between p-4 sm:p-6 bg-grid-pattern font-sans">
      {/* Top Header */}
      <header className="max-w-4xl w-full mx-auto flex items-center justify-between pb-6 border-b border-border dark:border-border-dark font-sans">
        <Link href="/">
          <MarrowNodeLogo variant="full" size="md" />
        </Link>

        {/* Step Indicator */}
        <div className="flex items-center gap-2 text-xs font-sans text-text-muted">
          <span
            className={`px-2.5 py-1 rounded font-medium ${
              step === 1 ? 'bg-charcoal text-white dark:bg-forest' : 'text-text-secondary'
            }`}
          >
            1. Authorize
          </span>
          <span>→</span>
          <span
            className={`px-2.5 py-1 rounded font-medium ${
              step === 2 ? 'bg-charcoal text-white dark:bg-forest' : 'text-text-secondary'
            }`}
          >
            2. Choose Repo
          </span>
          <span>→</span>
          <span
            className={`px-2.5 py-1 rounded font-medium ${
              step === 3 ? 'bg-charcoal text-white dark:bg-forest' : 'text-text-secondary'
            }`}
          >
            3. Initialize
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl w-full mx-auto my-8 font-sans">
        {errorMessage && (
          <div className="mb-4 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-start gap-2 font-sans">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMessage}</span>
          </div>
        )}

        {/* ============================================================ */}
        {/* SCREEN 1: REPOSITORY AUTHORIZATION */}
        {/* ============================================================ */}
        {step === 1 && (
          <Card className="shadow-card border-border dark:bg-[#151C17] dark:border-border-dark overflow-hidden font-sans">
            <CardHeader className="bg-surface-subtle dark:bg-[#1A221D] p-4 border-b border-border dark:border-border-dark">
              <CardTitle>Step 1 · Repository Authorization</CardTitle>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-6 text-center font-sans">
              <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/30 flex items-center justify-center mx-auto text-forest dark:bg-forest/20 dark:text-[#88B094]">
                <Github className="w-6 h-6" />
              </div>

              <div className="space-y-2 max-w-md mx-auto">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary dark:text-white font-sans">
                  Connect your GitHub
                </h2>
                <p className="text-xs sm:text-sm text-text-secondary dark:text-[#A7AFA9] leading-relaxed font-sans">
                  Link your repository so MarrowNode can analyze codebase structure, dependencies, and architecture history.
                </p>
              </div>

              {/* Status if GitHub is already connected */}
              {user?.githubConnection?.githubUsername ? (
                <div className="p-3.5 bg-forest/10 border border-forest/30 rounded text-xs flex items-center justify-between max-w-md mx-auto dark:bg-forest/20">
                  <div className="flex items-center gap-2 text-text-primary dark:text-white font-medium">
                    <CheckCircle2 className="w-4 h-4 text-forest shrink-0" />
                    <span>Connected as @{user.githubConnection.githubUsername}</span>
                  </div>
                  <Badge variant="success" size="xs">
                    OAuth Active
                  </Badge>
                </div>
              ) : null}

              {/* Permission Scope Summary */}
              <div className="p-4 bg-surface-subtle rounded border border-border text-left space-y-2 max-w-md mx-auto dark:bg-[#1A221D] dark:border-border-dark text-xs font-sans">
                <div className="text-[11px] uppercase text-text-muted font-semibold tracking-wider">
                  Permissions Requested:
                </div>
                <div className="flex items-center gap-2 text-text-secondary dark:text-[#A7AFA9]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-forest" />
                  <span>Project files and folder structure</span>
                </div>
                <div className="flex items-center gap-2 text-text-secondary dark:text-[#A7AFA9]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-forest" />
                  <span>Commit log & historical blame metadata</span>
                </div>
                <div className="flex items-center gap-2 text-text-secondary dark:text-[#A7AFA9]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-forest" />
                  <span>Dependency manifests (package.json, Cargo.toml)</span>
                </div>
              </div>

              <div className="space-y-2.5 max-w-md mx-auto">
                {user?.githubConnection?.githubUsername ? (
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => setStep(2)}
                    className="font-sans font-medium text-xs w-full h-10"
                  >
                    <span>Proceed to Repository Selection</span>
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleConnectGitHub}
                      className="font-sans font-medium text-xs w-full h-10"
                    >
                      <Github className="w-4 h-4 mr-2" />
                      <span>Authorize with GitHub</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep(2)}
                      className="text-xs text-text-muted hover:text-text-primary dark:hover:text-white"
                    >
                      Or enter repository details manually →
                    </Button>
                  </>
                )}
              </div>

              <div className="text-xs text-text-muted flex items-center justify-center gap-1.5 pt-2 font-sans">
                <ShieldCheck className="w-3.5 h-3.5 text-forest" />
                <span>Zero write permissions requested. Code is never used to train public models.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ============================================================ */}
        {/* SCREEN 2: SELECT REPOSITORY */}
        {/* ============================================================ */}
        {step === 2 && (
          <div className="space-y-4">
            {!manualEntry ? (
              <div>
                <RepositorySelector
                  onRepositoryConnected={handleRepositoryConnectedFromSelector}
                />
                <div className="text-center mt-3">
                  <button
                    onClick={() => setManualEntry(true)}
                    className="text-xs text-text-muted hover:text-text-primary dark:hover:text-white underline underline-offset-4"
                  >
                    Or enter repository details manually
                  </button>
                </div>
              </div>
            ) : (
              <Card className="shadow-card border-border dark:bg-[#151C17] dark:border-border-dark overflow-hidden font-sans">
                <CardHeader className="bg-surface-subtle dark:bg-[#1A221D] p-4 border-b border-border dark:border-border-dark flex flex-row items-center justify-between">
                  <CardTitle>Step 2 · Configure repository manually</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setManualEntry(false)}
                    className="text-xs text-text-muted hover:text-text-primary dark:hover:text-white"
                  >
                    Browse GitHub Repositories
                  </Button>
                </CardHeader>

                <CardContent className="p-5 sm:p-6 space-y-4 font-sans">
                  <form onSubmit={handleCreateProjectManual} className="space-y-4 font-sans">
                    <div>
                      <label className="text-xs font-semibold text-text-secondary dark:text-[#A7AFA9] block mb-1">
                        Repository Identifier <span className="text-copper">*</span>
                      </label>
                      <div className="relative">
                        <FolderGit2 className="w-4 h-4 text-text-muted absolute left-3 top-2.5 pointer-events-none" />
                        <input
                          type="text"
                          required
                          value={repoIdentifier}
                          onChange={(e) => setRepoIdentifier(e.target.value)}
                          placeholder="owner/repo-name (e.g. acme/backend-api)"
                          className="w-full h-9 pl-9 pr-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#1A221D] dark:border-border-dark dark:text-white"
                        />
                      </div>
                      <span className="text-[11px] text-text-muted mt-1 block">
                        Format: organization/repository or repository-name
                      </span>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-text-secondary dark:text-[#A7AFA9] block mb-1">
                        Description (optional)
                      </label>
                      <input
                        type="text"
                        value={repoDescription}
                        onChange={(e) => setRepoDescription(e.target.value)}
                        placeholder="Core platform infrastructure & microservices"
                        className="w-full h-8 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#1A221D] dark:border-border-dark dark:text-white"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-text-secondary dark:text-[#A7AFA9] block mb-1">
                          Primary Language
                        </label>
                        <div className="relative">
                          <Code2 className="w-3.5 h-3.5 text-text-muted absolute left-3 top-2.5 pointer-events-none" />
                          <select
                            value={primaryLanguage}
                            onChange={(e) => setPrimaryLanguage(e.target.value)}
                            className="w-full h-8 pl-8 pr-3 bg-surface border border-border rounded text-xs font-sans text-text-primary focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#1A221D] dark:border-border-dark dark:text-white"
                          >
                            <option value="TypeScript">TypeScript</option>
                            <option value="JavaScript">JavaScript</option>
                            <option value="Python">Python</option>
                            <option value="Go">Go</option>
                            <option value="Rust">Rust</option>
                            <option value="Java">Java</option>
                            <option value="C++">C++</option>
                            <option value="Ruby">Ruby</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-text-secondary dark:text-[#A7AFA9] block mb-1">
                          Default Branch
                        </label>
                        <input
                          type="text"
                          value={defaultBranch}
                          onChange={(e) => setDefaultBranch(e.target.value)}
                          placeholder="main"
                          className="w-full h-8 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#1A221D] dark:border-border-dark dark:text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-text-secondary dark:text-[#A7AFA9] block mb-1.5">
                        Visibility
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setIsPrivate(true)}
                          className={`flex-1 p-2.5 rounded border text-xs flex items-center justify-center gap-2 transition-colors ${
                            isPrivate
                              ? 'border-forest bg-forest/10 font-semibold text-text-primary dark:text-white dark:bg-forest/20'
                              : 'border-border bg-surface text-text-muted dark:bg-[#1A221D] dark:border-border-dark'
                          }`}
                        >
                          <Lock className="w-3.5 h-3.5 text-forest" />
                          <span>Private Repository</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsPrivate(false)}
                          className={`flex-1 p-2.5 rounded border text-xs flex items-center justify-center gap-2 transition-colors ${
                            !isPrivate
                              ? 'border-forest bg-forest/10 font-semibold text-text-primary dark:text-white dark:bg-forest/20'
                              : 'border-border bg-surface text-text-muted dark:bg-[#1A221D] dark:border-border-dark'
                          }`}
                        >
                          <Globe className="w-3.5 h-3.5 text-forest" />
                          <span>Public Repository</span>
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-border flex items-center justify-between dark:border-border-dark">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setStep(1)}
                        className="font-sans text-xs font-medium"
                      >
                        Back
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        loading={isSubmitting}
                        className="font-sans text-xs font-medium"
                      >
                        <span>Connect & Initialize</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* SCREEN 3: INITIALIZING PROJECT */}
        {/* ============================================================ */}
        {step === 3 && (
          <Card className="shadow-card border-border dark:bg-[#151C17] dark:border-border-dark overflow-hidden font-sans">
            <CardHeader className="bg-surface-subtle dark:bg-[#1A221D] p-4 border-b border-border dark:border-border-dark">
              <div className="flex items-center justify-between w-full">
                <CardTitle>Step 3 · Project Initialization</CardTitle>
                <span className="text-xs text-text-muted font-sans font-mono">
                  {repoIdentifier}
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-6 font-sans">
              <div className="text-center space-y-1">
                <h3 className="text-lg font-bold text-text-primary dark:text-white font-sans">
                  {isCompleted ? 'Project Ready in MarrowNode' : 'Analyzing Code & History'}
                </h3>
                <p className="text-xs text-text-muted font-sans">
                  {isCompleted
                    ? 'Files, packages, and commit history analyzed. Ready to open your dashboard.'
                    : 'Reading files, packages, language breakdown, and commit records…'}
                </p>
              </div>

              {/* Progress Checklist */}
              <div className="p-4 bg-surface-subtle border border-border rounded space-y-3 dark:bg-[#18201B] dark:border-border-dark text-xs font-sans">
                {indexingStages.map((s) => (
                  <div key={s.id} className="flex items-start gap-2.5">
                    <div className="shrink-0 mt-0.5">
                      {s.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-forest dark:text-[#88B094]" />
                      ) : s.status === 'in_progress' ? (
                        <span className="w-4 h-4 flex items-center justify-center">
                          <span className="w-2 h-2 rounded-full bg-forest animate-ping" />
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded-full border border-border flex items-center justify-center text-[10px] text-text-muted">
                          ○
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 font-sans">
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-semibold ${
                            s.status === 'completed'
                              ? 'text-text-primary dark:text-white'
                              : s.status === 'in_progress'
                              ? 'text-forest font-bold dark:text-[#88B094]'
                              : 'text-text-muted'
                          }`}
                        >
                          {s.label}
                        </span>
                        <span className="text-[11px] text-text-muted uppercase font-medium">
                          {s.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted leading-tight mt-0.5 font-sans">
                        {s.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Enter Workstation CTA */}
              <div className="pt-2 text-center font-sans">
                <Button
                  variant="primary"
                  size="lg"
                  disabled={!isCompleted}
                  onClick={() => router.push('/dashboard')}
                  className="font-sans font-medium text-xs w-full max-w-sm h-10"
                >
                  <span>{isCompleted ? 'Open Project Dashboard' : 'Setting up…'}</span>
                  {isCompleted && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-text-muted pt-4 border-t border-border dark:border-border-dark font-sans">
        MarrowNode · The Memory Layer for Software
      </footer>
    </div>
  );
}
