'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FileTreeNode, FileDetail } from '@/types';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FolderTree } from 'lucide-react';

interface RepositoryExplorerProps {
  initialFile?: string;
  fileTree?: FileTreeNode[];
  onSelectFile?: (path: string) => void;
}

export function RepositoryExplorer({
  initialFile,
  fileTree = [],
  onSelectFile,
}: RepositoryExplorerProps) {
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
              No files indexed yet
            </h3>
            <p className="text-xs text-text-muted leading-relaxed">
              Connect a GitHub repository to explore directory structure, symbol tables, and code modules.
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
      <CardContent className="p-4">
        {/* Render file tree when files are indexed */}
        <div className="text-xs font-mono text-text-muted">
          {fileTree.length} files available.
        </div>
      </CardContent>
    </Card>
  );
}
