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
  const docTypesList = coverage?.documentation?.docTypes?.join(', ') || (coverage?.documentation?.hasReadme ? 'README' : 'No docs detected');

  const breakdownItems = [
    {
      label: 'Source Analysis Coverage',
      pct: hasCoverage ? filesPct : 0,
      detail: hasCoverage
        ? `${filesParsed} / ${filesSource} files (${filesDiscovered} discovered, ${filesIgnored} ignored, ${filesFailed} failed)`
        : 'Pending analysis',
      icon: <FileCode2 className="w-3.5 h-3.5 text-forest" />,
    },
    {
      label: 'Import Resolution',
      pct: hasCoverage ? importsPct : 0,
      detail: hasCoverage
        ? `${importsResolved} internal, ${importsExternal} external (${importsUnresolved} unresolved of ${importsTotal} total)`
        : 'Pending analysis',
      icon: <Network className="w-3.5 h-3.5 text-forest" />,
    },
    {
      label: 'Architecture Mapping',
      pct: hasCoverage ? archPct : 0,
      detail: hasCoverage
        ? `${archMapped} / ${archDetected} modules mapped${archModulesList ? ` [${archModulesList}]` : ''}${
            archUnresolved > 0
              ? ` (${archUnresolved} unlinked: standalone tooling/assets without incoming imports)`
              : ''
          }`
        : 'Pending analysis',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-forest" />,
    },
    {
      label: 'Dependency Resolution',
      pct: hasCoverage ? depsPct : 0,
      detail: hasCoverage
        ? `${depsResolved} / ${depsDeclared} declared packages resolved (${manifestsParsed} / ${manifestsDetected} manifests parsed)`
        : 'Pending analysis',
      icon: <Layers className="w-3.5 h-3.5 text-forest" />,
    },
    {
      label: 'Git History Scope',
      pct: hasCoverage ? gitPct : 0,
      detail: hasCoverage
        ? `${commitsIndexed} / ${commitsDiscovered} commits indexed (${gitHistoryScope})`
        : 'Pending analysis',
      icon: <GitCommit className="w-3.5 h-3.5 text-copper" />,
    },
    {
      label: 'Documentation Detected',
      pct: hasCoverage ? (docFilesDetected > 0 ? 100 : 0) : 0,
      detail: hasCoverage
        ? `${docFilesDetected} files detected (${docTypesList})`
        : 'Pending analysis',
      icon: <BookOpen className="w-3.5 h-3.5 text-text-muted" />,
    },
  ];

  return (
    <Card className="overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Repository Context Coverage</CardTitle>
          </div>
          <span className="text-xs text-text-muted flex items-center gap-1.5 font-sans">
            <Info className="w-3.5 h-3.5 text-text-subtle" />
            Deterministic AST & commit trace scope
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
                {hasCoverage ? 'Indexed Scope' : 'Not Indexed'}
              </span>
            </div>

            <p className="text-xs text-text-muted mt-2 leading-relaxed font-sans">
              {hasCoverage ? (
                <>
                  Verified deterministic understanding across{' '}
                  <strong className="font-semibold text-text-primary dark:text-white">
                    {filesParsed} of {filesSource} source files
                  </strong>{' '}
                  ({filesPct}%) with{' '}
                  <strong className="font-semibold text-text-primary dark:text-white">
                    {importsPct}% import resolution
                  </strong>{' '}
                  along{' '}
                  <strong className="font-semibold text-text-primary dark:text-white">
                    {commitsIndexed} commits
                  </strong>.
                </>
              ) : (
                'Analysis not available yet. Connect a repository and run analysis to generate project intelligence.'
              )}
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border dark:border-border-dark text-xs text-text-secondary font-sans">
              <div>
                <span className="text-text-muted block text-[11px] uppercase tracking-wider">
                  Imports Resolved
                </span>
                <span className="font-semibold text-text-primary dark:text-[#E4E6E1] text-xs sm:text-sm">
                  {hasCoverage ? `${importsResolved} internal` : '—'}
                </span>
              </div>
              <div>
                <span className="text-text-muted block text-[11px] uppercase tracking-wider">
                  Unresolved Imports
                </span>
                <span className="font-semibold text-text-primary dark:text-[#E4E6E1] text-xs sm:text-sm">
                  {hasCoverage ? `${importsUnresolved} unlinked` : '—'}
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
