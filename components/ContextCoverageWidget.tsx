'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { ShieldCheck, Info, FileCode2, GitCommit, Network, Layers, BookOpen, CheckCircle2 } from 'lucide-react';
import { AnalysisCoverage } from '@/types';

interface ContextCoverageWidgetProps {
  coverage?: AnalysisCoverage | null;
}

export function ContextCoverageWidget({ coverage }: ContextCoverageWidgetProps) {
  const hasCoverage = Boolean(coverage && (coverage.overallCoveragePercent || (coverage as any).overallPercentage));
  const overallPercent = coverage?.overallCoveragePercent ?? (coverage as any)?.overallPercentage ?? 0;

  // Canonical breakdowns with fallback support for legacy data
  const filesDiscovered = coverage?.files?.discovered ?? coverage?.metrics?.totalFiles ?? 0;
  const filesSource = coverage?.files?.source ?? filesDiscovered;
  const filesParsed = coverage?.files?.parsed ?? (coverage as any)?.filesAnalyzed ?? filesSource;
  const filesIgnored = coverage?.files?.ignored ?? 0;
  const filesFailed = coverage?.files?.failed ?? 0;
  const filesPct = coverage?.files?.coveragePercent ?? (filesSource > 0 ? Math.round((filesParsed / filesSource) * 100) : 0);

  const importsTotal = coverage?.imports?.total ?? coverage?.metrics?.relationshipsMapped ?? 0;
  const importsResolved = coverage?.imports?.resolved ?? importsTotal;
  const importsExternal = coverage?.imports?.external ?? 0;
  const importsUnresolved = coverage?.imports?.unresolved ?? 0;
  const importsPct = coverage?.imports?.resolutionPercent ?? (importsTotal > 0 ? Math.round(((importsResolved + importsExternal) / importsTotal) * 100) : 100);

  const archMapped = coverage?.architecture?.modulesMapped ?? coverage?.metrics?.architectureNodes ?? 0;
  const archDetected = coverage?.architecture?.modulesDetected ?? Math.max(1, archMapped);
  const archUnresolved = coverage?.architecture?.unresolvedModules ?? 0;
  const archPct = coverage?.architecture?.coveragePercent ?? (archDetected > 0 ? Math.round((archMapped / archDetected) * 100) : 100);
  const archModulesList = coverage?.architecture?.detectedModuleNames?.slice(0, 4).join(', ') || '';

  const depsDeclared = coverage?.dependencies?.declaredDependencies ?? 0;
  const depsResolved = coverage?.dependencies?.resolvedDependencies ?? depsDeclared;
  const manifestsParsed = coverage?.dependencies?.manifestsParsed ?? 1;
  const manifestsDetected = coverage?.dependencies?.manifestsDetected ?? 1;
  const depsPct = coverage?.dependencies?.usageResolutionPercent ?? (depsDeclared > 0 ? Math.round((depsResolved / depsDeclared) * 100) : 100);

  const commitsIndexed = coverage?.git?.commitsIndexed ?? coverage?.metrics?.commitsTracked ?? 0;
  const commitsDiscovered = coverage?.git?.commitsDiscovered ?? commitsIndexed;
  const gitHistoryScope = coverage?.git?.historyScope ?? `Latest ${commitsIndexed} commits`;
  const gitPct = coverage?.git?.coveragePercent ?? (commitsDiscovered > 0 ? Math.round((commitsIndexed / commitsDiscovered) * 100) : 0);

  const docFilesDetected = coverage?.documentation?.filesDetected ?? (coverage?.documentation?.hasReadme ? 1 : 0);
  const docTypesList = coverage?.documentation?.docTypes?.join(', ') || (coverage?.documentation?.hasReadme ? 'README' : 'None found');

  const breakdownItems = [
    {
      label: 'Files analyzed',
      tooltip: 'How many source code files MarrowNode could read and analyze.',
      pct: hasCoverage ? filesPct : 0,
      detail: hasCoverage
        ? `${filesParsed} of ${filesSource} source files analyzed${filesFailed > 0 ? ` (${filesFailed} could not be read)` : ''}`
        : 'Waiting for analysis',
      icon: <FileCode2 className="w-3.5 h-3.5 text-forest" />,
    },
    {
      label: 'File connections',
      tooltip: 'Shows how files in the project connect to one another based on imports.',
      pct: hasCoverage ? importsPct : 0,
      detail: hasCoverage
        ? `${importsResolved + importsExternal} connections found${importsUnresolved > 0 ? `, ${importsUnresolved} could not be confirmed` : ''}`
        : 'Waiting for analysis',
      icon: <Network className="w-3.5 h-3.5 text-forest" />,
    },
    {
      label: 'Project structure',
      tooltip: 'Shows how the major folders and code areas are organized.',
      pct: hasCoverage ? archPct : 0,
      detail: hasCoverage
        ? `${archMapped} of ${archDetected} project areas understood${archModulesList ? ` (${archModulesList})` : ''}${
            archUnresolved > 0
              ? ` · ${archUnresolved} standalone folders without incoming imports`
              : ''
          }`
        : 'Waiting for analysis',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-forest" />,
    },
    {
      label: 'Packages understood',
      tooltip: 'Shows which external packages MarrowNode could identify from your project files.',
      pct: hasCoverage ? depsPct : 0,
      detail: hasCoverage
        ? `${depsResolved} of ${depsDeclared} packages understood (${manifestsParsed} package list${manifestsParsed === 1 ? '' : 's'} checked)`
        : 'Waiting for analysis',
      icon: <Layers className="w-3.5 h-3.5 text-forest" />,
    },
    {
      label: 'Development history',
      tooltip: 'Shows how the project changed over time.',
      pct: hasCoverage ? gitPct : 0,
      detail: hasCoverage
        ? `${commitsIndexed} recent commits analyzed${commitsDiscovered > commitsIndexed ? ` (of ${commitsDiscovered})` : ''}`
        : 'Waiting for analysis',
      icon: <GitCommit className="w-3.5 h-3.5 text-copper" />,
    },
    {
      label: 'Project documentation',
      tooltip: 'Checks whether README or documentation files exist in the project.',
      pct: hasCoverage ? (docFilesDetected > 0 ? 100 : 0) : 0,
      detail: hasCoverage
        ? docFilesDetected > 0
          ? `${docFilesDetected} documentation file${docFilesDetected === 1 ? '' : 's'} found (${docTypesList})`
          : 'No documentation files found'
        : 'Waiting for analysis',
      icon: <BookOpen className="w-3.5 h-3.5 text-text-muted" />,
    },
  ];

  return (
    <Card className="overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 w-full min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-forest dark:text-[#9AC6A7] shrink-0" />
            <CardTitle>Project Understanding</CardTitle>
          </div>
          <span
            className="text-xs text-text-muted flex items-center gap-1.5 font-sans"
            title="How much of the available project information MarrowNode analyzed"
          >
            <Info className="w-3.5 h-3.5 text-text-subtle shrink-0" />
            <span>How much of this project MarrowNode was able to understand</span>
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left: Overall metric badge */}
          <div className="lg:col-span-4 flex flex-col justify-center border-b lg:border-b-0 lg:border-r border-border dark:border-border-dark pb-5 lg:pb-0 lg:pr-6">
            <div className="flex items-baseline gap-2.5">
              <span className="text-4xl sm:text-5xl font-bold tracking-tight text-text-primary dark:text-white font-sans">
                {hasCoverage ? overallPercent : 0}%
              </span>
              <span className="text-xs uppercase tracking-wider text-forest font-semibold dark:text-[#88B094] font-sans">
                {hasCoverage ? 'Analysis coverage' : 'Not analyzed'}
              </span>
            </div>

            <p className="text-xs text-text-muted mt-2 leading-relaxed font-sans">
              {hasCoverage ? (
                <>
                  <strong className="font-semibold text-text-primary dark:text-white">
                    {overallPercent}% of the available project information
                  </strong>{' '}
                  was analyzed across{' '}
                  <strong className="font-semibold text-text-primary dark:text-white">
                    {filesParsed} of {filesSource} code files
                  </strong>
                  ,{' '}
                  <strong className="font-semibold text-text-primary dark:text-white">
                    {importsPct}% of file connections
                  </strong>
                  , and{' '}
                  <strong className="font-semibold text-text-primary dark:text-white">
                    {commitsIndexed} commits
                  </strong>
                  .
                </>
              ) : (
                'Analysis not available yet. Connect a GitHub repository and run analysis to understand your project.'
              )}
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border dark:border-border-dark text-xs text-text-secondary font-sans">
              <div>
                <span className="text-text-muted block text-[11px] uppercase tracking-wider">
                  File Connections
                </span>
                <span className="font-semibold text-text-primary dark:text-[#E4E6E1] text-xs sm:text-sm">
                  {hasCoverage ? `${importsResolved + importsExternal} found` : '—'}
                </span>
              </div>
              <div>
                <span className="text-text-muted block text-[11px] uppercase tracking-wider">
                  Unconfirmed
                </span>
                <span className="font-semibold text-text-primary dark:text-[#E4E6E1] text-xs sm:text-sm">
                  {hasCoverage ? `${importsUnresolved} connections` : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Breakdown list with progress bars */}
          <div className="lg:col-span-8 space-y-3.5">
            {breakdownItems.map((item) => (
              <div key={item.label} className="group min-w-0" title={item.tooltip}>
                <div className="flex items-start justify-between gap-2 text-xs mb-1.5 font-sans">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="shrink-0">{item.icon}</span>
                      <span className="font-medium text-text-primary dark:text-[#F2F4F0]">
                        {item.label}
                      </span>
                      <span className="text-xs text-text-muted hidden sm:inline break-words">
                        — {item.detail}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5 pl-5 sm:hidden break-words">
                      {item.detail}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-text-secondary dark:text-[#C6CDC7] shrink-0">
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

            {hasCoverage && (
              <details className="pt-2 text-xs text-text-muted border-t border-border/60 dark:border-border-dark">
                <summary className="cursor-pointer font-medium hover:text-text-primary dark:hover:text-white select-none">
                  Technical details
                </summary>
                <div className="mt-2 p-2.5 rounded bg-surface-subtle dark:bg-[#141A16] font-mono text-[11px] space-y-1">
                  <div>Source files: {filesParsed}/{filesSource} AST parsed ({filesDiscovered} total, {filesIgnored} ignored, {filesFailed} failed)</div>
                  <div>Import resolution: {importsResolved} internal, {importsExternal} external, {importsUnresolved} unresolved ({importsTotal} total)</div>
                  <div>Architecture nodes: {archMapped}/{archDetected} mapped ({archUnresolved} unlinked) · Git scope: {gitHistoryScope}</div>
                </div>
              </details>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
