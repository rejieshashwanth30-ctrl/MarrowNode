'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Terminal,
  Database,
  Layers,
  Component,
  Server,
  FileCode,
  Shield,
  FolderGit2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Code2,
  Box,
} from 'lucide-react';
import type { NormalizedGraphNode } from '@/lib/analysis/architecture-graph-model';

export interface ArchitectureNodeData extends NormalizedGraphNode {
  direction?: 'TB' | 'LR';
  targetPosition?: Position;
  sourcePosition?: Position;
  isSelected?: boolean;
  isDimmed?: boolean;
  isDirectTarget?: boolean; // Outbound from selected ("Uses")
  isDirectSource?: boolean; // Inbound to selected ("Used by")
  onDrillDown?: (path: string) => void;
  width?: number;
  height?: number;
  [key: string]: any;
}

function getNodeIcon(type: string, isEntryPoint: boolean, isExternal?: boolean) {
  if (isExternal) {
    return <ExternalLink className="w-3.5 h-3.5 text-text-muted dark:text-[#9AC6A7]" />;
  }
  if (type === 'Root') {
    return <Box className="w-4 h-4 text-forest dark:text-[#9AC6A7]" />;
  }
  if (isEntryPoint) {
    return <Terminal className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7]" />;
  }
  const lower = (type || '').toLowerCase();
  if (lower.includes('db') || lower.includes('database') || lower.includes('prisma') || lower.includes('model')) {
    return <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-[#34D399]" />;
  }
  if (lower.includes('api') || lower.includes('route') || lower.includes('server')) {
    return <Server className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7]" />;
  }
  if (lower.includes('component') || lower.includes('ui') || lower.includes('view')) {
    return <Component className="w-3.5 h-3.5 text-teal-600 dark:text-[#2DD4BF]" />;
  }
  if (lower.includes('auth') || lower.includes('security') || lower.includes('service')) {
    return <Shield className="w-3.5 h-3.5 text-copper dark:text-[#E69E7B]" />;
  }
  if (lower.includes('util') || lower.includes('helper') || lower.includes('common')) {
    return <Layers className="w-3.5 h-3.5 text-text-muted dark:text-[#A1A1AA]" />;
  }
  if (lower.includes('file')) {
    return <FileCode className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7]" />;
  }
  return <Layers className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7]" />;
}

