'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { EvidenceItem, EvidenceCategory } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Search, ShieldCheck, Database, FileCode, GitCommit, GitPullRequest, BookOpen, Network } from 'lucide-react';

interface EvidenceExplorerProps {
  items?: EvidenceItem[];
  onSelectEvidence?: (item: EvidenceItem) => void;
  hasProject?: boolean;
  isAnalyzing?: boolean;
  onConnectRepo?: () => void;
}

const CATEGORIES: Array<{ id: EvidenceCategory | 'All'; label: string }> = [
  { id: 'All', label: 'All' },
  { id: 'Files', label: 'Files' },
  { id: 'Commits', label: 'Commits' },
  { id: 'Pull Requests', label: 'Pull Requests' },
  { id: 'Documentation', label: 'Documentation' },
  { id: 'Dependencies', label: 'Packages' },
  { id: 'Architecture relationships', label: 'Project connections' },
];

function getFriendlyEvidenceTitle(rawName: string): string {
  const map: Record<string, string> = {
    'Architectural Framework & Dependency Topology': 'Project Technology & Structure',
    'Architectural Topology': 'Project Technology & Structure',
    'Repository Structure & Codebase Volume': 'Project Size & Structure',
    'Repository Structure': 'Project Size & Structure',
    'Recent Development Commits': 'Recent Development History',
    'Recent Commit Memory': 'Recent Development History',
    'Detected Dependencies': 'External Packages',
    'Repository Documentation': 'Project Documentation',
  };
  return map[rawName] || rawName;
}

function getFriendlyCategoryLabel(cat: EvidenceCategory): string {
  if (cat === 'Architecture relationships') return 'Project connections';
  if (cat === 'Dependencies') return 'Packages';
  return cat;
}

export function EvidenceExplorer({
  items = [],
  onSelectEvidence,
  hasProject = false,
  isAnalyzing = false,
  onConnectRepo,
}: EvidenceExplorerProps) {
  const [activeCategory, setActiveCategory] = useState<EvidenceCategory | 'All'>('All');
  const [search, setSearch] = useState('');

  if (isAnalyzing) {
    return (
      <Card className="overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Project Evidence</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094] animate-spin">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              Gathering project evidence…
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Collecting files, packages, commits, and structure details from your project.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Card className="overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Project Evidence</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              {hasProject ? 'Project evidence not collected yet' : 'No project evidence yet'}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              {hasProject
                ? 'Analyze your project from Overview to see the real files, commits, and packages behind MarrowNode’s answers.'
                : 'Evidence will appear after you connect and analyze a project.'}
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

  const filteredItems = items.filter((item) => {
    const matchesCategory = activeCategory === 'All' || item.type === activeCategory;
    const displayName = getFriendlyEvidenceTitle(item.name);
    const matchesSearch =
      search.trim() === '' ||
      displayName.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.pathOrIdentifier.toLowerCase().includes(search.toLowerCase()) ||
      item.snippetOrContext.toLowerCase().includes(search.toLowerCase()) ||
      item.relatedModules.some((m) => m.toLowerCase().includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const getCategoryIcon = (type: EvidenceCategory) => {
    switch (type) {
      case 'Files':
        return <FileCode className="w-3.5 h-3.5 text-forest" />;
      case 'Commits':
        return <GitCommit className="w-3.5 h-3.5 text-copper" />;
      case 'Pull Requests':
        return <GitPullRequest className="w-3.5 h-3.5 text-text-secondary" />;
      case 'Documentation':
        return <BookOpen className="w-3.5 h-3.5 text-text-muted" />;
      case 'Dependencies':
        return <Database className="w-3.5 h-3.5 text-copper" />;
      case 'Architecture relationships':
        return <Network className="w-3.5 h-3.5 text-forest" />;
      default:
        return <ShieldCheck className="w-3.5 h-3.5 text-forest" />;
    }
  };

  return (
    <Card className="overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-forest dark:text-[#88B094]" />
              <CardTitle>Project Evidence</CardTitle>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              See the files, commits, packages, and project relationships behind MarrowNode&apos;s answers.
            </p>
          </div>

          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search project evidence"
              placeholder="Search project evidence..."
              className="w-full h-9 sm:h-8 pl-8 pr-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#1A221D] dark:border-[#324237] dark:text-[#F2F4F0] dark:placeholder:text-[#98A49A]"
            />
          </div>
        </div>
      </CardHeader>

      <div className="px-3 sm:px-4 py-2 border-b border-border bg-surface-subtle/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs font-sans dark:bg-[#151C17] dark:border-border-dark">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`px-2.5 py-1 rounded whitespace-nowrap shrink-0 transition-colors font-medium ${
              activeCategory === cat.id
                ? 'bg-charcoal text-white dark:bg-forest'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted dark:text-[#C6CDC7] dark:hover:bg-[#1F2822] dark:hover:text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <CardContent className="p-0 font-sans">
        <div className="divide-y divide-border dark:divide-border-dark">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs font-sans text-text-muted">
              No evidence matching &quot;{search}&quot; found in this category.
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectEvidence?.(item)}
                className="p-3.5 sm:p-4 hover:bg-surface-subtle/60 transition-colors cursor-pointer space-y-2.5 dark:hover:bg-[#1A221D]/70 font-sans min-w-0"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="shrink-0">{getCategoryIcon(item.type)}</span>
                    <span className="text-xs font-bold text-text-primary dark:text-white font-sans break-words">
                      {getFriendlyEvidenceTitle(item.name)}
                    </span>
                    <Badge variant="neutral" size="xs" className="font-sans font-medium">
                      {getFriendlyCategoryLabel(item.type)}
                    </Badge>
                  </div>

                  <span className="text-xs font-mono text-text-muted break-all min-w-0" title="Where we found this">
                    Where: {item.pathOrIdentifier}
                  </span>
                </div>

                <div className="text-xs text-text-secondary leading-relaxed font-sans dark:text-[#C6CDC7] break-words">
                  <span className="font-medium text-text-primary dark:text-[#F2F4F0]">What we found: </span>
                  {item.snippetOrContext}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-text-muted font-sans">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {item.relatedModules.length > 0 && (
                      <>
                        <span className="text-[11px] uppercase tracking-wider font-medium">Project areas:</span>
                        {item.relatedModules.map((m) => (
                          <span
                            key={m}
                            className="px-1.5 py-0.5 rounded bg-surface border border-border text-[11px] font-mono text-text-primary dark:bg-[#1C2620] dark:border-[#324237] dark:text-[#E4E8E3]"
                          >
                            {m}
                          </span>
                        ))}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-forest dark:text-[#9AC6A7] uppercase tracking-wider bg-forest/10 px-2 py-0.5 rounded border border-forest/20">
                      <ShieldCheck className="w-3 h-3 shrink-0" />
                      Found in project
                    </span>
                    <span className="text-[11px] text-text-muted font-medium">
                      {item.relevanceLevel === 'Primary'
                        ? 'Main source'
                        : item.relevanceLevel === 'High'
                        ? 'Direct match'
                        : 'Supporting'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
