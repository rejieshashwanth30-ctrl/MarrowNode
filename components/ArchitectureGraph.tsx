'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import '@xyflow/react/dist/style.css';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
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
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Search,
  FolderGit2,
  AlertTriangle,
  X,
  ExternalLink,
  Eye,
  EyeOff,
  GitCommit,
  GitPullRequest,
  Zap,
  Box,
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

export interface ArchitectureGraphProps {
  nodes?: ArchitectureNode[];
  edges?: ArchitectureEdge[];
  dependencyEdges?: any[];
  cycles?: string[][];
  fileTree?: FileTreeNode[];
  selectedNodeId?: string;
  projectName?: string;
  framework?: string;
  externalDependencies?: string[];
  onSelectNode?: (nodeId: string) => void;
  onSelectFile?: (filePath: string) => void;
  onExploreFolder?: (folderPath: string) => void;
  onNavigateToImpact?: (targetPath: string) => void;
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
 * Inner Flow Canvas with interactive React Flow state, MiniMap & controls
 */
function ArchitectureFlowCanvas({
  modelResult,
  activeId,
  searchFilter,
  onSelectNode,
  onDrillDown,
  direction,
  showLabels,
}: {
  modelResult: ReturnType<typeof buildArchitectureGraphModel>;
  activeId: string | null;
  searchFilter: string;
  onSelectNode: (id: string | null) => void;
  onDrillDown: (path: string) => void;
  direction: 'TB' | 'LR';
  showLabels: boolean;
}) {
  const { fitView, zoomIn, zoomOut, setCenter } = useReactFlow();

  // Compute Dagre hierarchical layout
  const { layoutNodes, layoutEdges } = useMemo(() => {
    return computeDagreLayout(modelResult.nodes, modelResult.edges, {
      direction,
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

  // Search match ids
  const searchMatchIds = useMemo(() => {
    if (!searchFilter.trim()) return new Set<string>();
    const q = searchFilter.trim().toLowerCase();
    const matches = new Set<string>();
    for (const n of modelResult.nodes) {
      if (
        n.name.toLowerCase().includes(q) ||
        n.path.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q)
      ) {
        matches.add(n.id);
      }
    }
    return matches;
  }, [searchFilter, modelResult.nodes]);

  // Map into React Flow Node objects with interactive states
  const flowNodes: Node[] = useMemo(() => {
    return layoutNodes.map((ln) => {
      const isSelected = ln.id === activeId;
      const isDirectTarget = outboundTargetIds.has(ln.id);
      const isDirectSource = inboundSourceIds.has(ln.id);
      const isConnected = isSelected || isDirectTarget || isDirectSource;

      // Handle dimming during selection or search
      let isDimmed = false;
      if (activeId && !isConnected) {
        isDimmed = true;
      } else if (searchMatchIds.size > 0 && !searchMatchIds.has(ln.id) && !isConnected) {
        isDimmed = true;
      }

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
  }, [layoutNodes, activeId, outboundTargetIds, inboundSourceIds, searchMatchIds, onDrillDown]);

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
          width: 15,
          height: 15,
          color: isOutbound ? '#34D399' : isInbound ? '#FB923C' : '#6B7E72',
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

  // Auto-fit on layout or level changes with a comfortable, readable zoom scale
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({
        padding: 0.18,
        maxZoom: 1.15,
        minZoom: 0.55,
        duration: 350,
      });
    }, 60);
    return () => clearTimeout(timer);
  }, [fitView, modelResult.levelTitle, direction, modelResult.depthMode]);

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
        maxZoom={2.2}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1.15, minZoom: 0.55 }}
        proOptions={{ hideAttribution: true }}
        className="touch-none"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-50 dark:opacity-25" />

        {/* Compact Dark-theme MiniMap */}
        <MiniMap
          nodeStrokeColor="#34D399"
          nodeColor="#1A261E"
          maskColor="rgba(10, 16, 13, 0.75)"
          className="!bg-[#0D1410] !border !border-[#2C3930] !rounded-lg !shadow-md hidden md:block !bottom-3 !right-3"
          style={{ width: 140, height: 95 }}
        />
      </ReactFlow>

