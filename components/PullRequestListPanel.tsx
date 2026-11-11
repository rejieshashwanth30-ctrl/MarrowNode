'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PullRequestCheckView } from '@/components/PullRequestCheckView';
import type { PullRequestCheckReport } from '@/lib/services/pr-check';
import type { DashboardView } from '@/components/Sidebar';
import {
  GitPullRequest,
  Play,
  RefreshCw,
  AlertTriangle,
  Settings,
  CheckCircle2,
  Clock,
} from 'lucide-react';

interface SavedPrCheckRecord {
  id: string;
  prNumber: number;
  prTitle: string;
  prUrl: string | null;
  prState: string;
  authorLogin: string | null;
  baseBranch: string | null;
  headBranch: string | null;
  baseSha: string;
  headSha: string;
  status: 'PASS' | 'REVIEW' | 'INCOMPLETE';
  impactLevel: string;
  changedFilesCount: number;
  directAffectedCount: number;
  transitiveAffectedCount: number;
  summaryText: string;
  triggerSource: string;
  githubPublishStatus: string | null;
  githubPublishNote: string | null;
  checkedAt: string;
  reportJson: PullRequestCheckReport;
}

interface LiveGitHubPr {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  author: string | null;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
  updatedAt: string;
  url: string;
}

interface PullRequestListPanelProps {
  projectId?: string;
  hasProject?: boolean;
  onConnectRepo?: () => void;
  onSyncProject?: () => void;
  onNavigateView: (view: DashboardView, targetPath?: string) => void;
}

