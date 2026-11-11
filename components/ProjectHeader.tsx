'use client';

import React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import {
  GitBranch,
  CheckCircle2,
  Database,
  Code2,
  Layers,
  RefreshCw,
  Clock,
  FolderGit2,
  Play,
  Plus,
  AlertCircle,
  Loader2,
} from 'lucide-react';
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
  freshness?: 'CURRENT' | 'STALE' | 'ANALYZING' | 'PARTIAL' | 'FAILED';
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
  onConnectRepo?: () => void;
}

export function ProjectHeader({
  project,
  freshness,
  onRefresh,
  isRefreshing = false,
  onAnalyze,
  isAnalyzing = false,
  onConnectRepo,
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
                No project connected
              </h1>
              <p className="text-xs text-text-muted">
                Connect a GitHub repository to start exploring your project.
              </p>
            </div>
          </div>
          {onConnectRepo ? (
            <Button
              variant="primary"
              size="sm"
              onClick={onConnectRepo}
              className="text-xs font-sans font-medium"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Choose repository
            </Button>
          ) : (
            <Link href="/onboarding">
              <Button variant="primary" size="sm" className="text-xs font-sans font-medium">
                Choose repository
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  const owner = project.githubOwner || 'Project';
  const lastAnalyzedText = project.lastAnalyzedAt
    ? `Analyzed ${new Date(project.lastAnalyzedAt).toLocaleDateString()}`
    : 'Not analyzed yet';

  const statusLabel = isAnalyzing
    ? 'Analyzing...'
    : project.analysisStatus === 'COMPLETED'
    ? 'Analysis complete'
    : project.analysisStatus === 'FAILED'
    ? 'Analysis failed'
    : project.analysisStatus === 'RUNNING'
    ? 'Analyzing...'
    : 'Waiting to analyze';

  const statusVariant =
    project.analysisStatus === 'COMPLETED'
      ? 'success'
      : project.analysisStatus === 'FAILED'
      ? 'copper'
      : project.analysisStatus === 'RUNNING'
      ? 'forest'
      : 'neutral';

  return (
    <div className="bg-surface border-b border-border px-3.5 py-3 sm:px-6 sm:py-4 dark:bg-[#151C17] dark:border-border-dark font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 min-w-0">
        {/* Left: Repo title, branch, and status badge */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 flex-wrap min-w-0">
            <h1
              title={`${owner} / ${project.name}`}
              className="text-base sm:text-lg font-semibold tracking-tight text-text-primary dark:text-white flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 min-w-0 break-words"
            >
              <span className="text-text-muted font-normal text-sm sm:text-base break-words">
                {owner} /
              </span>
              <span className="break-words overflow-wrap-anywhere">{project.name}</span>
            </h1>

            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <Badge variant={statusVariant} size="sm" className="gap-1 font-sans font-medium">
                {isAnalyzing || project.analysisStatus === 'RUNNING' ? (
                  <Loader2 className="w-3 h-3 animate-spin text-forest dark:text-[#9AC6A7]" />
                ) : project.analysisStatus === 'COMPLETED' ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : project.analysisStatus === 'FAILED' ? (
                  <AlertCircle className="w-3 h-3 text-copper" />
                ) : (
                  <Clock className="w-3 h-3 text-text-muted" />
                )}
                <span>{statusLabel}</span>
              </Badge>

              {freshness === 'STALE' && (
                <Badge
                  variant="copper"
                  size="sm"
                  className="font-sans font-medium text-[10px]"
                  title="Newer commits exist on GitHub since the last analysis"
                >
                  New changes available
                </Badge>
              )}

              {freshness === 'PARTIAL' && (
                <Badge
                  variant="neutral"
                  size="sm"
                  className="font-sans font-medium text-[10px]"
                  title="Part of the project files were analyzed"
                >
                  Partially analyzed
                </Badge>
              )}

              <Badge variant="neutral" size="sm" className="gap-1 font-sans font-medium">
                <GitBranch className="w-3 h-3 text-text-muted shrink-0" />
                <span className="truncate max-w-[140px] sm:max-w-[200px]">
                  {project.defaultBranch || 'main'}
                </span>
              </Badge>

              {project.visibility && (
                <Badge variant="neutral" size="sm" className="font-sans text-[10px] uppercase">
                  {project.visibility}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-x-3 gap-y-1.5 sm:gap-4 mt-2 text-xs text-text-muted flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-text-secondary shrink-0" />
              <span>Language:</span>
              <strong className="text-text-primary font-medium dark:text-[#EEF2EC]">
                {project.primaryLanguage || 'Checking...'}
              </strong>
            </span>

            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-text-secondary shrink-0" />
              <span>Framework:</span>
              <strong className="text-text-primary font-medium dark:text-[#EEF2EC]">
                {project.framework || 'Checking...'}
              </strong>
            </span>

            {project.database && (
              <span className="inline-flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-text-secondary shrink-0" />
                <span>Database:</span>
                <strong className="text-text-primary font-medium dark:text-[#EEF2EC]">
                  {project.database}
                </strong>
              </span>
            )}

            <span className="inline-flex items-center gap-1.5 text-text-muted">
              <Clock className="w-3 h-3 shrink-0" />
              <span>{lastAnalyzedText}</span>
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap shrink-0">
          {onConnectRepo && (
            <Button
              variant="outline"
              size="sm"
              onClick={onConnectRepo}
              className="text-xs font-sans font-medium"
            >
              <FolderGit2 className="w-3.5 h-3.5 mr-1.5" />
              Choose repository
            </Button>
          )}

          {onAnalyze && (
            <Button
              variant={project.analysisStatus === 'COMPLETED' ? 'outline' : 'primary'}
              size="sm"
              onClick={onAnalyze}
              loading={isAnalyzing}
              disabled={isAnalyzing}
              className="text-xs font-sans font-medium"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Analyzing...
                </>
              ) : project.analysisStatus === 'COMPLETED' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Analyze again
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                  Analyze project
                </>
              )}
            </Button>
          )}

          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              loading={isRefreshing}
              className="text-xs font-sans font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Sync changes
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
