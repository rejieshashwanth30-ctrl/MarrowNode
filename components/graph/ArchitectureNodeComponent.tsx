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
  Sparkles,
} from 'lucide-react';
import type { NormalizedGraphNode } from '@/lib/analysis/architecture-graph-model';

export interface ArchitectureNodeData extends NormalizedGraphNode {
  direction?: 'TB' | 'LR';
  targetPosition?: Position;
  sourcePosition?: Position;
  isSelected?: boolean;
  isDimmed?: boolean;
  isDirectTarget?: boolean; // Outbound from selected
  isDirectSource?: boolean; // Inbound to selected
  onDrillDown?: (path: string) => void;
  [key: string]: any;
}

function getNodeIcon(type: string, isEntryPoint: boolean) {
  if (isEntryPoint) return <Terminal className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7]" />;
  const lower = (type || '').toLowerCase();
  if (lower.includes('db') || lower.includes('database') || lower.includes('prisma')) {
    return <Database className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7]" />;
  }
  if (lower.includes('api') || lower.includes('route') || lower.includes('server')) {
    return <Server className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7]" />;
  }
  if (lower.includes('component') || lower.includes('ui')) {
    return <Component className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7]" />;
  }
  if (lower.includes('auth') || lower.includes('security')) {
    return <Shield className="w-3.5 h-3.5 text-copper dark:text-[#E69E7B]" />;
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

  // Visual status border & ring classes
  let borderRingClass = 'border-border dark:border-[#2C3930] hover:border-forest/60 dark:hover:border-[#9AC6A7]/60';
  if (isSelected) {
    borderRingClass =
      'border-forest dark:border-[#9AC6A7] ring-2 ring-forest/30 dark:ring-[#9AC6A7]/30 shadow-md';
  } else if (isDirectTarget) {
    borderRingClass =
      'border-forest/80 dark:border-[#9AC6A7]/80 ring-1 ring-forest/30 dark:ring-[#9AC6A7]/30';
  } else if (isDirectSource) {
    borderRingClass =
      'border-copper/80 dark:border-[#E69E7B]/80 ring-1 ring-copper/30 dark:ring-[#E69E7B]/30';
  }

  return (
    <div
      className={`relative w-[220px] rounded-xl border bg-surface dark:bg-[#151C17] p-3 shadow-2xs font-sans transition-all duration-200 select-none ${borderRingClass} ${
        isDimmed ? 'opacity-30' : 'opacity-100'
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
            {getNodeIcon(nodeData.type, nodeData.isEntryPoint)}
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted truncate">
            {nodeData.type}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {nodeData.isEntryPoint && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-forest/15 text-forest dark:bg-[#1E2E23] dark:text-[#9AC6A7]">
              Entry
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
          className="mt-2 pt-1 border-t border-dashed border-border/60 dark:border-[#2C3930] flex items-center justify-between text-[10px] text-forest dark:text-[#9AC6A7] hover:underline cursor-pointer group"
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
