import assert from "node:assert/strict";
import test from "node:test";
import extension from "../index.js";
import { fetchGoUsage, parseGoUsage, PROVIDER, USAGE_URL } from "../src/opencode-go-usage.js";

const NOW = Date.parse("2026-09-23T12:00:00Z");
const payload = () => ({ usage: {
  rolling: { status: "ok", percent: 20, resetsAt: "2026-09-23T17:00:00Z" },
  weekly: { status: "ok", percent: 42.5, resetsAt: "2026-09-30T12:00:00Z" },
  monthly: { status: "rate-limited", percent: 100, resetsAt: "2026-10-23T12:00:00Z" },
} });
const response = (data = payload(), options = {}) => ({ ok: true, redirected: false, url: USAGE_URL, json: async () => data, ...options });

test("maps all Go windows into a Gentle Shell ProviderUsage snapshot", () => {
  assert.deepEqual(parseGoUsage(payload(), NOW), {
    provider: PROVIDER, plan: undefined, fetchedAt: NOW,
    limits: [{ name: "Go", limitReached: true, windows: [
      { label: "5h", usedPercent: 20, windowSeconds: 18000, resetAt: Date.parse("2026-09-23T17:00:00Z") },
      { label: "week", usedPercent: 42.5, windowSeconds: 604800, resetAt: Date.parse("2026-09-30T12:00:00Z") },
      { label: "month", usedPercent: 100, windowSeconds: 2592000, resetAt: Date.parse("2026-10-23T12:00:00Z") },
    ] }],
  });
});

test("both official statuses affect limitReached without changing the window shape", () => {
  const available = payload();
  available.usage.monthly.status = "ok";
  available.usage.monthly.percent = 99;
  assert.equal(parseGoUsage(available, NOW).limits[0].limitReached, false);

  available.usage.weekly.status = "rate-limited";
  assert.equal(parseGoUsage(available, NOW).limits[0].limitReached, true);
  available.usage.weekly.status = "ok";
  available.usage.monthly.percent = 100;
  assert.equal(parseGoUsage(available, NOW).limits[0].limitReached, true);
});

test("rejects unknown statuses in any window", async () => {
  for (const name of ["rolling", "weekly", "monthly"]) {
    const data = payload();
    data.usage[name].status = "active";
    assert.equal(parseGoUsage(data, NOW), undefined);
    assert.equal(await fetchGoUsage("secret", async () => response(data), NOW), undefined);
  }
});

test("missing key never sends a request", async () => {
  const fetchFn = () => { throw Error("fetch must not run"); };
  assert.equal(await fetchGoUsage(undefined, fetchFn, NOW), undefined);
  assert.equal(await fetchGoUsage("", fetchFn, NOW), undefined);
});

test("uses fixed GET endpoint, bearer header and no redirects or cache", async () => {
  let called = 0;
  const result = await fetchGoUsage("test-secret", async (url, options) => {
    called++;
    assert.equal(url, USAGE_URL);
    assert.deepEqual(options, {
      method: "GET", headers: { Authorization: "Bearer test-secret", Accept: "application/json" },
      cache: "no-store", redirect: "error",
    });
    return response();
  }, NOW);
  assert.equal(called, 1);
  assert.equal(result.provider, PROVIDER);
  assert.equal(JSON.stringify(result).includes("test-secret"), false);
});

test("non-ok, auth failure, redirect and fetch exceptions fail closed", async () => {
  for (const value of [response(undefined, { ok: false, status: 401 }), response(undefined, { ok: false, status: 500 }), response(undefined, { redirected: true }), response(undefined, { url: "https://other.example/usage" })]) {
    assert.equal(await fetchGoUsage("secret", async () => value, NOW), undefined);
  }
  assert.equal(await fetchGoUsage("secret", async () => { throw Error("secret: network failure"); }, NOW), undefined);
  assert.equal(await fetchGoUsage("secret", async () => response(undefined, { json: async () => { throw Error("secret: invalid JSON"); } }), NOW), undefined);
});

test("rejects missing or malformed windows without emitting partial data", async () => {
  for (const name of ["rolling", "weekly", "monthly"]) {
    const data = payload();
    delete data.usage[name];
    assert.equal(parseGoUsage(data, NOW), undefined);
    assert.equal(await fetchGoUsage("secret", async () => response(data), NOW), undefined);
  }
  for (const change of [
    (data) => { data.usage.rolling.percent = NaN; },
    (data) => { data.usage.rolling.percent = -1; },
    (data) => { data.usage.rolling.percent = 101; },
    (data) => { data.usage.weekly.status = null; },
    (data) => { data.usage.monthly.resetsAt = "not a date"; },
    (data) => { data.usage.monthly.resetsAt = null; },
  ]) {
    const data = payload();
    change(data);
    assert.equal(parseGoUsage(data, NOW), undefined);
  }
  assert.equal(parseGoUsage({ usage: [] }, NOW), undefined);
  assert.equal(parseGoUsage(payload(), NaN), undefined);
});

test("registers standalone source initially and at every session start without retaining keys", async () => {
  const emitted = [];
  const handlers = new Map();
  extension({ events: { emit: (name, data) => emitted.push([name, data]) }, on: (name, callback) => handlers.set(name, callback) });
  handlers.get("session_start")();
  handlers.get("session_start")();
  assert.equal(emitted.length, 3);
  for (const [name, source] of emitted) {
    assert.equal(name, "gentle-pi:usage-source/v1");
    assert.equal(source.schema, "gentle-pi.usage-source/v1");
    assert.equal(source.provider, "opencode-go");
    assert.equal(source.fetch, fetchGoUsage);
    assert.equal(await source.fetch("secret", async () => response(), NOW).then((usage) => JSON.stringify(usage).includes("secret")), false);
  }
});
