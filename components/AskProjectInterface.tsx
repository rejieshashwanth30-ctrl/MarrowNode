'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Terminal, ShieldCheck, HelpCircle } from 'lucide-react';

interface AskProjectInterfaceProps {
  hasAnalyzedProject?: boolean;
  onInspectFile?: (filePath: string) => void;
}

export function AskProjectInterface({
  hasAnalyzedProject = false,
  onInspectFile,
}: AskProjectInterfaceProps) {
  const [query, setQuery] = useState('');

  if (!hasAnalyzedProject) {
    return (
      <Card className="h-full flex flex-col overflow-hidden font-sans">
        <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-forest dark:text-[#88B094]" />
              <CardTitle>Ask Your Project</CardTitle>
            </div>
            <Badge variant="neutral" size="xs" className="font-sans font-medium">
              EVIDENCE-ORIENTED
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-8 sm:p-12 flex-1 flex flex-col items-center justify-center text-center space-y-4 min-h-[460px] bg-ivory/40 dark:bg-[#101512]">
          <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-base sm:text-lg font-bold text-text-primary dark:text-white">
              Connect a repository to ask questions about your project.
            </h3>
            <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
              MarrowNode answers technical architectural questions, dependency bounds, and codebase intent using verified AST parsing and Git history once your repository is indexed.
            </p>
          </div>

          <div className="w-full max-w-sm pt-2">
            <Link href="/onboarding" className="inline-block w-full">
              <Button variant="primary" size="md" className="w-full text-xs font-sans font-medium">
                Connect GitHub Repository
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-forest dark:text-[#88B094]" />
            <CardTitle>Ask Your Project</CardTitle>
          </div>
          <Badge variant="success" size="xs" className="font-sans font-medium">
            ACTIVE PROJECT
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-6 flex-1 flex flex-col justify-between">
        <div className="text-center py-12 space-y-2">
          <ShieldCheck className="w-8 h-8 text-forest mx-auto" />
          <h4 className="text-sm font-semibold text-text-primary dark:text-white">
            Repository Query Engine Ready
          </h4>
          <p className="text-xs text-text-muted max-w-sm mx-auto">
            Ask any question regarding modules, services, schema definitions, or commit history.
          </p>
        </div>

        <div className="border-t border-border pt-4 dark:border-border-dark">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery('');
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about architectural patterns, historical decisions, or dependencies…"
              className="flex-1 h-9 px-3 bg-surface border border-border rounded text-xs font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#151C17] dark:border-border-dark dark:text-white"
            />
            <Button type="submit" variant="primary" size="sm" className="text-xs font-sans font-medium">
              Send
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
