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
            <CardTitle>Project Git Memory & Timeline</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-copper/10 border border-copper/20 flex items-center justify-center text-copper dark:text-[#E08F6B] animate-spin">
            <GitCommit className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              Indexing Git Timeline…
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Fetching commit history, author provenance, and chronological milestones from the repository.
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
            <CardTitle>Project Git Memory & Timeline</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-copper/10 border border-copper/20 flex items-center justify-center text-copper dark:text-[#E08F6B]">
            <GitCommit className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              {hasProject ? 'Git Timeline Pending' : 'No development history yet'}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              {hasProject
                ? 'Run repository analysis from the Overview tab to index commit history and chronological milestones.'
                : 'Git history will appear after repository analysis.'}
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
                Connect GitHub Repository
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
          <div className="flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-copper dark:text-[#E08F6B]" />
            <CardTitle>Project Git Memory & Timeline</CardTitle>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-text-muted mr-1 hidden sm:inline" />
            {[
              { id: 'all', label: 'All History' },
              { id: 'security', label: 'Security' },
              { id: 'database', label: 'Database' },
              { id: 'feature', label: 'Feature' },
              { id: 'refactor', label: 'Refactor' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={`text-xs font-sans px-2.5 py-1 rounded border transition-colors ${
                  filterType === f.id
                    ? 'bg-charcoal text-white border-charcoal dark:bg-forest dark:border-forest font-medium'
                    : 'bg-surface text-text-secondary border-border hover:bg-surface-muted dark:bg-[#151C17] dark:border-border-dark dark:text-[#A7AFA9]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex items-center gap-2 pb-2 border-b border-border dark:border-border-dark font-sans">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-primary dark:text-white px-2 py-0.5 bg-surface-muted rounded dark:bg-[#1A221D]">
            Repository Milestones
          </span>
          <span className="text-xs text-text-muted">
            {filteredEvents.length} tracked architectural evolutions
          </span>
        </div>

        <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3 before:top-2 before:bottom-2 before:w-[1.5px] before:bg-border dark:before:bg-border-dark">
          {filteredEvents.map((ev) => {
            const isExpanded = !!expandedEvents[ev.id];

            return (
              <div key={ev.id} className="relative group font-sans">
                <div
                  className={`absolute -left-[23px] sm:-left-[25px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-surface ${getDotColor(
                    ev.type
                  )} shadow-sm z-10 dark:border-[#151C17]`}
                />

                <div className="p-4 rounded bg-surface border border-border hover:border-forest/50 transition-colors dark:bg-[#17201B] dark:border-border-dark">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-text-primary dark:text-white">
                        {ev.title}
                      </h4>
                      <Badge variant="neutral" size="xs" className="uppercase font-sans font-medium">
                        {ev.type}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-text-muted font-sans">
                      <span>{ev.date}</span>
                      <span className="text-border-strong">·</span>
                      <span className="font-mono text-copper font-medium">
                        #{ev.commitShort}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-text-secondary leading-relaxed mb-3 dark:text-[#A7AFA9] font-sans">
                    {ev.explanation || ev.description}
                  </p>

                  {(ev.architecturalImpact || ev.explanation) && (
                    <div className="p-3 rounded bg-surface-subtle border border-border/70 text-xs space-y-1.5 dark:bg-[#141A16] dark:border-border-dark">
                      <div className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                        Architectural Intent & Impact
                      </div>
                      <p className="text-text-primary dark:text-[#E4E6E1] leading-relaxed">
                        {ev.architecturalImpact || ev.explanation}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between dark:border-border-dark">
                    <button
                      type="button"
                      onClick={() => toggleExpand(ev.id)}
                      className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 font-sans font-medium dark:hover:text-white"
                    >
                      <span>{isExpanded ? 'Hide Evidence & Diff' : 'Inspect Evidence'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    <span className="text-xs text-text-subtle font-sans">
                      {(ev.filesAffected || ev.filesChanged || []).length} files tracked {ev.diffStats ? `· +${ev.diffStats.additions} / -${ev.diffStats.deletions}` : ''}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2.5 dark:border-border-dark">
                      <div className="text-[11px] uppercase tracking-wider text-text-muted font-medium">
                        Modified Files:
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
