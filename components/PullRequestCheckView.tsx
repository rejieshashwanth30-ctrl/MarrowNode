'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import type { PullRequestCheckReport } from '@/lib/services/pr-check';
import {
  GitPullRequest,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Database,
  Package,
  RefreshCw,
  ExternalLink,
  FileCode2,
  GitBranch,
  HelpCircle,
  ArrowRight,
  ListChecks,
} from 'lucide-react';

interface PullRequestCheckViewProps {
  projectId: string;
  report: PullRequestCheckReport;
  githubPublishStatus?: string | null;
  githubPublishNote?: string | null;
  triggerSource?: string | null;
  checkedAt?: string | null;
  isRerunning?: boolean;
  onRerun?: () => void;
  onSyncRepo?: () => void;
  onInspectFile?: (filePath: string) => void;
  onInspectImpact?: (filePath: string) => void;
  dedicatedRouteHref?: string;
}

export function PullRequestCheckView({
  report,
  githubPublishStatus,
  githubPublishNote,
  triggerSource,
  checkedAt,
  isRerunning = false,
  onRerun,
  onSyncRepo,
  onInspectFile,
  onInspectImpact,
  dedicatedRouteHref,
}: PullRequestCheckViewProps) {
  const statusVariant =
    report.status === 'PASS'
      ? 'success'
      : report.status === 'REVIEW'
      ? 'copper'
      : 'neutral';

  const statusLabel =
    report.status === 'PASS'
      ? 'PASS — Safe / Localized'
      : report.status === 'REVIEW'
      ? 'REVIEW — Needs Attention'
      : 'INCOMPLETE — Coverage Gap';

  return (
    <div className="space-y-5 min-w-0">
      {/* Header Summary Card */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <GitPullRequest className="w-4 h-4 text-forest shrink-0" />
              <span className="font-mono text-xs text-text-muted">
                PR #{report.prNumber}
              </span>
              <Badge variant={statusVariant} size="sm">
                {report.status === 'PASS' ? (
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                ) : (
                  <AlertTriangle className="w-3 h-3 mr-1" />
                )}
                {statusLabel}
              </Badge>
              <Badge
                variant={
                  report.impactLevel === 'CRITICAL' || report.impactLevel === 'HIGH'
                    ? 'copper'
                    : 'forest'
                }
                size="xs"
              >
                Impact: {report.impactLevel}
              </Badge>
              {triggerSource && (
                <Badge variant="outline" size="xs">
                  {triggerSource === 'webhook' ? 'Webhook Triggered' : 'Manual Check'}
                </Badge>
              )}
            </div>

            <h2 className="text-lg font-medium text-text-primary break-words">
              {report.prTitle}
            </h2>

            <p className="text-sm text-text-secondary break-words">
              {report.summaryText}
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted pt-1">
              <span className="inline-flex items-center gap-1 font-mono">
                <GitBranch className="w-3 h-3" />
                {report.headBranch} → {report.baseBranch}
              </span>
              {report.authorLogin && <span>Author: @{report.authorLogin}</span>}
              <span className="font-mono">Head: {report.headSha.slice(0, 7)}</span>
              {checkedAt && (
                <span>Checked {new Date(checkedAt).toLocaleString()}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {report.prUrl && (
              <a
                href={report.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface hover:bg-surface-muted text-xs font-medium text-text-primary transition-colors"
              >
                GitHub PR <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {dedicatedRouteHref && (
              <a
                href={dedicatedRouteHref}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface hover:bg-surface-muted text-xs font-medium text-text-primary transition-colors"
              >
                Permalink <ArrowRight className="w-3 h-3" />
              </a>
            )}
            {onRerun && (
              <Button variant="secondary" size="sm" onClick={onRerun} disabled={isRerunning}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRerunning ? 'animate-spin' : ''}`} />
                Re-run Check
              </Button>
            )}
          </div>
        </div>

        {/* GitHub Status Publishing Notice */}
        {githubPublishNote && (
          <div className="mt-3 pt-3 border-t border-border/70 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <Badge
              variant={githubPublishStatus === 'published' ? 'success' : 'outline'}
              size="xs"
            >
              GitHub Status: {githubPublishStatus || 'stored'}
            </Badge>
            <span className="break-words">{githubPublishNote}</span>
          </div>
        )}
      </Card>

      {/* Honest Freshness & Coverage Disclosures */}
      {(report.analysisSnapshot.isStaleBase || report.analysisSnapshot.isPartialAnalysis) && (
        <div className="space-y-2.5">
          {report.analysisSnapshot.isStaleBase && report.analysisSnapshot.staleBaseDisclosure && (
            <Card className="p-3.5 border-copper/40 bg-copper/5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-copper shrink-0 mt-0.5" />
                  <p className="text-xs text-text-primary break-words">
                    {report.analysisSnapshot.staleBaseDisclosure}
                  </p>
                </div>
                {onSyncRepo && (
                  <Button variant="secondary" size="sm" onClick={onSyncRepo} className="shrink-0">
                    Sync Repository
                  </Button>
                )}
              </div>
            </Card>
          )}

          {report.analysisSnapshot.isPartialAnalysis && report.analysisSnapshot.partialDisclosure && (
            <Card className="p-3.5 border-amber-500/40 bg-amber-500/5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-text-primary break-words">
                  {report.analysisSnapshot.partialDisclosure}
                </p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3.5">
          <div className="text-xs text-text-muted">Changed Files</div>
          <div className="text-xl font-mono font-semibold text-text-primary mt-0.5">
            {report.totals.changedFiles}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">
            {report.totals.codeFilesChanged} code • {report.totals.nonCodeFilesChanged} non-code
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-text-muted">Direct Consumers</div>
          <div className="text-xl font-mono font-semibold text-text-primary mt-0.5">
            {report.totals.directAffectedFiles}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">Immediate importers</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-text-muted">Transitive Consumers</div>
          <div className="text-xl font-mono font-semibold text-text-primary mt-0.5">
            {report.totals.transitiveAffectedFiles}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">Multi-hop downstream</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-text-muted">Untouched Affected</div>
          <div className="text-xl font-mono font-semibold text-copper mt-0.5">
            {report.totals.untouchedAffectedFiles}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">
            Across {report.totals.affectedModules} workspace area(s)
          </div>
        </Card>
      </div>

      {/* Special Risk Signals: Broken Refs, Security Area, Database/Schema, Dependency Manifest */}
      {(report.brokenReferenceAlerts.length > 0 ||
        report.securitySignals.detected ||
        report.databaseChanges.detected ||
        report.dependencyChanges.manifestFiles.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {report.brokenReferenceAlerts.length > 0 && (
            <Card className="p-4 border-copper/40 bg-copper/5 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <AlertTriangle className="w-4 h-4 text-copper" />
                Potential Broken References ({report.brokenReferenceAlerts.length})
              </div>
              {report.brokenReferenceAlerts.map((alert, idx) => (
                <div key={idx} className="text-xs space-y-1.5 border-t border-border/60 pt-2">
                  <p className="text-text-primary font-medium break-words">{alert.message}</p>
                  <div className="flex flex-wrap gap-1">
                    {alert.affectedCallers.slice(0, 6).map((caller) => (
                      <EvidenceBadge
                        key={caller}
                        type="file"
                        label={caller}
                        onClick={onInspectFile ? () => onInspectFile(caller) : undefined}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          )}

          {report.securitySignals.detected && (
            <Card className="p-4 border-copper/40 bg-copper/5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <ShieldAlert className="w-4 h-4 text-copper" />
                {report.securitySignals.summary || 'Security-sensitive area changed'}
              </div>
              <p className="text-xs text-text-secondary">
                Changes touch authentication, middleware, permission, session, or webhook files. Inspect callers carefully (no vulnerability claim implied).
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {report.securitySignals.files.map((f) => (
                  <EvidenceBadge
                    key={f}
                    type="file"
                    label={f}
                    onClick={onInspectFile ? () => onInspectFile(f) : undefined}
                  />
                ))}
              </div>
            </Card>
          )}

          {report.databaseChanges.detected && (
            <Card className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Database className="w-4 h-4 text-forest" />
                Database / Schema Area Changed
              </div>
              <p className="text-xs text-text-secondary">
                {report.databaseChanges.notes.join(' ')}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {report.databaseChanges.files.map((f) => (
                  <EvidenceBadge
                    key={f}
                    type="schema"
                    label={f}
                    onClick={onInspectFile ? () => onInspectFile(f) : undefined}
                  />
                ))}
              </div>
            </Card>
          )}

          {report.dependencyChanges.manifestFiles.length > 0 && (
            <Card className="p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Package className="w-4 h-4 text-copper" />
                Dependency Manifest Changes
              </div>

              {report.dependencyChanges.warnings.length > 0 && (
                <p className="text-xs text-copper break-words">
                  {report.dependencyChanges.warnings.join(' ')}
                </p>
              )}

              <div className="space-y-1.5 text-xs">
                {report.dependencyChanges.added.map((p) => (
                  <div key={`add-${p.name}`} className="font-mono text-forest">
                    + {p.name} ({p.toVersion})
                  </div>
                ))}
                {report.dependencyChanges.updated.map((p) => (
                  <div key={`upd-${p.name}`} className="font-mono text-text-primary">
                    ~ {p.name}: {p.fromVersion} → {p.toVersion}
                  </div>
                ))}
                {report.dependencyChanges.removed.map((p) => (
                  <div key={`rem-${p.name}`} className="space-y-1">
                    <div className="font-mono text-copper">
                      - {p.name} ({p.fromVersion})
                    </div>
                    {(report.dependencyChanges.importingFilesByPackage[p.name] || []).length > 0 && (
                      <div className="text-[11px] text-text-muted pl-2">
                        Imported in:{' '}
                        {report.dependencyChanges.importingFilesByPackage[p.name].join(', ')}
                      </div>
                    )}
                  </div>
                ))}
                {report.dependencyChanges.added.length === 0 &&
                  report.dependencyChanges.updated.length === 0 &&
                  report.dependencyChanges.removed.length === 0 && (
                    <p className="text-text-muted">
                      Manifest updated ({report.dependencyChanges.manifestFiles.join(', ')}) with no parsed package version delta.
                    </p>
                  )}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Untouched External Dependents */}
      {report.untouchedExternalDependents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Untouched Downstream Consumers ({report.untouchedExternalDependents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-text-muted mb-3">
              These files are not modified in PR #{report.prNumber}, yet import or transitively depend on changed files.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {report.untouchedExternalDependents.slice(0, 30).map((f) => (
                <EvidenceBadge
                  key={f}
                  type="file"
                  label={f}
                  onClick={onInspectFile ? () => onInspectFile(f) : undefined}
                />
              ))}
              {report.untouchedExternalDependents.length > 30 && (
                <Badge variant="outline" size="xs">
                  +{report.untouchedExternalDependents.length - 30} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Changed Files Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-forest" />
            Changed Files Breakdown ({report.changedFiles.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {report.changedFiles.map((cf) => (
            <div
              key={`${cf.path}-${cf.changeType}`}
              className="py-3 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-2"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onInspectFile ? () => onInspectFile(cf.path) : undefined}
                    className={`font-mono text-xs sm:text-sm font-medium text-left break-all ${
                      onInspectFile ? 'text-forest hover:underline' : 'text-text-primary'
                    }`}
                  >
                    {cf.path}
                  </button>
                  <Badge variant="outline" size="xs">{cf.changeType}</Badge>
                  <Badge variant="neutral" size="xs">{cf.category}</Badge>
                  {cf.impactLevel !== 'ISOLATED' && (
                    <Badge
                      variant={
                        cf.impactLevel === 'CRITICAL' || cf.impactLevel === 'HIGH'
                          ? 'copper'
                          : 'forest'
                      }
                      size="xs"
                    >
                      {cf.impactLevel}
                    </Badge>
                  )}
                </div>
                {cf.previousPath && (
                  <div className="text-[11px] font-mono text-text-muted break-all">
                    Previously: {cf.previousPath}
                  </div>
                )}
                <p className="text-xs text-text-secondary break-words">
                  {cf.notes.join(' ')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 text-xs font-mono">
                <span className="text-forest">+{cf.additions}</span>
                <span className="text-copper">-{cf.deletions}</span>
                {onInspectImpact && cf.isCodeFile && cf.changeType !== 'added' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onInspectImpact(cf.previousPath || cf.path)}
                  >
                    Impact
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Review Checklist & Epistemic Provenance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-forest" />
              Review Checklist
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs text-text-secondary">
              {report.reviewChecklist.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded border border-border bg-surface-muted flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="break-words">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-forest" />
              Evidence Boundaries (Fact / Inference / Unknown)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <div>
              <Badge variant="success" size="xs" className="mb-1">FACT</Badge>
              {report.epistemic.facts.map((f, i) => (
                <p key={i} className="text-text-primary break-words mt-0.5">• {f}</p>
              ))}
            </div>
            <div>
              <Badge variant="forest" size="xs" className="mb-1">INFERENCE</Badge>
              {report.epistemic.inferences.map((f, i) => (
                <p key={i} className="text-text-secondary break-words mt-0.5">• {f}</p>
              ))}
            </div>
            <div>
              <Badge variant="copper" size="xs" className="mb-1">UNKNOWN</Badge>
              {report.epistemic.unknowns.map((f, i) => (
                <p key={i} className="text-text-muted break-words mt-0.5">• {f}</p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