export const ArchitectureNodeComponent = memo(function ArchitectureNodeComponent({
  data,
  selected,
}: NodeProps) {
  const nodeData = data as unknown as ArchitectureNodeData;
  const isSelected = selected || nodeData.isSelected;
  const isDimmed = nodeData.isDimmed;
  const isDirectTarget = nodeData.isDirectTarget;
  const isDirectSource = nodeData.isDirectSource;

  const targetPos = nodeData.targetPosition || Position.Top;
  const sourcePos = nodeData.sourcePosition || Position.Bottom;

  const isRoot = nodeData.type === 'Root';
  const isExternal = Boolean(nodeData.isExternal);
  const isFile = nodeData.type === 'File';

  // Distinct border & ring classes based on selection and role
  let borderRingClass = 'border-border dark:border-[#2C3930] hover:border-forest/60 dark:hover:border-[#9AC6A7]/60';
  if (isSelected) {
    borderRingClass =
      'border-forest dark:border-[#9AC6A7] ring-2 ring-forest/40 dark:ring-[#9AC6A7]/40 shadow-lg';
  } else if (isDirectTarget) {
    borderRingClass =
      'border-forest dark:border-[#34D399] ring-1.5 ring-forest/30 dark:ring-[#34D399]/30';
  } else if (isDirectSource) {
    borderRingClass =
      'border-copper dark:border-[#FB923C] ring-1.5 ring-copper/30 dark:ring-[#FB923C]/30';
  } else if (nodeData.isEntryPoint) {
    borderRingClass = 'border-forest/60 dark:border-[#9AC6A7]/60 hover:border-forest dark:hover:border-[#9AC6A7]';
  } else if (isExternal) {
    borderRingClass = 'border-dashed border-border-strong dark:border-[#3A4A3E]';
  }

  // 1. ROOT PROJECT NODE (Large, distinctive, prominent)
  if (isRoot) {
    return (
      <div
        className={`relative w-[280px] rounded-2xl border-2 bg-gradient-to-b from-surface to-surface-subtle dark:from-[#1A261E] dark:to-[#121A15] p-4 shadow-md font-sans transition-all duration-200 select-none ${borderRingClass} ${
          isDimmed ? 'opacity-25' : 'opacity-100'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-forest/20 dark:bg-forest/30 flex items-center justify-center shrink-0 text-forest dark:text-[#9AC6A7]">
              <Box className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-forest dark:text-[#9AC6A7]">
              PROJECT ROOT
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-semibold bg-forest/15 text-forest dark:bg-[#1E2E23] dark:text-[#9AC6A7]">
            {nodeData.technology || 'Next.js'}
          </span>
        </div>

        <div className="text-sm font-extrabold text-text-primary dark:text-white truncate mb-1" title={nodeData.name}>
          {nodeData.name}
        </div>
        <p className="text-[11px] text-text-muted leading-tight line-clamp-1 mb-2.5">
          {nodeData.description}
        </p>

        <div className="flex items-center justify-between pt-2 border-t border-border/80 dark:border-[#2C3930] text-[10px] font-mono text-text-muted">
          <span className="font-semibold text-text-secondary dark:text-[#EEF2ED]">
            {nodeData.filesCount} files analyzed
          </span>
          <span className="text-forest dark:text-[#9AC6A7]">
            {nodeData.fanOut} areas configured →
          </span>
        </div>

        {/* Source Handle (Root connects outward to Entrypoints) */}
        <Handle
          type="source"
          position={sourcePos}
          id="source"
          className="!w-3 !h-3 !bg-forest dark:!bg-[#9AC6A7] !border-2 !border-surface dark:!border-[#121A15] transition-all"
        />
      </div>
    );
  }

  // 2. EXTERNAL DEPENDENCY NODE (Distinctive pill/dashed styling)
  if (isExternal) {
    return (
      <div
        className={`relative w-[210px] rounded-xl border border-dashed bg-surface/75 dark:bg-[#121A15]/80 p-2.5 shadow-2xs font-sans transition-all duration-200 select-none ${borderRingClass} ${
          isDimmed ? 'opacity-20' : 'opacity-100'
        }`}
      >
        <Handle
          type="target"
          position={targetPos}
          id="target"
          className="!w-2 !h-2 !bg-text-muted dark:!bg-[#88A892] !border-2 !border-surface dark:!border-[#121A15]"
        />

        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded bg-surface-muted dark:bg-[#1C2720] flex items-center justify-center shrink-0">
            <ExternalLink className="w-3 h-3 text-text-muted dark:text-[#9AC6A7]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-text-primary dark:text-[#EEF2ED] truncate">
              {nodeData.name}
            </div>
            <div className="text-[9px] text-text-muted uppercase tracking-wider font-semibold">
              External Package
            </div>
          </div>
        </div>

        <Handle
          type="source"
          position={sourcePos}
          id="source"
          className="!w-2 !h-2 !bg-text-muted dark:!bg-[#88A892] !border-2 !border-surface dark:!border-[#121A15]"
        />
      </div>
    );
  }

  // 3. FILE NODE (Clean, compact, code-focused)
  if (isFile) {
    return (
      <div
        className={`relative w-[220px] rounded-xl border bg-surface dark:bg-[#151C17] p-2.5 shadow-2xs font-sans transition-all duration-200 select-none ${borderRingClass} ${
          isDimmed ? 'opacity-25' : 'opacity-100'
        }`}
      >
        <Handle
          type="target"
          position={targetPos}
          id="target"
          className="!w-2.5 !h-2.5 !bg-forest dark:!bg-[#9AC6A7] !border-2 !border-surface dark:!border-[#151C17]"
        />

        <div className="flex items-center justify-between gap-1.5 mb-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-4 h-4 rounded bg-forest/10 dark:bg-[#1A261E] flex items-center justify-center shrink-0">
              <FileCode className="w-3 h-3 text-forest dark:text-[#9AC6A7]" />
            </div>
            <span className="text-xs font-bold text-text-primary dark:text-[#F2F4F0] truncate" title={nodeData.name}>
              {nodeData.name}
            </span>
          </div>

          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-surface-muted text-text-muted dark:bg-[#202722]">
            {nodeData.language || 'TS'}
          </span>
        </div>

        <div className="text-[10px] text-text-muted font-mono truncate mb-1.5" title={nodeData.path}>
          {nodeData.path}
        </div>

        <div className="flex items-center justify-between pt-1.5 border-t border-border/70 dark:border-[#2C3930] text-[9px] text-text-muted font-mono">
          <span>{nodeData.fanIn} caller(s)</span>
          <span>{nodeData.fanOut} import(s)</span>
        </div>

        <Handle
          type="source"
          position={sourcePos}
          id="source"
          className="!w-2.5 !h-2.5 !bg-forest dark:!bg-[#9AC6A7] !border-2 !border-surface dark:!border-[#151C17]"
        />
      </div>
    );
  }

  // 4. ARCHITECTURE / MODULE NODE (Standard functional area)
  return (
    <div
      className={`relative w-[250px] rounded-xl border bg-surface dark:bg-[#151C17] p-3 shadow-2xs font-sans transition-all duration-200 select-none ${borderRingClass} ${
        isDimmed ? 'opacity-25' : 'opacity-100'
      }`}
    >
      {/* Target Handle (Inbound) */}
      <Handle
        type="target"
        position={targetPos}
        id="target"
        className="!w-2.5 !h-2.5 !bg-forest dark:!bg-[#9AC6A7] !border-2 !border-surface dark:!border-[#151C17] transition-all"
      />

      {/* Node Header Row: Icon + Type Badge + Status Indicator */}
      <div className="flex items-center justify-between gap-1.5 mb-1.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-5 h-5 rounded-md bg-forest/10 dark:bg-[#1A261E] flex items-center justify-center shrink-0">
            {getNodeIcon(nodeData.type, nodeData.isEntryPoint, false)}
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted truncate">
            {nodeData.type}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {nodeData.isEntryPoint && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-forest/15 text-forest dark:bg-[#1E2E23] dark:text-[#9AC6A7] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-forest dark:bg-[#9AC6A7] animate-pulse" />
              <span>Entry</span>
            </span>
          )}
          {nodeData.isCycle && (
            <span
              title="Part of a circular dependency cycle"
              className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-copper/15 text-copper dark:bg-[#2B1B15] dark:text-[#E69E7B] flex items-center gap-0.5"
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              <span>Cycle</span>
            </span>
          )}
          {nodeData.isIsolated && !nodeData.isEntryPoint && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-surface-muted text-text-muted dark:bg-[#202722]">
              Isolated
            </span>
          )}
        </div>
      </div>

      {/* Node Name & Area Path */}
      <div className="min-w-0 mb-2">
        <div className="text-xs font-bold text-text-primary dark:text-[#F2F4F0] truncate" title={nodeData.name}>
          {nodeData.name}
        </div>
        <div className="text-[10px] text-text-muted font-mono truncate" title={nodeData.path}>
          {nodeData.path}
        </div>
      </div>

      {/* Node Stats Row: Files & In/Out Connections */}
      <div className="flex items-center justify-between pt-2 border-t border-border/70 dark:border-[#2C3930] text-[10px] text-text-muted font-sans">
        <span className="font-medium text-text-secondary dark:text-[#C6CDC7]">
          {nodeData.filesCount} {nodeData.filesCount === 1 ? 'file' : 'files'}
        </span>

        <span className="font-mono text-[9px] text-text-muted">
          {nodeData.fanIn} in · {nodeData.fanOut} out
        </span>
      </div>

      {/* Drill-down prompt if sub-modules exist */}
      {nodeData.hasDrillDown && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            nodeData.onDrillDown?.(nodeData.path);
          }}
          className="mt-2 pt-1.5 border-t border-dashed border-border/60 dark:border-[#2C3930] flex items-center justify-between text-[10px] text-forest dark:text-[#9AC6A7] hover:underline cursor-pointer group"
        >
          <span className="font-medium flex items-center gap-1">
            <FolderGit2 className="w-3 h-3 shrink-0" />
            <span>Explore area</span>
          </span>
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </div>
      )}

      {/* Source Handle (Outbound) */}
      <Handle
        type="source"
        position={sourcePos}
        id="source"
        className="!w-2.5 !h-2.5 !bg-forest dark:!bg-[#9AC6A7] !border-2 !border-surface dark:!border-[#151C17] transition-all"
      />
    </div>
  );
});
