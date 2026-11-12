'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sidebar, DashboardView } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { MobileNavigation } from '@/components/MobileNavigation';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { ProjectHeader } from '@/components/ProjectHeader';
import { RepositorySelector } from '@/components/RepositorySelector';
import { ContextCoverageWidget } from '@/components/ContextCoverageWidget';
import { ProjectIntelligencePanel } from '@/components/ProjectIntelligencePanel';
import { ArchitectureGraph } from '@/components/ArchitectureGraph';
import { ProjectTimeline } from '@/components/ProjectTimeline';
import { ChangeImpactAnalysis } from '@/components/ChangeImpactAnalysis';
import { EvidenceExplorer } from '@/components/EvidenceExplorer';
import { RepositoryExplorer } from '@/components/RepositoryExplorer';
import { AskProjectInterface } from '@/components/AskProjectInterface';
import { ProjectSettings } from '@/components/ProjectSettings';
import { DeveloperOnboarding } from '@/components/DeveloperOnboarding';
import { PullRequestListPanel } from '@/components/PullRequestListPanel';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  FileCode2,
  GitCommit,
  Network,
  ShieldCheck,
  ArrowRight,
  FolderGit2,
  RefreshCw,
  Plus,
  X,
  AlertCircle,
  Play,
  CheckCircle2,
  Compass,
  GitPullRequest,
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<DashboardView>('overview');
  const [user, setUser] = useState<any | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectContext, setProjectContext] = useState<any | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showRepoModal, setShowRepoModal] = useState(false);

  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  const [focusedFilePath, setFocusedFilePath] = useState<string | undefined>(undefined);
  const [analysisProgress, setAnalysisProgress] = useState<{
    analysisId: string;
    status: string;
    totalSourceFiles: number;
    processedSourceFiles: number;
    failedFiles: number;
    totalBatches: number;
    completedBatches: number;
    totalCommitsIngested: number;
    historyStatus: string;
  } | null>(null);
  const activeStepRunRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const fileParam = params.get('file');
    if (fileParam) {
      setFocusedFilePath(fileParam);
    }
    const validViews: DashboardView[] = [
      'overview',
      'onboarding',
      'explorer',
      'architecture',
      'timeline',
      'ask',
      'impact',
      'pull-requests',
      'evidence',
      'settings',
    ];
    if (viewParam && validViews.includes(viewParam as DashboardView)) {
      setActiveView(viewParam as DashboardView);
    }
  }, []);

  const handleNavigateIntel = (view: DashboardView, targetPath?: string) => {
    if (targetPath && targetPath !== '/') {
      setFocusedFilePath(targetPath);
    }
    setActiveView(view);
  };

  const fetchProjectContext = async (projectId: string) => {
    try {
      setIsLoadingContext(true);
      const res = await fetch(`/api/projects/${projectId}/context`);
      if (res.ok) {
        const data = await res.json();
        setProjectContext(data.context);
      }
    } catch (err) {
      console.error('[Dashboard fetch context error]:', err);
    } finally {
      setIsLoadingContext(false);
    }
  };

  const fetchDashboardData = async (targetProjectId?: string) => {
    try {
      // 1. Fetch user profile, active project, and all owned projects in parallel
      const [userRes, activeRes, projectsRes] = await Promise.all([
        fetch('/api/user/me'),
        fetch('/api/projects/active'),
        fetch('/api/projects'),
      ]);

      if (userRes.status === 401) {
        router.push('/auth');
        return;
      }

      if (userRes.ok) {
        const userData = await userRes.json();
        setUser(userData.user);
      }

      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        const projs = projectsData.projects || [];
        setProjects(projs);
      }

      if (activeRes.ok) {
        const activeData = await activeRes.json();
        if (activeData.hasActiveProject && activeData.project) {
          const activeProjId = targetProjectId || activeData.project.id;
          setSelectedProjectId(activeProjId);
          if (activeData.context && activeProjId === activeData.project.id) {
            setProjectContext(activeData.context);
          } else {
            await fetchProjectContext(activeProjId);
          }
        }
      }
    } catch (err) {
      console.error('[Dashboard fetch error]:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleSelectProject = async (projectId: string) => {
    activeStepRunRef.current = null;
    setAnalysisProgress(null);
    setSelectedProjectId(projectId);
    // Clear previous project state immediately so stale data never flashes across switches
    setProjectContext(null);
    setAnalysisError(null);
    setSyncStatusMessage(null);
    setFocusedFilePath(undefined);
    setIsLoadingContext(true);
    try {
      // Authoritatively persist active project switch to server Neon database
      const res = await fetch('/api/projects/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (res.ok) {
        const data = await res.json();
        setProjectContext(data.context);
      } else {
        await fetchProjectContext(projectId);
      }
    } catch (_) {
      await fetchProjectContext(projectId);
    } finally {
      setIsLoadingContext(false);
    }
  };

  const driveAnalysisSteps = async (projectId: string, analysisId: string) => {
    if (activeStepRunRef.current === analysisId) return;
    activeStepRunRef.current = analysisId;
    setIsAnalyzing(true);
    try {
      let completed = false;
      for (let i = 0; i < 80 && !completed; i++) {
        if (activeStepRunRef.current !== analysisId) break;
        const stepRes = await fetch(`/api/projects/${encodeURIComponent(projectId)}/analyze/step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ analysisId }),
        });
        const stepData = await stepRes.json();
        if (!stepRes.ok) {
          setAnalysisError(stepData.error || 'Analysis step paused cleanly. Click Analyze again to resume.');
          break;
        }
        if (stepData.snapshot) {
          setAnalysisProgress(stepData.snapshot);
        }
        completed = Boolean(stepData.completed);
        if (!completed) {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      if (completed) {
        setAnalysisProgress(null);
        await fetchDashboardData(projectId);
      }
    } catch (err: any) {
      setAnalysisError(err?.message || 'Unable to resume analysis step.');
    } finally {
      if (activeStepRunRef.current === analysisId) {
        activeStepRunRef.current = null;
      }
      setIsAnalyzing(false);
    }
  };

  // Recover and resume active queued/running analysis cleanly after page refresh (#37)
  useEffect(() => {
    if (
      selectedProjectId &&
      projectContext?.activeProgress?.analysisId &&
      (projectContext.activeProgress.status === 'RUNNING' ||
        projectContext.activeProgress.status === 'QUEUED') &&
      activeStepRunRef.current !== projectContext.activeProgress.analysisId
    ) {
      setAnalysisProgress({
        ...projectContext.activeProgress,
        failedFiles: 0,
      });
      driveAnalysisSteps(selectedProjectId, projectContext.activeProgress.analysisId);
    }
  }, [selectedProjectId, projectContext?.activeProgress?.analysisId]);

  const handleCancelAnalysis = async () => {
    if (!selectedProjectId || !analysisProgress?.analysisId) return;
    const cancelId = analysisProgress.analysisId;
    activeStepRunRef.current = null;
    try {
      await fetch(`/api/projects/${encodeURIComponent(selectedProjectId)}/analyze/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: cancelId }),
      });
      setAnalysisProgress(null);
      setIsAnalyzing(false);
      await fetchDashboardData(selectedProjectId);
    } catch {
      // ignore cancel UI glitch
    }
  };

  const handleSyncProject = async () => {
    if (!selectedProjectId) return;
    setIsRefreshing(true);
    setSyncStatusMessage(null);

    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/sync`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok) {
        if (data.snapshot && !data.completed && data.analysisId) {
          setAnalysisProgress(data.snapshot);
          setSyncStatusMessage(data.message || 'Sync started; processing repository batches…');
          driveAnalysisSteps(selectedProjectId, data.analysisId);
        } else {
          setSyncStatusMessage(data.message || 'Project updated with latest changes.');
          setTimeout(() => setSyncStatusMessage(null), 4000);
          await fetchDashboardData(selectedProjectId);
        }
      } else {
        setAnalysisError(data.error || 'Could not sync changes. Try syncing again.');
      }
    } catch (err: any) {
      setAnalysisError(err?.message || 'Could not sync project changes.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStartAnalysis = async (targetProjectId?: string) => {
    const id = targetProjectId || selectedProjectId;
    if (!id) return;

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const res = await fetch(`/api/projects/${id}/analyze`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        setAnalysisError(data.error || 'Could not finish analyzing this project. Please try again.');
        setIsAnalyzing(false);
        return;
      }

      if (data.snapshot && !data.completed && data.analysisId) {
        setAnalysisProgress(data.snapshot);
        await driveAnalysisSteps(id, data.analysisId);
      } else {
        setAnalysisProgress(null);
        await fetchDashboardData(id);
        setIsAnalyzing(false);
      }
    } catch (err: any) {
      setAnalysisError(err?.message || 'Unable to start project analysis right now.');
      setIsAnalyzing(false);
    }
  };

  const handleRepoConnected = async (newProject: any) => {
    setShowRepoModal(false);
    if (newProject?.id) {
      setSelectedProjectId(newProject.id);
      await fetchDashboardData(newProject.id);
      // Automatically trigger deterministic analysis
      handleStartAnalysis(newProject.id);
    } else {
      await fetchDashboardData();
    }
  };

  const handleSelectCommandAction = (type: string, target: string) => {
    if (type === 'view') {
      setActiveView(target as DashboardView);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ivory flex items-center justify-center font-sans text-xs text-text-muted dark:bg-[#0E1310]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-forest animate-ping" />
          <span>Loading your project…</span>
        </div>
      </div>
    );
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0] || null;
  const latestAnalysis = selectedProject?.analyses?.[0] || null;

  return (
    <div className="flex h-[100dvh] lg:h-screen overflow-hidden bg-ivory dark:bg-[#0E1310] text-text-primary font-sans">
      {/* Desktop Left Sidebar */}
      <div className="hidden lg:block shrink-0 h-full">
        <Sidebar
          activeView={activeView}
          onSelectView={setActiveView}
          user={user}
        />
      </div>

      {/* Main AppShell Frame */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Topbar */}
        <Topbar
          onOpenSearch={() => setIsCommandPaletteOpen(true)}
          onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)}
          mobileNavOpen={isMobileNavOpen}
          project={selectedProject}
          projects={projects}
          onSelectProject={handleSelectProject}
        />

        {/* Scrollable Content Surface — reserves bottom nav height + safe-area inset */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+1.75rem)] lg:pb-8">
          {/* Project Repository Header */}
          <ProjectHeader
            project={selectedProject}
            freshness={projectContext?.latestAnalysis?.freshness}
            onRefresh={handleSyncProject}
            isRefreshing={isRefreshing}
            onAnalyze={() => handleStartAnalysis()}
            isAnalyzing={isAnalyzing}
            onConnectRepo={() => setShowRepoModal(true)}
          />

          {/* Live Resumable Batch & History Progress Indicator (#36) */}
          {analysisProgress && (
            <div className="p-3.5 mx-3 sm:mx-6 mt-3 rounded bg-forest/10 border border-forest/30 text-xs space-y-2 font-sans">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-text-primary dark:text-white flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-forest animate-spin shrink-0" />
                  <span>
                    Analyzing repository ({analysisProgress.processedSourceFiles} / {analysisProgress.totalSourceFiles} source files)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-text-muted">
                    Batch {analysisProgress.completedBatches}/{Math.max(1, analysisProgress.totalBatches)} · {analysisProgress.totalCommitsIngested} commits ({analysisProgress.historyStatus.toLowerCase()})
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelAnalysis}
                    className="text-[11px] font-medium text-copper hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {analysisProgress.totalBatches > 0 && (
                <div className="w-full h-1.5 rounded-full bg-surface border border-border overflow-hidden">
                  <div
                    className="h-full bg-forest transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (analysisProgress.completedBatches / analysisProgress.totalBatches) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Mandatory Stale / Unverified Freshness Disclosure */}
          {selectedProject &&
            (projectContext?.latestAnalysis?.freshness === 'STALE' ||
              projectContext?.latestAnalysis?.freshness === 'UNVERIFIED') && (
              <div className="p-3 mx-3 sm:mx-6 mt-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 font-sans">
                <div className="flex items-start sm:items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
                  <span className="break-words">
                    {projectContext.latestAnalysis.freshness === 'STALE'
                      ? 'Repository has changed since this analysis.'
                      : 'Repository freshness could not be verified.'}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSyncProject}
                  disabled={isRefreshing || isAnalyzing}
                  className="shrink-0 self-start sm:self-center text-xs"
                >
                  Sync &amp; Re-analyze
                </Button>
              </div>
            )}

          {/* Sync status alert */}
          {syncStatusMessage && (
            <div className="p-3 mx-3 sm:mx-6 mt-3 rounded bg-forest/10 border border-forest/20 text-forest dark:text-[#9AC6A7] text-xs flex items-center justify-between gap-2 font-sans animate-in fade-in-50">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="break-words">{syncStatusMessage}</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => setSyncStatusMessage(null)}
                className="text-text-muted hover:text-text-primary dark:hover:text-white shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Analysis error alert */}
          {analysisError && (
            <div className="p-3.5 mx-3 sm:mx-6 mt-3 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-2 font-sans">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="break-words">{analysisError}</span>
              </div>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setAnalysisError(null)}
                className="text-text-muted hover:text-text-primary dark:hover:text-white shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Main View Surface */}
          <div className="p-3 sm:p-5 lg:p-6 max-w-7xl mx-auto space-y-5 sm:space-y-6 font-sans min-w-0">
            {/* If no project is connected yet and on overview */}
            {!selectedProject && activeView === 'overview' ? (
              <div className="space-y-6 animate-in fade-in-50 duration-150">
                {/* Repository Browser / Connect Widget */}
                <RepositorySelector
                  onRepositoryConnected={handleRepoConnected}
                  className="mb-6"
                />

                {/* Initial Blank Coverage Indicator */}
                <ContextCoverageWidget coverage={null} />

                {/* Clean Unanalyzed Telemetry Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 font-sans">
                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Files analyzed</span>
                      <FileCode2 className="w-3.5 h-3.5 text-forest" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      0
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      No project connected
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Project areas</span>
                      <Network className="w-3.5 h-3.5 text-forest" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      0
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      Project structure unavailable
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Recent commits</span>
                      <GitCommit className="w-3.5 h-3.5 text-copper" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      0
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      No development history yet
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Project evidence</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-forest" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      0
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      No evidence collected
                    </div>
                  </div>
                </div>

                {/* Central Intelligence Callout */}
                <ProjectIntelligencePanel
                  hasAnalyzedProject={false}
                  onConnectRepo={() => setShowRepoModal(true)}
                />
              </div>
            ) : null}

            {/* If project IS present and on overview */}
            {selectedProject && activeView === 'overview' ? (
              <div className="space-y-6 animate-in fade-in-50 duration-150">
                {/* 1. Project Understanding Coverage */}
                <ContextCoverageWidget
                  coverage={projectContext?.coverage || null}
                />

                {/* Unanalyzed banner if project has no analysis yet */}
                {(!latestAnalysis || latestAnalysis.status === 'PENDING') && (
                  <div className="p-4 rounded-lg bg-surface border border-forest/30 dark:bg-[#151C17] dark:border-forest/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans">
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-text-primary dark:text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-copper animate-pulse" />
                        <span>Ready to analyze your project</span>
                      </div>
                      <p className="text-xs text-text-muted">
                        Run analysis to explore your files, packages, project structure, and recent changes.
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleStartAnalysis()}
                      loading={isAnalyzing}
                      disabled={isAnalyzing}
                      className="text-xs font-sans font-medium shrink-0"
                    >
                      <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                      Analyze project
                    </Button>
                  </div>
                )}

                {/* 2. Key Project Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 font-sans">
                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Files analyzed</span>
                      <FileCode2 className="w-3.5 h-3.5 text-forest" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      {projectContext?.coverage?.files
                        ? `${projectContext.coverage.files.parsed} / ${projectContext.coverage.files.source}`
                        : (latestAnalysis?.filesAnalyzed ?? 0)}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {projectContext?.coverage?.files
                        ? `${projectContext.coverage.files.coveragePercent}% of code files (${projectContext.coverage.files.discovered} total)`
                        : (latestAnalysis ? `${latestAnalysis.filesAnalyzed} files analyzed` : 'Waiting for analysis')}
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">File connections</span>
                      <Network className="w-3.5 h-3.5 text-forest" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      {projectContext?.coverage?.imports
                        ? `${projectContext.coverage.imports.resolved} / ${projectContext.coverage.imports.total}`
                        : (latestAnalysis?.architectureNodes ?? 0)}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {projectContext?.coverage?.imports
                        ? `${projectContext.coverage.imports.resolutionPercent}% confirmed (${projectContext.coverage.imports.unresolved} unconfirmed)`
                        : (latestAnalysis ? `${latestAnalysis.dependenciesDetected ?? 0} packages` : 'Waiting for analysis')}
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Recent commits</span>
                      <GitCommit className="w-3.5 h-3.5 text-copper" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      {projectContext?.coverage?.git?.commitsIndexed ?? (latestAnalysis?.commitsAnalyzed ?? 0)}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {projectContext?.coverage?.git?.commitsIndexed
                        ? `Recent commits analyzed on ${selectedProject.defaultBranch || 'main'}`
                        : (latestAnalysis ? 'Commit history analyzed' : 'Waiting for analysis')}
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Project evidence</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-forest" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      {projectContext?.evidenceItems?.length ?? (selectedProject._count?.evidences ?? latestAnalysis?.evidenceCount ?? 0)}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {projectContext?.coverage?.documentation
                        ? projectContext.coverage.documentation.filesDetected > 0
                          ? `${projectContext.coverage.documentation.filesDetected} documentation file(s) found`
                          : 'No documentation files found'
                        : 'Files, commits, and packages'}
                    </div>
                  </div>
                </div>

                {/* 3. Ask MarrowNode Panel */}
                <ProjectIntelligencePanel
                  key={selectedProject.id}
                  projectId={selectedProject.id}
                  hasAnalyzedProject={Boolean(
                    projectContext?.latestAnalysis?.status === 'COMPLETED' ||
                      projectContext?.latestAnalysis?.status === 'PARTIALLY_COMPLETED' ||
                      latestAnalysis?.status === 'COMPLETED' ||
                      latestAnalysis?.status === 'PARTIALLY_COMPLETED'
                  )}
                  onConnectRepo={() => setShowRepoModal(true)}
                />

                {/* 3B. Onboarding & Pull Request Workflows Quick Entry */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => setActiveView('onboarding')}
                    className="text-left p-4 rounded-lg border border-border bg-surface hover:border-forest/50 hover:bg-forest/5 transition-all flex items-center justify-between gap-3 dark:bg-[#151C17] dark:border-border-dark"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <Compass className="w-5 h-5 text-forest shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary dark:text-white">
                          Developer Onboarding
                        </div>
                        <p className="text-xs text-text-muted mt-0.5 break-words">
                          Start-here guide, key files, architecture areas, auth &amp; data flows
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveView('pull-requests')}
                    className="text-left p-4 rounded-lg border border-border bg-surface hover:border-forest/50 hover:bg-forest/5 transition-all flex items-center justify-between gap-3 dark:bg-[#151C17] dark:border-border-dark"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <GitPullRequest className="w-5 h-5 text-copper shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary dark:text-white">
                          GitHub PR Check
                        </div>
                        <p className="text-xs text-text-muted mt-0.5 break-words">
                          Evaluate PR blast radius, deleted/renamed callers &amp; schema changes
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />
                  </button>
                </div>

                {/* 4. Two-Column Dashboard Overview Widgets */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
                  {/* Left: Project Structure Preview */}
                  <div className="lg:col-span-7 min-w-0">
                    <Card className="h-full flex flex-col justify-between font-sans">
                      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                          <div className="flex items-center gap-2 min-w-0">
                            <Network className="w-4 h-4 text-forest dark:text-[#9AC6A7] shrink-0" />
                            <CardTitle>Project Structure</CardTitle>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveView('architecture')}
                            className="text-xs font-sans font-medium shrink-0"
                          >
                            <span>See connections</span>
                            <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </div>
                      </CardHeader>

                      <CardContent className="p-4 sm:p-6 text-center space-y-2">
                        <div className="text-xs text-text-muted">
                          {latestAnalysis?.status === 'COMPLETED'
                            ? `Found ${latestAnalysis.architectureNodes || 0} connected areas across your project.`
                            : 'Run analysis to see how the parts of your project connect.'}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Right: Recent Development History */}
                  <div className="lg:col-span-5 min-w-0">
                    <Card className="h-full flex flex-col justify-between font-sans">
                      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                          <div className="flex items-center gap-2 min-w-0">
                            <GitCommit className="w-4 h-4 text-copper dark:text-[#E69E7B] shrink-0" />
                            <CardTitle>Development History</CardTitle>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveView('timeline')}
                            className="text-xs font-sans font-medium shrink-0"
                          >
                            <span>View history</span>
                            <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </div>
                      </CardHeader>

                      <CardContent className="p-4 sm:p-6 text-center space-y-2">
                        <div className="text-xs text-text-muted">
                          {latestAnalysis?.status === 'COMPLETED'
                            ? `Reviewed ${latestAnalysis.commitsAnalyzed || 0} recent commits on ${selectedProject.defaultBranch || 'main'}.`
                            : 'No development history analyzed yet.'}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            ) : null}

            {/* VIEW 1B: DEVELOPER ONBOARDING */}
            {activeView === 'onboarding' && (
              <div className="animate-in fade-in-50 duration-150">
                <DeveloperOnboarding
                  key={selectedProject?.id || 'no-proj-onboarding'}
                  projectId={selectedProject?.id}
                  hasProject={Boolean(selectedProject)}
                  isAnalyzing={isAnalyzing || selectedProject?.analysisStatus === 'RUNNING'}
                  onConnectRepo={() => setShowRepoModal(true)}
                  onSyncProject={handleSyncProject}
                  onNavigateView={handleNavigateIntel}
                />
              </div>
            )}

            {/* VIEW 2: REPOSITORY EXPLORER */}
            {activeView === 'explorer' && (
              <div className="animate-in fade-in-50 duration-150">
                <RepositoryExplorer
                  key={`${selectedProject?.id || 'none'}:${focusedFilePath || 'default-explorer'}`}
                  initialFile={focusedFilePath}
                  fileTree={projectContext?.fileTree || []}
                  hasProject={Boolean(selectedProject)}
                  isAnalyzing={isAnalyzing || selectedProject?.analysisStatus === 'RUNNING'}
                  onConnectRepo={() => setShowRepoModal(true)}
                />
              </div>
            )}

            {/* VIEW 3: ARCHITECTURE */}
            {activeView === 'architecture' && (
              <div className="animate-in fade-in-50 duration-150">
                <ArchitectureGraph
                  key={selectedProject?.id || 'no-proj-arch'}
                  nodes={projectContext?.nodes || []}
                  edges={projectContext?.edges || []}
                  hasProject={Boolean(selectedProject)}
                  isAnalyzing={isAnalyzing || selectedProject?.analysisStatus === 'RUNNING'}
                  onConnectRepo={() => setShowRepoModal(true)}
                />
              </div>
            )}

            {/* VIEW 4: TIMELINE */}
            {activeView === 'timeline' && (
              <div className="animate-in fade-in-50 duration-150">
                <ProjectTimeline
                  key={selectedProject?.id || 'no-proj-timeline'}
                  projectId={selectedProject?.id}
                  events={projectContext?.timeline || []}
                  totalCommitsCount={projectContext?.historyTotalCount}
                  hasProject={Boolean(selectedProject)}
                  isAnalyzing={isAnalyzing || selectedProject?.analysisStatus === 'RUNNING'}
                  onConnectRepo={() => setShowRepoModal(true)}
                />
              </div>
            )}

            {/* VIEW 5: ASK PROJECT */}
            {activeView === 'ask' && (
              <div className="animate-in fade-in-50 duration-150">
                <AskProjectInterface
                  key={selectedProject?.id || 'no-proj-ask'}
                  projectId={selectedProject?.id}
                  hasAnalyzedProject={Boolean(
                    projectContext?.latestAnalysis?.status === 'COMPLETED' ||
                      projectContext?.latestAnalysis?.status === 'PARTIALLY_COMPLETED' ||
                      latestAnalysis?.status === 'COMPLETED' ||
                      latestAnalysis?.status === 'PARTIALLY_COMPLETED'
                  )}
                  hasProject={Boolean(selectedProject)}
                  isAnalyzing={isAnalyzing || selectedProject?.analysisStatus === 'RUNNING'}
                  onConnectRepo={() => setShowRepoModal(true)}
                />
              </div>
            )}

            {/* VIEW 6: IMPACT ANALYSIS */}
            {activeView === 'impact' && (
              <div className="animate-in fade-in-50 duration-150">
                <ChangeImpactAnalysis
                  key={selectedProject?.id || 'no-proj-impact'}
                  projectId={selectedProject?.id}
                  initialFile={focusedFilePath}
                  hasAnalyzedProject={Boolean(
                    projectContext?.latestAnalysis?.status === 'COMPLETED' ||
                      projectContext?.latestAnalysis?.status === 'PARTIALLY_COMPLETED' ||
                      latestAnalysis?.status === 'COMPLETED' ||
                      latestAnalysis?.status === 'PARTIALLY_COMPLETED'
                  )}
                  hasProject={Boolean(selectedProject)}
                  isAnalyzing={isAnalyzing || selectedProject?.analysisStatus === 'RUNNING'}
                  modules={projectContext?.modules || []}
                  fileTree={projectContext?.fileTree || []}
                  onConnectRepo={() => setShowRepoModal(true)}
                />
              </div>
            )}

            {/* VIEW 6B: GITHUB PR CHECK */}
            {activeView === 'pull-requests' && (
              <div className="animate-in fade-in-50 duration-150">
                <PullRequestListPanel
                  key={selectedProject?.id || 'no-proj-pr'}
                  projectId={selectedProject?.id}
                  hasProject={Boolean(selectedProject)}
                  onConnectRepo={() => setShowRepoModal(true)}
                  onSyncProject={handleSyncProject}
                  onNavigateView={handleNavigateIntel}
                />
              </div>
            )}

            {/* VIEW 7: EVIDENCE EXPLORER */}
            {activeView === 'evidence' && (
              <div className="animate-in fade-in-50 duration-150">
                <EvidenceExplorer
                  items={projectContext?.evidenceItems || []}
                  hasProject={Boolean(selectedProject)}
                  isAnalyzing={isAnalyzing || selectedProject?.analysisStatus === 'RUNNING'}
                  onConnectRepo={() => setShowRepoModal(true)}
                />
              </div>
            )}

            {/* VIEW 8: SETTINGS */}
            {activeView === 'settings' && (
              <div className="animate-in fade-in-50 duration-150">
                <ProjectSettings project={selectedProject} />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Connect Repository Modal */}
      {showRepoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/60 backdrop-blur-sm animate-in fade-in-50">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl">
            <RepositorySelector
              onRepositoryConnected={handleRepoConnected}
              onCancel={() => setShowRepoModal(false)}
            />
          </div>
        </div>
      )}

      {/* Mobile Navigation Drawer & Bottom Bar */}
      <MobileNavigation
        activeView={activeView}
        onSelectView={setActiveView}
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        user={user}
      />

      {/* Quick Jump Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSelectAction={handleSelectCommandAction}
      />
    </div>
  );
}
