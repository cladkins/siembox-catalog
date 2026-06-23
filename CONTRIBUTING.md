# Contributing a parser

Thanks for adding a log source to SIEMBox! A parser is **data, not code** — you
describe how to recognize a log line and what canonical fields it produces, and
ship `test_samples` that prove it. CI runs your self-tests through the real
SIEMBox engine, so if it passes here it works in SIEMBox.

## TL;DR

1. Add `parsers/<name>.parser.json` (kebab-case name).
2. Map captured fields to **canonical** names (`source_ip`, `user`, `status_code`, ...).
3. Add at least one `test_sample` asserting the canonical fields, using a real
   (redacted) log line.
4. Open a PR. The **Validate parsers** check must be green.

Tip: if you already run SIEMBox, build the parser in the UI and export it
(Parsers -> Export) as a starting point.

## File format

Authoritative schema: [`schema/parser.schema.json`](./schema/parser.schema.json)
(point your editor at it for autocomplete).

- `parser_type`: `regex` | `json` | `grok`.
- `field_mappings`: regex `{ captureGroup: canonicalField }`, json `{ jsonKey: canonicalField }`.
  Map to canonical names so detections match regardless of source: `source_ip`,
  `dest_ip`, `source_port`, `dest_port`, `user`, `target_user`, `host`, `service`,
  `method`, `path`, `status_code`, `message`. The normalizer fills aliases
  (`client_ip`/`src_ip` -> `source_ip`) and mirrors `source_ip` <-> `client_ip`.
- `derivations`: ordered post-processing. Each rule may have `when`
  (`equals`/`contains`/`in`/`matches`/`exists`; `contains` & `matches` are
  case-insensitive), `set` (literals), `extract` (`{from, pattern, group}` — pull a
  regex capture from another field), and `overwrite` (default false = fill empty
  only; first match wins).

## test_samples — your parser's contract

Every parser must ship self-tests. Each is a raw `input` and the canonical fields
it must `expect`:

- The `input` runs through the full pipeline (match -> map -> derive -> normalize).
- Each `expect` field is compared to the produced value (string-coerced).
- Use `null` to assert a field is **absent** (e.g. `"auth_outcome": null`).
- `expect` is a **subset** — extra produced fields are fine.
- Use real log lines, redacted to documentation ranges (`203.0.113.0/24`,
  `198.51.100.0/24`). Cover each distinct event your parser surfaces.

## Validate locally

CI does this automatically. To reproduce locally, build the validator from SIEMBox:

```bash
git clone https://github.com/cladkins/SIEMBOX
cd SIEMBOX/backend && npm ci && npm run build
npm run validate-parsers -- /path/to/siembox-parsers/parsers
```

Strict mode requires a kebab-case `name` and >=1 `test_sample`. It exits non-zero
with precise per-field diffs on any failure.

## PR checklist

- [ ] `parsers/<name>.parser.json` with a kebab-case `name`.
- [ ] Fields mapped to canonical names where possible.
- [ ] >=1 `test_sample` per distinct event, using real (redacted) log lines.
- [ ] **Validate parsers** CI check is green.
