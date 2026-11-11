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
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <div className="flex items-center gap-2 min-w-0">
            <Terminal className="w-4 h-4 text-forest dark:text-[#9AC6A7] shrink-0" />
            <CardTitle>Ask MarrowNode</CardTitle>
          </div>
          <span className="text-xs text-text-muted flex items-center gap-1.5 font-sans">
            <ShieldCheck className="w-3.5 h-3.5 text-forest shrink-0" />
            <span>Answer based on analyzed project data</span>
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-3.5 sm:p-5 space-y-4">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col min-[380px]:flex-row gap-2">
            <div className="relative flex-1 min-w-0 flex items-center">
              <Search className="w-4 h-4 text-text-muted absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={loading}
                aria-label="Ask anything about this project"
                placeholder="Ask about your project… (e.g. How does login work?)"
                className="w-full h-10 sm:h-9 pl-9 pr-3 bg-surface border border-border rounded text-sm sm:text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-forest focus:border-forest transition-colors dark:bg-[#1A221D] dark:border-[#324237] dark:text-[#F2F4F0] dark:placeholder:text-[#98A49A]"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!query.trim() || loading}
              className="h-10 sm:h-9 w-full min-[380px]:w-auto text-xs font-sans font-medium px-4 gap-1.5 shrink-0"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span>Ask</span>}
            </Button>
          </div>
        </form>

        {result && (
          <div className="p-3.5 sm:p-4 rounded-lg bg-surface-subtle dark:bg-[#131915] border border-border dark:border-[#2C3930] space-y-3 text-xs leading-relaxed font-sans animate-in fade-in-50 min-w-0 break-words">
            {result.fact && (
              <div className="p-2.5 rounded bg-forest/10 border border-forest/20 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-forest dark:text-[#9AC6A7] block">
                  CONFIRMED FROM YOUR PROJECT
                </span>
                <span className="text-text-primary dark:text-[#F2F4F0] whitespace-pre-line break-words block">{result.fact}</span>
              </div>
            )}

            {result.inference && (
              <div className="p-2.5 rounded bg-copper/10 border border-copper/20 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-copper dark:text-[#E69E7B] block">
                  BASED ON PROJECT STRUCTURE
                </span>
                <span className="text-text-primary dark:text-[#F2F4F0] break-words block">{result.inference}</span>
              </div>
            )}

            {result.unknown && (
              <div className="p-2.5 rounded bg-surface border border-border dark:bg-[#1A221D] dark:border-[#2E3C33] text-text-secondary dark:text-[#C6CDC7] space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                  NOT FOUND IN THE PROJECT
                </span>
                <span className="break-words block">{result.unknown}</span>
              </div>
            )}

            {result.citations && result.citations.length > 0 && (
              <div className="pt-2 border-t border-border dark:border-[#2C3930] flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase font-semibold text-text-muted">Found in:</span>
                {result.citations.map((c: any, i: number) => (
                  <span
                    key={i}
                    onClick={() => onSelectEvidence && onSelectEvidence(c.path)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-surface border border-border dark:bg-[#1E2721] dark:border-[#324237] text-forest dark:text-[#9AC6A7] cursor-pointer hover:underline max-w-full break-all"
                  >
                    <FileCode className="w-3 h-3 shrink-0" />
                    <span className="truncate">{c.label}</span>
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
