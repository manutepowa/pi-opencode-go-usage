export const PROVIDER = "opencode-go";
export const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
export const REQUEST_TIMEOUT_MS = 10_000;
export const DEBUG_ENV = "PI_OPENCODE_GO_USAGE_DEBUG";

// The endpoint reports reset instants, not window lengths. These are nominal
// display durations; a calendar month is not always exactly 30 days.
const WINDOWS = [
  ["rolling", "5h", 5 * 60 * 60],
  ["weekly", "week", 7 * 24 * 60 * 60],
  ["monthly", "month", 30 * 24 * 60 * 60],
];
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseWindow(value, label, windowSeconds) {
  if (!record(value) || (value.status !== "ok" && value.status !== "rate-limited")) return undefined;
  if (typeof value.percent !== "number" || !Number.isFinite(value.percent) || value.percent < 0 || value.percent > 100) return undefined;
  if (typeof value.resetsAt !== "string" || !ISO_INSTANT.test(value.resetsAt)) return undefined;
  const resetAt = Date.parse(value.resetsAt);
  if (!Number.isFinite(resetAt)) return undefined;
  return { label, usedPercent: value.percent, windowSeconds, resetAt };
}

// Fail the entire snapshot if one allowance is missing: a partial snapshot
// would otherwise make a depleted subscription appear less used.
function parseUsage(payload, now) {
  if (!Number.isFinite(now) || !record(payload) || !record(payload.usage)) return { reason: "unexpected-shape" };
  const windows = [];
  for (const [name, label, seconds] of WINDOWS) {
    const window = parseWindow(payload.usage[name], label, seconds);
    if (!window) return { reason: `unexpected-shape:${name}` };
    windows.push(window);
  }
  return { usage: {
    provider: PROVIDER,
    plan: undefined,
    limits: [{ name: "Go", windows, limitReached: windows.some((window) => window.usedPercent >= 100) || WINDOWS.some(([name]) => payload.usage[name].status === "rate-limited") }],
    fetchedAt: now,
  } };
}

export function parseGoUsage(payload, now) {
  return parseUsage(payload, now).usage;
}

// Reasons are fixed codes, never error messages, so the key cannot leak.
function defaultReport(reason) {
  if (process.env[DEBUG_ENV]) console.error(`[pi-opencode-go-usage] ${reason}`);
}

async function requestUsage(apiKey, fetchFn, now, timeoutMs) {
  if (typeof apiKey !== "string" || apiKey.length === 0) return { reason: "missing-key" };
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetchFn(USAGE_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal,
    });
  } catch {
    return { reason: signal.aborted ? "timeout" : "network" };
  }
  // Defense in depth against a nonconforming fetch implementation.
  if (response.redirected || (response.url && response.url !== USAGE_URL)) return { reason: "redirect" };
  if (!response.ok) return { reason: `http-${response.status}` };
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { reason: signal.aborted ? "timeout" : "invalid-json" };
  }
  return parseUsage(payload, now);
}

export async function fetchGoUsage(apiKey, fetchFn, now, { timeoutMs = REQUEST_TIMEOUT_MS, report = defaultReport } = {}) {
  const { usage, reason } = await requestUsage(apiKey, fetchFn, now, timeoutMs);
  if (reason) {
    try { report(reason); } catch {}
  }
  return usage;
}
