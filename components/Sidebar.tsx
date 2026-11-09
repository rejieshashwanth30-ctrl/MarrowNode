'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  LogOut,
  User as UserIcon,
} from 'lucide-react';

export type DashboardView =
  | 'overview'
  | 'explorer'
  | 'architecture'
  | 'timeline'
  | 'ask'
  | 'impact'
  | 'evidence'
  | 'settings';

interface SidebarProps {
  activeView: DashboardView;
  onSelectView: (view: DashboardView) => void;
  user: {
    displayName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
    githubConnection?: {
      githubUsername?: string | null;
      connectionStatus?: string | null;
    } | null;
  } | null;
  collapsed?: boolean;
}

export function Sidebar({ activeView, onSelectView, user, collapsed = false }: SidebarProps) {
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

  const navItems: { id: DashboardView; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'explorer',
      label: 'Explorer',
      icon: <FolderTree className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'architecture',
      label: 'Architecture',
      icon: <Network className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: <GitCommit className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'ask',
      label: 'Ask Project',
      icon: <HelpCircle className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'impact',
      label: 'Impact Analysis',
      icon: <Cpu className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'evidence',
      label: 'Evidence',
      icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
    },
  ];

  const githubName = user?.githubConnection?.githubUsername;

  return (
    <aside className="w-60 bg-surface border-r border-border h-full flex flex-col justify-between shrink-0 select-none font-sans dark:bg-[#131915] dark:border-border-dark">
      {/* Top Header & Brand */}
      <div>
        <div className="h-14 px-4 border-b border-border flex items-center justify-between dark:border-border-dark">
          <Link href="/dashboard" className="flex items-center">
            <MarrowNodeLogo variant="full" size="md" />
          </Link>
          <span className="text-[11px] font-sans uppercase tracking-wider text-forest bg-forest/10 px-2 py-0.5 rounded font-semibold dark:bg-forest/20 dark:text-[#88B094]">
            v2.4
          </span>
        </div>

        {/* Primary Navigation List */}
        <div className="p-2 space-y-0.5">
          <div className="px-2.5 py-1.5 text-[10px] font-sans uppercase tracking-wider text-text-muted font-medium">
            Workstation
          </div>

          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectView(item.id)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded text-xs font-sans transition-colors text-left ${
                  isActive
                    ? 'bg-charcoal text-white font-medium shadow-subtle dark:bg-forest'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted dark:text-[#A7AFA9] dark:hover:bg-[#1A221D] dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={isActive ? 'text-white' : 'text-text-muted'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-forest dark:bg-white" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Footer Section */}
      <div className="border-t border-border p-2 space-y-1 dark:border-border-dark font-sans">
        {/* Settings button */}
        <button
          onClick={() => onSelectView('settings')}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-xs font-sans transition-colors text-left ${
            activeView === 'settings'
              ? 'bg-charcoal text-white font-medium dark:bg-forest'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted dark:text-[#A7AFA9] dark:hover:bg-[#1A221D]'
          }`}
        >
          <Settings className="w-4 h-4 text-text-muted" />
          <span>Settings</span>
        </button>

        {/* GitHub Connection Status */}
        <div className="px-2.5 py-2 rounded bg-surface-subtle border border-border/70 flex items-center justify-between text-xs font-sans text-text-muted dark:bg-[#18201B] dark:border-border-dark">
          <div className="flex items-center gap-1.5 truncate">
            <Github className="w-3.5 h-3.5 text-text-primary dark:text-white shrink-0" />
            <span className="truncate">
              {githubName ? `@${githubName}` : 'GitHub: Not connected'}
            </span>
          </div>
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              githubName ? 'bg-forest' : 'bg-border-strong'
            }`}
            title={githubName ? 'Connected' : 'Not connected'}
          />
        </div>

        {/* User Profile Mini Bar */}
        <div className="pt-1 flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-muted transition-colors dark:hover:bg-[#18201B]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full overflow-hidden bg-surface-muted flex items-center justify-center shrink-0 border border-border dark:border-border-dark text-text-muted">
              {user?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-3.5 h-3.5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-sans font-medium text-text-primary truncate dark:text-white leading-tight">
                {user?.displayName || user?.email?.split('@')[0] || 'Developer'}
              </div>
              <div className="text-[11px] font-sans text-text-muted truncate">
                {user?.email || 'MarrowNode Workspace'}
              </div>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            title="Sign out"
            className="text-text-muted hover:text-text-primary p-1 dark:hover:text-white"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
