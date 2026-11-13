'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import '@xyflow/react/dist/style.css';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useReactFlow,
  MarkerType,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';

import type { ArchitectureNode, ArchitectureEdge, FileTreeNode } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EvidenceBadge } from '@/components/ui/EvidenceBadge';
import {
  Network,
  Layers,
  ArrowRight,
  ArrowLeft,
  FileCode,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Search,
  FolderGit2,
  AlertTriangle,
  HelpCircle,
  X,
  ExternalLink,
  ShieldCheck,
  Eye,
  EyeOff,
  GitCommit,
} from 'lucide-react';

import {
  buildArchitectureGraphModel,
  computeDagreLayout,
  type NormalizedGraphNode,
  type NormalizedGraphEdge,
} from '@/lib/analysis/architecture-graph-model';
import {
  ArchitectureNodeComponent,
  type ArchitectureNodeData,
} from '@/components/graph/ArchitectureNodeComponent';
import {
  ArchitectureEdgeComponent,
  type ArchitectureEdgeData,
} from '@/components/graph/ArchitectureEdgeComponent';

interface ArchitectureGraphProps {
  nodes?: ArchitectureNode[];
  edges?: ArchitectureEdge[];
  dependencyEdges?: any[];
  cycles?: string[][];
  fileTree?: FileTreeNode[];
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  onSelectFile?: (filePath: string) => void;
  onExploreFolder?: (folderPath: string) => void;
  hasProject?: boolean;
  isAnalyzing?: boolean;
  onConnectRepo?: () => void;
}

const nodeTypes = {
  architectureNode: ArchitectureNodeComponent,
};

const edgeTypes = {
  architectureEdge: ArchitectureEdgeComponent,
};

/**
 * Inner Flow Canvas with interactive React Flow state & controls
 */
