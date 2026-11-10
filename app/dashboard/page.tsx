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
      const [userRes, projectsRes] = await Promise.all([
        fetch('/api/user/me'),
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
        const activeId = targetProjectId || selectedProjectId || (projs.length > 0 ? projs[0].id : null);
        if (activeId) {
          setSelectedProjectId(activeId);
          await fetchProjectContext(activeId);
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

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    fetchProjectContext(projectId);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchDashboardData(selectedProjectId || undefined);
    setIsRefreshing(false);
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
        setAnalysisError(data.error || 'Repository analysis failed');
      } else {
        await fetchDashboardData(id);
      }
    } catch (err: any) {
      setAnalysisError(err?.message || 'Failed to trigger repository analysis');
    } finally {
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
          <span>Mounting MarrowNode Workstation…</span>
        </div>
      </div>
    );
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || projects[0] || null;
  const latestAnalysis = selectedProject?.analyses?.[0] || null;

  return (
    <div className="flex h-screen overflow-hidden bg-ivory dark:bg-[#0E1310] text-text-primary font-sans">
      {/* Desktop Left Sidebar */}
      <div className="hidden lg:block shrink-0 h-full">
        <Sidebar
          activeView={activeView}
          onSelectView={setActiveView}
          user={user}
        />
      </div>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Topbar */}
        <Topbar
          onOpenSearch={() => setIsCommandPaletteOpen(true)}
          onToggleMobileNav={() => setIsMobileNavOpen(!isMobileNavOpen)}
          mobileNavOpen={isMobileNavOpen}
          project={selectedProject}
        />

        {/* Scrollable Workstation Surface */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-8">
          {/* Project Repository Header */}
          <ProjectHeader
            project={selectedProject}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            onAnalyze={() => handleStartAnalysis()}
            isAnalyzing={isAnalyzing}
            onConnectRepo={() => setShowRepoModal(true)}
          />

          {/* Analysis error alert */}
          {analysisError && (
            <div className="p-3.5 mx-3.5 sm:mx-6 mt-3 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between font-sans">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{analysisError}</span>
              </div>
              <button
                onClick={() => setAnalysisError(null)}
                className="text-text-muted hover:text-text-primary dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Main View Surface */}
          <div className="p-3.5 sm:p-6 max-w-7xl mx-auto space-y-6 font-sans">
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
                      <span className="text-[11px] uppercase tracking-wider font-medium">Analyzed Files</span>
                      <FileCode2 className="w-3.5 h-3.5 text-forest" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      0
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      No repository connected
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Architecture Nodes</span>
                      <Network className="w-3.5 h-3.5 text-forest" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      0
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      Topology map unavailable
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Tracked Commits</span>
                      <GitCommit className="w-3.5 h-3.5 text-copper" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      0
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      No history indexed
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Evidence Provenance</span>
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
                <ProjectIntelligencePanel hasAnalyzedProject={false} />
              </div>
            ) : null}

            {/* If project IS present and on overview */}
            {selectedProject && activeView === 'overview' ? (
              <div className="space-y-6 animate-in fade-in-50 duration-150">
                {/* 1. Context Coverage */}
                <ContextCoverageWidget
                  coverage={
                    latestAnalysis && latestAnalysis.status === 'COMPLETED'
                      ? {
                          overallPercentage: Math.min(
                            100,
                            Math.round(
                              ((latestAnalysis.filesAnalyzed || 0) > 0 ? 50 : 0) +
                                ((latestAnalysis.commitsAnalyzed || 0) > 0 ? 50 : 0)
                            )
                          ),
                          metrics: {
                            totalFiles: latestAnalysis.filesAnalyzed || 0,
                            commitsTracked: latestAnalysis.commitsAnalyzed || 0,
                            relationshipsMapped: latestAnalysis.architectureNodes || 0,
                            architectureNodes: latestAnalysis.architectureNodes || 0,
                          },
                          breakdown: {
                            codebaseUnderstanding: (latestAnalysis.filesAnalyzed || 0) > 0 ? 80 : 0,
                            architectureMapping: (latestAnalysis.architectureNodes || 0) > 0 ? 70 : 0,
                            gitHistory: (latestAnalysis.commitsAnalyzed || 0) > 0 ? 85 : 0,
                            dependencyMapping: (latestAnalysis.dependenciesDetected || 0) > 0 ? 75 : 0,
                            documentation: 50,
                          },
                        }
                      : null
                  }
                />

                {/* Unanalyzed banner if project has no analysis yet */}
                {(!latestAnalysis || latestAnalysis.status === 'PENDING') && (
                  <div className="p-4 rounded-lg bg-surface border border-forest/30 dark:bg-[#151C17] dark:border-forest/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans">
                    <div className="space-y-0.5">
                      <div className="text-sm font-semibold text-text-primary dark:text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-copper animate-pulse" />
                        <span>Repository analysis not started</span>
                      </div>
                      <p className="text-xs text-text-muted">
                        Execute deterministic AST & manifest analysis to populate file structure, dependencies, and commit intelligence.
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
                      Run Analysis Now
                    </Button>
                  </div>
                )}

                {/* 2. Key Engineering Telemetry Cards (Real Data from Neon) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 font-sans">
                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Analyzed Files</span>
                      <FileCode2 className="w-3.5 h-3.5 text-forest" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      {latestAnalysis?.filesAnalyzed ?? 0}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {latestAnalysis ? `${latestAnalysis.filesAnalyzed} source files indexed` : 'Analysis not available yet'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Architecture Nodes</span>
                      <Network className="w-3.5 h-3.5 text-forest" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      {latestAnalysis?.architectureNodes ?? 0}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {latestAnalysis ? `${latestAnalysis.dependenciesDetected ?? 0} dependency bounds` : 'Analysis not available yet'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Tracked Commits</span>
                      <GitCommit className="w-3.5 h-3.5 text-copper" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      {latestAnalysis?.commitsAnalyzed ?? 0}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {latestAnalysis ? 'Indexed with author blame' : 'Analysis not available yet'}
                    </div>
                  </div>

                  <div className="p-3.5 rounded bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark">
                    <div className="flex items-center justify-between text-text-muted mb-1">
                      <span className="text-[11px] uppercase tracking-wider font-medium">Evidence Provenance</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-forest" />
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-text-primary dark:text-white">
                      {selectedProject._count?.evidences ?? latestAnalysis?.evidenceCount ?? 0}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      Verified citations & PR links
                    </div>
                  </div>
                </div>

                {/* 3. Central Intelligence Area */}
                <ProjectIntelligencePanel
                  hasAnalyzedProject={latestAnalysis && latestAnalysis.status === 'COMPLETED'}
                />

                {/* 4. Two-Column Dashboard Overview Widgets */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left: Architecture Quick View */}
                  <div className="lg:col-span-7">
                    <Card className="h-full flex flex-col justify-between font-sans">
                      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <Network className="w-4 h-4 text-forest dark:text-[#88B094]" />
                            <CardTitle>Topology Map Preview</CardTitle>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveView('architecture')}
                            className="text-xs font-sans font-medium"
                          >
                            <span>Open Graph</span>
                            <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </div>
                      </CardHeader>

                      <CardContent className="p-6 text-center space-y-2">
                        <div className="text-xs text-text-muted">
                          {latestAnalysis?.status === 'COMPLETED'
                            ? `Architecture topology mapped across ${latestAnalysis.architectureNodes || 0} module components.`
                            : 'Architecture map unavailable. Run repository analysis to generate the topology map.'}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Right: Recent Timeline Milestones */}
                  <div className="lg:col-span-5">
                    <Card className="h-full flex flex-col justify-between font-sans">
                      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-2">
                            <GitCommit className="w-4 h-4 text-copper dark:text-[#E08F6B]" />
                            <CardTitle>Recent Commit Milestones</CardTitle>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveView('timeline')}
                            className="text-xs font-sans font-medium"
                          >
                            <span>Timeline</span>
                            <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </div>
                      </CardHeader>

                      <CardContent className="p-6 text-center space-y-2">
                        <div className="text-xs text-text-muted">
                          {latestAnalysis?.status === 'COMPLETED'
                            ? `Indexed ${latestAnalysis.commitsAnalyzed || 0} commits along ${selectedProject.defaultBranch || 'main'}.`
                            : 'No development history available yet.'}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            ) : null}

            {/* VIEW 2: REPOSITORY EXPLORER */}
            {activeView === 'explorer' && (
              <div className="animate-in fade-in-50 duration-150">
                <RepositoryExplorer
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
                  events={projectContext?.timeline || []}
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
                  hasAnalyzedProject={latestAnalysis && latestAnalysis.status === 'COMPLETED'}
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
                  hasAnalyzedProject={latestAnalysis && latestAnalysis.status === 'COMPLETED'}
                  hasProject={Boolean(selectedProject)}
                  isAnalyzing={isAnalyzing || selectedProject?.analysisStatus === 'RUNNING'}
                  modules={projectContext?.modules || []}
                  fileTree={projectContext?.fileTree || []}
                  onConnectRepo={() => setShowRepoModal(true)}
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
