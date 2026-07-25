# siembox-catalog

Community catalog of portable SIEMBox content — data, not code. Parsers are
`parsers/<name>.parser.json` (match pattern, canonical `field_mappings`,
declarative `derivations`, `test_samples`); detections are
`detections/<category>/<ID>-<slug>.yaml`. Authoring guide: `CONTRIBUTING.md`;
editor schema: `schema/parser.schema.json`.

## Gotchas

**This repo is a published mirror.** The canonical source lives in the main
SIEMBox repo (`cladkins/SIEMBOX`: `catalog/parsers/` and `rules/`), which
mirrors here weekly via its `sync-catalog.yml` workflow (as a PR). A change
made only here will surface as drift in the next sync PR — land content
changes in the main repo (or both) to keep them.

**CI runs the real engine.** The `validate-catalog` workflow checks out
`cladkins/SIEMBOX`, builds its validators, and runs every parser's
`test_samples` through the actual parse → derive → normalize pipeline, plus a
ReDoS scan (`recheck`) on new/changed regexes and a duplication check. A parser
without at least one `test_sample`, or with a catastrophic-backtracking
pattern, fails the build.

**Validation can't be changed from this side.** CI builds the validator from
the trusted SIEMBox repo with a read-only token, so a PR here cannot alter how
it is validated — engine or validator changes belong in the main repo.