function ArchitectureFlowCanvas({
  modelResult,
  activeId,
  onSelectNode,
  onDrillDown,
  direction,
  showLabels,
}: {
  modelResult: ReturnType<typeof buildArchitectureGraphModel>;
  activeId: string | null;
  onSelectNode: (id: string | null) => void;
  onDrillDown: (path: string) => void;
  direction: 'TB' | 'LR';
  showLabels: boolean;
}) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  // Compute Dagre hierarchical layout
  const { layoutNodes, layoutEdges } = useMemo(() => {
    return computeDagreLayout(modelResult.nodes, modelResult.edges, {
      direction,
      nodeWidth: 220,
      nodeHeight: 90,
    });
  }, [modelResult.nodes, modelResult.edges, direction]);

  // Identify connected nodes & edges when a node is selected
  const { outboundTargetIds, inboundSourceIds, connectedEdgeIds } = useMemo(() => {
    const outTargets = new Set<string>();
    const inSources = new Set<string>();
    const connEdges = new Set<string>();

    if (activeId) {
      for (const e of modelResult.edges) {
        if (e.source === activeId) {
          outTargets.add(e.target);
          connEdges.add(e.id);
        }
        if (e.target === activeId) {
          inSources.add(e.source);
          connEdges.add(e.id);
        }
      }
    }

    return {
      outboundTargetIds: outTargets,
      inboundSourceIds: inSources,
      connectedEdgeIds: connEdges,
    };
  }, [activeId, modelResult.edges]);

  // Map into React Flow Node objects with interactive states
  const flowNodes: Node[] = useMemo(() => {
    return layoutNodes.map((ln) => {
      const isSelected = ln.id === activeId;
      const isDirectTarget = outboundTargetIds.has(ln.id);
      const isDirectSource = inboundSourceIds.has(ln.id);
      const isConnected = isSelected || isDirectTarget || isDirectSource;
      const isDimmed = Boolean(activeId && !isConnected);

      return {
        id: ln.id,
        type: 'architectureNode',
        position: ln.position,
        targetPosition: ln.targetPosition,
        sourcePosition: ln.sourcePosition,
        data: {
          ...ln.data,
          isSelected,
          isDimmed,
          isDirectTarget,
          isDirectSource,
          onDrillDown,
        } as ArchitectureNodeData,
      };
    });
  }, [layoutNodes, activeId, outboundTargetIds, inboundSourceIds, onDrillDown]);

  // Map into React Flow Edge objects with interactive states
  const flowEdges: Edge[] = useMemo(() => {
    return layoutEdges.map((le) => {
      const isConnected = connectedEdgeIds.has(le.id);
      const isOutbound = activeId ? le.source === activeId : false;
      const isInbound = activeId ? le.target === activeId : false;
      const isDimmed = Boolean(activeId && !isConnected);

      return {
        id: le.id,
        source: le.source,
        target: le.target,
        type: 'architectureEdge',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: isOutbound ? '#56735F' : isInbound ? '#B56B45' : '#B8B9B1',
        },
        data: {
          ...le.data,
          isOutboundFromSelected: isOutbound,
          isInboundToSelected: isInbound,
          isDimmed,
          showLabelAlways: showLabels,
        } as ArchitectureEdgeData,
      };
    });
  }, [layoutEdges, connectedEdgeIds, activeId, showLabels]);

  const [nodes, setNodes] = useState<Node[]>(flowNodes);
  const [edges, setEdges] = useState<Edge[]>(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges]);

  // Auto-fit on layout or level changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.25, duration: 350 });
    }, 50);
    return () => clearTimeout(timer);
  }, [fitView, modelResult.levelTitle, direction]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectNode(node.id);
    },
    [onSelectNode]
  );

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div className="w-full h-full relative select-none">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        minZoom={0.2}
        maxZoom={2.0}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        className="touch-none"
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} className="opacity-60 dark:opacity-30" />
      </ReactFlow>

      {/* Embedded Quick Canvas Controls */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 p-1 bg-surface/90 dark:bg-[#151C17]/90 backdrop-blur-xs border border-border dark:border-[#2C3930] rounded-lg shadow-sm z-10">
        <button
          type="button"
          onClick={() => fitView({ padding: 0.25, duration: 400 })}
          title="Fit entire graph in view"
          className="p-1.5 rounded hover:bg-surface-subtle dark:hover:bg-[#1E2721] text-text-muted hover:text-text-primary dark:hover:text-white transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            onSelectNode(null);
            fitView({ padding: 0.25, duration: 400 });
          }}
          title="Reset zoom and selection"
          className="p-1.5 rounded hover:bg-surface-subtle dark:hover:bg-[#1E2721] text-text-muted hover:text-text-primary dark:hover:text-white transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-3.5 bg-border dark:bg-[#2C3930]" />
        <button
          type="button"
          onClick={() => zoomIn({ duration: 250 })}
          title="Zoom in"
          className="p-1.5 rounded hover:bg-surface-subtle dark:hover:bg-[#1E2721] text-text-muted hover:text-text-primary dark:hover:text-white transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => zoomOut({ duration: 250 })}
          title="Zoom out"
          className="p-1.5 rounded hover:bg-surface-subtle dark:hover:bg-[#1E2721] text-text-muted hover:text-text-primary dark:hover:text-white transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Visual Canvas Legend Overlay */}
      <div className="absolute top-3 left-3 hidden min-[480px]:flex items-center gap-3 px-2.5 py-1.5 bg-surface/85 dark:bg-[#151C17]/85 backdrop-blur-xs border border-border/80 dark:border-[#2C3930] rounded-lg text-[10px] text-text-muted z-10">
        <span className="flex items-center gap-1 font-medium">
          <span className="w-2 h-2 rounded-full bg-forest" /> Entry point
        </span>
        <span className="flex items-center gap-1 font-medium">
          <span className="w-2 h-2 rounded-full bg-border-strong dark:bg-[#4E6254]" /> Module / Area
        </span>
        <span className="flex items-center gap-1 font-medium">
          <span className="w-3 h-0.5 bg-forest" /> Imports (uses)
        </span>
        {modelResult.cyclesDetectedCount > 0 && (
          <span className="flex items-center gap-1 font-medium text-copper">
            <span className="w-2 h-2 rounded-full bg-copper" /> Circular
          </span>
        )}
      </div>
    </div>
  );
}

