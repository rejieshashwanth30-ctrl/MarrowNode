'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { ShieldCheck, Info, FileCode2, GitCommit, Network, Layers, BookOpen } from 'lucide-react';

interface ContextCoverageWidgetProps {
  coverage?: {
    overallPercentage: number;
    metrics: {
      totalFiles: number;
      commitsTracked: number;
      relationshipsMapped: number;
      architectureNodes: number;
    };
    breakdown: {
      codebaseUnderstanding: number;
      architectureMapping: number;
      gitHistory: number;
      dependencyMapping: number;
      documentation: number;
    };
  } | null;
}

export function ContextCoverageWidget({ coverage }: ContextCoverageWidgetProps) {
  const hasCoverage = coverage && coverage.overallPercentage > 0;

  const breakdownItems = [
    {
      label: 'Codebase Understanding',
      pct: hasCoverage ? coverage.breakdown.codebaseUnderstanding : 0,
      detail: hasCoverage ? 'AST symbol indexing & export resolution' : 'Pending analysis',
      icon: <FileCode2 className="w-3.5 h-3.5 text-forest" />,
    },
    {
      label: 'Architecture Mapping',
      pct: hasCoverage ? coverage.breakdown.architectureMapping : 0,
      detail: hasCoverage ? 'Service boundaries & component graphs' : 'Pending analysis',
      icon: <Network className="w-3.5 h-3.5 text-forest" />,
    },
    {
      label: 'Git History',
      pct: hasCoverage ? coverage.breakdown.gitHistory : 0,
      detail: hasCoverage ? 'Commit diffs, author blame & milestone trees' : 'Pending analysis',
      icon: <GitCommit className="w-3.5 h-3.5 text-copper" />,
    },
    {
      label: 'Dependency Mapping',
      pct: hasCoverage ? coverage.breakdown.dependencyMapping : 0,
      detail: hasCoverage ? 'Direct & transitive package bindings' : 'Pending analysis',
      icon: <Layers className="w-3.5 h-3.5 text-forest" />,
    },
    {
      label: 'Documentation',
      pct: hasCoverage ? coverage.breakdown.documentation : 0,
      detail: hasCoverage ? 'READMEs, RFCs & inline docstrings' : 'Pending analysis',
      icon: <BookOpen className="w-3.5 h-3.5 text-text-muted" />,
    },
  ];

  return (
    <Card className="overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Project Context Coverage</CardTitle>
          </div>
          <span className="text-xs text-text-muted flex items-center gap-1.5 font-sans">
            <Info className="w-3.5 h-3.5 text-text-subtle" />
            Static analysis & commit trace coverage
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left: Overall metric badge */}
          <div className="lg:col-span-4 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-border dark:border-border-dark pb-5 lg:pb-0 lg:pr-6">
            <div className="flex items-baseline gap-2.5">
              <span className="text-4xl sm:text-5xl font-bold tracking-tight text-text-primary dark:text-white font-sans">
                {hasCoverage ? coverage.overallPercentage : 0}%
              </span>
              <span className="text-xs uppercase tracking-wider text-forest font-semibold dark:text-[#88B094] font-sans">
                {hasCoverage ? 'Indexed' : 'Not Indexed'}
              </span>
            </div>

            <p className="text-xs text-text-muted mt-2 leading-relaxed font-sans">
              {hasCoverage ? (
                <>
                  Synthesized structural understanding across{' '}
                  <strong className="font-semibold text-text-primary dark:text-white">
                    {coverage.metrics.totalFiles} source files
                  </strong>{' '}
                  and{' '}
                  <strong className="font-semibold text-text-primary dark:text-white">
                    {coverage.metrics.commitsTracked} historical commits
                  </strong>.
                </>
              ) : (
                'Analysis not available yet. Connect a repository and start an analysis to generate project intelligence.'
              )}
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border dark:border-border-dark text-xs text-text-secondary font-sans">
              <div>
                <span className="text-text-muted block text-[11px] uppercase tracking-wider">
                  Symbols Mapped
                </span>
                <span className="font-semibold text-text-primary dark:text-[#E4E6E1] text-xs sm:text-sm">
                  {hasCoverage ? `${coverage.metrics.relationshipsMapped} linkages` : '—'}
                </span>
              </div>
              <div>
                <span className="text-text-muted block text-[11px] uppercase tracking-wider">
                  Architecture Nodes
                </span>
                <span className="font-semibold text-text-primary dark:text-[#E4E6E1] text-xs sm:text-sm">
                  {hasCoverage ? `${coverage.metrics.architectureNodes} nodes` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Breakdown list with progress bars */}
          <div className="lg:col-span-8 space-y-3.5">
            {breakdownItems.map((item) => (
              <div key={item.label} className="group">
                <div className="flex items-center justify-between text-xs mb-1.5 font-sans">
                  <div className="flex items-center gap-2">
                    {item.icon}
                    <span className="font-medium text-text-primary dark:text-[#E4E6E1]">
                      {item.label}
                    </span>
                    <span className="text-xs text-text-subtle hidden sm:inline">
                      — {item.detail}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-text-secondary dark:text-[#A7AFA9]">
                    {item.pct}%
                  </span>
                </div>

                {/* Meter Bar */}
                <div className="w-full h-1.5 bg-surface-muted rounded-full overflow-hidden dark:bg-[#202A24]">
                  <div
                    className="h-full bg-forest transition-all duration-500 ease-out dark:bg-[#6D977A]"
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
