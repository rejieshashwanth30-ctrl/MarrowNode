'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import type { DeveloperOnboardingReport } from '@/lib/services/onboarding';
import {
  Compass,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  FolderTree,
  FileCode2,
  Cpu,
  ShieldCheck,
  Database,
  Globe,
  GitCommit,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  ExternalLink,
  Layers,
  BookOpen,
} from 'lucide-react';
import type { DashboardView } from '@/components/Sidebar';

interface DeveloperOnboardingProps {
  projectId?: string;
  hasProject?: boolean;
  isAnalyzing?: boolean;
  onConnectRepo?: () => void;
  onSyncProject?: () => void;
  onNavigateView: (view: DashboardView, targetPath?: string) => void;
}

export function DeveloperOnboarding({
  projectId,
  hasProject = false,
  isAnalyzing = false,
  onConnectRepo,
  onSyncProject,
  onNavigateView,
}: DeveloperOnboardingProps) {
  const [report, setReport] = useState<DeveloperOnboardingReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showTechDetails, setShowTechDetails] = useState<boolean>(false);

  const loadOnboarding = useCallback(
    async (forceFresh = false) => {
      if (!projectId) return;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/onboarding${forceFresh ? '?fresh=true' : ''}`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load Developer Onboarding report.');
        }
        setReport(data.onboarding || null);
      } catch (err: any) {
        setError(err?.message || 'Unable to fetch onboarding guide.');
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (projectId && hasProject) {
      loadOnboarding(false);
    } else {
      setReport(null);
    }
  }, [projectId, hasProject, isAnalyzing, loadOnboarding]);

  if (!hasProject || !projectId) {
    return (
      <Card className="p-8 text-center">
        <Compass className="w-10 h-10 text-forest mx-auto mb-3 opacity-80" />
        <h2 className="text-lg font-medium text-text-primary mb-2">
          No Repository Connected Yet
        </h2>
        <p className="text-sm text-text-muted max-w-md mx-auto mb-5">
          Connect a GitHub repository to generate an evidence-backed Developer Onboarding guide from real files, imports, schemas, and commits.
        </p>
        {onConnectRepo && (
          <Button variant="primary" onClick={onConnectRepo}>
            Connect GitHub Repository
          </Button>
        )}
      </Card>
    );
  }

  if (loading && !report) {
    return (
      <Card className="p-8 text-center">
        <RefreshCw className="w-7 h-7 text-forest animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium text-text-primary">
          Building Developer Onboarding Guide...
        </p>
        <p className="text-xs text-text-muted mt-1">
          Reading verified architecture modules, entrypoints, dependencies, and git history.
        </p>
      </Card>
    );
  }

  if (error && !report) {
    return (
      <Card className="p-6 border-copper/40 bg-copper/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle className="w-5 h-5 text-copper shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">
                Could not generate onboarding report
              </p>
              <p className="text-xs text-text-muted mt-1 break-words">{error}</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => loadOnboarding(true)}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (!report) return null;

  const {
    snapshot,
    glance,
    structure,
    startHere,
    importantFiles,
    technologies,
    authFlow,
    dataFlow,
    externalServices,
    recentDevelopment,
    attentionAreas,
    epistemicSummary,
  } = report;

  const bannerTone =
    snapshot.isStale || snapshot.freshness === 'FAILED'
      ? 'border-copper/40 bg-copper/5'
      : snapshot.isPartial
      ? 'border-amber-500/40 bg-amber-500/5'
      : 'border-forest/30 bg-forest/5';

  return (
    <div className="space-y-6 min-w-0">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Compass className="w-5 h-5 text-forest shrink-0" />
            <h1 className="text-xl sm:text-2xl font-medium text-text-primary tracking-tight">
              Developer Onboarding
            </h1>
            <Badge variant={snapshot.isPartial ? 'copper' : 'forest'} size="xs">
              {snapshot.sourceCoveragePercent}% Source Coverage
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-text-muted mt-1 break-words">
            Practical, evidence-backed codebase orientation for{' '}
            <span className="font-mono text-text-primary">{glance.fullName}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadOnboarding(true)}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {onSyncProject && (snapshot.isStale || snapshot.isPartial) && (
            <Button variant="primary" size="sm" onClick={onSyncProject}>
              Sync &amp; Re-analyze
            </Button>
          )}
        </div>
      </div>

      {/* Analysis Freshness & Honesty Banner */}
      <Card className={`p-4 ${bannerTone}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {snapshot.isStale || snapshot.isPartial ? (
              <AlertTriangle className="w-5 h-5 text-copper shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-forest shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-text-primary">
                  {snapshot.noticeTitle}
                </p>
                {snapshot.commitShort && (
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-text-secondary">
                    {snapshot.branch}@{snapshot.commitShort}
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary mt-1 break-words">
                {snapshot.noticeMessage}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowTechDetails((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary shrink-0 self-start md:self-center"
          >
            {showTechDetails ? (
              <>
                Hide Technical Details <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Technical Details <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {showTechDetails && (
          <div className="mt-3 pt-3 border-t border-border/70 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-text-muted block">Snapshot ID</span>
              <span className="font-mono text-text-primary break-all">
                {snapshot.analysisId || 'None'}
              </span>
            </div>
            <div>
              <span className="text-text-muted block">Parsed Source Files</span>
              <span className="font-mono text-text-primary">
                {snapshot.sourceFilesParsed} / {snapshot.sourceFilesTotal} ({snapshot.sourceCoveragePercent}%)
              </span>
            </div>
            <div>
              <span className="text-text-muted block">Unresolved Imports</span>
              <span className="font-mono text-text-primary">
                {snapshot.unresolvedImportsCount}
              </span>
            </div>
            <div>
              <span className="text-text-muted block">Overall Coverage Index</span>
              <span className="font-mono text-text-primary">
                {snapshot.overallCoveragePercent}%
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Section 1: Project at a Glance */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-forest" />
              Project at a Glance
            </CardTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="forest" size="xs">{glance.primaryLanguage}</Badge>
              <Badge variant="neutral" size="xs">{glance.framework}</Badge>
              <Badge variant="outline" size="xs">{glance.repoScaleLabel} Repo</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-text-secondary break-words leading-relaxed">
            {glance.description ||
              (glance.readmePreview
                ? glance.readmePreview
                : 'No repository description or README overview was found in the repository root.')}
          </p>

          {glance.description && glance.readmePreview && (
            <div className="p-3 rounded-lg bg-surface-muted border border-border text-xs text-text-secondary break-words">
              <span className="font-semibold text-text-primary block mb-1">
                From {glance.readmePath || 'README'}:
              </span>
              {glance.readmePreview}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-surface-muted border border-border">
              <div className="text-xs text-text-muted">Total Files</div>
              <div className="text-lg font-mono font-semibold text-text-primary mt-0.5">
                {glance.counts.totalFiles}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                {glance.counts.sourceFiles} code • {glance.counts.testFiles} test
              </div>
            </div>
            <div className="p-3 rounded-lg bg-surface-muted border border-border">
              <div className="text-xs text-text-muted">Parsed Code</div>
              <div className="text-lg font-mono font-semibold text-text-primary mt-0.5">
                {glance.counts.parsedSourceFiles}/{glance.counts.sourceFiles}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                {snapshot.sourceCoveragePercent}% inspected
              </div>
            </div>
            <div className="p-3 rounded-lg bg-surface-muted border border-border">
              <div className="text-xs text-text-muted">Code Connections</div>
              <div className="text-lg font-mono font-semibold text-text-primary mt-0.5">
                {glance.counts.relationshipsMapped}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                Verified internal imports
              </div>
            </div>
            <div className="p-3 rounded-lg bg-surface-muted border border-border">
              <div className="text-xs text-text-muted">Tracked History</div>
              <div className="text-lg font-mono font-semibold text-text-primary mt-0.5">
                {glance.counts.commitsTracked}
              </div>
              <div className="text-[11px] text-text-muted mt-0.5">
                Commits on {glance.defaultBranch}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid: Start Here + Key Technologies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 2: Start Here */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-forest" />
                Start Here (Recommended Path)
              </CardTitle>
              <Badge variant="neutral" size="xs">{startHere.length} steps</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {startHere.length === 0 ? (
              <p className="text-xs text-text-muted">
                No standard entrypoints or README files were indexed yet. Browse files in the Explorer.
              </p>
            ) : (
              <div className="space-y-3">
                {startHere.map((step) => (
                  <div
                    key={step.filePath}
                    className="p-3 rounded-lg border border-border bg-surface-muted/60 hover:border-forest/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-forest/15 text-forest text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                          {step.stepNumber}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-text-primary">
                            {step.title}
                          </div>
                          <p className="text-xs text-text-muted mt-0.5 break-words">
                            {step.reason}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <EvidenceBadge
                              type="file"
                              label={step.filePath}
                              onClick={() => onNavigateView('explorer', step.filePath)}
                            />
                            <Badge variant="outline" size="xs">{step.category}</Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 3: Key Technologies */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="w-4 h-4 text-forest" />
                Key Technologies
              </CardTitle>
              <span className="text-xs text-text-muted">
                {technologies.manifests.length} manifest(s)
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {technologies.languages.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-text-secondary">
                  Language Share
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {technologies.languages.slice(0, 5).map((lang) => (
                    <Badge key={lang.name} variant="forest" size="xs">
                      {lang.name} {lang.sharePercent}%
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {technologies.items.length === 0 ? (
                <p className="text-xs text-text-muted">
                  No package manifests or language signatures detected.
                </p>
              ) : (
                technologies.items.slice(0, 16).map((tech) => (
                  <div
                    key={`${tech.name}-${tech.category}`}
                    className="flex items-center justify-between gap-2 py-1.5 border-b border-border/60 last:border-b-0 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-medium text-text-primary break-all">
                        {tech.name}
                      </span>
                      <span className="text-text-muted ml-2">({tech.category})</span>
                    </div>
                    <Badge
                      variant={tech.confidence === 'Verified' ? 'success' : 'neutral'}
                      size="xs"
                      className="shrink-0"
                    >
                      {tech.confidence}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 4: How This Project Is Structured */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4 text-forest" />
              How This Project Is Structured
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigateView('architecture')}
            >
              Open Architecture Map
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {structure.areas.length === 0 ? (
            <p className="text-xs text-text-muted">
              Files sit directly in the root workspace without nested top-level directories.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {structure.areas.map((area) => (
                <div
                  key={area.id}
                  className="p-3.5 rounded-lg border border-border bg-surface-muted/50 flex flex-col justify-between gap-2 min-w-0"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-medium text-text-primary truncate">
                        {area.path}
                      </span>
                      <Badge
                        variant={area.confidence === 'Verified' ? 'success' : 'neutral'}
                        size="xs"
                      >
                        {area.confidence}
                      </Badge>
                    </div>
                    <p className="text-xs text-text-secondary mt-1 break-words">
                      {area.roleDescription}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
                    <span>{area.fileCount} files</span>
                    <span>
                      in: {area.fanIn} / out: {area.fanOut}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {structure.verifiedRelationships.length > 0 && (
            <div className="pt-2 border-t border-border">
              <div className="text-xs font-medium text-text-secondary mb-2">
                Verified Module Connections
              </div>
              <div className="flex flex-wrap gap-2">
                {structure.verifiedRelationships.map((rel, idx) => (
                  <Badge key={idx} variant="outline" size="xs" className="font-mono">
                    {rel.from} → {rel.to}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 5: Important Files */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCode2 className="w-4 h-4 text-forest" />
              Important Files
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigateView('explorer')}>
              Open File Explorer
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {importantFiles.length === 0 ? (
            <p className="text-xs text-text-muted">
              No ranked files available yet. Run analysis or inspect the repository tree directly.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {importantFiles.map((file) => (
                <div
                  key={file.path}
                  className="py-3 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onNavigateView('explorer', file.path)}
                        className="font-mono text-sm font-medium text-forest hover:underline text-left break-all"
                      >
                        {file.path}
                      </button>
                      <Badge variant="neutral" size="xs">{file.category}</Badge>
                      {file.impactLevel !== 'ISOLATED' && (
                        <Badge
                          variant={
                            file.impactLevel === 'CRITICAL' || file.impactLevel === 'HIGH'
                              ? 'copper'
                              : 'outline'
                          }
                          size="xs"
                        >
                          {file.impactLevel} impact
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary break-words">
                      {file.reasons.join(' • ')}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="text-[11px] font-mono text-text-muted">
                      {file.fanIn} in / {file.fanOut} out
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onNavigateView('explorer', file.path)}
                    >
                      View Source
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onNavigateView('impact', file.path)}
                    >
                      Check Impact
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grid: Auth Flow + Data / Database Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 6: Authentication Flow */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-forest" />
                Authentication Flow
              </CardTitle>
              <Badge
                variant={authFlow.status === 'DETECTED' ? 'success' : 'neutral'}
                size="xs"
              >
                {authFlow.status === 'DETECTED' ? authFlow.confidence : 'Not Detected'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs sm:text-sm text-text-secondary break-words">
              {authFlow.summary}
            </p>
            {authFlow.detectedLibraries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {authFlow.detectedLibraries.map((lib) => (
                  <Badge key={lib} variant="forest" size="xs" className="font-mono">
                    {lib}
                  </Badge>
                ))}
              </div>
            )}
            {authFlow.keyFiles.length > 0 && (
              <div className="space-y-1.5">
                {authFlow.keyFiles.map((kf) => (
                  <div
                    key={kf.path}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs p-2 rounded bg-surface-muted border border-border"
                  >
                    <EvidenceBadge
                      type="file"
                      label={kf.path}
                      onClick={() => onNavigateView('explorer', kf.path)}
                    />
                    <span className="text-text-muted">{kf.role}</span>
                  </div>
                ))}
              </div>
            )}
            {authFlow.caveats.length > 0 && (
              <p className="text-[11px] text-text-muted break-words">
                <span className="font-medium text-text-secondary">Scope note:</span>{' '}
                {authFlow.caveats[0]}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Section 7: Data & Database Flow */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="w-4 h-4 text-forest" />
                Data &amp; Database Flow
              </CardTitle>
              <Badge
                variant={dataFlow.status === 'DETECTED' ? 'success' : 'neutral'}
                size="xs"
              >
                {dataFlow.status === 'DETECTED' ? dataFlow.confidence : 'None Detected'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs sm:text-sm text-text-secondary break-words">
              {dataFlow.summary}
            </p>
            {dataFlow.detectedLibraries.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {dataFlow.detectedLibraries.map((lib) => (
                  <Badge key={lib} variant="forest" size="xs" className="font-mono">
                    {lib}
                  </Badge>
                ))}
              </div>
            )}
            {dataFlow.keyFiles.length > 0 && (
              <div className="space-y-1.5">
                {dataFlow.keyFiles.map((kf) => (
                  <div
                    key={kf.path}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs p-2 rounded bg-surface-muted border border-border"
                  >
                    <EvidenceBadge
                      type="schema"
                      label={kf.path}
                      onClick={() => onNavigateView('explorer', kf.path)}
                    />
                    <span className="text-text-muted">{kf.role}</span>
                  </div>
                ))}
              </div>
            )}
            {dataFlow.caveats.length > 0 && (
              <p className="text-[11px] text-text-muted break-words">
                <span className="font-medium text-text-secondary">Scope note:</span>{' '}
                {dataFlow.caveats[0]}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Grid: External Services + Recent Development */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 8: Important External Services */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4 text-forest" />
              Important External Services
            </CardTitle>
          </CardHeader>
          <CardContent>
            {externalServices.length === 0 ? (
              <p className="text-xs text-text-muted">
                No external SaaS APIs or third-party SDKs were identified in declared dependencies.
              </p>
            ) : (
              <div className="space-y-2.5">
                {externalServices.map((svc) => (
                  <div
                    key={svc.name}
                    className="p-3 rounded-lg bg-surface-muted/60 border border-border flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-text-primary">{svc.name}</div>
                      <p className="text-xs text-text-secondary mt-0.5">{svc.purpose}</p>
                      <p className="text-[11px] font-mono text-text-muted mt-1 break-all">
                        Source: {svc.evidenceSource}
                      </p>
                    </div>
                    <Badge
                      variant={svc.confidence === 'Verified' ? 'success' : 'neutral'}
                      size="xs"
                      className="shrink-0"
                    >
                      {svc.confidence}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 9: Recent Development */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <GitCommit className="w-4 h-4 text-copper" />
                Recent Development
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => onNavigateView('timeline')}>
                View History
                <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-text-muted">{recentDevelopment.historyScope}</p>
            {recentDevelopment.commits.length === 0 ? (
              <p className="text-xs text-text-muted">No recent commits indexed.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {recentDevelopment.commits.slice(0, 7).map((c, idx) => (
                  <div
                    key={`${c.shortSha}-${idx}`}
                    className="p-2.5 rounded-lg border border-border bg-surface-muted/40 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-copper font-medium">
                        {c.shortSha}
                      </span>
                      <span className="text-text-muted">
                        {c.author} {c.date ? `• ${c.date}` : ''}
                      </span>
                    </div>
                    <p className="text-text-primary mt-1 font-medium break-words">
                      {c.title}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 10: Areas to Understand Next */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-copper" />
            Areas to Understand Next
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attentionAreas.length === 0 ? (
            <p className="text-xs text-text-muted">
              No high-blast-radius hubs, circular imports, or missing test gaps flagged in current snapshot.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {attentionAreas.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-lg border border-border bg-surface-muted/50 flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text-primary break-words">
                        {item.title}
                      </span>
                      <Badge variant="copper" size="xs">{item.kind}</Badge>
                    </div>
                    <p className="text-xs text-text-secondary mt-1.5 break-words">
                      {item.description}
                    </p>
                    <p className="text-xs text-text-muted mt-1 break-words">
                      {item.recommendation}
                    </p>
                  </div>

                  <div className="pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onNavigateView(item.targetView, item.targetPath)}
                    >
                      Inspect in {item.targetView === 'impact' ? 'Impact Analysis' : item.targetView === 'architecture' ? 'Architecture' : 'Explorer'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 11: Honest Onboarding Summary (FACT / INFERENCE / UNKNOWN) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-forest" />
              Onboarding Summary: Facts, Inferences &amp; Unknowns
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigateView('evidence')}>
              Inspect All Evidence
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Verified Facts */}
          <div className="p-3.5 rounded-lg border border-forest/30 bg-forest/5 space-y-2.5">
            <Badge variant="success" size="xs">FACT — Directly Verified</Badge>
            <ul className="space-y-2 text-xs text-text-primary">
              {epistemicSummary.facts.map((item, idx) => (
                <li key={idx} className="space-y-1">
                  <p className="break-words leading-relaxed">{item.statement}</p>
                  {item.refs.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.refs.map((r, rIdx) => (
                        <EvidenceBadge
                          key={rIdx}
                          type={r.type === 'manifest' ? 'dependency' : 'file'}
                          label={r.label}
                          onClick={() => onNavigateView(r.view, r.path)}
                        />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Grounded Inferences */}
          <div className="p-3.5 rounded-lg border border-border bg-surface-muted/60 space-y-2.5">
            <Badge variant="forest" size="xs">INFERENCE — Architectural Interpretation</Badge>
            <ul className="space-y-2 text-xs text-text-secondary">
              {epistemicSummary.inferences.map((item, idx) => (
                <li key={idx} className="space-y-1">
                  <p className="break-words leading-relaxed">{item.statement}</p>
                  {item.refs.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.refs.map((r, rIdx) => (
                        <EvidenceBadge
                          key={rIdx}
                          type="file"
                          label={r.label}
                          onClick={() => onNavigateView(r.view, r.path)}
                        />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Explicit Unknowns */}
          <div className="p-3.5 rounded-lg border border-copper/30 bg-copper/5 space-y-2.5">
            <Badge variant="copper" size="xs">UNKNOWN — Outside Static Proof</Badge>
            <ul className="space-y-2 text-xs text-text-secondary">
              {epistemicSummary.unknowns.map((item, idx) => (
                <li key={idx} className="space-y-1">
                  <p className="break-words leading-relaxed">{item.statement}</p>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

