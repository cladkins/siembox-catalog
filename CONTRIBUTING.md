# Contributing

Thanks for improving SIEMBox's detection coverage! This catalog holds two kinds
of contribution, both **data, not code**:

- a **parser** — teaches SIEMBox to read a new log source and emit canonical fields;
- a **detection rule** — fires an alert when those canonical fields match a threat pattern.

Both are gated by the **`validate-catalog`** CI check, which builds the validator
from [SIEMBox](https://github.com/cladkins/siembox) and runs it against your
change. If it's green here, it imports into SIEMBox and behaves identically. Pick
the section below for what you're adding.

## How to submit

1. **Fork** this repository and clone your fork.
2. Create a branch for your change.
3. Add your `parsers/<name>.parser.json` or `detections/<category>/<name>.yaml`.
4. [Validate locally](#validate-locally) until the validator exits 0.
5. Open a PR against `main`. Fill in the PR template checklist.
6. A catalog maintainer (via `CODEOWNERS`) reviews and squash-merges once
   `validate-catalog` is green and conversations are resolved. `main` is
   protected: no direct pushes, linear history, code-owner approval required.

---

## Contributing a parser

A parser recognizes a log line and declares the canonical fields it produces,
with `test_samples` that prove it.

### TL;DR

1. Add `parsers/<name>.parser.json` (kebab-case `name` recommended — see note below).
2. Map captured fields to **canonical** names (`source_ip`, `user`, `status_code`, …).
3. Add at least one `test_sample` asserting the canonical fields, using a real
   (redacted) log line.
4. Open a PR. The **`validate-catalog`** check must be green.

> Tip: if you already run SIEMBox, build the parser in the UI and export it
> (Parsers → Export) as a starting point.

### File format

Authoritative schema: [`schema/parser.schema.json`](./schema/parser.schema.json)
(point your editor at it for autocomplete).

- `name`: the upsert key. Kebab-case (`^[a-z0-9][a-z0-9-]*$`) is **recommended**
  for new community parsers; legacy/first-party display names (e.g.
  `SSH Authentication`) are accepted as a warning, not an error.
- `parser_type`: `regex` | `json` | `grok`.
- `pattern`: regex with **named** capture groups (`(?<source_ip>...)`); use `""`
  for `json` parsers.
- `field_mappings`: regex `{ captureGroup: canonicalField }`, json `{ jsonKey: canonicalField }`.
  Map to canonical names so detections match regardless of source: `source_ip`,
  `dest_ip`, `source_port`, `dest_port`, `user`, `target_user`, `host`, `service`,
  `method`, `path`, `status_code`, `message`. The normalizer fills aliases
  (`client_ip`/`src_ip` → `source_ip`) and mirrors `source_ip` ↔ `client_ip`.
- `derivations`: ordered post-processing. Each rule may have `when`
  (`equals`/`contains`/`in`/`matches`/`exists`; `contains` & `matches` are
  case-insensitive), `set` (literals), `extract` (`{from, pattern, group}` — pull a
  regex capture from another field), and `overwrite` (default false = fill empty
  only; first match wins).

### test_samples — your parser's contract

Every parser must ship self-tests. Each is a raw `input` and the canonical fields
it must `expect`:

- The `input` runs through the full pipeline (match → map → derive → normalize).
- Each `expect` field is compared to the produced value (string-coerced).
- Use `null` to assert a field is **absent** (e.g. `"auth_outcome": null`).
- `expect` is a **subset** — extra produced fields are fine.
- Use real log lines, redacted to documentation ranges (`203.0.113.0/24`,
  `198.51.100.0/24`). Cover each distinct event your parser surfaces.

---

## Contributing a detection rule

A detection rule is a YAML file that evaluates the canonical fields parsers
produce and raises an alert when its `conditions` match. This is SIEMBox's native
rule format — the same files that ship in SIEMBox's `rules/`.

### TL;DR

1. Add `detections/<category>/<ID>-<slug>.yaml` (e.g.
   `detections/authentication/AUTH-012-new-attack.yaml`).
2. Match on **canonical** field names that a parser already produces.
3. Set a `severity`, write an `alert` with `{field}` substitution, and tag it.
4. Open a PR. The **`validate-catalog`** check must be green.

Categories: `access-control`, `application`, `authentication`,
`data-exfiltration`, `infrastructure`, `iot`, `network`, `password-manager`,
`reverse-proxy`.

### File format

```yaml
name: Sudo to Root by Non-Admin User      # required, non-empty
description: >                             # optional
  One or two sentences on what this detects and why it matters.
severity: high                            # required: low | medium | high | critical
enabled: true                             # optional (default true)
tags: [sudo, privilege-escalation, linux] # optional, array of strings

conditions:                               # required, non-empty; ALL must match (AND)
  - field: target_user                    # a canonical field a parser emits
    operator: equals
    value: "root"
  - field: user
    operator: not_equals
    value: "admin"

aggregation:                              # optional — count/threshold over a window
  field: source_ip                        # group events by this field
  timeframe: 5m                           # <int><s|m|h|d>, e.g. 30s, 5m, 1h, 1d
  threshold: 5                            # fire after N matches (positive integer)
  distinct_count: user                    # optional: count distinct values instead

alert:                                    # required
  title: "Non-Admin User {user} Executed Sudo to Root"   # required; {field} is substituted
  description: >                          # optional
    User {user} ran sudo as root on {hostname}: {command}. Verify authorization…
```

**Condition operators** (engine-supported): `equals`, `not_equals`, `contains`,
`not_contains`, `regex`, `greater_than`, `less_than`, `in`, `not_in`,
`not_in_whitelist`, `exists`.

- Every condition needs a `value` **except** `exists` (where `value` is an
  optional boolean).
- `greater_than` / `less_than` values must be numeric.
- `regex` values must compile.
- `in` / `not_in` take a comma-separated list (or YAML array).

Write `conditions` against canonical field names (`source_ip`, `user`,
`target_user`, `status_code`, `event`, `host`, …) so the rule fires no matter
which source the log came from. If no parser yet produces the field you need,
contribute the parser first.

The authoritative reference for the rule set — severity guidance, thresholds, and
response playbooks — is SIEMBox's
[`docs/reference/RULES.md`](https://github.com/cladkins/siembox/blob/main/docs/reference/RULES.md).

---

## Validate locally

CI does this automatically. To reproduce locally, build the validator from SIEMBox
and point it at this catalog:

```bash
git clone https://github.com/cladkins/siembox
cd siembox/backend && npm ci && npm run build

# parsers: strict validation + self-tests
npm run validate-parsers -- /path/to/siembox-catalog/parsers

# detections: strict rule validation
npm run validate-detections -- /path/to/siembox-catalog/detections
```

Both run in strict mode and exit non-zero with precise per-field diffs on any
failure. Parser strict mode requires a non-empty `name` and ≥1 `test_sample`;
detection strict mode requires `name`, a valid `severity`, non-empty
`conditions`, and an `alert.title`.

---

## Security & regex safety

This catalog ships **declarative data only** — no executable code. Keep
contributions safe to import and safe to run:

- **No catastrophic backtracking (ReDoS).** A parser's regex runs against
  untrusted log volume, so a pathological pattern can hang the pipeline. CI runs
  a `recheck` ReDoS scan over the parser regexes **added or modified** in your PR
  and **fails on a `vulnerable` verdict**. Pre-existing parsers are grandfathered
  pending a dedicated cleanup; new and changed parsers must be clean.
  - Avoid adjacent open-ended quantifiers over the same text (e.g. `\s+` next to
    `.*`), anchor fixed segments, and prefer bounded character classes. Test
    pathological inputs at <https://regex101.com/> if unsure.
- **Redact samples.** Use the documentation IP ranges (`203.0.113.0/24`,
  `198.51.100.0/24`) and strip real users, hostnames, tokens, and secrets from
  `test_samples`.
- **Trusted validation.** CI builds the validator from `cladkins/siembox` (not
  from your PR) and runs fork PRs with a read-only token and no secret access, so
  a submission cannot alter how it is validated.

## PR checklist

**For a parser:**

- [ ] `parsers/<name>.parser.json`, with `name` as the upsert key (kebab-case preferred).
- [ ] Fields mapped to canonical names where possible.
- [ ] ≥1 `test_sample` per distinct event, using real (redacted) log lines.
- [ ] Regex is free of catastrophic backtracking (ReDoS scan passes).

**For a detection:**

- [ ] `detections/<category>/<name>.yaml` under an existing category.
- [ ] `conditions` reference canonical fields a parser actually produces.
- [ ] `severity` set appropriately; `alert.title` is clear and actionable.

**Both:**

- [ ] The **`validate-catalog`** CI check is green.
