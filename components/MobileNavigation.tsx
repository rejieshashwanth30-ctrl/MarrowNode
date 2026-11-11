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
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'explorer', label: 'Files', icon: <FolderTree className="w-5 h-5" /> },
    { id: 'architecture', label: 'Structure', icon: <Network className="w-5 h-5" /> },
    { id: 'timeline', label: 'History', icon: <GitCommit className="w-5 h-5" /> },
    { id: 'ask', label: 'Ask', icon: <HelpCircle className="w-5 h-5" /> },
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
      {/* 1. Bottom Nav Bar (Mobile only, persistent) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-border flex items-center justify-around h-14 px-2 font-sans dark:bg-[#131915] dark:border-border-dark">
        {primaryNavItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[11px] font-sans font-medium transition-colors ${
                isActive
                  ? 'text-forest font-semibold dark:text-[#88B094]'
                  : 'text-text-muted hover:text-text-primary dark:hover:text-white'
              }`}
            >
              <span className={isActive ? 'text-forest dark:text-[#88B094]' : 'text-text-muted'}>
                {item.icon}
              </span>
              <span className="mt-1">{item.label}</span>
            </button>
          );
        })}
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
          <div className="relative w-4/5 max-w-xs bg-surface border-r border-border h-full flex flex-col justify-between p-4 z-10 dark:bg-[#131915] dark:border-border-dark animate-in slide-in-from-left duration-200">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-border dark:border-border-dark">
                <MarrowNodeLogo variant="full" size="sm" />
                <button
                  onClick={onClose}
                  className="p-1.5 text-text-muted hover:text-text-primary rounded"
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
                      onClick={() => {
                        onSelectView(item.id);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-xs font-sans transition-colors text-left ${
                        isActive
                          ? 'bg-charcoal text-white font-medium dark:bg-forest'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted dark:text-[#A7AFA9]'
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
            <div className="border-t border-border pt-3 space-y-2 dark:border-border-dark text-xs font-sans">
              <div className="px-2.5 py-1.5 rounded bg-surface-subtle border border-border flex items-center justify-between dark:bg-[#1A221D] dark:border-border-dark">
                <div className="flex items-center gap-1.5 truncate text-text-muted">
                  <Github className="w-3.5 h-3.5 text-text-primary dark:text-white" />
                  <span className="truncate">
                    {githubName ? `@${githubName}` : 'GitHub: Not connected'}
                  </span>
                </div>
                <span
                  className={`w-2 h-2 rounded-full ${
                    githubName ? 'bg-forest' : 'bg-border-strong'
                  }`}
                />
              </div>

              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-surface-muted flex items-center justify-center border border-border text-text-muted">
                    {user?.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-text-primary dark:text-white">
                      {user?.displayName || user?.email?.split('@')[0] || 'Developer'}
                    </div>
                    <div className="text-[11px] text-text-muted">{user?.email}</div>
                  </div>
                </div>

                <button
                  onClick={handleSignOut}
                  title="Sign out"
                  className="text-text-muted hover:text-text-primary p-1.5"
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
