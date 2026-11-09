'use client';

import React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { GitBranch, CheckCircle2, Database, Code2, Layers, RefreshCw, Clock, FolderGit2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ProjectHeaderProps {
  project?: {
    id: string;
    name: string;
    githubOwner?: string | null;
    githubRepositoryName?: string | null;
    defaultBranch?: string;
    visibility?: string;
    primaryLanguage?: string | null;
    framework?: string | null;
    database?: string | null;
    analysisStatus?: string;
    lastAnalyzedAt?: string | Date | null;
  } | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function ProjectHeader({
  project,
  onRefresh,
  isRefreshing = false,
}: ProjectHeaderProps) {
  if (!project) {
    return (
      <div className="bg-surface border-b border-border px-4 py-3 sm:px-6 sm:py-4 dark:bg-[#151C17] dark:border-border-dark font-sans">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-surface-subtle border border-border dark:bg-[#1A221D] dark:border-border-dark">
              <FolderGit2 className="w-4 h-4 text-text-muted" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-semibold tracking-tight text-text-primary dark:text-white">
                No repository connected
              </h1>
              <p className="text-xs text-text-muted">
                Connect a GitHub repository to begin building your project context.
              </p>
            </div>
          </div>
          <Link href="/onboarding">
            <Button variant="primary" size="sm" className="text-xs font-sans font-medium">
              Connect Repository
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const owner = project.githubOwner || 'Workspace';
  const lastIndexedText = project.lastAnalyzedAt
    ? `Analyzed ${new Date(project.lastAnalyzedAt).toLocaleDateString()}`
    : 'Not analyzed yet';

  const statusVariant =
    project.analysisStatus === 'COMPLETED'
      ? 'success'
      : project.analysisStatus === 'FAILED'
      ? 'copper'
      : 'neutral';

  return (
    <div className="bg-surface border-b border-border px-4 py-3 sm:px-6 sm:py-4 dark:bg-[#151C17] dark:border-border-dark font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Repo title, branch, and status badge */}
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-text-primary dark:text-white flex items-center gap-2">
              <span className="text-text-muted font-normal text-sm sm:text-base">
                {owner} /
              </span>
              <span>{project.name}</span>
            </h1>

            <div className="flex items-center gap-1.5">
              <Badge variant={statusVariant} size="sm" className="gap-1 font-sans font-medium">
                <CheckCircle2 className="w-3 h-3" />
                {project.analysisStatus || 'PENDING'}
              </Badge>

              <Badge variant="neutral" size="sm" className="gap-1 font-sans font-medium">
                <GitBranch className="w-3 h-3 text-text-muted" />
                {project.defaultBranch || 'main'}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 mt-2 text-xs text-text-muted flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-text-secondary" />
              <span>Language:</span>
              <strong className="text-text-primary font-medium dark:text-[#E4E6E1]">
                {project.primaryLanguage || 'Not available yet'}
              </strong>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-text-secondary" />
              <span>Framework:</span>
              <strong className="text-text-primary font-medium dark:text-[#E4E6E1]">
                {project.framework || 'Not available yet'}
              </strong>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-text-secondary" />
              <span>Database:</span>
              <strong className="text-text-primary font-medium dark:text-[#E4E6E1]">
                {project.database || 'Not available yet'}
              </strong>
            </span>

            <span className="inline-flex items-center gap-1.5 text-text-subtle">
              <Clock className="w-3 h-3" />
              <span>{lastIndexedText}</span>
            </span>
          </div>
        </div>

        {/* Right: Quick actions */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            loading={isRefreshing}
            className="text-xs font-sans font-medium"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Re-index delta
          </Button>
        </div>
      </div>
    </div>
  );
}
