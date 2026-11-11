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
            style={{ paddingLeft: `${Math.min(depth * 12 + 8, 60)}px` }}
            className="flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer hover:bg-surface-subtle dark:hover:bg-[#1A221D] text-text-primary dark:text-white transition-colors text-xs min-w-0"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7] shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7] shrink-0" />
            )}
            <span className="font-medium truncate min-w-0">{node.name}</span>
            {node.children && (
              <span className="text-[10px] text-text-muted ml-auto font-mono shrink-0">
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
        style={{ paddingLeft: `${Math.min(depth * 12 + 14, 68)}px` }}
        className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors text-xs font-mono select-none min-w-0 ${
          isSelected
            ? 'bg-forest/15 text-forest dark:text-[#9AC6A7] font-medium'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle dark:text-[#C6CDC7] dark:hover:bg-[#1A221D]'
        }`}
      >
        {getFileIcon(node.name, node.extension)}
        <span className="truncate min-w-0">{node.name}</span>
        {node.size && (
          <span className="text-[10px] text-text-muted ml-auto font-sans shrink-0">{node.size}</span>
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
              Project Files
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094] animate-spin">
            <FolderTree className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              Reading project files…
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Scanning folders, code files, and connections in your project. This view will update automatically.
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
              Project Files
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
            <FolderTree className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              {hasProject ? 'Ready to scan your files' : 'No project connected'}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              {hasProject
                ? 'Run analysis from Overview to browse files and see what each part does.'
                : 'Connect a GitHub repository to browse your project files and understand how they are organized.'}
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

  // State 3: Active File Tree Browser
  return (
    <Card className="overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D] p-3 sm:p-4 border-b border-border dark:border-border-dark">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 w-full">
          <div>
            <div className="flex items-center gap-2">
              <FolderTree className="w-4 h-4 text-forest dark:text-[#88B094]" />
              <span className="text-xs sm:text-sm font-semibold text-text-primary dark:text-white">
                Project Files
              </span>
              <Badge variant="neutral" size="xs" className="font-mono text-[10px]">
                {allFiles.length} files analyzed
              </Badge>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Browse the files and folders MarrowNode analyzed.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search files and folders…"
              className="w-full h-8 pl-8 pr-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#151C17] dark:border-border-dark dark:text-white"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-12 min-h-[380px] md:min-h-[460px]">
          {/* Left: Tree View */}
          <div className="md:col-span-5 lg:col-span-4 border-b md:border-b-0 md:border-r border-border dark:border-border-dark p-2 max-h-[260px] md:max-h-[560px] overflow-y-auto bg-surface-subtle/30 dark:bg-[#121814] min-w-0">
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
                    className={`flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-xs font-mono select-none min-w-0 ${
                      selectedNode?.path === f.path
                        ? 'bg-forest/15 text-forest dark:text-[#9AC6A7] font-medium'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle dark:text-[#C6CDC7] dark:hover:bg-[#1A221D]'
                    }`}
                  >
                    {getFileIcon(f.name, f.extension)}
                    <span className="truncate min-w-0">{f.path}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">{fileTree.map((node) => renderTreeNode(node, 0))}</div>
            )}
          </div>

          {/* Right: File Inspector Panel */}
          <div className="md:col-span-7 lg:col-span-8 p-3.5 sm:p-6 flex flex-col justify-between bg-surface dark:bg-[#151C17] min-w-0">
            {selectedNode ? (
              <div className="space-y-4 sm:space-y-5 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 border-b border-border dark:border-border-dark pb-4 min-w-0">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      {getFileIcon(selectedNode.name, selectedNode.extension)}
                      <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white font-mono break-all min-w-0">
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
                    className="text-xs font-sans gap-1 shrink-0 self-start"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-forest" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy path'}</span>
                  </Button>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 font-sans text-xs">
                  <div className="p-3 rounded bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-border-dark min-w-0">
                    <span className="text-[10px] uppercase font-semibold text-text-muted block mb-1">
                      File size
                    </span>
                    <span className="font-mono text-text-primary dark:text-white break-words block">
                      {selectedNode.size || 'Standard file'}
                    </span>
                  </div>

                  <div className="p-3 rounded bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-border-dark min-w-0">
                    <span className="text-[10px] uppercase font-semibold text-text-muted block mb-1">
                      Part of
                    </span>
                    <span className="font-mono text-text-primary dark:text-white break-all block">
                      {selectedNode.path.includes('/') ? selectedNode.path.split('/')[0] : 'Project root'}
                    </span>
                  </div>

                  <div className="p-3 rounded bg-surface-subtle dark:bg-[#1A221D] border border-border dark:border-border-dark min-w-0">
                    <span className="text-[10px] uppercase font-semibold text-text-muted block mb-1">
                      Analysis
                    </span>
                    <span className="text-forest dark:text-[#9AC6A7] font-medium flex items-center gap-1.5 break-words">
                      <span className="w-1.5 h-1.5 rounded-full bg-forest dark:bg-[#9AC6A7] shrink-0" />
                      <span>Code structure analyzed</span>
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded bg-surface-subtle/50 border border-border dark:bg-[#121814] dark:border-border-dark space-y-2 text-xs text-text-secondary dark:text-[#C6CDC7]">
                  <div className="font-medium text-text-primary dark:text-white flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-forest shrink-0" />
                    <span>Why this information is shown</span>
                  </div>
                  <p className="leading-relaxed">
                    This file is part of your project analysis. MarrowNode uses it to understand the project structure, file connections, and what could be affected by changes.
                  </p>
                  <details className="pt-1 border-t border-border/60 dark:border-border-dark">
                    <summary className="cursor-pointer font-medium hover:text-text-primary dark:hover:text-white select-none text-[11px] text-text-muted">
                      Technical details
                    </summary>
                    <div className="mt-1.5 font-mono text-[11px] space-y-0.5 text-text-muted break-all">
                      <div>Path: {selectedNode.path}</div>
                      <div>Module Scope: {selectedNode.path.split('/')[0] || 'root'}</div>
                      <div>Indexed State: AST Parsed (Static Analysis)</div>
                    </div>
                  </details>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center space-y-2 h-full text-text-muted py-12">
                <FileCode className="w-8 h-8 opacity-40" />
                <span className="text-xs">Select any file on the left to see its details.</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
