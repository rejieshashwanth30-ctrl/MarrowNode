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
  let strokeColor = '#B8B9B1'; // default light mode
  let strokeWidth = 1.5;

  if (selected || isOutbound) {
    strokeColor = '#56735F'; // forest green
    strokeWidth = 2.5;
  } else if (isInbound) {
    strokeColor = '#B56B45'; // copper
    strokeWidth = 2.5;
  } else if (isCycle) {
    strokeColor = '#D97706'; // amber warning
    strokeWidth = 2;
  }

  const customStyle: React.CSSProperties = {
    ...style,
    stroke: strokeColor,
    strokeWidth,
    opacity: isDimmed ? 0.15 : 1,
    transition: 'all 200ms ease',
    strokeDasharray: isCycle ? '5 4' : undefined,
  };

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
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono leading-none border shadow-2xs select-none backdrop-blur-xs transition-opacity ${
                isOutbound
                  ? 'bg-forest/90 text-white border-forest'
                  : isInbound
                  ? 'bg-copper/90 text-white border-copper'
                  : 'bg-surface/90 text-text-muted border-border dark:bg-[#151C17]/90 dark:border-[#2C3930] dark:text-[#C6CDC7]'
              }`}
              title={edgeData?.evidence || `${edgeData?.source} imports ${edgeData?.target}`}
            >
              {edgeData?.relationship || 'imports'}
              {edgeData?.connectionCount && edgeData.connectionCount > 1
                ? ` (${edgeData.connectionCount})`
                : ''}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
