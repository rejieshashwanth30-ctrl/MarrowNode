'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { TimelineEvent } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { GitCommit, Filter, ChevronDown, ChevronUp } from 'lucide-react';

interface ProjectTimelineProps {
  events?: TimelineEvent[];
  onSelectFile?: (filePath: string) => void;
  hasProject?: boolean;
  isAnalyzing?: boolean;
  onConnectRepo?: () => void;
}

export function ProjectTimeline({
  events = [],
  onSelectFile,
  hasProject = false,
  isAnalyzing = false,
  onConnectRepo,
}: ProjectTimelineProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  if (isAnalyzing) {
    return (
      <Card className="overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-copper dark:text-[#E08F6B]" />
            <CardTitle>Project History</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-copper/10 border border-copper/20 flex items-center justify-center text-copper dark:text-[#E08F6B] animate-spin">
            <GitCommit className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              Reading project history…
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Loading recent commits and changes from your project.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!events || events.length === 0) {
    return (
      <Card className="overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-copper dark:text-[#E08F6B]" />
            <CardTitle>Project History</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-copper/10 border border-copper/20 flex items-center justify-center text-copper dark:text-[#E08F6B]">
            <GitCommit className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              {hasProject ? 'Project history not analyzed yet' : 'No development history yet'}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              {hasProject
                ? 'Run analysis from Overview to see recent commits and how the project changed over time.'
                : 'Development history will appear after connecting and analyzing your project.'}
            </p>
          </div>
          {!hasProject && (
            <div className="pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={onConnectRepo}
                className="text-xs font-sans font-medium"
              >
                Choose repository
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const toggleExpand = (id: string) => {
    setExpandedEvents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredEvents = events.filter((ev) => {
    if (filterType === 'all') return true;
    return ev.type === filterType;
  });

  const getDotColor = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'security':
        return 'bg-copper border-copper/30';
      case 'database':
        return 'bg-forest border-forest/30';
      case 'refactor':
        return 'bg-[#4B6150] border-[#4B6150]/30';
      case 'feature':
        return 'bg-[#56735F] border-[#56735F]/30';
      case 'milestone':
        return 'bg-charcoal border-charcoal/30 dark:bg-white dark:border-white/30';
      default:
        return 'bg-text-muted border-border';
    }
  };

  return (
    <Card className="overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
          <div>
            <div className="flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-copper dark:text-[#E08F6B]" />
              <CardTitle>Project History</CardTitle>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              See how your project has changed over time.
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap max-w-full">
            <Filter className="w-3.5 h-3.5 text-text-muted mr-1 hidden sm:inline shrink-0" />
            {[
              { id: 'all', label: 'All History' },
              { id: 'milestone', label: 'Important Changes' },
              { id: 'security', label: 'Security' },
              { id: 'database', label: 'Database' },
              { id: 'feature', label: 'Feature' },
              { id: 'refactor', label: 'Refactor' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterType(f.id)}
                className={`text-xs font-sans px-2.5 py-1 rounded border transition-colors whitespace-nowrap ${
                  filterType === f.id
                    ? 'bg-charcoal text-white border-charcoal dark:bg-forest dark:border-forest font-medium'
                    : 'bg-surface text-text-secondary border-border hover:bg-surface-muted dark:bg-[#151C17] dark:border-border-dark dark:text-[#C6CDC7] dark:hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 pb-2 border-b border-border dark:border-border-dark font-sans">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-primary dark:text-white px-2 py-0.5 bg-surface-muted rounded dark:bg-[#1A221D]">
            Important Changes &amp; History
          </span>
          <span className="text-xs text-text-muted">
            {filteredEvents.length} recent change{filteredEvents.length === 1 ? '' : 's'} shown
          </span>
        </div>

        <div className="relative pl-5 sm:pl-8 space-y-5 sm:space-y-6 before:absolute before:left-2 sm:before:left-3 before:top-2 before:bottom-2 before:w-[1.5px] before:bg-border dark:before:bg-border-dark">
          {filteredEvents.map((ev) => {
            const isExpanded = !!expandedEvents[ev.id];

            return (
              <div key={ev.id} className="relative group font-sans min-w-0">
                <div
                  className={`absolute -left-[20px] sm:-left-[25px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-surface ${getDotColor(
                    ev.type
                  )} shadow-sm z-10 dark:border-[#151C17]`}
                />

                <div className="p-3.5 sm:p-4 rounded bg-surface border border-border hover:border-forest/50 transition-colors dark:bg-[#17201B] dark:border-border-dark min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <h4 className="text-sm font-semibold text-text-primary dark:text-white break-words min-w-0">
                        {ev.title}
                      </h4>
                      <Badge variant="neutral" size="xs" className="uppercase font-sans font-medium">
                        {ev.type === 'milestone' ? 'important change' : ev.type}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-text-muted font-sans shrink-0">
                      <span>{ev.date}</span>
                      <span className="text-border-strong">·</span>
                      <span className="font-mono text-copper dark:text-[#E69E7B] font-medium">
                        #{ev.commitShort}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-3 min-w-0">
                    <div className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                      What changed
                    </div>
                    <p className="text-xs sm:text-sm text-text-secondary leading-relaxed dark:text-[#C6CDC7] font-sans break-words">
                      {ev.explanation || ev.description}
                    </p>
                  </div>

                  <div className="p-3 rounded bg-surface-subtle border border-border/70 text-xs space-y-1.5 dark:bg-[#141A16] dark:border-border-dark min-w-0">
                    <div className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                      Why it changed
                    </div>
                    <p className="text-text-primary dark:text-[#EEF2EC] leading-relaxed break-words">
                      {ev.architecturalImpact || 'Not documented in the commit. The commit message does not explain the broader reason for this change.'}
                    </p>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-border flex flex-wrap items-center justify-between gap-2 dark:border-border-dark">
                    <button
                      type="button"
                      onClick={() => toggleExpand(ev.id)}
                      className="text-xs text-text-secondary hover:text-text-primary dark:text-[#C6CDC7] dark:hover:text-white flex items-center gap-1 font-sans font-medium"
                    >
                      <span>{isExpanded ? 'Hide commit details' : 'See commit details'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    <span className="text-xs text-text-muted font-sans">
                      by {ev.author?.name || 'Developer'}
                      {(ev.filesAffected || ev.filesChanged || []).length > 0
                        ? ` · ${(ev.filesAffected || ev.filesChanged || []).length} files changed`
                        : ''}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2.5 dark:border-border-dark min-w-0">
                      {(ev.filesAffected || ev.filesChanged || []).length > 0 && (
                        <>
                          <div className="text-[11px] uppercase tracking-wider text-text-muted font-medium">
                            Changed Files:
                          </div>
                          <div className="space-y-1.5">
                            {(ev.filesAffected || ev.filesChanged || []).map((file) => (
                              <EvidenceBadge
                                key={file}
                                type="file"
                                label={file}
                                onClick={() => onSelectFile?.(file)}
                                className="w-full justify-between"
                              />
                            ))}
                          </div>
                        </>
                      )}

                      <details className="text-xs text-text-muted">
                        <summary className="cursor-pointer font-medium hover:text-text-primary dark:hover:text-white select-none text-[11px]">
                          Technical details
                        </summary>
                        <div className="mt-1.5 p-2 rounded bg-surface dark:bg-[#141A16] border border-border dark:border-border-dark font-mono text-[11px] space-y-0.5 break-all">
                          <div>Commit SHA: {ev.commitHash}</div>
                          <div>Author: {ev.author?.name} ({ev.author?.handle})</div>
                          {ev.diffStats && (
                            <div>Diff stats: +{ev.diffStats.additions} / -{ev.diffStats.deletions} lines</div>
                          )}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
