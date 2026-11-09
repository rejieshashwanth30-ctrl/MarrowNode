'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Cpu } from 'lucide-react';

interface ChangeImpactAnalysisProps {
  initialFile?: string;
  onSelectFile?: (filePath: string) => void;
}

export function ChangeImpactAnalysis({
  initialFile,
  onSelectFile,
}: ChangeImpactAnalysisProps) {
  return (
    <Card className="overflow-hidden font-sans">
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D]">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-forest dark:text-[#88B094]" />
          <CardTitle>Change Impact Analysis</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-3 min-h-[380px] bg-ivory/40 dark:bg-[#101512]">
        <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
          <Cpu className="w-6 h-6" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h3 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">
            Change impact analysis unavailable
          </h3>
          <p className="text-xs text-text-muted leading-relaxed">
            Connect and analyze a repository to evaluate blast radius, affected downstream consumers, and direct/transitive dependency changes.
          </p>
        </div>
        <div className="pt-2">
          <Link href="/onboarding">
            <Button variant="primary" size="sm" className="text-xs font-sans font-medium">
              Connect GitHub Repository
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
