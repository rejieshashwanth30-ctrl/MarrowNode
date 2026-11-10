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

const CATEGORIES: (EvidenceCategory | 'All')[] = [
  'All',
  'Files',
  'Commits',
  'Pull Requests',
  'Documentation',
  'Dependencies',
  'Architecture relationships',
];

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
            <CardTitle>Evidence & Repository Provenance</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094] animate-spin">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              Collecting Project Evidence…
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Extracting cryptographic proof, AST symbols, dependencies, and commit evidence from the repository.
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
            <CardTitle>Evidence & Repository Provenance</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
              {hasProject ? 'Evidence Collection Pending' : 'No evidence available'}
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              {hasProject
                ? 'Run repository analysis to generate verifiable evidence records for files, architecture, and commits.'
                : 'Evidence will appear after project analysis.'}
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

  const filteredItems = items.filter((item) => {
    const matchesCategory = activeCategory === 'All' || item.type === activeCategory;
    const matchesSearch =
      search.trim() === '' ||
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
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Evidence & Repository Provenance</CardTitle>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search evidence items..."
              className="w-full h-8 pl-8 pr-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#151C17] dark:border-border-dark dark:text-white"
            />
          </div>
        </div>
      </CardHeader>

      <div className="px-4 py-2 border-b border-border bg-surface-subtle/50 flex items-center gap-1.5 overflow-x-auto text-xs font-sans dark:bg-[#151C17] dark:border-border-dark">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2.5 py-1 rounded whitespace-nowrap transition-colors font-medium ${
              activeCategory === cat
                ? 'bg-charcoal text-white dark:bg-forest'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted dark:text-[#A7AFA9] dark:hover:bg-[#1F2822]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <CardContent className="p-0 font-sans">
        <div className="divide-y divide-border dark:divide-border-dark">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-xs font-sans text-text-muted">
              No evidence matching &quot;{search}&quot; found in category &quot;{activeCategory}&quot;.
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectEvidence?.(item)}
                className="p-4 hover:bg-surface-subtle/60 transition-colors cursor-pointer space-y-2 dark:hover:bg-[#1A221D]/70 font-sans"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(item.type)}
                    <span className="text-xs font-bold text-text-primary dark:text-white font-sans">
                      {item.name}
                    </span>
                    <Badge variant="neutral" size="xs" className="font-sans font-medium">
                      {item.type}
                    </Badge>
                  </div>

                  <span className="text-xs font-mono text-text-muted truncate">
                    {item.pathOrIdentifier}
                  </span>
                </div>

                <p className="text-xs text-text-secondary leading-relaxed font-sans dark:text-[#A7AFA9]">
                  {item.snippetOrContext}
                </p>

                <div className="flex items-center justify-between pt-1 text-xs text-text-muted font-sans">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] uppercase tracking-wider font-medium">Linked Modules:</span>
                    {item.relatedModules.map((m) => (
                      <span
                        key={m}
                        className="px-1.5 py-0.5 rounded bg-surface border border-border text-[11px] font-mono dark:bg-[#151C17] dark:border-border-dark"
                      >
                        {m}
                      </span>
                    ))}
                  </div>

                  <span className="text-forest font-semibold dark:text-[#88B094]">
                    Confidence {item.relevanceScore}%
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
