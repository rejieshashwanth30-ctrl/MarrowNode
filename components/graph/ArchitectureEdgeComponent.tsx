'use client';

import React, { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  EdgeProps,
} from '@xyflow/react';
import type { NormalizedGraphEdge } from '@/lib/analysis/architecture-graph-model';

export interface ArchitectureEdgeData extends NormalizedGraphEdge {
  isOutboundFromSelected?: boolean;
  isInboundToSelected?: boolean;
  isDimmed?: boolean;
  showLabelAlways?: boolean;
  isExternal?: boolean;
  [key: string]: any;
}

export const ArchitectureEdgeComponent = memo(function ArchitectureEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const edgeData = data as ArchitectureEdgeData | undefined;
  const isOutbound = edgeData?.isOutboundFromSelected;
  const isInbound = edgeData?.isInboundToSelected;
  const isDimmed = edgeData?.isDimmed;
  const isCycle = edgeData?.isCycle;
  const isExternal = edgeData?.isExternal;
  const showLabel = edgeData?.showLabelAlways || selected || isOutbound || isInbound;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Determine stroke color & width
  let strokeColor = '#6B7E72'; // neutral dark theme edge
  let strokeWidth = 1.5;

  if (selected || isOutbound) {
    strokeColor = '#34D399'; // bright forest green
    strokeWidth = 2.5;
  } else if (isInbound) {
    strokeColor = '#FB923C'; // bright copper amber
    strokeWidth = 2.5;
  } else if (isCycle) {
    strokeColor = '#F59E0B'; // amber warning
    strokeWidth = 2.0;
  } else if (isExternal) {
    strokeColor = '#88A892';
    strokeWidth = 1.25;
  }

  const customStyle: React.CSSProperties = {
    ...style,
    stroke: strokeColor,
    strokeWidth,
    opacity: isDimmed ? 0.12 : 0.85,
    transition: 'all 200ms ease',
    strokeDasharray: isCycle ? '5 4' : isExternal ? '4 3' : undefined,
  };

  const relationshipLabel = edgeData?.relationship || 'imports';
  const connectionCountText =
    edgeData?.connectionCount && edgeData.connectionCount > 1
      ? ` (${edgeData.connectionCount})`
      : '';

  const tooltipText =
    edgeData?.evidence ||
    (edgeData?.symbols && edgeData.symbols.length > 0
      ? `Imports: ${edgeData.symbols.join(', ')}`
      : `${edgeData?.source} imports ${edgeData?.target}`);

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={customStyle} />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono leading-none border shadow-2xs select-none backdrop-blur-xs transition-opacity cursor-help ${
                isOutbound
                  ? 'bg-forest text-white border-forest dark:bg-[#1E3A2B] dark:border-[#34D399] dark:text-[#34D399]'
                  : isInbound
                  ? 'bg-copper text-white border-copper dark:bg-[#382015] dark:border-[#FB923C] dark:text-[#FB923C]'
                  : isCycle
                  ? 'bg-amber-600/90 text-white border-amber-600 dark:bg-[#3D2808] dark:border-[#F59E0B] dark:text-[#FCD34D]'
                  : 'bg-surface/90 text-text-muted border-border dark:bg-[#151C17]/90 dark:border-[#2C3930] dark:text-[#C6CDC7]'
              }`}
              title={tooltipText}
            >
              {relationshipLabel}
              {connectionCountText}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
