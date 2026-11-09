'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sidebar, DashboardView } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { MobileNavigation } from '@/components/MobileNavigation';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { ProjectHeader } from '@/components/ProjectHeader';
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
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<DashboardView>('overview');
  const [user, setUser] = useState<any | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDashboardData = async () => {
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
        if (projs.length > 0 && !selectedProjectId) {
          setSelectedProjectId(projs[0].id);
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchDashboardData();
    setIsRefreshing(false);
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
          />

          {/* Main View Surface */}
          <div className="p-3.5 sm:p-6 max-w-7xl mx-auto space-y-6 font-sans">
            {/* If no project is connected yet and on overview */}
            {!selectedProject && activeView === 'overview' ? (
              <div className="space-y-6 animate-in fade-in-50 duration-150">
                {/* Clean No-Projects Empty State Card */}
                <Card className="p-8 sm:p-12 text-center space-y-4 bg-surface dark:bg-[#151C17] border-border dark:border-border-dark font-sans">
                  <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest mx-auto dark:text-[#88B094]">
                    <FolderGit2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5 max-w-md mx-auto">
                    <h2 className="text-base sm:text-lg font-bold text-text-primary dark:text-white">
                      No projects yet
                    </h2>
                    <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
                      Connect a GitHub repository to begin building your project context, architecture map, and development memory.
                    </p>
                  </div>
                  <div className="pt-2">
                    <Link href="/onboarding">
                      <Button variant="primary" size="md" className="text-xs font-sans font-medium">
                        Connect GitHub Repository
                      </Button>
                    </Link>
                  </div>
                </Card>

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
                            codebaseUnderstanding: latestAnalysis.filesAnalyzed > 0 ? 80 : 0,
                            architectureMapping: latestAnalysis.architectureNodes > 0 ? 70 : 0,
                            gitHistory: latestAnalysis.commitsAnalyzed > 0 ? 85 : 0,
                            dependencyMapping: latestAnalysis.dependenciesDetected > 0 ? 75 : 0,
                            documentation: 50,
                          },
                        }
                      : null
                  }
                />

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
                          Architecture map unavailable. Connect and analyze a repository to generate the architecture map.
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
                          No development history available yet.
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
                <RepositoryExplorer fileTree={[]} />
              </div>
            )}

            {/* VIEW 3: ARCHITECTURE */}
            {activeView === 'architecture' && (
              <div className="animate-in fade-in-50 duration-150">
                <ArchitectureGraph nodes={[]} edges={[]} />
              </div>
            )}

            {/* VIEW 4: TIMELINE */}
            {activeView === 'timeline' && (
              <div className="animate-in fade-in-50 duration-150">
                <ProjectTimeline events={[]} />
              </div>
            )}

            {/* VIEW 5: ASK PROJECT */}
            {activeView === 'ask' && (
              <div className="animate-in fade-in-50 duration-150">
                <AskProjectInterface
                  hasAnalyzedProject={latestAnalysis && latestAnalysis.status === 'COMPLETED'}
                />
              </div>
            )}

            {/* VIEW 6: IMPACT ANALYSIS */}
            {activeView === 'impact' && (
              <div className="animate-in fade-in-50 duration-150">
                <ChangeImpactAnalysis />
              </div>
            )}

            {/* VIEW 7: EVIDENCE EXPLORER */}
            {activeView === 'evidence' && (
              <div className="animate-in fade-in-50 duration-150">
                <EvidenceExplorer items={[]} />
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
