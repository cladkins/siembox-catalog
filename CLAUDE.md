# siembox-catalog

Community catalog of portable SIEMBox content — data, not code. Parsers are
`parsers/<name>.parser.json` (match pattern, canonical `field_mappings`,
declarative `derivations`, `test_samples`); detections are
`detections/<category>/<ID>-<slug>.yaml`; content packs are
`packs/<id>.pack.yaml` (references to parsers, detections and SigmaHQ rule ids,
plus a setup guide). Authoring guide: `CONTRIBUTING.md`; editor schemas:
`schema/parser.schema.json`, `schema/pack.schema.json`.

## Gotchas

**This repo is the source of truth.** Parsers, detections and content packs
are authored here (as PRs to this repo), and SIEMBox installs from it. The main
SIEMBox repo (`cladkins/SIEMBOX`: `catalog/parsers/`, `rules/` and
`catalog/packs/`) keeps an exact mirror,
refreshed weekly by its `sync-catalog.yml` workflow as a PR, so a change made
only on the SIEMBox side is reverted by the next sync. Land content changes
here; when a SIEMBox change needs catalog content to change with it (a stricter
validator, say), land the same content in both repos.

**CI runs the real engine.** The `validate-catalog` workflow checks out
`cladkins/SIEMBOX`, builds its validators, and runs every parser's
`test_samples` through the actual parse → derive → normalize pipeline, plus a
ReDoS scan (`recheck`) on new/changed regexes and a duplication check. A parser
without at least one `test_sample`, or with a catastrophic-backtracking
pattern, fails the build. Packs run through `validate-packs` with this repo's
parsers and detections, so a pack naming a parser or category that does not
exist here fails too.

**Bump a pack's `version` when its items change.** SIEMBox records the version
and item list of each install and shows the difference as "What's new"; a
change without a bump still shows as new items, but the version is what users
see.

**Validation can't be changed from this side.** CI builds the validator from
the trusted SIEMBox repo with a read-only token, so a PR here cannot alter how
it is validated — engine or validator changes belong in the main repo.
