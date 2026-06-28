<!--
Thanks for contributing to the SIEMBox catalog! Both parsers and detections are
data, not code. Fill in the checklist so the validate-catalog check passes on the
first try. See CONTRIBUTING.md for the full guide.
-->

## What does this PR add or change?

<!-- One or two sentences. Link any related issue. -->

## Type of change

- [ ] New parser
- [ ] New detection rule
- [ ] Update to an existing parser or detection
- [ ] Schema, CI, or tooling change

## Checklist

- [ ] I ran the SIEMBox validator locally and it exits 0
      (`npm run validate-parsers -- <path>` and/or `npm run validate-detections -- <path>`).
- [ ] Sample log lines use real data with IPs/secrets redacted to the
      documentation ranges (`203.0.113.0/24`, `198.51.100.0/24`).
- [ ] Every distinct event type my parser surfaces has a `test_sample`.
- [ ] All `expect` values use canonical field names (`source_ip`, `dest_ip`,
      `user`, `host`, `status_code`, `message`, ...).

### Parsers only

- [ ] `name` is kebab-case (`^[a-z0-9][a-z0-9-]*$`) and does not collide with an
      existing parser.
- [ ] The regex pattern does not exhibit catastrophic backtracking (ReDoS).
      New and modified parsers are scanned by `recheck` in CI; if unsure, test
      pathological inputs at https://regex101.com/.
