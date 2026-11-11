'use client';

import React from 'react';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';
import { MarrowNodeLogo } from '@/components/MarrowNodeLogo';
import {
  Search,
  Sun,
  Moon,
  Menu,
  X,
  Github,
  ChevronDown,
} from 'lucide-react';

interface TopbarProps {
  onOpenSearch: () => void;
  onToggleMobileNav?: () => void;
  mobileNavOpen?: boolean;
  project?: {
    id?: string;
    name: string;
    githubOwner?: string | null;
  } | null;
  projects?: Array<{ id: string; name: string; githubOwner?: string | null }>;
  onSelectProject?: (projectId: string) => void;
}

export function Topbar({
  onOpenSearch,
  onToggleMobileNav,
  mobileNavOpen = false,
  project,
  projects = [],
  onSelectProject,
}: TopbarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const owner = project?.githubOwner || 'MarrowNode';
  const projectName = project?.name || 'No project connected';

  return (
    <header className="h-14 bg-surface border-b border-border px-3 sm:px-5 flex items-center justify-between shrink-0 select-none font-sans dark:bg-[#131915] dark:border-border-dark">
      {/* Left: Mobile hamburger & repo breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileNav}
          className="lg:hidden p-1.5 text-text-secondary hover:text-text-primary rounded hover:bg-surface-muted dark:text-[#A7AFA9] dark:hover:text-white"
          aria-label="Toggle navigation"
        >
          {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Mobile brand (hidden on desktop where sidebar is visible) */}
        <div className="lg:hidden flex items-center">
          <Link href="/dashboard">
            <MarrowNodeLogo variant="mark" size="sm" />
          </Link>
        </div>

        {/* Workspace & Repository Breadcrumb */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-sans text-text-secondary dark:text-[#A7AFA9] relative">
          <span className="text-text-muted hover:text-text-primary transition-colors cursor-pointer">
            {owner}
          </span>
          <span className="text-border-strong">/</span>
          {projects.length > 1 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1 font-semibold text-text-primary dark:text-white hover:text-forest dark:hover:text-[#88B094] transition-colors py-1 px-1.5 rounded hover:bg-surface-muted dark:hover:bg-[#1A221D]"
              >
                <span>{projectName}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>

              {dropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-60 bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark rounded-md shadow-xl py-1 z-50">
                  <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-text-muted border-b border-border dark:border-border-dark">
                    Switch Active Project
                  </div>
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        if (onSelectProject) onSelectProject(p.id);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-surface-subtle dark:hover:bg-[#1A221D] transition-colors ${
                        p.name === projectName
                          ? 'font-bold text-forest dark:text-[#88B094]'
                          : 'text-text-primary dark:text-white'
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      {p.name === projectName && (
                        <span className="text-[10px] text-forest dark:text-[#88B094]">Active</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 font-semibold text-text-primary dark:text-white">
              <span>{projectName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Center / Right: Command palette trigger & action buttons */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Search trigger */}
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2 h-8 px-2.5 sm:px-3 bg-surface-subtle border border-border rounded text-xs font-sans text-text-muted hover:border-border-strong hover:text-text-primary transition-all dark:bg-[#18201B] dark:border-border-dark dark:hover:text-white"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Search files, code, commits…</span>
          <span className="sm:hidden">Search…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 bg-surface border border-border rounded text-text-muted font-mono dark:bg-[#131915] dark:border-border-dark">
            ⌘K
          </kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          className="p-2 text-text-muted hover:text-text-primary rounded hover:bg-surface-muted transition-colors dark:hover:text-white"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4 text-[#E4E6E1]" />
          ) : (
            <Moon className="w-4 h-4 text-text-secondary" />
          )}
        </button>

        {/* GitHub link button */}
        <Link
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex items-center gap-1.5 h-8 px-2.5 text-xs font-sans text-text-secondary hover:text-text-primary rounded hover:bg-surface-muted transition-colors dark:text-[#A7AFA9] dark:hover:text-white"
        >
          <Github className="w-3.5 h-3.5" />
          <span>GitHub</span>
        </Link>
      </div>
    </header>
  );
}
