'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArchitectureNode, ArchitectureEdge } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import { Network, ArrowRight, ArrowLeft, GitCommit, Layers, FileCode } from 'lucide-react';

interface ArchitectureGraphProps {
  nodes?: ArchitectureNode[];
  edges?: ArchitectureEdge[];
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  onSelectFile?: (filePath: string) => void;
  hasProject?: boolean;
  isAnalyzing?: boolean;
  onConnectRepo?: () => void;
}

export function ArchitectureGraph({
  nodes = [],
  edges = [],
  selectedNodeId,
  onSelectNode,
  onSelectFile,
  hasProject = false,
  isAnalyzing = false,
  onConnectRepo,
}: ArchitectureGraphProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string>(
    selectedNodeId || nodes[0]?.id || ''
  );

  if (isAnalyzing) {
    return (
      <Card className="h-full flex flex-col overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Topology Dependency Graph</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex-1 flex flex-col items-center justify-center text-center space-y-3 min-h-[420px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094] animate-spin">
            <Network className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              Mapping Architecture Topology…
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Synthesizing module coupling, service boundaries, and dependency relationships from AST files and manifests.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!nodes || nodes.length === 0) {
    return (
      <Card className="h-full flex flex-col overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Topology Dependency Graph</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex-1 flex flex-col items-center justify-center text-center space-y-3 min-h-[420px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
            <Network className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              {hasProject ? 'Architecture Map Pending' : 'Architecture map unavailable'}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              {hasProject
                ? 'Run repository analysis to generate the topology graph and compute module couplings.'
                : 'Connect and analyze a repository to generate the architecture map and visualize service boundaries, component graphs, and dependency couplings.'}
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

  const activeId = selectedNodeId || internalSelectedId || nodes[0]?.id;
  const activeNode = nodes.find((n) => n.id === activeId) || nodes[0];

  const handleNodeClick = (id: string) => {
    setInternalSelectedId(id);
    onSelectNode?.(id);
  };

  const incomingEdges = edges.filter((e) => e.target === activeId);
  const outgoingEdges = edges.filter((e) => e.source === activeId);

  const isEdgeHighlighted = (e: ArchitectureEdge) => {
    return e.source === activeId || e.target === activeId;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 font-sans">
      {/* Graph Visual Canvas */}
      <div className="lg:col-span-8">
        <Card className="h-full flex flex-col overflow-hidden font-sans">
          <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-forest dark:text-[#88B094]" />
                <CardTitle>Topology Dependency Graph</CardTitle>
              </div>
              <div className="flex items-center gap-2 text-xs font-sans text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-forest" /> Active Edge
                </span>
                <span className="flex items-center gap-1.5 ml-2">
                  <span className="w-2.5 h-0.5 bg-border" /> Neutral Edge
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-3 sm:p-5 flex-1 bg-ivory/40 dark:bg-[#101512] flex flex-col items-center justify-center relative min-h-[460px]">
            {/* SVG Diagram Canvas */}
            <div className="w-full max-w-[720px] aspect-[4/3] relative">
              <svg
                viewBox="0 0 760 560"
                className="w-full h-full select-none"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  <marker
                    id="arrow-neutral"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 9 5 L 0 9 z" fill="#B8B9B1" />
                  </marker>
                  <marker
                    id="arrow-active"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 9 5 L 0 9 z" fill="#56735F" />
                  </marker>
                </defs>

                {/* Graph Edges */}
                {edges.map((edge) => {
                  const srcNode = nodes.find((n) => n.id === edge.source);
                  const tgtNode = nodes.find((n) => n.id === edge.target);
                  if (!srcNode || !tgtNode) return null;

                  const isHighlighted = isEdgeHighlighted(edge);
                  const strokeColor = isHighlighted ? '#56735F' : '#D9DAD4';
                  const strokeWidth = isHighlighted ? 2 : 1.25;
                  const marker = isHighlighted ? 'url(#arrow-active)' : 'url(#arrow-neutral)';

                  const dx = tgtNode.position.x - srcNode.position.x;
                  const dy = tgtNode.position.y - srcNode.position.y;
                  const cx = (srcNode.position.x + tgtNode.position.x) / 2 + (dy > 0 ? 15 : -15);
                  const cy = (srcNode.position.y + tgtNode.position.y) / 2;

                  return (
                    <g key={edge.id} className="transition-all duration-300">
                      <path
                        d={`M ${srcNode.position.x} ${srcNode.position.y} Q ${cx} ${cy} ${tgtNode.position.x} ${tgtNode.position.y}`}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeDasharray={edge.isIndirect ? '4 3' : 'none'}
                        markerEnd={marker}
                      />
                    </g>
                  );
                })}

                {/* Graph Nodes */}
                {nodes.map((node) => {
                  const isSelected = node.id === activeId;
                  const isConnected =
                    isSelected ||
                    incomingEdges.some((e) => e.source === node.id) ||
                    outgoingEdges.some((e) => e.target === node.id);

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.position.x}, ${node.position.y})`}
                      onClick={() => handleNodeClick(node.id)}
                      className="cursor-pointer group"
                    >
                      <rect
                        x="-70"
                        y="-30"
                        width="140"
                        height="60"
                        rx="4"
                        className={`transition-all duration-200 ${
                          isSelected
                            ? 'fill-surface stroke-forest stroke-[2.5px] dark:fill-[#1C2620]'
                            : isConnected
                            ? 'fill-surface stroke-border-strong hover:stroke-forest/70 dark:fill-[#151C17]'
                            : 'fill-surface/90 stroke-border opacity-70 hover:opacity-100 dark:fill-[#131915]'
                        }`}
                      />

                      <rect
                        x="-69"
                        y="-30"
                        width="138"
                        height="3"
                        rx="1"
                        className={isSelected ? 'fill-forest' : 'fill-transparent group-hover:fill-forest/40'}
                      />

                      <text
                        x="0"
                        y="-8"
                        textAnchor="middle"
                        className={`text-xs font-semibold font-sans select-none ${
                          isSelected
                            ? 'fill-text-primary font-bold dark:fill-white'
                            : 'fill-text-primary dark:fill-[#E4E6E1]'
                        }`}
                      >
                        {node.name}
                      </text>

                      <text
                        x="0"
                        y="10"
                        textAnchor="middle"
                        className="text-[11px] font-sans fill-text-muted select-none"
                      >
                        {node.category}
                      </text>

                      <text
                        x="0"
                        y="22"
                        textAnchor="middle"
                        className="text-[10px] font-sans fill-text-subtle select-none"
                      >
                        {node.filesCount} files · {node.metrics.loc} LOC
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="w-full text-center mt-2 text-xs font-sans text-text-muted">
              Select any architecture node to inspect dependencies, downstream dependents, and related source files.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Node Inspector Details Pane */}
      <div className="lg:col-span-4">
        {activeNode && (
          <Card className="h-full flex flex-col font-sans">
            <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-forest dark:text-[#88B094]" />
                  <CardTitle>Node Inspector</CardTitle>
                </div>
                <Badge variant={activeNode.health === 'stable' ? 'success' : 'forest'} size="xs" className="font-sans font-medium uppercase">
                  {activeNode.health}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4 flex-1 overflow-y-auto max-h-[600px] font-sans">
              <div>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-base font-bold font-sans text-text-primary dark:text-white">
                    {activeNode.name}
                  </h3>
                  <span className="text-xs text-text-muted font-sans font-medium">
                    {activeNode.type}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-1.5 leading-relaxed dark:text-[#A7AFA9] font-sans">
                  {activeNode.description}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 p-2.5 bg-surface-subtle rounded border border-border dark:bg-[#1A221D] dark:border-border-dark text-center font-sans">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted block font-medium">Files</span>
                  <span className="text-xs font-semibold text-text-primary dark:text-[#E4E6E1]">
                    {activeNode.filesCount}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted block font-medium">Fan-In</span>
                  <span className="text-xs font-semibold text-text-primary dark:text-[#E4E6E1]">
                    {activeNode.metrics.fanIn}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted block font-medium">Fan-Out</span>
                  <span className="text-xs font-semibold text-text-primary dark:text-[#E4E6E1]">
                    {activeNode.metrics.fanOut}
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-1 border-t border-border dark:border-border-dark text-xs font-sans">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-text-muted block mb-1.5 flex items-center gap-1 font-medium">
                    <ArrowRight className="w-3.5 h-3.5 text-forest" />
                    Direct Dependencies (Outbound)
                  </span>
                  {activeNode.dependencies.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {activeNode.dependencies.map((dep) => (
                        <button
                          key={dep}
                          onClick={() => {
                            const tgt = nodes.find((n) => n.name === dep);
                            if (tgt) handleNodeClick(tgt.id);
                          }}
                          className="px-2 py-0.5 rounded font-sans text-xs bg-surface border border-border hover:border-forest/60 text-text-primary dark:bg-[#151C17] dark:border-border-dark dark:text-[#E4E6E1] font-medium"
                        >
                          → {dep}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-text-muted text-xs italic font-sans">
                      None (leaf persistence or primitive layer)
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[11px] uppercase tracking-wider text-text-muted block mb-1.5 flex items-center gap-1 font-medium">
                    <ArrowLeft className="w-3.5 h-3.5 text-copper" />
                    Dependents (Inbound Consumers)
                  </span>
                  {activeNode.dependents.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {activeNode.dependents.map((dep) => (
                        <button
                          key={dep}
                          onClick={() => {
                            const tgt = nodes.find((n) => n.name === dep);
                            if (tgt) handleNodeClick(tgt.id);
                          }}
                          className="px-2 py-0.5 rounded font-sans text-xs bg-surface border border-border hover:border-copper/60 text-text-primary dark:bg-[#151C17] dark:border-border-dark dark:text-[#E4E6E1] font-medium"
                        >
                          ← {dep}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-text-muted text-xs italic font-sans">
                      None (root entrypoint layer)
                    </span>
                  )}
                </div>
              </div>

              {activeNode.relatedFiles && activeNode.relatedFiles.length > 0 && (
                <div className="pt-2 border-t border-border dark:border-border-dark font-sans">
                  <span className="text-[11px] uppercase tracking-wider text-text-muted block mb-2 flex items-center gap-1 font-medium">
                    <FileCode className="w-3.5 h-3.5 text-forest" />
                    Related Source Modules
                  </span>
                  <div className="space-y-1.5">
                    {activeNode.relatedFiles.map((file) => (
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
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