export function ArchitectureGraph({
  nodes = [],
  edges = [],
  dependencyEdges = [],
  cycles = [],
  fileTree = [],
  selectedNodeId,
  onSelectNode,
  onSelectFile,
  onExploreFolder,
  hasProject = false,
  isAnalyzing = false,
  onConnectRepo,
}: ArchitectureGraphProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    selectedNodeId || nodes[0]?.id || null
  );
  const [activeLevel, setActiveLevel] = useState<string>('root');
  const [direction, setDirection] = useState<'TB' | 'LR'>('TB');
  const [hideIsolated, setHideIsolated] = useState<boolean>(false);
  const [showLabels, setShowLabels] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [showMobileDetails, setShowMobileDetails] = useState<boolean>(false);

  // Synchronize internal selection with external prop
  useEffect(() => {
    if (selectedNodeId) {
      setInternalSelectedId(selectedNodeId);
    }
  }, [selectedNodeId]);

  // Reset drill-down if project switches
  useEffect(() => {
    setActiveLevel('root');
    setInternalSelectedId(nodes[0]?.id || null);
  }, [nodes]);

  // Build the normalized graph model from real analyzed evidence
  const modelResult = useMemo(() => {
    return buildArchitectureGraphModel({
      nodes,
      edges,
      dependencyEdges,
      cycles,
      fileTree,
      activeLevel,
      hideIsolated,
      searchFilter,
    });
  }, [nodes, edges, dependencyEdges, cycles, fileTree, activeLevel, hideIsolated, searchFilter]);

  // Active selected node
  const activeId = internalSelectedId || modelResult.nodes[0]?.id || null;
  const activeNode = modelResult.nodes.find((n) => n.id === activeId) || modelResult.nodes[0] || null;

  const handleSelectNode = useCallback(
    (id: string | null) => {
      setInternalSelectedId(id);
      if (id) {
        onSelectNode?.(id);
      }
    },
    [onSelectNode]
  );

  const handleDrillDown = useCallback((path: string) => {
    setActiveLevel(path);
    setInternalSelectedId(null);
    setSearchFilter('');
  }, []);

  const handleBackToProject = useCallback(() => {
    setActiveLevel('root');
    setInternalSelectedId(null);
    setSearchFilter('');
  }, []);

  if (isAnalyzing) {
    return (
      <Card className="h-full flex flex-col overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Project Structure</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex-1 flex flex-col items-center justify-center text-center space-y-3 min-h-[420px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094] animate-spin">
            <Network className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              Mapping project structure…
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Finding how the main parts and folders in your project connect to each other.
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
            <CardTitle>Project Structure</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex-1 flex flex-col items-center justify-center text-center space-y-3 min-h-[420px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
            <Network className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              {hasProject ? 'Project structure not mapped yet' : 'Project structure unavailable'}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              {hasProject
                ? 'Run analysis from Overview to see how the main parts of your project depend on each other.'
                : 'Connect and analyze a GitHub repository to see how the main folders and parts of your project connect.'}
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

  return (
    <div className="space-y-4 font-sans">
      {/* Top Header Card: Title, Breadcrumbs, Controls */}
      <Card className="overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D] p-3 sm:p-4 border-b border-border dark:border-border-dark">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full min-w-0">
            {/* Title & Drill-down Breadcrumbs */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <Network className="w-4 h-4 text-forest dark:text-[#9AC6A7] shrink-0" />
                <CardTitle className="text-base sm:text-lg">Project Structure</CardTitle>

                {modelResult.isDrillDown && (
                  <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
                    <span>/</span>
                    <button
                      type="button"
                      onClick={handleBackToProject}
                      className="text-forest dark:text-[#9AC6A7] hover:underline"
                    >
                      Project Architecture
                    </button>
                    <span>/</span>
                    <span className="text-text-primary dark:text-white font-mono">{activeLevel}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-text-muted mt-0.5">
                {modelResult.isDrillDown
                  ? `Showing internal subsystem wiring and file connections in /${activeLevel}`
                  : 'Based on analyzed project connections: see how the main areas of your software depend on each other'}
              </p>
            </div>

            {/* Toolbar Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {modelResult.isDrillDown && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBackToProject}
                  className="h-8 text-xs font-medium gap-1.5 px-3 border-forest/40 text-forest dark:text-[#9AC6A7]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to project</span>
                </Button>
              )}

              {/* Search Filter */}
              <div className="relative flex items-center min-w-[130px] sm:min-w-[170px]">
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter parts…"
                  className="w-full h-8 pl-8 pr-2.5 bg-surface border border-border rounded-lg text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#151C17] dark:border-[#2C3930] dark:text-[#F2F4F0]"
                />
                {searchFilter && (
                  <button
                    type="button"
                    onClick={() => setSearchFilter('')}
                    className="absolute right-2 text-text-muted hover:text-text-primary p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Hide Isolated Parts Toggle */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setHideIsolated(!hideIsolated)}
                title={hideIsolated ? 'Show all parts including standalone folders' : 'Hide unconnected standalone parts'}
                className="h-8 px-2.5 text-xs font-medium gap-1"
              >
                {hideIsolated ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{hideIsolated ? 'Show all' : 'Hide isolated'}</span>
              </Button>

              {/* Labels Toggle */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowLabels(!showLabels)}
                title="Toggle edge relationship labels"
                className={`h-8 px-2.5 text-xs font-medium gap-1 ${showLabels ? 'border-forest text-forest dark:text-[#9AC6A7]' : ''}`}
              >
                <span>Labels</span>
              </Button>

              {/* Layout Direction Toggle */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDirection(direction === 'TB' ? 'LR' : 'TB')}
                title={`Switch layout to ${direction === 'TB' ? 'Left-to-Right' : 'Top-to-Bottom'}`}
                className="h-8 px-2.5 text-xs font-mono font-medium"
              >
                <span>{direction === 'TB' ? '↓ TB' : '→ LR'}</span>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Grid: Interactive Canvas (8 cols) + Inspector Pane (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 font-sans items-start">
        {/* Graph Canvas Container */}
        <div className="lg:col-span-8 min-w-0">
          <Card className="flex flex-col overflow-hidden font-sans border-border dark:border-[#2C3930]">
            <CardContent className="p-0 relative h-[480px] sm:h-[580px] lg:h-[640px] bg-ivory/40 dark:bg-[#101512] overflow-hidden">
              <ReactFlowProvider>
                <ArchitectureFlowCanvas
                  key={`${activeLevel}-${direction}-${hideIsolated}-${searchFilter}`}
                  modelResult={modelResult}
                  activeId={activeId}
                  onSelectNode={handleSelectNode}
                  onDrillDown={handleDrillDown}
                  direction={direction}
                  showLabels={showLabels}
                />
              </ReactFlowProvider>
            </CardContent>
          </Card>

          {/* Mobile Inspector Drawer Button */}
          {activeNode && (
            <div className="mt-3 lg:hidden">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowMobileDetails(!showMobileDetails)}
                className="w-full text-xs font-medium h-10 gap-1.5 justify-between px-4 bg-surface dark:bg-[#151C17] border-border dark:border-[#2C3930]"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <Layers className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7]" />
                  <span>Part Details:</span>
                  <strong className="text-text-primary dark:text-white truncate">{activeNode.name}</strong>
                </span>
                <span className="text-[11px] text-text-muted shrink-0">
                  {showMobileDetails ? 'Hide details ▲' : 'View details ▼'}
                </span>
              </Button>
            </div>
          )}
        </div>

        {/* Part Details Inspector Panel */}
        <div
          className={`lg:col-span-4 min-w-0 ${
            showMobileDetails ? 'block' : 'hidden lg:block'
          }`}
        >
          {activeNode ? (
            <Card className="h-full flex flex-col font-sans border-border dark:border-[#2C3930] shadow-2xs">
              <CardHeader className="bg-surface-subtle dark:bg-[#1A221D] p-3.5 border-b border-border dark:border-border-dark">
                <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers className="w-4 h-4 text-forest dark:text-[#9AC6A7] shrink-0" />
                    <CardTitle className="text-sm font-semibold">Part Details</CardTitle>
                  </div>
                  <Badge
                    variant={activeNode.health === 'stable' ? 'success' : 'forest'}
                    size="xs"
                    className="font-sans font-medium uppercase"
                  >
                    {activeNode.type}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-3.5 sm:p-4 space-y-4 flex-1 overflow-y-auto max-h-[640px] font-sans min-w-0">
                {/* Name, Path & Exploration CTA */}
                <div className="min-w-0 space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-bold font-sans text-text-primary dark:text-white break-words">
                      {activeNode.name}
                    </h3>
                    <span className="text-xs text-text-muted font-mono shrink-0">
                      /{activeNode.path}
                    </span>
                  </div>

                  <p className="text-xs text-text-secondary leading-relaxed dark:text-[#C6CDC7] font-sans break-words">
                    {activeNode.description}
                  </p>

                  {/* Primary Actions: Explore area & View in Files */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {activeNode.hasDrillDown && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => handleDrillDown(activeNode.path)}
                        className="h-8 text-xs font-medium gap-1.5 px-3 bg-forest hover:bg-forest/90 text-white"
                      >
                        <FolderGit2 className="w-3.5 h-3.5" />
                        <span>Explore this area</span>
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onSelectFile?.(activeNode.path)}
                      className="h-8 text-xs font-medium gap-1.5 px-3"
                    >
                      <FileCode className="w-3.5 h-3.5 text-text-muted" />
                      <span>Show in Files</span>
                    </Button>
                  </div>
                </div>

                {/* Stats Grid: Real Metrics */}
                <div className="grid grid-cols-3 gap-2 p-2.5 bg-surface-subtle rounded-lg border border-border dark:bg-[#1A221D] dark:border-border-dark text-center font-sans">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-text-muted block font-medium">Files</span>
                    <span className="text-xs font-semibold text-text-primary dark:text-[#F2F4F0]">
                      {activeNode.filesCount}
                    </span>
                  </div>
                  <div className="min-w-0" title="Other parts that depend on this part">
                    <span className="text-[10px] uppercase tracking-wider text-text-muted block font-medium">Used by</span>
                    <span className="text-xs font-semibold text-copper dark:text-[#E69E7B]">
                      {activeNode.fanIn} {activeNode.fanIn === 1 ? 'part' : 'parts'}
                    </span>
                  </div>
                  <div className="min-w-0" title="Parts this area depends on">
                    <span className="text-[10px] uppercase tracking-wider text-text-muted block font-medium">Uses</span>
                    <span className="text-xs font-semibold text-forest dark:text-[#9AC6A7]">
                      {activeNode.fanOut} {activeNode.fanOut === 1 ? 'part' : 'parts'}
                    </span>
                  </div>
                </div>

                {/* Directional Relationships: Uses vs Used By */}
                <div className="space-y-3 pt-1 border-t border-border dark:border-border-dark text-xs font-sans">
                  {/* Directly Uses */}
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-text-muted block mb-1.5 flex items-center gap-1 font-medium">
                      <ArrowRight className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7] shrink-0" />
                      <span>Directly uses</span>
                    </span>
                    {activeNode.dependencies.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {activeNode.dependencies.map((depName) => (
                          <button
                            key={depName}
                            type="button"
                            onClick={() => {
                              const target = modelResult.nodes.find(
                                (n) =>
                                  n.name.toLowerCase() === depName.toLowerCase() ||
                                  n.path.toLowerCase() === depName.toLowerCase() ||
                                  n.id.includes(depName.toLowerCase())
                              );
                              if (target) handleSelectNode(target.id);
                            }}
                            className="px-2 py-1 rounded-md font-sans text-xs bg-surface border border-border hover:border-forest text-text-primary dark:bg-[#1C2620] dark:border-[#324237] dark:text-[#EEF2ED] dark:hover:bg-[#233028] font-medium break-words transition-colors"
                          >
                            → {depName}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-muted text-xs italic font-sans block">
                        None (this part does not depend on other analyzed areas)
                      </span>
                    )}
                  </div>

                  {/* Used By */}
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-text-muted block mb-1.5 flex items-center gap-1 font-medium">
                      <ArrowLeft className="w-3.5 h-3.5 text-copper dark:text-[#E69E7B] shrink-0" />
                      <span>Other parts that depend on this</span>
                    </span>
                    {activeNode.dependents.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {activeNode.dependents.map((depName) => (
                          <button
                            key={depName}
                            type="button"
                            onClick={() => {
                              const target = modelResult.nodes.find(
                                (n) =>
                                  n.name.toLowerCase() === depName.toLowerCase() ||
                                  n.path.toLowerCase() === depName.toLowerCase() ||
                                  n.id.includes(depName.toLowerCase())
                              );
                              if (target) handleSelectNode(target.id);
                            }}
                            className="px-2 py-1 rounded-md font-sans text-xs bg-surface border border-border hover:border-copper text-text-primary dark:bg-[#1C2620] dark:border-[#324237] dark:text-[#EEF2ED] dark:hover:bg-[#233028] font-medium break-words transition-colors"
                          >
                            ← {depName}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-muted text-xs italic font-sans block">
                        None (no other analyzed parts directly import this)
                      </span>
                    )}
                  </div>
                </div>

                {/* Related Real Files */}
                {activeNode.relatedFiles && activeNode.relatedFiles.length > 0 && (
                  <div className="pt-2 border-t border-border dark:border-border-dark font-sans">
                    <span className="text-[11px] uppercase tracking-wider text-text-muted block mb-2 flex items-center gap-1 font-medium">
                      <FileCode className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7]" />
                      <span>Related source files ({activeNode.relatedFiles.length})</span>
                    </span>
                    <div className="space-y-1.5">
                      {activeNode.relatedFiles.map((file) => (
                        <EvidenceBadge
                          key={file}
                          type="file"
                          label={file}
                          onClick={() => onSelectFile?.(file)}
                          className="w-full justify-between cursor-pointer"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Technical Details Accordion */}
                <details className="pt-2 border-t border-border dark:border-border-dark text-xs text-text-muted">
                  <summary className="cursor-pointer font-medium hover:text-text-primary dark:hover:text-white select-none text-[11px] flex items-center justify-between">
                    <span>Technical details</span>
                  </summary>
                  <div className="mt-2 p-2.5 rounded-lg bg-surface-subtle dark:bg-[#141A16] font-mono text-[10px] space-y-1 text-text-muted">
                    <div>Node ID: {activeNode.id}</div>
                    <div>Area Path: {activeNode.path}</div>
                    <div>Inbound Fan-In: {activeNode.fanIn}</div>
                    <div>Outbound Fan-Out: {activeNode.fanOut}</div>
                    <div>Estimated LOC: {activeNode.loc} lines</div>
                    {activeNode.isCycle && <div className="text-copper">Status: Involved in detected circular cycle</div>}
                    {activeNode.isIsolated && <div>Status: Isolated in analyzed code (0 connections)</div>}
                  </div>
                </details>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex flex-col items-center justify-center p-8 text-center text-text-muted text-xs font-sans">
              <Layers className="w-6 h-6 mb-2 opacity-40" />
              <span>Select any project part to view its dependencies, dependents, and files.</span>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
