'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Search, Terminal, ShieldCheck, FileCode, Loader2, AlertCircle, RotateCcw } from 'lucide-react';

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

  React.useEffect(() => {
    setQuery('');
    setResult(null);
    setLoading(false);
  }, [projectId]);

  const handleSubmit = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    const q = (customQuery || query).trim();
    if (!q || !projectId || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // Non-JSON response
      }

      if (res.ok && data?.result) {
        setResult(data.result);
      } else {
        let errorMsg = data?.error;
        if (!errorMsg) {
          if (res.status === 401) {
            errorMsg = 'GitHub or MarrowNode authentication expired. Please sign in or reconnect.';
          } else if (res.status === 404) {
            errorMsg = 'Project snapshot not found. Please select or analyze a repository first.';
          } else if (res.status === 504 || res.status === 408) {
            errorMsg = 'Request timed out while analyzing repository evidence. Please try again.';
          } else {
            errorMsg = `Server error (${res.status}). Please try again.`;
          }
        }
        setResult({
          fact: null,
          inference: null,
          unknown: errorMsg,
          citations: [],
          isError: true,
          failedQuery: q,
        });
      }
    } catch (_) {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      const errorMsg = isOffline
        ? 'No internet connection detected. Please check your network and try again.'
        : 'Unable to reach MarrowNode right now. Please check your connection and try again.';

      setResult({
        fact: null,
        inference: null,
        unknown: errorMsg,
        citations: [],
        isError: true,
        failedQuery: q,
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

      <CardContent className="p-3 sm:p-5 space-y-3 sm:space-y-4">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-row items-center gap-2 sm:gap-2.5">
            <div className="relative flex-1 min-w-0 flex items-center">
              <Search className="w-4 h-4 text-text-muted absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={loading}
                aria-label="Ask anything about this project"
                placeholder="Ask about your project… (e.g. How does login work?)"
                className="w-full h-12 pl-10 pr-4 bg-surface border border-border rounded-xl text-base sm:text-sm font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-forest focus:border-forest transition-all dark:bg-[#1A221D] dark:border-[#324237] dark:text-[#F2F4F0] dark:placeholder:text-[#98A49A] shadow-2xs"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={!query.trim() || loading}
              className="h-12 px-4 sm:px-6 rounded-xl text-sm font-sans font-medium shrink-0 bg-forest hover:bg-forest/90 text-white dark:bg-forest dark:hover:bg-forest/90 border border-forest/20 shadow-sm min-w-[72px] sm:min-w-[88px] flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Ask</span>}
            </Button>
          </div>
        </form>

        {result && (
          <div className={`p-3.5 sm:p-4 rounded-xl border space-y-3 text-xs sm:text-[13px] leading-relaxed font-sans animate-in fade-in-50 min-w-0 break-words shadow-2xs ${
            result.isError 
              ? 'bg-copper/5 border-copper/30 dark:bg-[#231815] dark:border-copper/40' 
              : 'bg-surface-subtle dark:bg-[#131915] border-border dark:border-[#2C3930]'
          }`}>
            {result.isError && (
              <div className="flex items-center gap-2 text-copper dark:text-[#E69E7B] font-semibold text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="uppercase tracking-wider text-[10px]">Unable to reach MarrowNode</span>
              </div>
            )}

            {result.fact && (
              <div className="p-2.5 rounded-lg bg-forest/10 border border-forest/20 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-forest dark:text-[#9AC6A7] block">
                  CONFIRMED FROM YOUR PROJECT
                </span>
                <span className="text-text-primary dark:text-[#F2F4F0] whitespace-pre-line break-words block">{result.fact}</span>
              </div>
            )}

            {result.inference && (
              <div className="p-2.5 rounded-lg bg-copper/10 border border-copper/20 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-copper dark:text-[#E69E7B] block">
                  BASED ON PROJECT STRUCTURE
                </span>
                <span className="text-text-primary dark:text-[#F2F4F0] break-words block">{result.inference}</span>
              </div>
            )}

            {result.unknown && (
              <div className={`p-2.5 rounded-lg border space-y-1 ${
                result.isError 
                  ? 'bg-transparent border-transparent text-text-primary dark:text-[#F2F4F0] p-0' 
                  : 'bg-surface border-border dark:bg-[#1A221D] dark:border-[#2E3C33] text-text-secondary dark:text-[#C6CDC7]'
              }`}>
                {!result.isError && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                    NOT FOUND IN THE PROJECT
                  </span>
                )}
                <span className="break-words block">{result.unknown}</span>
              </div>
            )}

            {result.isError && result.failedQuery && (
              <div className="pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSubmit(undefined, result.failedQuery)}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface hover:bg-surface-subtle border border-border dark:bg-[#1E2721] dark:border-[#324237] text-text-primary dark:text-[#EEF2ED] transition-colors cursor-pointer active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-forest dark:text-[#9AC6A7]" />
                  <span>Retry</span>
                </button>
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
