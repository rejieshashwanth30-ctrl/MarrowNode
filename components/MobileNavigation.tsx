'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardView } from '@/components/Sidebar';
import { MarrowNodeLogo } from '@/components/MarrowNodeLogo';
import { createClient } from '@/utils/supabase/client';
import {
  LayoutDashboard,
  FolderTree,
  Network,
  GitCommit,
  HelpCircle,
  Cpu,
  ShieldCheck,
  Settings,
  Github,
  X,
  LogOut,
  User as UserIcon,
} from 'lucide-react';

interface MobileNavigationProps {
  activeView: DashboardView;
  onSelectView: (view: DashboardView) => void;
  isOpen: boolean;
  onClose: () => void;
  user: {
    displayName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    githubConnection?: {
      githubUsername?: string | null;
      connectionStatus?: string | null;
    } | null;
  } | null;
}

export function MobileNavigation({
  activeView,
  onSelectView,
  isOpen,
  onClose,
  user,
}: MobileNavigationProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      await fetch('/api/auth/signout', { method: 'POST' });
    } catch (_) {}
    router.push('/');
    router.refresh();
  };

  const primaryNavItems: { id: DashboardView; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5" /> },
    { id: 'explorer', label: 'Files', icon: <FolderTree className="w-4 h-4 sm:w-5 sm:h-5" /> },
    { id: 'architecture', label: 'Structure', icon: <Network className="w-4 h-4 sm:w-5 sm:h-5" /> },
    { id: 'timeline', label: 'History', icon: <GitCommit className="w-4 h-4 sm:w-5 sm:h-5" /> },
    { id: 'ask', label: 'Ask', icon: <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" /> },
  ];

  const allNavItems: { id: DashboardView; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'explorer', label: 'Files', icon: <FolderTree className="w-5 h-5" /> },
    { id: 'architecture', label: 'Project Structure', icon: <Network className="w-5 h-5" /> },
    { id: 'timeline', label: 'History', icon: <GitCommit className="w-5 h-5" /> },
    { id: 'ask', label: 'Ask MarrowNode', icon: <HelpCircle className="w-5 h-5" /> },
    { id: 'impact', label: 'Change Impact', icon: <Cpu className="w-5 h-5" /> },
    { id: 'evidence', label: 'Evidence', icon: <ShieldCheck className="w-5 h-5" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  ];

  const githubName = user?.githubConnection?.githubUsername;

  return (
    <>
      {/* 1. Bottom Nav Bar (Mobile only, persistent above safe-area) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur-sm border-t border-border dark:bg-[#131915]/95 dark:border-[#2C3930] pb-[env(safe-area-inset-bottom)] font-sans shadow-[0_-2px_10px_rgba(0,0,0,0.05)] dark:shadow-[0_-2px_12px_rgba(0,0,0,0.35)]"
      >
        <div className="h-[var(--mobile-nav-height)] flex items-stretch justify-around px-1">
          {primaryNavItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectView(item.id)}
                className={`relative min-w-0 flex-1 flex flex-col items-center justify-center py-1.5 px-0.5 text-[10px] sm:text-[11px] font-sans transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest ${
                  isActive
                    ? 'text-forest font-semibold dark:text-[#98C8A5]'
                    : 'text-text-secondary font-medium hover:text-text-primary dark:text-[#BAC4BC] dark:hover:text-white'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 left-3 right-3 h-[2px] rounded-full bg-forest dark:bg-[#98C8A5]" />
                )}
                <span className="shrink-0">{item.icon}</span>
                <span className="mt-1 truncate max-w-full leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* 2. Slide-over Mobile Drawer for Full Navigation */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex font-sans">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-charcoal/50 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />

          {/* Drawer Pane */}
          <div className="relative w-4/5 max-w-xs bg-surface border-r border-border h-full flex flex-col justify-between p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] overflow-y-auto z-10 dark:bg-[#131915] dark:border-[#2C3930] animate-in slide-in-from-left duration-200">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-border dark:border-[#2C3930]">
                <MarrowNodeLogo variant="full" size="sm" />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close navigation menu"
                  className="p-1.5 text-text-muted hover:text-text-primary dark:text-[#C6CDC7] dark:hover:text-white rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Navigation Items */}
              <div className="py-3 space-y-1">
                {allNavItems.map((item) => {
                  const isActive = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectView(item.id);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-xs font-sans transition-colors text-left ${
                        isActive
                          ? 'bg-charcoal text-white font-medium dark:bg-forest'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted dark:text-[#C6CDC7] dark:hover:bg-[#1F2822] dark:hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-forest dark:bg-white" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* User Profile & GitHub */}
            <div className="border-t border-border pt-3 space-y-2 dark:border-[#2C3930] text-xs font-sans">
              <div className="px-2.5 py-1.5 rounded bg-surface-subtle border border-border flex items-center justify-between dark:bg-[#1A221D] dark:border-[#2C3930]">
                <div className="flex items-center gap-1.5 truncate text-text-muted">
                  <Github className="w-3.5 h-3.5 text-text-primary dark:text-white shrink-0" />
                  <span className="truncate">
                    {githubName ? `@${githubName}` : 'GitHub: Not connected'}
                  </span>
                </div>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    githubName ? 'bg-forest' : 'bg-border-strong'
                  }`}
                />
              </div>

              <div className="flex items-center justify-between px-1 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-surface-muted flex items-center justify-center border border-border text-text-muted shrink-0">
                    {user?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-text-primary dark:text-white truncate">
                      {user?.displayName || user?.email?.split('@')[0] || 'Developer'}
                    </div>
                    <div className="text-[11px] text-text-muted truncate">{user?.email}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  title="Sign out"
                  aria-label="Sign out"
                  className="text-text-muted hover:text-text-primary dark:hover:text-white p-1.5 shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
