/**
 * MarrowNode Observability & Performance Telemetry
 * Provides lightweight execution timing and metrics collection for server operations.
 * Strictly adheres to security rules: never logs credentials, tokens, or source code.
 */

export interface TimingMetric {
  operation: string;
  durationMs: number;
  projectId?: string;
  analysisId?: string;
  cacheHit?: boolean;
  status: 'success' | 'failure';
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface TelemetrySummary {
  count: number;
  p50: number;
  p95: number;
  avg: number;
  min: number;
  max: number;
}

class PerformanceTelemetry {
  private recentMetrics: TimingMetric[] = [];
  private readonly maxMetrics = 250;

  /**
   * Record a timing event into the in-memory telemetry buffer.
   */
  public record(metric: Omit<TimingMetric, 'timestamp'>): TimingMetric {
    const entry: TimingMetric = {
      ...metric,
      timestamp: new Date().toISOString(),
    };

    this.recentMetrics.push(entry);
    if (this.recentMetrics.length > this.maxMetrics) {
      this.recentMetrics.shift();
    }

    // Structured server log for observability (without sensitive content)
    if (process.env.NODE_ENV !== 'test') {
      const cacheTag = metric.cacheHit !== undefined ? ` cacheHit=${metric.cacheHit}` : '';
      const projTag = metric.projectId ? ` proj=${metric.projectId.substring(0, 8)}` : '';
      console.log(
        `[Telemetry] op=${metric.operation} duration=${metric.durationMs}ms status=${metric.status}${cacheTag}${projTag}`
      );
    }

    return entry;
  }

  /**
   * Measure the execution duration of an asynchronous operation.
   */
  public async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    options?: {
      projectId?: string;
      analysisId?: string;
      cacheHit?: boolean;
      metadata?: Record<string, any>;
    }
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const durationMs = Math.round(performance.now() - start);
      this.record({
        operation,
        durationMs,
        projectId: options?.projectId,
        analysisId: options?.analysisId,
        cacheHit: options?.cacheHit,
        status: 'success',
        metadata: options?.metadata,
      });
      return result;
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      this.record({
        operation,
        durationMs,
        projectId: options?.projectId,
        analysisId: options?.analysisId,
        status: 'failure',
        metadata: {
          errorType: err?.name || 'Error',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      });
      throw err;
    }
  }

  /**
   * Compute aggregated timing statistics (p50, p95, avg, min, max) grouped by operation.
   */
  public getSummary(): Record<string, TelemetrySummary> {
    const grouped = new Map<string, number[]>();
    for (const m of this.recentMetrics) {
      if (!grouped.has(m.operation)) grouped.set(m.operation, []);
      grouped.get(m.operation)!.push(m.durationMs);
    }

    const summary: Record<string, TelemetrySummary> = {};
    for (const [op, durations] of Array.from(grouped.entries())) {
      durations.sort((a: number, b: number) => a - b);
      const count = durations.length;
      const avg = Math.round(durations.reduce((sum: number, d: number) => sum + d, 0) / count);
      const p50 = durations[Math.floor(count * 0.5)] || 0;
      const p95 = durations[Math.floor(count * 0.95)] || durations[count - 1] || 0;
      const min = durations[0] || 0;
      const max = durations[count - 1] || 0;
      summary[op] = { count, p50, p95, avg, min, max };
    }
    return summary;
  }

  /**
   * Retrieve recent metrics for diagnostic inspection.
   */
  public getRecent(limit = 25): TimingMetric[] {
    return this.recentMetrics.slice(-limit);
  }

  /**
   * Clear all recorded metrics (e.g. for testing).
   */
  public clear(): void {
    this.recentMetrics = [];
  }
}

export const telemetry = new PerformanceTelemetry();
