'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { FileTreeNode } from '@/types';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  FolderTree,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Search,
  ChevronRight,
  ChevronDown,
  File,
  Code2,
  HardDrive,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';

interface RepositoryExplorerProps {
  initialFile?: string;
  fileTree?: FileTreeNode[];
  onSelectFile?: (path: string) => void;
  hasProject?: boolean;
  isAnalyzing?: boolean;
  onConnectRepo?: () => void;
}

export function RepositoryExplorer({
  initialFile,
  fileTree = [],
  onSelectFile,
  hasProject = false,
  isAnalyzing = false,
  onConnectRepo,
}: RepositoryExplorerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(initialFile || null);
  const [copied, setCopied] = useState(false);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const getFileIcon = (fileName: string, ext?: string) => {
    const extension = ext || (fileName.includes('.') ? `.${fileName.split('.').pop()}` : '');
    switch (extension.toLowerCase()) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
        return <Code2 className="w-3.5 h-3.5 text-forest dark:text-[#88B094] shrink-0" />;
      case '.json':
        return <FileCode className="w-3.5 h-3.5 text-copper dark:text-[#E08F6B] shrink-0" />;
      case '.md':
      case '.txt':
        return <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" />;
      default:
        return <File className="w-3.5 h-3.5 text-text-muted shrink-0" />;
    }
  };

  // Flatten nodes for search
  const allFiles = useMemo(() => {
    const list: FileTreeNode[] = [];
    const traverse = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'file') {
          list.push(node);
        }
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      }
    };
    traverse(fileTree);
    return list;
  }, [fileTree]);

  // Selected file details
  const selectedNode = useMemo(() => {
    if (!selectedFilePath) return allFiles[0] || null;
    return allFiles.find((f) => f.path === selectedFilePath) || allFiles[0] || null;
  }, [selectedFilePath, allFiles]);

  const handleCopyPath = () => {
    if (selectedNode) {
      navigator.clipboard.writeText(selectedNode.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Filtered files when searching
  const filteredSearchFiles = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const term = searchTerm.toLowerCase();
    return allFiles.filter(
      (f) => f.name.toLowerCase().includes(term) || f.path.toLowerCase().includes(term)
    );
  }, [allFiles, searchTerm]);

  // Recursive tree node renderer
  const renderTreeNode = (node: FileTreeNode, depth = 0) => {
    const isFolder = node.type === 'folder';
    const isExpanded = expandedFolders[node.path] ?? depth < 1; // Auto-expand root folders
    const isSelected = selectedNode?.path === node.path;

    if (isFolder) {
      return (
        <div key={node.path} className="select-none font-sans">
          <div
            onClick={() => toggleFolder(node.path)}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            className="flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer hover:bg-surface-subtle dark:hover:bg-[#1A221D] text-text-primary dark:text-white transition-colors text-xs"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-forest dark:text-[#88B094] shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-forest dark:text-[#88B094] shrink-0" />
            )}
            <span className="font-medium truncate">{node.name}</span>
            {node.children && (
              <span className="text-[10px] text-text-muted ml-auto font-mono">
                {node.children.length}
              </span>
            )}
          </div>
          {isExpanded && node.children && (
            <div>{node.children.map((child) => renderTreeNode(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.path}
        onClick={() => {
          setSelectedFilePath(node.path);
          if (onSelectFile) onSelectFile(node.path);
        }}
        style={{ paddingLeft: `${depth * 14 + 16}px` }}
        className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer transition-colors text-xs font-mono select-none ${
          isSelected
            ? 'bg-forest/15 text-forest dark:text-[#88B094] font-medium'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle dark:text-[#A7AFA9] dark:hover:bg-[#1A221D]'
        }`}
      >
        {getFileIcon(node.name, node.extension)}
        <span className="truncate">{node.name}</span>
        {node.size && (
          <span className="text-[10px] text-text-muted ml-auto font-sans">{node.size}</span>
        )}
      </div>
    );
  };

  // State 1: Analyzing in progress
  if (isAnalyzing) {
    return (
      <Card className="overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <span className="text-xs sm:text-sm font-semibold text-text-primary dark:text-white font-sans">
              Repository Module Explorer
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094] animate-spin">
            <FolderTree className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              Indexing Repository Tree…
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Analyzing repository filesystem tree, module boundaries, and AST symbols. This view will update automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // State 2: No project or empty tree
  if (!fileTree || fileTree.length === 0) {
    return (
      <Card className="overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <span className="text-xs sm:text-sm font-semibold text-text-primary dark:text-white font-sans">
              Repository Module Explorer
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
            <FolderTree className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              {hasProject ? 'Repository Analysis Needed' : 'No repository connected'}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              {hasProject
                ? 'Your repository is connected. Run analysis from the Overview tab to index directory structure and symbols.'
                : 'Connect a GitHub repository to explore directory structure, symbol tables, and code modules.'}
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

  // State 3: Active File Tree Browser
  return (
    <Card className="overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D] p-3 sm:p-4 border-b border-border dark:border-border-dark">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full">
          <div className="flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <span className="text-xs sm:text-sm font-semibold text-text-primary dark:text-white">
              Repository Module Explorer
            </span>
            <Badge variant="neutral" size="xs" className="font-mono text-[10px]">
              {allFiles.length} files
            </Badge>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search files or paths…"
              className="w-full h-8 pl-8 pr-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#151C17] dark:border-border-dark dark:text-white"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-12 min-h-[460px]">
          {/* Left: Tree View */}
          <div className="md:col-span-5 lg:col-span-4 border-r border-border dark:border-border-dark p-2 max-h-[560px] overflow-y-auto bg-surface-subtle/30 dark:bg-[#121814]">
            {filteredSearchFiles ? (
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase font-semibold text-text-muted px-2 py-1">
                  Matching Files ({filteredSearchFiles.length})
                </div>
                {filteredSearchFiles.map((f) => (
                  <div
                    key={f.path}
                    onClick={() => {
                      setSelectedFilePath(f.path);
                      if (onSelectFile) onSelectFile(f.path);
                    }}
                    className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer text-xs font-mono select-none ${
                      selectedNode?.path === f.path
                        ? 'bg-forest/15 text-forest dark:text-[#88B094] font-medium'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle dark:text-[#A7AFA9] dark:hover:bg-[#1A221D]'
                    }`}
                  >
                    {getFileIcon(f.name, f.extension)}
                    <span className="truncate">{f.path}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">{fileTree.map((node) => renderTreeNode(node, 0))}</div>
            )}
          </div>

          {/* Right: File Inspector Panel */}
          <div className="md:col-span-7 lg:col-span-8 p-4 sm:p-6 flex flex-col justify-between bg-surface dark:bg-[#151C17]">
            {selectedNode ? (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3 border-b border-border dark:border-border-dark pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getFileIcon(selectedNode.name, selectedNode.extension)}
                      <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white font-mono break-all">
                        {selectedNode.name}
                      </h3>
                      {selectedNode.extension && (
                        <Badge variant="neutral" size="xs" className="uppercase font-mono text-[10px]">
                          {selectedNode.extension.replace('.', '')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs font-mono text-text-muted break-all">
                      {selectedNode.path}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyPath}
                    className="text-xs font-sans gap-1 shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-forest" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy Path'}</span>
                  </Button>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-sans text-xs">
                  <div className="p-3 rounded bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-border-dark">
                    <span className="text-[10px] uppercase font-semibold text-text-muted block mb-1">
                      File Size
                    </span>
                    <span className="font-mono text-text-primary dark:text-white">
                      {selectedNode.size || 'Standard blob'}
                    </span>
                  </div>

                  <div className="p-3 rounded bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-border-dark">
                    <span className="text-[10px] uppercase font-semibold text-text-muted block mb-1">
                      Module Scope
                    </span>
                    <span className="font-mono text-text-primary dark:text-white truncate block">
                      {selectedNode.path.split('/')[0] || 'root'}
                    </span>
                  </div>

                  <div className="p-3 rounded bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-border-dark col-span-2 sm:col-span-1">
                    <span className="text-[10px] uppercase font-semibold text-text-muted block mb-1">
                      Indexed State
                    </span>
                    <span className="text-forest dark:text-[#88B094] font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-forest dark:bg-[#88B094]" />
                      AST Parsed
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded bg-surface-subtle/50 border border-border dark:bg-[#121814] dark:border-border-dark space-y-1.5 text-xs text-text-muted">
                  <div className="font-medium text-text-primary dark:text-white flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-forest" />
                    <span>Workstation Provenance</span>
                  </div>
                  <p className="leading-relaxed">
                    This file is tracked as part of your active repository analysis. Downstream impact, symbol references, and architecture topology are indexed against this path.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center space-y-2 h-full text-text-muted py-12">
                <FileCode className="w-8 h-8 opacity-40" />
                <span className="text-xs">Select a file from the explorer to view module details.</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
