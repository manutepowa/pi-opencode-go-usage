# pi-opencode-go-usage

OpenCode Go subscription usage for [Gentle Shell](https://github.com/Gentleman-Programming/gentle-shell). A standalone Pi extension that registers a usage source through Gentle Shell's `gentle-pi:usage-source/v1` event, so your 5-hour, weekly and monthly quota appear next to Codex, Claude and NaN.

It does not modify Gentle Shell, add a model provider, or read credentials itself.

## Requirements

- Pi with Gentle Shell (`gentle-pi`) enabled.
- A Pi session whose active model, or a subagent route of the session profile, uses provider `opencode-go`, with its API key already configured in Pi.

## Install

```sh
pi install git:github.com/manutepowa/pi-opencode-go-usage
```

Pin a release with `@v0.1.1`. For a local checkout, run `pi install /path/to/pi-opencode-go-usage`. Then start a new Pi session or reload extensions. No settings or separate token are needed. Extension load order does not matter.

## What you see

- **Panel:** `/gentle:usage` (`alt+u` by default) shows three rows: `5h`, `week` and `month`, each with a meter, percentage and reset countdown. Press `r` to refresh.
- **Shell bar:** shows the first window (`5h`) while an `opencode-go` model is active.
- **Sidebar:** the Usage group prints the same rows without reset dates; a row at `0%` is hidden.
- **Before the first fetch:** `no Go usage yet · r to fetch`.
- **After a failed refresh:** Gentle Shell shows `fetch failed · r to retry` and keeps the last valid snapshot.
- Gauges turn amber at 80% and red at 95%.

## How it works

The extension emits the usage-source event on load and again on every `session_start`; re-registering replaces the previous source. Gentle Shell then calls `fetch(apiKey, fetchFn, now)` with the provider's existing Pi API key and owns the schedule: session start, at most every 5 minutes after a turn, when a source registers late, and `r` in the panel. This package never polls on its own. Gentle Shell also refreshes `opencode-go` when it is only a subagent route of the session profile.

Request: `GET https://opencode.ai/zen/go/v1/usage` with Bearer authorization and `Accept: application/json`, `cache: no-store`, `redirect: error` and a 10-second timeout (matching Gentle Shell's default window, `GENTLE_PI_SHELL_USAGE_TIMEOUT_MS`). The key is never written or logged.

### Response contract

`usage.rolling`, `usage.weekly` and `usage.monthly` must all be present, each with:

| Field | Requirement |
| --- | --- |
| `status` | `ok` or `rate-limited` |
| `percent` | finite number, 0–100 |
| `resetsAt` | ISO 8601 timestamp with timezone |

Percentages are shown as reported. `limitReached` is set when any window reaches 100% or reports `rate-limited`. Reset times become Unix milliseconds. The endpoint does not report window lengths, so 5 hours, 7 days and a nominal 30 days are display durations, not billing periods; calendar months can differ.

Missing credentials, HTTP or auth errors, redirects, network or JSON errors, timeouts, and malformed or partial responses produce no snapshot. A partial payload is rejected entirely so a depleted subscription never looks less used.

## Troubleshooting

Set `PI_OPENCODE_GO_USAGE_DEBUG=1` before starting Pi to log why a refresh produced no snapshot, for example `[pi-opencode-go-usage] http-401`.

| Code | Meaning |
| --- | --- |
| `missing-key` | Pi has no API key for `opencode-go` |
| `timeout` | No answer within 10 seconds |
| `network` | Request failed |
| `redirect` | Endpoint redirected; refused to protect the key |
| `http-<status>` | Non-2xx response, e.g. `http-401` |
| `invalid-json` | Body was not JSON |
| `unexpected-shape` | Payload is not the expected object |
| `unexpected-shape:<rolling\|weekly\|monthly>` | That window is missing or invalid |

Only these fixed codes are logged, never the key or error messages.

## Development

```sh
pnpm test
```

Dependency-free Node tests; no live endpoint calls are made.

## Limitations

- Only OpenCode Go's subscription quota; not general OpenCode API usage or other providers.
- The upstream endpoint is not a published API and its format can change; an unknown shape is rejected rather than partially displayed.
- It does not provide a credential or enable Gentle Shell.

MIT licensed; see [LICENSE](LICENSE).
