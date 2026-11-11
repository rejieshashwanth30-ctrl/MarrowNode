'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PullRequestCheckView } from '@/components/PullRequestCheckView';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react';

export default function PullRequestDetailPage() {
  const params = useParams<{ projectId: string; prNumber: string }>();
  const router = useRouter();
  const projectId = params?.projectId || '';
  const prNumber = Number(params?.prNumber);

  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [rerunning, setRerunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!projectId || !Number.isInteger(prNumber) || prNumber <= 0) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/pull-requests/${prNumber}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Pull Request check report not found.');
      }
      setDetail(data);
    } catch (err: any) {
      setError(err?.message || 'Unable to load PR check report.');
    } finally {
      setLoading(false);
    }
  }, [projectId, prNumber]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleRerun = async () => {
    if (!projectId || !Number.isInteger(prNumber)) return;
    setRerunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/pr-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prNumber, forceRerun: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to rerun PR check.');
      }
      await loadDetail();
    } catch (err: any) {
      setError(err?.message || 'Failed to rerun PR check.');
    } finally {
      setRerunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={`/dashboard?view=pull-requests`}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Workspace
            </Link>
            {detail?.project && (
              <span className="text-xs font-mono text-text-muted truncate">
                / {detail.project.githubOwner}/{detail.project.githubRepositoryName}
              </span>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={loadDetail} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {loading && !detail ? (
          <Card className="p-8 text-center">
            <RefreshCw className="w-7 h-7 text-forest animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-text-primary">
              Loading Pull Request Check Report...
            </p>
          </Card>
        ) : error && !detail ? (
          <Card className="p-6 border-copper/40 bg-copper/5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-copper shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h1 className="text-base font-medium text-text-primary">
                  Pull Request Report Unavailable
                </h1>
                <p className="text-xs text-text-muted mt-1 break-words">{error}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Number.isInteger(prNumber) && prNumber > 0 && projectId && (
                <Button variant="primary" size="sm" onClick={handleRerun} disabled={rerunning}>
                  Run PR #{prNumber} Check Now
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => router.push('/dashboard?view=pull-requests')}>
                Return to PR Checks
              </Button>
            </div>
          </Card>
        ) : detail?.check?.reportJson ? (
          <PullRequestCheckView
            projectId={projectId}
            report={detail.check.reportJson}
            githubPublishStatus={detail.check.githubPublishStatus}
            githubPublishNote={detail.check.githubPublishNote}
            triggerSource={detail.check.triggerSource}
            checkedAt={detail.check.checkedAt}
            isRerunning={rerunning}
            onRerun={handleRerun}
            onInspectFile={(filePath) =>
              router.push(`/dashboard?view=explorer&file=${encodeURIComponent(filePath)}`)
            }
            onInspectImpact={(filePath) =>
              router.push(`/dashboard?view=impact&file=${encodeURIComponent(filePath)}`)
            }
          />
        ) : null}
      </main>
    </div>
  );
}

