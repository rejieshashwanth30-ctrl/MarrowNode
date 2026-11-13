'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { createClient } from '@/utils/supabase/client';
import { getAppOrigin } from '@/lib/origin';
import {
  Github,
  Search,
  Lock,
  Globe,
  GitFork,
  Star,
  Clock,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Code2,
} from 'lucide-react';

export interface RepositoryItem {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  ownerAvatarUrl: string;
  description: string | null;
  htmlUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  isFork: boolean;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  updatedAt: string;
  pushedAt: string;
}

interface RepositorySelectorProps {
  onRepositoryConnected?: (project: any, repository: any) => void;
  onCancel?: () => void;
  className?: string;
}

type FilterType = 'all' | 'owned' | 'private' | 'forks';

interface ClientRepoCache {
  repositories: RepositoryItem[];
  hasMore: boolean;
  githubUsername?: string;
  timestamp: number;
}
const repoCache = new Map<string, ClientRepoCache>();
const CLIENT_REPO_TTL_MS = 60 * 1000;

export function RepositorySelector({
  onRepositoryConnected,
  onCancel,
  className = '',
}: RepositorySelectorProps) {
  const [repositories, setRepositories] = useState<RepositoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [requiresReconnect, setRequiresReconnect] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);

  // Filter & Search state
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Selection & Connect state
  const [selectedRepo, setSelectedRepo] = useState<RepositoryItem | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Safe reconnect handler via Supabase OAuth with prompt=consent
  const handleReconnectGitHub = useCallback(async () => {
    setIsReconnecting(true);
    try {
      const supabase = createClient();
      const origin = getAppOrigin();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${origin}/auth/callback?next=/dashboard?openRepoSelector=true`,
          scopes: 'read:user repo',
          queryParams: {
            prompt: 'consent',
          },
        },
      });

      if (error) {
        window.location.href = `/auth?reconnect=true&next=${encodeURIComponent('/dashboard?openRepoSelector=true')}`;
      }
    } catch {
      window.location.href = `/auth?reconnect=true&next=${encodeURIComponent('/dashboard?openRepoSelector=true')}`;
    }
  }, []);

  // Fetch repositories from API
  const fetchRepos = useCallback(
    async (targetPage = 1, append = false, bypassCache = false) => {
      const cacheKey = `${filter}:${search.trim()}:${targetPage}`;

      if (!append && !bypassCache) {
        const cached = repoCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CLIENT_REPO_TTL_MS) {
          setRepositories(cached.repositories);
          setHasMore(cached.hasMore);
          if (cached.githubUsername) setGithubUsername(cached.githubUsername);
          setPage(targetPage);
          setLoading(false);
          return;
        }
      }

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          per_page: '20',
          filter,
        });
        if (search.trim()) {
          params.set('search', search.trim());
        }

        const res = await fetch(`/api/github/repositories?${params.toString()}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Unable to load repositories. Try again.');
          setErrorType(data.connectionStatus || (data.isRateLimit ? 'rate_limit' : 'error'));
          setRequiresReconnect(
            Boolean(data.requiresReconnect) ||
            data.connectionStatus === 'token_expired' ||
            data.connectionStatus === 'token_missing' ||
            data.connectionStatus === 'not_connected' ||
            data.connectionStatus === 'account_mismatch' ||
            data.connectionStatus === 'permission_denied'
          );
          setRepositories([]);
          return;
        }

        if (data.githubUsername) {
          setGithubUsername(data.githubUsername);
        }

        if (append) {
          setRepositories((prev) => [...prev, ...(data.repositories || [])]);
        } else {
          setRepositories(data.repositories || []);
          repoCache.set(cacheKey, {
            repositories: data.repositories || [],
            hasMore: Boolean(data.hasMore),
            githubUsername: data.githubUsername,
            timestamp: Date.now(),
          });
        }

        setPage(targetPage);
        setHasMore(Boolean(data.hasMore));
        setRequiresReconnect(false);
      } catch (err: any) {
        setError(err?.message || 'Unable to load repositories. Try again.');
        setErrorType('error');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filter, search]
  );

  // Initial fetch and on filter/search change (with debounce on search)
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchRepos(1, false);
    }, 200);

    return () => clearTimeout(handler);
  }, [fetchRepos]);

  // Connect repository action
  const handleConnectRepository = async () => {
    if (!selectedRepo) return;

    setIsConnecting(true);
    setConnectError(null);

    try {
      const res = await fetch('/api/github/repositories/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: selectedRepo.owner,
          name: selectedRepo.name,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setConnectError(data.error || 'Failed to connect repository.');
        setIsConnecting(false);
        return;
      }

      if (onRepositoryConnected) {
        onRepositoryConnected(data.project, data.repository);
      }
    } catch (err: any) {
      setConnectError(err?.message || 'Failed to connect repository.');
      setIsConnecting(false);
    }
  };

  return (
    <Card className={`overflow-hidden font-sans border-border dark:border-border-dark ${className}`}>
      {/* Header */}
      <CardHeader className="bg-surface-subtle dark:bg-[#1A221D] p-4 sm:p-5 border-b border-border dark:border-border-dark">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-forest/10 border border-forest/20 flex items-center justify-center text-forest dark:text-[#88B094]">
              <Github className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-text-primary dark:text-white flex items-center gap-2">
                <span>Select GitHub Repository</span>
                {githubUsername && (
                  <div className="flex items-center gap-1.5">
                    <Badge variant="neutral" size="sm" className="font-mono text-[11px] font-normal">
                      @{githubUsername}
                    </Badge>
                    <button
                      type="button"
                      onClick={handleReconnectGitHub}
                      className="text-[11px] text-forest dark:text-[#88B094] hover:underline cursor-pointer"
                      title="Connect or switch GitHub account"
                    >
                      Switch
                    </button>
                  </div>
                )}
              </h2>
              <p className="text-xs text-text-muted">
                Choose a repository from your GitHub account to connect to MarrowNode.
              </p>
            </div>
          </div>

          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="text-xs text-text-muted hover:text-text-primary dark:hover:text-white self-start sm:self-auto"
            >
              Cancel
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-4 font-sans">
        {/* Step 1: Repository Detail Preview (if a repo is selected) */}
        {selectedRepo && (
          <div className="p-4 rounded bg-forest/5 border border-forest/20 dark:bg-forest/10 space-y-3 animate-in fade-in-50 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-text-primary dark:text-white">
                    {selectedRepo.fullName}
                  </span>
                  <Badge variant="neutral" size="sm" className="text-[11px] gap-1">
                    {selectedRepo.isPrivate ? (
                      <>
                        <Lock className="w-3 h-3 text-copper" /> Private
                      </>
                    ) : (
                      <>
                        <Globe className="w-3 h-3 text-forest" /> Public
                      </>
                    )}
                  </Badge>
                  {selectedRepo.isFork && (
                    <Badge variant="neutral" size="sm" className="text-[11px] gap-1">
                      <GitFork className="w-3 h-3" /> Fork
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-text-secondary dark:text-[#A7AFA9] leading-relaxed">
                  {selectedRepo.description || 'No description provided.'}
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedRepo(null)}
                className="text-xs text-text-muted hover:text-text-primary shrink-0"
              >
                Change
              </Button>
            </div>

            {/* Repository Metadata Chips */}
            <div className="flex items-center gap-4 text-xs text-text-muted pt-1 border-t border-border/50 dark:border-border-dark/50 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-forest" />
                <span>Branch: <strong className="text-text-primary dark:text-white font-medium">{selectedRepo.defaultBranch}</strong></span>
              </span>

              {selectedRepo.language && (
                <span className="inline-flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-forest" />
                  <span>Language: <strong className="text-text-primary dark:text-white font-medium">{selectedRepo.language}</strong></span>
                </span>
              )}

              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Updated {new Date(selectedRepo.updatedAt).toLocaleDateString()}</span>
              </span>

              <a
                href={selectedRepo.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-forest hover:underline ml-auto"
              >
                <span>View on GitHub</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {connectError && (
              <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{connectError}</span>
              </div>
            )}

            {/* Confirm Connect Button */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={handleConnectRepository}
                loading={isConnecting}
                className="font-sans font-medium text-xs h-9 px-4"
              >
                <span>{isConnecting ? 'Connecting repository…' : 'Add to MarrowNode'}</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Controls: Search and Filter Tabs */}
        {!selectedRepo && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              {/* Search input */}
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search repositories…"
                  aria-label="Search repositories"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 sm:h-8 pl-8 pr-3 text-xs font-sans rounded bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-forest dark:bg-[#1A221D] dark:border-[#324237] dark:text-[#F2F4F0] dark:placeholder:text-[#98A49A]"
                />
              </div>

              {/* Filter tabs */}
              <div className="flex items-center gap-1 p-0.5 rounded bg-surface-subtle border border-border dark:bg-[#1A221D] dark:border-border-dark self-start sm:self-auto max-w-full overflow-x-auto no-scrollbar text-xs">
                {(['all', 'owned', 'private', 'forks'] as FilterType[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilter(tab)}
                    className={`px-2.5 py-1 rounded capitalize font-medium whitespace-nowrap shrink-0 transition-colors ${
                      filter === tab
                        ? 'bg-surface text-text-primary shadow-subtle dark:bg-[#243129] dark:text-white'
                        : 'text-text-secondary hover:text-text-primary dark:text-[#C6CDC7] dark:hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* State 1: Loading */}
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center min-h-[260px]">
                <RefreshCw className="w-5 h-5 text-forest animate-spin" />
                <p className="text-xs text-text-muted font-sans">
                  Loading your repositories from GitHub…
                </p>
              </div>
            ) : error ? (
              /* State 2: Error */
              <div className="py-10 px-4 text-center space-y-3 bg-surface-subtle border border-border dark:bg-[#18201B] dark:border-border-dark rounded min-h-[220px] flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h4 className="text-xs sm:text-sm font-semibold text-text-primary dark:text-white">
                    {errorType === 'rate_limit'
                      ? 'GitHub API rate limit reached'
                      : errorType === 'token_missing' || errorType === 'not_connected'
                      ? 'GitHub connection required'
                      : errorType === 'account_mismatch'
                      ? 'GitHub account mismatch'
                      : errorType === 'permission_denied'
                      ? 'GitHub permission required'
                      : errorType === 'token_expired'
                      ? 'GitHub authorization expired'
                      : 'Unable to load repositories'}
                  </h4>
                  <p className="text-xs text-text-muted leading-relaxed">
                    {error}
                  </p>
                </div>
                <div className="pt-1">
                  {requiresReconnect ||
                  errorType === 'token_expired' ||
                  errorType === 'not_connected' ||
                  errorType === 'token_missing' ||
                  errorType === 'account_mismatch' ||
                  errorType === 'permission_denied' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleReconnectGitHub}
                      loading={isReconnecting}
                      className="text-xs font-sans shadow-sm"
                    >
                      <Github className="w-3.5 h-3.5 mr-1.5" />
                      <span>{isReconnecting ? 'Connecting to GitHub…' : 'Reconnect GitHub'}</span>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchRepos(1, false, true)}
                      className="text-xs font-sans"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      <span>Try again</span>
                    </Button>
                  )}
                </div>
              </div>
            ) : repositories.length === 0 ? (
              /* State 3: Empty */
              <div className="py-12 text-center space-y-2 bg-surface-subtle border border-border dark:bg-[#18201B] dark:border-border-dark rounded min-h-[220px] flex flex-col items-center justify-center">
                <Globe className="w-7 h-7 text-text-muted mx-auto" />
                <h4 className="text-xs sm:text-sm font-semibold text-text-primary dark:text-white">
                  No repositories found
                </h4>
                <p className="text-xs text-text-muted max-w-xs mx-auto">
                  {search
                    ? `No repositories matched "${search}". Try adjusting your search or filter.`
                    : 'No repositories were returned for this filter.'}
                </p>
              </div>
            ) : (
              /* State 4: Repository List */
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {repositories.map((repo) => (
                  <div
                    key={repo.id}
                    onClick={() => setSelectedRepo(repo)}
                    className="p-3 rounded bg-surface border border-border hover:border-forest hover:bg-forest/[0.02] cursor-pointer transition-all dark:bg-[#17201B] dark:border-border-dark dark:hover:border-forest/40 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 sm:gap-3 group min-w-0"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-xs sm:text-sm font-semibold text-text-primary group-hover:text-forest transition-colors dark:text-white dark:group-hover:text-[#9AC6A7] break-all min-w-0">
                          {repo.fullName}
                        </span>

                        <Badge variant="neutral" size="sm" className="text-[10px] py-0 px-1.5 gap-1">
                          {repo.isPrivate ? (
                            <>
                              <Lock className="w-2.5 h-2.5 text-copper" /> Private
                            </>
                          ) : (
                            <>
                              <Globe className="w-2.5 h-2.5 text-forest" /> Public
                            </>
                          )}
                        </Badge>

                        {repo.isFork && (
                          <Badge variant="neutral" size="sm" className="text-[10px] py-0 px-1.5 gap-0.5">
                            <GitFork className="w-2.5 h-2.5" /> Fork
                          </Badge>
                        )}
                      </div>

                      {repo.description && (
                        <p className="text-xs text-text-muted line-clamp-2 sm:truncate max-w-md">
                          {repo.description}
                        </p>
                      )}

                      <div className="flex items-center flex-wrap gap-3 text-[11px] text-text-muted">
                        {repo.language && (
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-forest" />
                            <span>{repo.language}</span>
                          </span>
                        )}

                        {repo.stargazersCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-copper" />
                            <span>{repo.stargazersCount}</span>
                          </span>
                        )}

                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(repo.updatedAt).toLocaleDateString()}</span>
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-xs font-sans font-medium shrink-0 group-hover:bg-forest group-hover:text-white transition-colors"
                    >
                      <span>Select</span>
                    </Button>
                  </div>
                ))}

                {/* Load More Button */}
                {hasMore && (
                  <div className="pt-2 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchRepos(page + 1, true)}
                      loading={loadingMore}
                      className="text-xs font-sans"
                    >
                      <span>{loadingMore ? 'Loading more…' : 'Load more repositories'}</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

