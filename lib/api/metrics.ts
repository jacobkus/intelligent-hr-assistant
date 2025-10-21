/**
 * In-memory metrics collection (request counts, latency percentiles, errors). Resets hourly.
 * For production: replace with observability platform (DataDog, New Relic) or Prometheus export.
 */

interface MetricData {
  count: number;
  latencies: number[];
  errors: number;
  rateLimitHits: number;
  lastReset: number;
}

const metrics = new Map<string, MetricData>();
const RESET_INTERVAL = 60 * 60 * 1000;

function getMetric(endpoint: string): MetricData {
  const now = Date.now();
  let metric = metrics.get(endpoint);

  if (!metric || now - metric.lastReset > RESET_INTERVAL) {
    metric = {
      count: 0,
      latencies: [],
      errors: 0,
      rateLimitHits: 0,
      lastReset: now,
    };
    metrics.set(endpoint, metric);
  }

  return metric;
}

export function recordRequest(endpoint: string, latencyMs: number): void {
  const metric = getMetric(endpoint);
  metric.count++;
  metric.latencies.push(latencyMs);

  // Keep only last 1000 latencies to prevent unbounded memory growth
  if (metric.latencies.length > 1000) {
    metric.latencies = metric.latencies.slice(-1000);
  }
}

export function recordError(endpoint: string): void {
  const metric = getMetric(endpoint);
  metric.errors++;
}

export function recordRateLimitHit(endpoint: string): void {
  const metric = getMetric(endpoint);
  metric.rateLimitHits++;
}

// Sort array once instead of three times (P50, P95, P99) for ~66% performance improvement.
function calculatePercentiles(arr: number[]): {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
} {
  if (arr.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0 };
  }

  const sorted = [...arr].sort((a, b) => a - b);

  const getPercentile = (p: number): number => {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  };

  return {
    p50: getPercentile(50),
    p95: getPercentile(95),
    p99: getPercentile(99),
    avg: arr.reduce((sum, val) => sum + val, 0) / arr.length,
  };
}

export function getMetrics(endpoint: string) {
  const metric = getMetric(endpoint);

  return {
    endpoint,
    count: metric.count,
    errors: metric.errors,
    error_rate: metric.count > 0 ? metric.errors / metric.count : 0,
    rate_limit_hits: metric.rateLimitHits,
    latency: calculatePercentiles(metric.latencies),
    period_start: new Date(metric.lastReset).toISOString(),
  };
}

export function getAllMetrics() {
  const allMetrics: Record<string, ReturnType<typeof getMetrics>> = {};

  for (const endpoint of metrics.keys()) {
    allMetrics[endpoint] = getMetrics(endpoint);
  }

  return allMetrics;
}

export function resetMetrics(): void {
  metrics.clear();
}
