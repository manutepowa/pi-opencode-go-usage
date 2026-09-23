# pi-opencode-go-usage

A standalone Pi extension that registers OpenCode Go subscription usage with Gentle Shell. It does not modify Gentle Shell or add a model provider; your active Pi model must already use provider `opencode-go`, and Gentle Shell must be enabled.

## Install

After publication, install the package with Pi:

```sh
pi install git:github.com/manutepowa/pi-opencode-go-usage@v0.1.0
```

For a local checkout, use `pi install /path/to/pi-opencode-go-usage` instead. Load Gentle Shell (`gentle-pi`) separately, then start a new Pi session or reload extensions. No package settings or separate token configuration are required. Run `pnpm test` locally to run the dependency-free Node tests.

## Behavior

The source registers `opencode-go` via the `gentle-pi:usage-source/v1` event on load and again at each `session_start` (re-registration replaces the previous source). Gentle Shell passes the active provider's existing Pi API key into the source; this extension does not read credentials itself. It requests `GET https://opencode.ai/zen/go/v1/usage` with Bearer authorization and JSON Accept headers, `cache: no-store`, and `redirect: error`. The key is never written or logged by the extension.

The response must contain all three `usage.rolling`, `usage.weekly`, and `usage.monthly` windows, each with `status` equal to `ok` or `rate-limited`, numeric 0–100 `percent`, and an ISO timestamp with a timezone in `resetsAt`. It shows 5h, week, and month rows in Gentle Shell's `/gentle:usage` panel (`alt+u` by default), and the first window in the shell bar. Percentages are used as reported; `limitReached` is set when any percentage reaches 100 or any window reports `rate-limited`. Reset times become Unix milliseconds. The endpoint does not report window lengths, so 5 hours, 7 days, and a nominal 30 days are display durations, not inferred billing periods; calendar months can differ.

Missing credentials, failed HTTP/auth requests, redirects, network/JSON errors, and malformed or partial responses yield no new snapshot. Gentle Shell retains a previous valid snapshot during failed refreshes. Gentle Shell controls refresh timing (session start, periodic after turns, and manual `r` in the panel); this package does not poll independently.

## Limitations

Only OpenCode Go's subscription quota is supported, not general OpenCode API usage or other providers. The upstream endpoint and response format can change; an unknown shape is rejected rather than partially displayed. This extension does not provide a credential, enable Gentle Shell, or fetch quota when another provider is active. No live endpoint calls are made by the tests.

MIT licensed; see [LICENSE](LICENSE).
