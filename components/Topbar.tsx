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
  gitHubTokenExpired?: boolean;
}

export function Topbar({
  onOpenSearch,
  onToggleMobileNav,
  mobileNavOpen = false,
  project,
  projects = [],
  onSelectProject,
  gitHubTokenExpired = false,
}: TopbarProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const owner = project?.githubOwner || 'MarrowNode';
  const projectName = project?.name || 'No project connected';

  return (
    <header className="h-14 bg-surface border-b border-border px-3 sm:px-5 flex items-center justify-between gap-2 shrink-0 select-none font-sans dark:bg-[#131915] dark:border-border-dark">
      {/* Left: Mobile hamburger & repo breadcrumbs */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleMobileNav}
          className="lg:hidden p-1.5 text-text-secondary hover:text-text-primary rounded hover:bg-surface-muted dark:text-[#C6CDC7] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest shrink-0"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileNavOpen}
        >
          {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Mobile brand (hidden on desktop where sidebar is visible) */}
        <div className="lg:hidden flex items-center shrink-0">
          <Link href="/dashboard" aria-label="MarrowNode dashboard">
            <MarrowNodeLogo variant="mark" size="sm" />
          </Link>
        </div>

        {/* Workspace & Repository Breadcrumb */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-sans text-text-secondary dark:text-[#C6CDC7] relative min-w-0">
          <span className="text-text-muted hover:text-text-primary transition-colors cursor-pointer truncate max-w-[140px]">
            {owner}
          </span>
          <span className="text-border-strong shrink-0">/</span>
          {projects.length > 1 ? (
            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-expanded={dropdownOpen}
                className="flex items-center gap-1 font-semibold text-text-primary dark:text-white hover:text-forest dark:hover:text-[#9AC6A7] transition-colors py-1 px-1.5 rounded hover:bg-surface-muted dark:hover:bg-[#1A221D] max-w-[200px]"
              >
                <span className="truncate">{projectName}</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70 shrink-0" />
              </button>

              {dropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-60 max-w-[calc(100vw-2rem)] bg-surface border border-border dark:bg-[#151C17] dark:border-border-dark rounded-md shadow-xl py-1 z-50">
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
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-surface-subtle dark:hover:bg-[#1A221D] transition-colors ${
                        p.name === projectName
                          ? 'font-bold text-forest dark:text-[#9AC6A7]'
                          : 'text-text-primary dark:text-white'
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      {p.name === projectName && (
                        <span className="text-[10px] text-forest dark:text-[#9AC6A7] shrink-0">Active</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 font-semibold text-text-primary dark:text-white min-w-0">
              <span className="truncate max-w-[200px]">{projectName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Center / Right: Command palette trigger & action buttons */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Search trigger */}
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search files, code, and commits"
          className="flex items-center gap-2 h-8 px-2.5 sm:px-3 bg-surface-subtle border border-border rounded text-xs font-sans text-text-secondary hover:border-border-strong hover:text-text-primary transition-all dark:bg-[#18201B] dark:border-border-dark dark:text-[#C6CDC7] dark:hover:text-white whitespace-nowrap"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Search files, code, commits…</span>
          <span className="sm:hidden">Search…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 bg-surface border border-border rounded text-text-muted font-mono dark:bg-[#131915] dark:border-border-dark">
            ⌘K
          </kbd>
        </button>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          className="p-2 text-text-secondary hover:text-text-primary rounded hover:bg-surface-muted transition-colors dark:text-[#C6CDC7] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4 text-[#F2F4F0]" />
          ) : (
            <Moon className="w-4 h-4 text-text-secondary" />
          )}
        </button>

        {/* GitHub link / reconnect button */}
        {gitHubTokenExpired ? (
          <Link
            href="/auth"
            aria-label="Reconnect GitHub"
            className="flex items-center gap-1.5 h-8 px-2.5 text-xs font-sans text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-colors dark:text-amber-300 dark:border-amber-500/40 whitespace-nowrap"
          >
            <Github className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Reconnect GitHub</span>
            <span className="sm:hidden">Reconnect</span>
          </Link>
        ) : (
          <Link
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open GitHub"
            className="hidden md:flex items-center gap-1.5 h-8 px-2.5 text-xs font-sans text-text-secondary hover:text-text-primary rounded hover:bg-surface-muted transition-colors dark:text-[#C6CDC7] dark:hover:text-white whitespace-nowrap"
          >
            <Github className="w-3.5 h-3.5 shrink-0" />
            <span>GitHub</span>
          </Link>
        )}
      </div>
    </header>
  );
}