      {/* Embedded Quick Canvas Controls */}
      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 p-1 bg-surface/90 dark:bg-[#151C17]/90 backdrop-blur-xs border border-border dark:border-[#2C3930] rounded-lg shadow-sm z-10">
        <button
          type="button"
          onClick={() => fitView({ padding: 0.18, maxZoom: 1.15, minZoom: 0.55, duration: 400 })}
          title="Fit entire architecture graph in view"
          className="p-1.5 rounded hover:bg-surface-subtle dark:hover:bg-[#1E2721] text-text-muted hover:text-text-primary dark:hover:text-white transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            onSelectNode(null);
            fitView({ padding: 0.18, maxZoom: 1.15, minZoom: 0.55, duration: 400 });
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
      <div className="absolute top-3 left-3 hidden min-[540px]:flex items-center gap-3 px-3 py-1.5 bg-surface/90 dark:bg-[#151C17]/90 backdrop-blur-xs border border-border/80 dark:border-[#2C3930] rounded-xl text-[10px] text-text-muted z-10 shadow-sm">
        <span className="flex items-center gap-1 font-medium text-forest dark:text-[#9AC6A7]">
          <span className="w-2 h-2 rounded-full bg-forest dark:bg-[#9AC6A7]" /> Entry point
        </span>
        <span className="flex items-center gap-1 font-medium">
          <span className="w-2 h-2 rounded-full bg-border-strong dark:bg-[#4E6254]" /> Module / Area
        </span>
        <span className="flex items-center gap-1 font-medium">
          <span className="w-3 h-0.5 bg-forest dark:bg-[#9AC6A7]" /> Imports
        </span>
        <span className="flex items-center gap-1 font-medium text-text-muted">
          <span className="w-2.5 h-1 border border-dashed border-text-muted" /> External
        </span>
        {modelResult.cyclesDetectedCount > 0 && (
          <span className="flex items-center gap-1 font-medium text-copper dark:text-[#E69E7B]">
            <span className="w-2 h-2 rounded-full bg-copper dark:bg-[#E69E7B]" /> Circular
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
  projectName = 'Project Root',
  framework,
  externalDependencies = [],
  onSelectNode,
  onSelectFile,
  onExploreFolder,
  onNavigateToImpact,
  hasProject = false,
  isAnalyzing = false,
  onConnectRepo,
}: ArchitectureGraphProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    selectedNodeId || nodes[0]?.id || null
  );
  const [activeLevel, setActiveLevel] = useState<string>('root');
  const [depthMode, setDepthMode] = useState<'architecture' | 'modules' | 'files'>('architecture');
  const [direction, setDirection] = useState<'TB' | 'LR'>('TB');
  const [hideIsolated, setHideIsolated] = useState<boolean>(false);
  const [showLabels, setShowLabels] = useState<boolean>(false);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [showMobileDetails, setShowMobileDetails] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Build the normalized graph model
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
      depthMode,
      projectName,
      framework,
      externalDependencies,
    });
  }, [
    nodes,
    edges,
    dependencyEdges,
    cycles,
    fileTree,
    activeLevel,
    hideIsolated,
    searchFilter,
    depthMode,
    projectName,
    framework,
    externalDependencies,
  ]);

  // Selected node metadata
  const activeId = internalSelectedId || modelResult.nodes[0]?.id || null;
  const activeNode = useMemo(() => {
    return modelResult.nodes.find((n) => n.id === activeId) || modelResult.nodes[0] || null;
  }, [modelResult.nodes, activeId]);

  const handleSelectNode = useCallback(
    (id: string | null) => {
      setInternalSelectedId(id);
      if (id && onSelectNode) {
        onSelectNode(id);
      }
    },
    [onSelectNode]
  );

  const handleDrillDown = useCallback((path: string) => {
    setActiveLevel(path);
    setDepthMode('modules');
    setInternalSelectedId(null);
    setSearchFilter('');
  }, []);

  const handleBackToProject = useCallback(() => {
    setActiveLevel('root');
    setDepthMode('architecture');
    setInternalSelectedId(null);
    setSearchFilter('');
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  if (isAnalyzing) {
    return (
      <Card className="h-full flex flex-col overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Project Architecture</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex-1 flex flex-col items-center justify-center text-center space-y-3 min-h-[440px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094] animate-spin">
            <Network className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              Mapping project architecture…
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Extracting AST relationships, entrypoints, and cross-module wiring from your code.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!nodes || (nodes.length === 0 && dependencyEdges.length === 0)) {
    return (
      <Card className="h-full flex flex-col overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Project Architecture</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex-1 flex flex-col items-center justify-center text-center space-y-3 min-h-[440px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
            <Network className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              {hasProject ? 'Architecture graph is not available yet' : 'Project structure unavailable'}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              {hasProject
                ? 'Run project analysis from Overview to map how your software modules, entrypoints, and files connect.'
                : 'Connect and analyze a GitHub repository to visualize your project architecture.'}
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
    <div ref={containerRef} className="space-y-4 font-sans">
      {/* Top Header Card: Title, Breadcrumbs, Segmented Depth Switcher & Toolbar */}
      <Card className="overflow-hidden font-sans border-border dark:border-[#2C3930]">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D] p-3 sm:p-4 border-b border-border dark:border-border-dark">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 w-full min-w-0">
            {/* Title & Drill-down Breadcrumbs */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <Network className="w-4 h-4 text-forest dark:text-[#9AC6A7] shrink-0" />
                <CardTitle className="text-base sm:text-lg">Project Architecture</CardTitle>

                {modelResult.isDrillDown && (
                  <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
                    <span>/</span>
                    <button
                      type="button"
                      onClick={handleBackToProject}
                      className="text-forest dark:text-[#9AC6A7] hover:underline"
                    >
                      Architecture
                    </button>
                    <span>/</span>
                    <span className="text-text-primary dark:text-white font-mono">{activeLevel}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-text-muted mt-0.5">
                {modelResult.isDrillDown
                  ? `Showing internal wiring and files in /${activeLevel}`
                  : depthMode === 'files'
                  ? 'File-level AST import relationships across the codebase'
                  : 'Layered software architecture: entrypoints, modules, core services, database, and dependencies'}
              </p>
            </div>

            {/* Depth View Controls + Toolbar Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Depth Mode Segmented Control */}
              <div className="flex items-center p-0.5 rounded-lg bg-surface border border-border dark:bg-[#121A15] dark:border-[#2C3930] text-xs font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setDepthMode('architecture');
                    setActiveLevel('root');
                  }}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    depthMode === 'architecture' && !modelResult.isDrillDown
                      ? 'bg-forest text-white shadow-2xs dark:bg-forest'
                      : 'text-text-muted hover:text-text-primary dark:hover:text-white'
                  }`}
                >
                  Architecture
                </button>
                <button
                  type="button"
                  onClick={() => setDepthMode('modules')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    depthMode === 'modules' || modelResult.isDrillDown
                      ? 'bg-forest text-white shadow-2xs dark:bg-forest'
                      : 'text-text-muted hover:text-text-primary dark:hover:text-white'
                  }`}
                >
                  Modules
                </button>
                <button
                  type="button"
                  onClick={() => setDepthMode('files')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    depthMode === 'files'
                      ? 'bg-forest text-white shadow-2xs dark:bg-forest'
                      : 'text-text-muted hover:text-text-primary dark:hover:text-white'
                  }`}
                >
                  Files
                </button>
              </div>

              {modelResult.isDrillDown && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBackToProject}
                  className="h-8 text-xs font-medium gap-1.5 px-3 border-forest/40 text-forest dark:text-[#9AC6A7]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </Button>
              )}

              {/* Search Filter */}
              <div className="relative flex items-center min-w-[130px] sm:min-w-[160px]">
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search parts…"
                  aria-label="Search architecture parts"
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
                className={`h-8 px-2.5 text-xs font-medium gap-1 ${
                  showLabels ? 'border-forest text-forest dark:text-[#9AC6A7]' : ''
                }`}
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

              {/* Fullscreen Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit fullscreen' : 'View graph fullscreen'}
                className="h-8 px-2.5 text-xs font-medium hidden sm:flex items-center"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
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
            <CardContent className="p-0 relative h-[520px] sm:h-[620px] lg:h-[700px] bg-ivory/40 dark:bg-[#101512] overflow-hidden">
              <ReactFlowProvider>
                <ArchitectureFlowCanvas
                  key={`${activeLevel}-${direction}-${hideIsolated}-${searchFilter}-${depthMode}`}
                  modelResult={modelResult}
                  activeId={activeId}
                  searchFilter={searchFilter}
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

              <CardContent className="p-3.5 sm:p-4 space-y-4 flex-1 overflow-y-auto max-h-[700px] font-sans min-w-0">
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

                  {/* Primary Actions: Explore area & View in Files & Show Change Impact */}
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
                        <span>Explore area</span>
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

                    {/* Change Impact Integration */}
                    {onNavigateToImpact && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onNavigateToImpact(activeNode.path)}
                        className="h-8 text-xs font-medium gap-1.5 px-3 text-copper dark:text-[#E69E7B] border-copper/40 hover:bg-copper/10"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Show Impact</span>
                      </Button>
                    )}
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
                      <span>Directly uses ({activeNode.dependencies.length})</span>
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
                      <span>Other parts that depend on this ({activeNode.dependents.length})</span>
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
