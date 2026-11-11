'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Cpu,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  GitBranch,
  Layers,
  FileCode2,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { FileTreeNode } from '@/types';

interface ChangeImpactAnalysisProps {
  projectId?: string;
  initialFile?: string;
  onSelectFile?: (filePath: string) => void;
  hasAnalyzedProject?: boolean;
  hasProject?: boolean;
  isAnalyzing?: boolean;
  modules?: string[];
  fileTree?: FileTreeNode[];
  onConnectRepo?: () => void;
}

interface BlastRadiusData {
  target: string;
  changeType: 'interface' | 'refactor' | 'delete';
  blastRating: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'ISOLATED';
  confidenceScore: number;
  directConsumersCount: number;
  transitiveConsumersCount: number;
  totalAffectedCount: number;
  directConsumers: Array<{
    path: string;
    line: number;
    symbols?: string[];
    relationship: string;
  }>;
  transitiveConsumers: Array<{
    path: string;
    via: string;
  }>;
  isCoreSubsystem: boolean;
  cycles: string[][];
}

export function ChangeImpactAnalysis({
  projectId,
  initialFile,
  onSelectFile,
  hasAnalyzedProject = false,
  hasProject = false,
  isAnalyzing = false,
  modules = [],
  fileTree = [],
  onConnectRepo,
}: ChangeImpactAnalysisProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>(
    initialFile || modules[0] || 'app'
  );
  const [changeType, setChangeType] = useState<'interface' | 'refactor' | 'delete'>('interface');
  const [impactData, setImpactData] = useState<BlastRadiusData | null>(null);
  const [isLoadingImpact, setIsLoadingImpact] = useState<boolean>(false);
  const [impactError, setImpactError] = useState<string | null>(null);

  // Sync selected target when modules or initialFile change
  useEffect(() => {
    if (initialFile) {
      setSelectedTarget(initialFile);
    } else if (modules.length > 0 && !modules.includes(selectedTarget)) {
      setSelectedTarget(modules[0]);
    }
  }, [initialFile, modules]);

  // Query server-side deterministic impact analysis
  useEffect(() => {
    if (!projectId || !hasAnalyzedProject) return;

    let isMounted = true;
    setIsLoadingImpact(true);
    setImpactError(null);

    const controller = new AbortController();

    async function fetchImpact() {
      try {
        const queryParams = new URLSearchParams({
          target: selectedTarget,
          changeType,
        });

        const res = await fetch(`/api/projects/${projectId}/impact?${queryParams.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Could not calculate change impact (${res.status})`);
        }

        const data: BlastRadiusData = await res.json();
        if (isMounted) {
          setImpactData(data);
          setIsLoadingImpact(false);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError' && isMounted) {
          setImpactError(err?.message || 'Unable to compute file connections right now.');
          setIsLoadingImpact(false);
        }
      }
    }

    fetchImpact();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [projectId, hasAnalyzedProject, selectedTarget, changeType]);

  if (isAnalyzing) {
    return (
      <Card className="overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Change Impact</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094] animate-spin">
            <Cpu className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              Checking what could be affected…
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Scanning how files and folders in your project connect to each other.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasAnalyzedProject) {
    return (
      <Card className="overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Change Impact</CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
            <Cpu className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              {hasProject ? 'Analyze your project to see change impact' : 'Change impact unavailable'}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              {hasProject
                ? 'Run analysis from Overview to see which files and parts of your project depend on each other.'
                : 'Connect and analyze a project to see what could be affected when you make a change.'}
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

  // Determine Blast Rating & Colors from live telemetry
  const blastRating = impactData?.blastRating || (changeType === 'delete' ? 'CRITICAL' : 'MODERATE');
  const friendlyRatingLabel =
    blastRating === 'ISOLATED'
      ? 'NO OTHER PARTS CONNECTED'
      : blastRating === 'CRITICAL'
      ? 'VERY HIGH IMPACT'
      : blastRating === 'HIGH'
      ? 'HIGH IMPACT'
      : blastRating === 'MODERATE'
      ? 'MODERATE IMPACT'
      : 'LOW IMPACT';

  const blastColor =
    blastRating === 'CRITICAL'
      ? 'text-rose-500'
      : blastRating === 'HIGH'
      ? 'text-copper'
      : blastRating === 'MODERATE'
      ? 'text-amber-500'
      : 'text-forest dark:text-[#88B094]';

  const directConsumers = impactData?.directConsumers || [];
  const transitiveConsumers = impactData?.transitiveConsumers || [];
  const cycles = impactData?.cycles || [];
  const hasCycles = cycles.length > 0;

  return (
    <Card className="overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D] p-4 sm:p-5 border-b border-border dark:border-border-dark">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
          <div>
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-forest dark:text-[#88B094]" />
              <CardTitle>Change Impact</CardTitle>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Choose a part of your project and see what could be affected if you change it.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isLoadingImpact && (
              <span className="text-[10px] text-text-muted flex items-center gap-1 font-sans">
                <RefreshCw className="w-3 h-3 animate-spin text-forest" />
                checking connections…
              </span>
            )}
            <Badge variant="neutral" size="xs" className="font-sans text-[11px] font-medium">
              Based on project connections
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Target Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-primary dark:text-white block">
              What are you changing?
            </label>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="w-full h-9 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#151C17] dark:border-border-dark dark:text-white"
            >
              {modules.length > 0 ? (
                modules.map((m) => (
                  <option key={m} value={m}>
                    Project area: /{m}
                  </option>
                ))
              ) : (
                <>
                  <option value="app">Project area: /app</option>
                  <option value="lib">Project area: /lib</option>
                  <option value="components">Project area: /components</option>
                </>
              )}
            </select>
          </div>

          <div className="space-y-1.5 min-w-0">
            <label className="text-xs font-medium text-text-primary dark:text-white block">
              Type of change
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setChangeType('interface')}
                className={`min-h-[38px] py-1.5 px-2.5 text-xs rounded border transition-colors font-medium text-center leading-tight ${
                  changeType === 'interface'
                    ? 'border-forest bg-forest/15 text-forest dark:border-[#6E947A] dark:text-[#A5D3B3]'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-subtle dark:bg-[#1B251E] dark:border-[#324237] dark:text-[#D5DDD7] dark:hover:bg-[#233028]'
                }`}
              >
                Changing an interface
              </button>
              <button
                type="button"
                onClick={() => setChangeType('refactor')}
                className={`min-h-[38px] py-1.5 px-2.5 text-xs rounded border transition-colors font-medium text-center leading-tight ${
                  changeType === 'refactor'
                    ? 'border-forest bg-forest/15 text-forest dark:border-[#6E947A] dark:text-[#A5D3B3]'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-subtle dark:bg-[#1B251E] dark:border-[#324237] dark:text-[#D5DDD7] dark:hover:bg-[#233028]'
                }`}
              >
                Refactoring code
              </button>
              <button
                type="button"
                onClick={() => setChangeType('delete')}
                className={`min-h-[38px] py-1.5 px-2.5 text-xs rounded border transition-colors font-medium text-center leading-tight ${
                  changeType === 'delete'
                    ? 'border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-300'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-subtle dark:bg-[#1B251E] dark:border-[#324237] dark:text-[#D5DDD7] dark:hover:bg-[#233028]'
                }`}
              >
                Removing something
              </button>
            </div>
          </div>
        </div>

        {/* Telemetry Results */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-border-dark">
            <span className="text-[10px] uppercase font-semibold text-text-muted block mb-1">
              Possible impact
            </span>
            <div className={`text-lg font-bold font-sans ${blastColor}`}>{friendlyRatingLabel}</div>
            <span className="text-[11px] text-text-muted mt-1 block">
              Based on connections in your project
            </span>
          </div>

          <div className="p-4 rounded bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-border-dark">
            <span className="text-[10px] uppercase font-semibold text-text-muted block mb-1">
              Other parts that may be affected
            </span>
            <div className="text-lg font-bold font-sans text-text-primary dark:text-white">
              {impactData ? `${impactData.directConsumersCount} direct, ${impactData.transitiveConsumersCount} indirect` : 'Checking…'}
            </div>
            <span className="text-[11px] text-text-muted mt-1 block">
              {impactData ? `${impactData.totalAffectedCount} total affected files` : 'Scanning connections'}
            </span>
          </div>

          <div className="p-4 rounded bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-border-dark">
            <span className="text-[10px] uppercase font-semibold text-text-muted block mb-1">
              Dependency check
            </span>
            <div className={`text-lg font-bold font-sans flex items-center gap-1.5 ${hasCycles ? 'text-amber-500' : 'text-forest dark:text-[#88B094]'}`}>
              {hasCycles ? (
                <>
                  <AlertTriangle className="w-5 h-5" />
                  <span>Circular connection found</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{directConsumers.length === 0 ? 'Isolated' : 'Clear'}</span>
                </>
              )}
            </div>
            <span className="text-[11px] text-text-muted mt-1 block">
              {hasCycles
                ? `${cycles.length} circular loop(s) between files`
                : 'No circular connections found'}
            </span>
          </div>
        </div>

        {/* Circular Dependency Warning Banner */}
        {hasCycles && (
          <div className="p-3.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-sans space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Circular Connection Found Between Files</span>
            </div>
            <div className="font-mono text-[11px] pl-5 overflow-x-auto">
              {cycles[0]?.join(' → ')}
            </div>
          </div>
        )}

        {/* Direct Consumers Impact List */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-text-muted">
            Files that directly depend on this part ({directConsumers.length})
          </h4>
          {directConsumers.length > 0 ? (
            <div className="border border-border dark:border-border-dark rounded divide-y divide-border dark:divide-border-dark text-xs max-h-60 overflow-y-auto">
              {directConsumers.map((consumer, idx) => (
                <div key={idx} className="p-3 flex flex-wrap items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileCode2 className="w-4 h-4 text-forest shrink-0" />
                    <span className="font-mono text-text-primary dark:text-white break-all min-w-0">
                      {consumer.path}:{consumer.line}
                    </span>
                  </div>
                  <Badge variant="neutral" size="xs" className="shrink-0 font-mono text-[10px]">
                    {consumer.relationship}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded border border-border dark:border-border-dark bg-surface-subtle dark:bg-[#1A221D] text-center text-xs text-text-muted space-y-1">
              <div className="font-semibold text-text-primary dark:text-white">NO OTHER CONNECTED PARTS FOUND</div>
              <p>MarrowNode did not find other project files that directly depend on this part.</p>
              <p className="text-[11px] text-text-subtle">This is based on the project connections MarrowNode could analyze. Dynamic runtime behavior may not be visible.</p>
            </div>
          )}
        </div>

        {/* Transitive Consumers Impact List */}
        {transitiveConsumers.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-text-muted">
              Indirectly affected parts ({transitiveConsumers.length})
            </h4>
            <div className="border border-border dark:border-border-dark rounded divide-y divide-border dark:divide-border-dark text-xs max-h-48 overflow-y-auto">
              {transitiveConsumers.slice(0, 10).map((tc, idx) => (
                <div key={idx} className="p-2.5 flex flex-wrap items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Layers className="w-3.5 h-3.5 text-copper shrink-0" />
                    <span className="font-mono text-text-primary dark:text-white break-all min-w-0">
                      {tc.path}
                    </span>
                  </div>
                  <span className="text-[10px] text-text-muted font-mono shrink-0 break-all">
                    through {tc.via}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {impactData && (
          <details className="pt-2 border-t border-border dark:border-border-dark text-xs text-text-muted">
            <summary className="cursor-pointer font-medium hover:text-text-primary dark:hover:text-white select-none text-[11px]">
              Technical details
            </summary>
            <div className="mt-1.5 p-2.5 rounded bg-surface-subtle dark:bg-[#141A16] font-mono text-[11px] space-y-0.5">
              <div>Blast rating enum: {impactData.blastRating} (changeType={impactData.changeType})</div>
              <div>Direct consumers: {impactData.directConsumersCount} · Transitive consumers: {impactData.transitiveConsumersCount}</div>
              <div>Evidence model: Deterministic AST dependency graph traversal</div>
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
