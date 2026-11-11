'use client';

import React, { useState, useEffect } from 'react';
import { Search, FileCode, Network, GitCommit, HelpCircle, CornerDownLeft, X, Compass, GitPullRequest } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (type: 'view' | 'file' | 'query' | 'node', target: string) => void;
}

export function CommandPalette({ isOpen, onClose, onSelectAction }: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(); // parent handles toggling
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const quickActions = [
    { type: 'view' as const, label: 'Overview', target: 'overview', category: 'Navigation', icon: <Network className="w-3.5 h-3.5 text-forest" /> },
    { type: 'view' as const, label: 'Developer Onboarding', target: 'onboarding', category: 'Navigation', icon: <Compass className="w-3.5 h-3.5 text-forest" /> },
    { type: 'view' as const, label: 'GitHub PR Check', target: 'pull-requests', category: 'Navigation', icon: <GitPullRequest className="w-3.5 h-3.5 text-forest" /> },
    { type: 'view' as const, label: 'Project Structure', target: 'architecture', category: 'Navigation', icon: <Network className="w-3.5 h-3.5 text-forest" /> },
    { type: 'view' as const, label: 'Project Files', target: 'explorer', category: 'Navigation', icon: <FileCode className="w-3.5 h-3.5 text-text-muted" /> },
    { type: 'view' as const, label: 'Project History', target: 'timeline', category: 'Navigation', icon: <GitCommit className="w-3.5 h-3.5 text-copper" /> },
    { type: 'view' as const, label: 'Ask MarrowNode', target: 'ask', category: 'Navigation', icon: <HelpCircle className="w-3.5 h-3.5 text-forest" /> },
    { type: 'file' as const, label: 'src/middleware.ts', target: 'src/middleware.ts', category: 'File', icon: <FileCode className="w-3.5 h-3.5 text-forest" />, isCode: true },
    { type: 'file' as const, label: 'prisma/schema.prisma', target: 'prisma/schema.prisma', category: 'File', icon: <FileCode className="w-3.5 h-3.5 text-copper" />, isCode: true },
    { type: 'query' as const, label: 'How does authentication work?', target: 'How does authentication work?', category: 'Question', icon: <HelpCircle className="w-3.5 h-3.5 text-forest" /> },
    { type: 'query' as const, label: 'What database does this project use?', target: 'What database does this project use?', category: 'Question', icon: <HelpCircle className="w-3.5 h-3.5 text-forest" /> },
  ];

  const filtered = quickActions.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase()) ||
    a.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-charcoal/50 backdrop-blur-xs flex items-start justify-center pt-16 sm:pt-24 px-4 select-none font-sans">
      <div className="w-full max-w-xl bg-surface border border-border rounded shadow-dropdown overflow-hidden flex flex-col dark:bg-[#151C17] dark:border-border-dark animate-in fade-in-0 zoom-in-95 duration-100">
        {/* Search Input Bar */}
        <div className="p-3 border-b border-border flex items-center gap-2.5 dark:border-border-dark font-sans">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search files, commands, or questions"
            placeholder="Type a file path, query, or command..."
            className="flex-1 min-w-0 bg-transparent text-sm sm:text-xs font-sans text-text-primary placeholder:text-text-muted dark:placeholder:text-[#98A49A] focus:outline-none dark:text-[#F2F4F0]"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="p-1 text-text-muted hover:text-text-primary rounded dark:text-[#C6CDC7] dark:hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Results List */}
        <div className="p-2 max-h-72 overflow-y-auto space-y-1 font-sans">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-text-muted font-sans">
              No results found for “{query}”.
            </div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  onSelectAction(item.type, item.target);
                  onClose();
                }}
                className="px-3 py-2 rounded text-xs flex items-center justify-between cursor-pointer hover:bg-surface-muted transition-colors text-text-secondary hover:text-text-primary dark:hover:bg-[#1F2822] dark:text-[#A7AFA9] dark:hover:text-white"
              >
                <div className="flex items-center gap-2.5">
                  {item.icon}
                  <span className={`font-medium ${item.isCode ? 'font-mono' : 'font-sans'}`}>
                    {item.label}
                  </span>
                </div>
                <Badge variant="neutral" size="xs" className="font-sans font-medium">
                  {item.category}
                </Badge>
              </div>
            ))
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="p-2 bg-surface-subtle border-t border-border flex items-center justify-between text-xs text-text-muted dark:bg-[#1A221D] dark:border-border-dark font-sans">
          <div className="flex items-center gap-2">
            <span>Use ↑↓ to navigate</span>
            <span>·</span>
            <span>ESC to dismiss</span>
          </div>
          <span className="flex items-center gap-1">
            <span>Select</span>
            <CornerDownLeft className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