export function PullRequestListPanel({
  projectId,
  hasProject = false,
  onConnectRepo,
  onSyncProject,
  onNavigateView,
}: PullRequestListPanelProps) {
  const [checks, setChecks] = useState<SavedPrCheckRecord[]>([]);
  const [livePrs, setLivePrs] = useState<LiveGitHubPr[]>([]);
  const [prChecksEnabled, setPrChecksEnabled] = useState<boolean>(false);
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [manualPrInput, setManualPrInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [runningPr, setRunningPr] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [githubWarning, setGithubWarning] = useState<string | null>(null);

  const loadPullRequests = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/pull-requests?includeOpen=true`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load Pull Requests.');
      }

      const loadedChecks: SavedPrCheckRecord[] = Array.isArray(data.checks) ? data.checks : [];
      setChecks(loadedChecks);
      setLivePrs(Array.isArray(data.githubPullRequests) ? data.githubPullRequests : []);
      setPrChecksEnabled(Boolean(data.project?.prChecksEnabled));
      setGithubWarning(data.githubError || null);

      if (loadedChecks.length > 0 && !selectedCheckId) {
        setSelectedCheckId(loadedChecks[0].id);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load PR checks.');
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedCheckId]);

  useEffect(() => {
    if (projectId && hasProject) {
      loadPullRequests();
    } else {
      setChecks([]);
      setLivePrs([]);
      setSelectedCheckId(null);
    }
  }, [projectId, hasProject, loadPullRequests]);

  const handleRunPrCheck = async (prNumber: number, forceRerun = true) => {
    if (!projectId || !Number.isInteger(prNumber) || prNumber <= 0) return;
    setRunningPr(prNumber);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/pr-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prNumber, forceRerun }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Failed to run check for PR #${prNumber}`);
      }

      const savedRecord: SavedPrCheckRecord = data.check;
      setChecks((prev) => {
        const filtered = prev.filter((c) => c.id !== savedRecord.id);
        return [savedRecord, ...filtered];
      });
      setSelectedCheckId(savedRecord.id);
    } catch (err: any) {
      setError(err?.message || `Error checking PR #${prNumber}`);
    } finally {
      setRunningPr(null);
    }
  };

  if (!hasProject || !projectId) {
    return (
      <Card className="p-8 text-center">
        <GitPullRequest className="w-10 h-10 text-forest mx-auto mb-3 opacity-80" />
        <h2 className="text-lg font-medium text-text-primary mb-2">
          No Repository Connected
        </h2>
        <p className="text-sm text-text-muted max-w-md mx-auto mb-5">
          Connect a GitHub repository first to run evidence-backed impact checks on Pull Requests and configure automated GitHub webhooks.
        </p>
        {onConnectRepo && (
          <Button variant="primary" onClick={onConnectRepo}>
            Connect GitHub Repository
          </Button>
        )}
      </Card>
    );
  }

  const selectedCheck = checks.find((c) => c.id === selectedCheckId) || checks[0] || null;

  return (
    <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <GitPullRequest className="w-5 h-5 text-forest shrink-0" />
            <h1 className="text-xl sm:text-2xl font-medium text-text-primary tracking-tight">
              GitHub PR Check
            </h1>
            <Badge variant={prChecksEnabled ? 'success' : 'neutral'} size="xs">
              {prChecksEnabled ? 'Webhooks Active' : 'Manual Mode'}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Inspect PR blast radius, broken consumer risks, schema/auth touches, and dependency diffs against analyzed repository evidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={loadPullRequests} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigateView('settings')}
          >
            <Settings className="w-3.5 h-3.5 mr-1.5" />
            Webhook Settings
          </Button>
        </div>
      </div>

      {/* Webhook Info Banner if not enabled */}
      {!prChecksEnabled && (
        <Card className="p-3.5 border-border bg-surface-muted/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span className="text-text-secondary">
              Automatic GitHub webhook checks are disabled on this project. You can run manual checks below or enable webhooks in Project Settings.
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigateView('settings')}
              className="shrink-0"
            >
              Configure Webhooks
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <Card className="p-3.5 border-copper/40 bg-copper/5">
          <div className="flex items-start gap-2 text-xs text-copper">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        </Card>
      )}

      {/* Manual PR Trigger + Recent GitHub PR Picker */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          {/* Manual PR # Form */}
          <Card className="p-4 space-y-3">
            <div className="text-sm font-medium text-text-primary">
              Check Any Pull Request
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const num = Number(manualPrInput.trim());
                if (Number.isInteger(num) && num > 0) {
                  handleRunPrCheck(num, true);
                }
              }}
              className="flex gap-2"
            >
              <input
                type="number"
                min={1}
                step={1}
                value={manualPrInput}
                onChange={(e) => setManualPrInput(e.target.value)}
                placeholder="PR # (e.g. 42)"
                className="flex-1 min-w-0 px-3 py-1.5 rounded-md border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-forest/40"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={runningPr !== null || !manualPrInput.trim()}
              >
                <Play className="w-3.5 h-3.5 mr-1" />
                Run
              </Button>
            </form>
          </Card>

          {/* Live GitHub PRs */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Repository Pull Requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-72 overflow-y-auto">
              {githubWarning && (
                <p className="text-xs text-copper break-words">{githubWarning}</p>
              )}
              {livePrs.length === 0 && !githubWarning && (
                <p className="text-xs text-text-muted">
                  No recent GitHub Pull Requests found in this repository.
                </p>
              )}
              {livePrs.map((pr) => (
                <div
                  key={pr.number}
                  className="p-2.5 rounded-lg border border-border bg-surface-muted/40 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs text-text-muted">#{pr.number}</span>
                      <Badge
                        variant={pr.state === 'open' ? 'forest' : 'neutral'}
                        size="xs"
                      >
                        {pr.state}
                      </Badge>
                    </div>
                    <p className="text-xs font-medium text-text-primary truncate mt-0.5">
                      {pr.title}
                    </p>
                    <p className="text-[11px] font-mono text-text-muted truncate">
                      {pr.headRef} → {pr.baseRef}
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={runningPr === pr.number}
                    onClick={() => handleRunPrCheck(pr.number, true)}
                    className="shrink-0"
                  >
                    {runningPr === pr.number ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      'Check'
                    )}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Saved PR Check Audit History */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent PR Checks ({checks.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-80 overflow-y-auto">
              {checks.length === 0 ? (
                <p className="text-xs text-text-muted">
                  No PR checks recorded yet. Select a PR above or enter a PR number to run your first check.
                </p>
              ) : (
                checks.map((chk) => {
                  const isActive = selectedCheck?.id === chk.id;
                  return (
                    <button
                      key={chk.id}
                      type="button"
                      onClick={() => setSelectedCheckId(chk.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                        isActive
                          ? 'border-forest bg-forest/10'
                          : 'border-border bg-surface-muted/40 hover:border-forest/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-medium text-text-primary">
                          PR #{chk.prNumber} • {chk.headSha.slice(0, 7)}
                        </span>
                        <Badge
                          variant={
                            chk.status === 'PASS'
                              ? 'success'
                              : chk.status === 'REVIEW'
                              ? 'copper'
                              : 'neutral'
                          }
                          size="xs"
                        >
                          {chk.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-secondary truncate mt-1">
                        {chk.prTitle}
                      </p>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted mt-1">
                        <span>Impact: {chk.impactLevel}</span>
                        <span className="inline-flex items-center gap-1">
                          {chk.status === 'PASS' ? (
                            <CheckCircle2 className="w-3 h-3 text-forest" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          {new Date(chk.checkedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right 2 Columns: Full Report Detail */}
        <div className="lg:col-span-2 min-w-0">
          {selectedCheck ? (
            <PullRequestCheckView
              projectId={projectId}
              report={selectedCheck.reportJson}
              githubPublishStatus={selectedCheck.githubPublishStatus}
              githubPublishNote={selectedCheck.githubPublishNote}
              triggerSource={selectedCheck.triggerSource}
              checkedAt={selectedCheck.checkedAt}
              isRerunning={runningPr === selectedCheck.prNumber}
              onRerun={() => handleRunPrCheck(selectedCheck.prNumber, true)}
              onSyncRepo={onSyncProject}
              onInspectFile={(filePath) => onNavigateView('explorer', filePath)}
              onInspectImpact={(filePath) => onNavigateView('impact', filePath)}
              dedicatedRouteHref={`/project/${encodeURIComponent(projectId)}/pull-requests/${selectedCheck.prNumber}`}
            />
          ) : (
            <Card className="p-8 text-center">
              <GitPullRequest className="w-9 h-9 text-text-muted mx-auto mb-3 opacity-60" />
              <p className="text-sm font-medium text-text-primary">
                Select or run a Pull Request check
              </p>
              <p className="text-xs text-text-muted mt-1 max-w-md mx-auto">
                MarrowNode will analyze changed, added, renamed, and deleted files against your latest repository dependency graph.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

