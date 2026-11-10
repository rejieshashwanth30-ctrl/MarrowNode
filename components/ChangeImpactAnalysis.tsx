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
          throw new Error(`Failed to calculate blast radius (${res.status})`);
        }

        const data: BlastRadiusData = await res.json();
        if (isMounted) {
          setImpactData(data);
          setIsLoadingImpact(false);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError' && isMounted) {
          setImpactError(err?.message || 'Error computing graph traversal');
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
            <CardTitle>Change Impact Analysis</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094] animate-spin">
            <Cpu className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              Computing Blast Radius Models…
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Evaluating import graphs and dependency paths across repository files.
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
            <CardTitle>Change Impact Analysis</CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
            <Cpu className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              {hasProject ? 'Analysis Required for Impact Modeling' : 'Change impact analysis unavailable'}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              {hasProject
                ? 'Run repository analysis from the Overview tab to compute call graphs, AST dependencies, and impact models.'
                : 'Connect and analyze a repository to evaluate blast radius, affected downstream consumers, and direct/transitive dependency changes.'}
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

  // Determine Blast Rating & Colors from live telemetry
  const blastRating = impactData?.blastRating || (changeType === 'delete' ? 'CRITICAL' : 'MODERATE');
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
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Architectural Blast Radius & Impact Simulator</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isLoadingImpact && (
              <span className="text-[10px] text-text-muted flex items-center gap-1 font-mono">
                <RefreshCw className="w-3 h-3 animate-spin text-forest" />
                traversing AST…
              </span>
            )}
            <Badge variant="neutral" size="xs" className="font-mono text-[10px]">
              DETERMINISTIC GRAPH
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Target Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-primary dark:text-white block">
              Simulated Target (Module or Subsystem)
            </label>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="w-full h-9 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#151C17] dark:border-border-dark dark:text-white"
            >
              {modules.length > 0 ? (
                modules.map((m) => (
                  <option key={m} value={m}>
                    Module: /{m}
                  </option>
                ))
              ) : (
                <>
                  <option value="app">Module: /app (Core Routing)</option>
                  <option value="lib">Module: /lib (Shared Utilities)</option>
                  <option value="components">Module: /components (UI Elements)</option>
                </>
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-primary dark:text-white block">
              Hypothetical Change Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setChangeType('interface')}
                className={`h-9 px-2 text-xs rounded border transition-colors font-medium ${
                  changeType === 'interface'
                    ? 'border-forest bg-forest/10 text-forest dark:text-[#88B094]'
                    : 'border-border bg-surface text-text-secondary dark:bg-[#151C17] dark:border-border-dark'
                }`}
              >
                Signature Edit
              </button>
              <button
                type="button"
                onClick={() => setChangeType('refactor')}
                className={`h-9 px-2 text-xs rounded border transition-colors font-medium ${
                  changeType === 'refactor'
                    ? 'border-forest bg-forest/10 text-forest dark:text-[#88B094]'
                    : 'border-border bg-surface text-text-secondary dark:bg-[#151C17] dark:border-border-dark'
                }`}
              >
                Internal Refactor
              </button>
              <button
                type="button"
                onClick={() => setChangeType('delete')}
                className={`h-9 px-2 text-xs rounded border transition-colors font-medium ${
                  changeType === 'delete'
                    ? 'border-rose-500 bg-rose-500/10 text-rose-500'
                    : 'border-border bg-surface text-text-secondary dark:bg-[#151C17] dark:border-border-dark'
                }`}
              >
                Deprecation
              </button>
            </div>
          </div>
        </div>

        {/* Telemetry Results */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-border-dark">
            <span className="text-[10px] uppercase font-semibold text-text-muted block mb-1">
              Estimated Blast Radius
            </span>
            <div className={`text-xl font-bold font-mono ${blastColor}`}>{blastRating}</div>
            <span className="text-[11px] text-text-muted mt-1 block">
              Evidence model: AST graph traversal
            </span>
          </div>

          <div className="p-4 rounded bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-border-dark">
            <span className="text-[10px] uppercase font-semibold text-text-muted block mb-1">
              Downstream Consumers
            </span>
            <div className="text-xl font-bold font-mono text-text-primary dark:text-white">
              {impactData ? `${impactData.directConsumersCount} direct, ${impactData.transitiveConsumersCount} transitive` : 'Traversing…'}
            </div>
            <span className="text-[11px] text-text-muted mt-1 block">
              {impactData ? `${impactData.totalAffectedCount} total affected files` : 'Evaluating dependency graph'}
            </span>
          </div>

          <div className="p-4 rounded bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-border-dark">
            <span className="text-[10px] uppercase font-semibold text-text-muted block mb-1">
              Regression Safeguard
            </span>
            <div className={`text-xl font-bold font-mono flex items-center gap-1.5 ${hasCycles ? 'text-amber-500' : 'text-forest dark:text-[#88B094]'}`}>
              {hasCycles ? (
                <>
                  <AlertTriangle className="w-5 h-5" />
                  <span>CYCLE DETECTED</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{directConsumers.length === 0 ? 'ISOLATED' : 'SAFE'}</span>
                </>
              )}
            </div>
            <span className="text-[11px] text-text-muted mt-1 block">
              {hasCycles
                ? `${cycles.length} circular dependency cycle(s) identified`
                : 'No circular dependencies identified'}
            </span>
          </div>
        </div>

        {/* Circular Dependency Warning Banner */}
        {hasCycles && (
          <div className="p-3.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-sans space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Circular Coupling Detected in Subsystem</span>
            </div>
            <div className="font-mono text-[11px] pl-5 overflow-x-auto">
              {cycles[0]?.join(' → ')}
            </div>
          </div>
        )}

        {/* Direct Consumers Impact List */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase text-text-muted">
            Directly Coupled Downstream Consumers ({directConsumers.length})
          </h4>
          {directConsumers.length > 0 ? (
            <div className="border border-border dark:border-border-dark rounded divide-y divide-border dark:divide-border-dark text-xs max-h-60 overflow-y-auto">
              {directConsumers.map((consumer, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCode2 className="w-4 h-4 text-forest shrink-0" />
                    <span className="font-mono text-text-primary dark:text-white truncate">
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
            <div className="p-4 rounded border border-border dark:border-border-dark bg-surface-subtle dark:bg-[#1A221D] text-center text-xs text-text-muted">
              No direct consumers import this target. Changes here will not break other modules directly.
            </div>
          )}
        </div>

        {/* Transitive Consumers Impact List */}
        {transitiveConsumers.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-text-muted">
              Transitive Downstream Dependents ({transitiveConsumers.length})
            </h4>
            <div className="border border-border dark:border-border-dark rounded divide-y divide-border dark:divide-border-dark text-xs max-h-48 overflow-y-auto">
              {transitiveConsumers.slice(0, 10).map((tc, idx) => (
                <div key={idx} className="p-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers className="w-3.5 h-3.5 text-copper shrink-0" />
                    <span className="font-mono text-text-primary dark:text-white truncate">
                      {tc.path}
                    </span>
                  </div>
                  <span className="text-[10px] text-text-muted font-mono shrink-0">
                    via {tc.via}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
