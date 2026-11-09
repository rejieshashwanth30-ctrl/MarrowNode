'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Search, Terminal, ShieldCheck } from 'lucide-react';

interface ProjectIntelligencePanelProps {
  hasAnalyzedProject?: boolean;
  onSelectEvidence?: (evidenceLabel: string) => void;
}

export function ProjectIntelligencePanel({
  hasAnalyzedProject = false,
  onSelectEvidence,
}: ProjectIntelligencePanelProps) {
  const [query, setQuery] = useState('');

  if (!hasAnalyzedProject) {
    return (
      <Card className="overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-forest dark:text-[#88B094]" />
              <CardTitle>Project Intelligence</CardTitle>
            </div>
            <span className="text-xs text-text-muted flex items-center gap-1.5 font-sans">
              <ShieldCheck className="w-3.5 h-3.5 text-forest" />
              Evidence-backed query engine
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
              MarrowNode will provide evidence-backed technical answers once your codebase is indexed and analyzed.
            </p>
          </div>
          <div className="pt-2">
            <Link href="/onboarding">
              <Button variant="outline" size="sm" className="text-xs font-sans font-medium">
                Connect GitHub Repository
              </Button>
            </Link>
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
            <CardTitle>Project Intelligence</CardTitle>
          </div>
          <span className="text-xs text-text-muted flex items-center gap-1.5 font-sans">
            <ShieldCheck className="w-3.5 h-3.5 text-forest" />
            Active Project Query Engine
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery('');
          }}
          className="relative"
        >
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-text-muted absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything about this project… (e.g. How does authentication work?)"
              className="w-full h-10 pl-10 pr-24 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest focus:border-forest transition-colors dark:bg-[#151C17] dark:border-border-dark dark:text-white"
            />
            <div className="absolute right-1.5 flex items-center">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!query.trim()}
                className="h-7 text-xs font-sans font-medium px-3"
              >
                <span>Ask</span>
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
