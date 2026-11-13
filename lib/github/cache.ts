/**
 * MarrowNode GitHub API Request Cache
 * Provides in-memory commit-bound caching to eliminate duplicate API requests
 * and prevent hitting GitHub rate limits.
 *
 * Cache identity is rooted in:
 * owner + repo + commitSha/operation + path
 */

import { telemetry } from '@/lib/observability/timing';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  commitSha?: string;
}

class GitHubApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes default
  private readonly maxEntries = 2000;

  public get<T>(key: string): { data: T; hit: boolean } | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return { data: entry.data as T, hit: true };
  }

  public set<T>(key: string, data: T, ttlMs = this.defaultTTL, commitSha?: string): void {
    // Evict oldest entries if capacity reached
    if (this.cache.size >= this.maxEntries) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, 300);
      for (const k of keysToDelete) {
        this.cache.delete(k);
      }
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      commitSha,
    });
  }

  /**
   * Execute an operation with in-memory caching.
   * Telemetry tracks cache hits and latency.
   */
  public async fetchWithCache<T>(
    key: string,
    operationName: string,
    fetcher: () => Promise<T>,
    ttlMs = this.defaultTTL,
    commitSha?: string
  ): Promise<T> {
    const existing = this.get<T>(key);
    if (existing) {
      telemetry.record({
        operation: `github_cache.${operationName}`,
        durationMs: 0,
        cacheHit: true,
        status: 'success',
        metadata: { key },
      });
      return existing.data;
    }

    return telemetry.measure(
      `github_api.${operationName}`,
      async () => {
        const fresh = await fetcher();
        this.set(key, fresh, ttlMs, commitSha);
        return fresh;
      },
      { cacheHit: false, metadata: { key } }
    );
  }

  /**
   * Delete a specific cache key.
   */
  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all cache entries whose key starts with a specific prefix.
   */
  public deletePrefix(prefix: string): void {
    const low = prefix.toLowerCase();
    for (const key of Array.from(this.cache.keys())) {
      if (key.toLowerCase().startsWith(low)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate all cached data for a specific repository (e.g., when new commits are detected).
   */
  public invalidateRepo(owner: string, repo: string): void {
    const prefix = `${owner.toLowerCase()}/${repo.toLowerCase()}:`;
    for (const key of Array.from(this.cache.keys())) {
      if (key.toLowerCase().startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

export const githubCache = new GitHubApiCache();
