'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { FileCode, GitCommit, GitPullRequest, Database, Network, BookOpen, ExternalLink } from 'lucide-react';

export interface EvidenceBadgeProps {
  type?: 'file' | 'commit' | 'schema' | 'pr' | 'architecture' | 'doc' | 'dependency';
  label: string;
  reference?: string;
  preview?: string;
  onClick?: () => void;
  className?: string;
}

export function EvidenceBadge({
  type = 'file',
  label,
  reference,
  preview,
  onClick,
  className,
}: EvidenceBadgeProps) {
  const getIcon = () => {
    switch (type) {
      case 'file':
        return <FileCode className="w-3 h-3 text-forest dark:text-[#88B094] shrink-0" />;
      case 'commit':
        return <GitCommit className="w-3 h-3 text-copper dark:text-[#E08F6B] shrink-0" />;
      case 'schema':
        return <Database className="w-3 h-3 text-forest dark:text-[#88B094] shrink-0" />;
      case 'pr':
        return <GitPullRequest className="w-3 h-3 text-text-secondary shrink-0" />;
      case 'architecture':
        return <Network className="w-3 h-3 text-forest shrink-0" />;
      case 'doc':
        return <BookOpen className="w-3 h-3 text-text-muted shrink-0" />;
      case 'dependency':
        return <Database className="w-3 h-3 text-copper shrink-0" />;
      default:
        return <FileCode className="w-3 h-3 text-text-muted shrink-0" />;
    }
  };

  return (
    <div
      onClick={onClick}
      title={preview || reference || label}
      className={cn(
        'group inline-flex items-center gap-1.5 px-2 py-1 rounded bg-surface border border-border text-xs font-mono text-text-primary transition-all dark:bg-[#1A221D] dark:border-border-dark dark:text-[#E4E6E1]',
        onClick && 'cursor-pointer hover:border-forest/50 hover:bg-forest/5',
        className
      )}
    >
      {getIcon()}
      <span className="font-medium truncate max-w-[200px] sm:max-w-none">{label}</span>
      {reference && (
        <span className="text-[10px] text-text-muted border-l border-border pl-1.5 ml-0.5 truncate hidden sm:inline">
          {reference}
        </span>
      )}
      {onClick && (
        <ExternalLink className="w-2.5 h-2.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" />
      )}
    </div>
  );
}

