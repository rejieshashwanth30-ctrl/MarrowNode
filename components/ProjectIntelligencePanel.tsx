'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Search, Terminal, ShieldCheck, FileCode, Loader2 } from 'lucide-react';

interface ProjectIntelligencePanelProps {
  projectId?: string;
  hasAnalyzedProject?: boolean;
  onSelectEvidence?: (evidenceLabel: string) => void;
  onConnectRepo?: () => void;
}

export function ProjectIntelligencePanel({
  projectId,
  hasAnalyzedProject = false,
  onSelectEvidence,
  onConnectRepo,
}: ProjectIntelligencePanelProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !projectId || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult(data.result);
      } else {
        setResult({
          fact: null,
          inference: null,
          unknown: data.error || 'Failed to query codebase context.',
          citations: [],
        });
      }
    } catch (_) {
      setResult({
        fact: null,
        inference: null,
        unknown: 'Unable to reach MarrowNode right now. Please try again.',
        citations: [],
      });
    } finally {
      setLoading(false);
    }
  };

  if (!hasAnalyzedProject) {
    return (
      <Card className="overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-forest dark:text-[#88B094]" />
              <CardTitle>Ask MarrowNode</CardTitle>
            </div>
            <span className="text-xs text-text-muted flex items-center gap-1.5 font-sans">
              <ShieldCheck className="w-3.5 h-3.5 text-forest" />
              Based on your project
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-8 text-center space-y-3 font-sans">
          <div className="w-10 h-10 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest mx-auto dark:text-[#88B094]">
            <Terminal className="w-5 h-5" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-sm font-semibold text-text-primary dark:text-white">
              Connect a repository to ask questions about your project
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Ask questions about your project using the files, packages, structure, and development history MarrowNode analyzed.
            </p>
          </div>
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onConnectRepo}
              className="text-xs font-sans font-medium"
            >
              Choose repository
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Ask MarrowNode</CardTitle>
          </div>
          <span className="text-xs text-text-muted flex items-center gap-1.5 font-sans">
            <ShieldCheck className="w-3.5 h-3.5 text-forest" />
            Answer based on analyzed project data
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-text-muted absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
              placeholder="Ask anything about your project… (e.g. How does login work?)"
              className="w-full h-10 pl-10 pr-24 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest focus:border-forest transition-colors dark:bg-[#151C17] dark:border-border-dark dark:text-white"
            />
            <div className="absolute right-1.5 flex items-center">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!query.trim() || loading}
                className="h-7 text-xs font-sans font-medium px-3 gap-1"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>Ask</span>}
              </Button>
            </div>
          </div>
        </form>

        {result && (
          <div className="p-4 rounded-lg bg-surface-subtle dark:bg-[#121814] border border-border dark:border-border-dark space-y-3 text-xs leading-relaxed font-sans animate-in fade-in-50">
            {result.fact && (
              <div className="p-2.5 rounded bg-forest/10 border border-forest/20 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-forest dark:text-[#88B094] block">
                  CONFIRMED FROM YOUR PROJECT
                </span>
                <span className="text-text-primary dark:text-white whitespace-pre-line">{result.fact}</span>
              </div>
            )}

            {result.inference && (
              <div className="p-2.5 rounded bg-copper/10 border border-copper/20 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-copper dark:text-[#E08F6B] block">
                  BASED ON PROJECT STRUCTURE
                </span>
                <span className="text-text-primary dark:text-white">{result.inference}</span>
              </div>
            )}

            {result.unknown && (
              <div className="p-2.5 rounded bg-surface border border-border dark:bg-[#1A221D] dark:border-border-dark text-text-muted space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider block">
                  NOT FOUND IN THE PROJECT
                </span>
                <span>{result.unknown}</span>
              </div>
            )}

            {result.citations && result.citations.length > 0 && (
              <div className="pt-2 border-t border-border dark:border-border-dark flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase font-semibold text-text-muted">Found in:</span>
                {result.citations.map((c: any, i: number) => (
                  <span
                    key={i}
                    onClick={() => onSelectEvidence && onSelectEvidence(c.path)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface border border-border dark:bg-[#1A221D] dark:border-border-dark text-forest dark:text-[#88B094] cursor-pointer hover:underline"
                  >
                    <FileCode className="w-3 h-3" />
                    <span>{c.label}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
