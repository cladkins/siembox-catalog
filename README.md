# siembox-catalog

> Formerly `siembox-parsers` — the repo was renamed now that it ships both
> parsers and detections. The old name still redirects (and remains SIEMBox's
> built-in default), so existing clones and links keep working.

Community catalog of portable **parsers** and **detection rules** for
[SIEMBox](https://github.com/cladkins/SIEMBOX). Everything here is **data, not
code**, and everything is gated by CI that runs the *real* SIEMBox engine — so
anything that's green here behaves identically once imported into SIEMBox.

- **Parsers** (`parsers/*.parser.json`) turn a raw log line into SIEMBox's
  canonical fields: a match pattern, `field_mappings`, declarative `derivations`,
  and `test_samples` that assert the fields the parser must produce.
- **Detections** (`detections/<category>/*.yaml`) are rules that fire on those
  canonical fields: `conditions` (AND logic), an optional `aggregation`
  (count/threshold over a timeframe), a `severity`, and an `alert` template.

The two compose: a parser normalizes `Failed password for admin from 203.0.113.5`
into `user=admin`, `source_ip=203.0.113.5`, `event=… failed`; a detection then
matches on those fields and raises an alert. Mapping to canonical names is what
lets one rule work across every source.

## How it fits together

```
raw log ──▶ parser (match → map → derive → normalize) ──▶ canonical fields ──▶ detection rule ──▶ alert
            parsers/*.parser.json                                              detections/**/*.yaml
```

## Install in-app

**Parsers** — in SIEMBox: **Parsers → Browse Catalog**. SIEMBox lists this repo's
tree, pulls each `parsers/*.parser.json` from `raw.githubusercontent`,
**validates + runs its self-tests**, then upserts — flagging each as installed /
update-available. SIEMBox targets this catalog out of the box; set it explicitly
to pin a fork or ref:

```
SIEMBOX_CATALOG_REPO=cladkins/siembox-catalog   # default: cladkins/siembox-parsers (redirects here)
SIEMBOX_CATALOG_REF=main
SIEMBOX_CATALOG_PARSERS_PATH=parsers
```

(Legacy `PARSER_CATALOG_REPO` / `PARSER_CATALOG_REF` / `PARSER_CATALOG_PATH` are
still honored. An optional `SIEMBOX_CATALOG_TOKEN` / `GITHUB_TOKEN` raises the
GitHub API rate limit for catalog fetches.)

**Detections** — the YAML under `detections/` *is* SIEMBox's native rule format
(the same files that live in SIEMBox's own `rules/`). Import them through the
rules engine / rules importer; each rule is self-contained and order-independent.

## Layout

```
parsers/      <name>.parser.json       — one portable parser per file
detections/   <category>/<ID>-<slug>.yaml — detection rules, grouped by category
schema/       parser.schema.json       — JSON Schema for parsers (editor autocomplete + docs)
.github/      workflows/validate.yml   — CI: strict validation + parser self-tests
```

Detection categories: `access-control`, `application`, `authentication`,
`data-exfiltration`, `infrastructure`, `iot`, `network`, `password-manager`,
`reverse-proxy`. The authoritative guide to the rule set (severities, thresholds,
response playbooks) lives in SIEMBox at
[`docs/reference/RULES.md`](https://github.com/cladkins/SIEMBOX/blob/main/docs/reference/RULES.md).

## Validation & CI

The **Validate parsers** workflow checks out the SIEMBox repo, builds the
validator, and runs it against this catalog on every PR and push:

- `validate-parsers.js parsers/` — strict structural validation **plus** each
  parser's `test_samples` through the real parse → derive → normalize pipeline.
- `validate-detections.js detections/` — strict validation of every rule against
  what the rules engine actually supports (operators, severities, aggregation,
  alert template).

A green check is the promise: it imports into SIEMBox and behaves the same.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md). In short: add a
`parsers/<name>.parser.json` (with canonical field mappings and at least one
`test_sample`) or a `detections/<category>/<name>.yaml` rule, open a PR, and make
the **Validate parsers** check green.

## License

MIT — see [LICENSE](./LICENSE).
