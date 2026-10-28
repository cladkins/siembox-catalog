# Contributing

Thanks for improving SIEMBox's detection coverage! This catalog holds five kinds
of contribution, all **data, not code**:

- a **parser** — teaches SIEMBox to read a new log source and emit canonical fields;
- a **detection rule** — fires an alert when those canonical fields match a threat pattern;
- a **content pack** — bundles the parsers, detections and SigmaHQ rules for one
  technology, with a setup guide, so it installs in one click;
- an **application signature** — teaches Application Monitoring to recognize
  one application from the evidence SIEMBox already has;
- a **suggested scan** — a ready-made scheduled scan or endpoint scan policy
  SIEMBox offers in one click (options and timing; the user adds the targets).

All are gated by the **`validate-catalog`** CI check, which builds the validator
from [SIEMBox](https://github.com/cladkins/siembox) and runs it against your
change. If it's green here, it imports into SIEMBox and behaves identically. Pick
the section below for what you're adding.

## How to submit

1. **Fork** this repository and clone your fork.
2. Create a branch for your change.
3. Add your `parsers/<name>.parser.json`, `detections/<category>/<name>.yaml`, `packs/<id>.pack.yaml`, `applications/<id>.app.yaml` or `scans/<id>.scan.yaml`.
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

## Contributing a content pack

A pack is what the SIEMBox **Content Packs** page shows for one technology
(Reverse Proxy & Web, Linux & Infrastructure, ...). It **references** content,
it does not copy it: catalog parsers by name, catalog detections by category,
tag or exact name, and [SigmaHQ](https://github.com/SigmaHQ/sigma) rules by their
Sigma `id`. Installing the pack in SIEMBox installs each item through its normal
path (Sigma rules through SIEMBox's SigmaHQ library) and turns the detections on.

### File format

`packs/<id>.pack.yaml` (editor schema: `schema/pack.schema.json`):

```yaml
schema: siembox.pack/v1
id: reverse-proxy                  # kebab-case; the file name without .pack.yaml
name: Reverse Proxy & Web
description: nginx / Traefik / Caddy access + error logs with ...
icon: Connection                   # Box, Connection, DataLine, Files, House, Key, Lock,
                                   # Monitor, Share, VideoPlay, Cpu, Cloudy, Message
version: 2                         # bump whenever parsers, detections or sigma change
parsers: [traefik-access, caddy-access]
detections:
  categories: [reverse-proxy]      # detections/<category>/
  tags: []                         # a tag on the rule
  names: []                        # a rule's exact name
sigma:
  - id: 65354b83-a2ea-4ea6-8414-3ab38be0d409
    title: Cross Site Scripting Strings
setup:                             # 1-20 steps, shown before install
  - title: Ship the logs
    text: |                        # markdown, at most 4000 characters
      Add a **File** source on a SIEMBox log shipper ...
    code: |                        # optional, shown verbatim
      volumes:
        - /var/log/nginx:/var/log/nginx:ro
    code_language: yaml
```

### Rules for packs

- **Version.** Start at 1 and bump `version` whenever the item lists change.
  SIEMBox records the version and items of each install; the next time the
  catalog has more, the pack shows **What's new** with exactly the added items
  and an **Install what's new** button.
- **References must resolve.** Every parser name, detection category, tag and
  name must exist in this catalog; CI checks.
- **Sigma rules.** List only rules SIEMBox can run: the converter handles them
  (Detection Rules → SigmaHQ lists them as convertible), the regex safety gate
  accepts them, and the pack's parsers emit their fields (the library's
  *compatible* view with the pack's parsers installed). Copy the title next to
  the id. Sigma rules are under the Detection Rule License 1.1; SIEMBox keeps the
  attribution on each installed rule.
- **Setup guide.** Write it for someone setting the source up for the first
  time: which log or container, where it lives, a shipper or compose snippet in
  `code`, and how to check that events arrive. Markdown only: no raw HTML, no
  images, and links must be http(s), mailto or relative. Put placeholders such
  as `<host>` in `code`, or in backticks. At most 20 steps, 20000 characters.

## Contributing an application signature

A signature is how SIEMBox's **Application Monitoring** recognizes one
application. It matches evidence SIEMBox already stores, so write each matcher
for the shape that evidence really has (the examples below are real shapes).
SIEMBox's **Not identified** tab has a **Suggest signature** link that opens a
pre-filled file here for a program name, image or user agent nothing matches.

### File format

`applications/<id>.app.yaml`:

```yaml
schema: siembox.app/v1
id: plex                            # kebab-case; the file name without .app.yaml
name: Plex Media Server
vendor: Plex
category: media-server              # see the list below
description: Media server for movies, TV and music.
website: https://www.plex.tv        # optional
cpe: { vendor: plex, product: media_server }   # optional; helps link vulnerabilities
supersedes: []                      # optional: ids this one wins over on the same evidence
match:                              # one or more of:
  syslog_program: [plex, plexmediaserver]      # the syslog TAG, exact, case-insensitive; "postfix/*" = postfix/<anything>
  parser: [plex]                               # catalog parser names (must exist in parsers/)
  service:                                     # nmap services on an asset
    names: [postgresql]                        #   nmap service names (product-specific only: not ssh/http)
    banner: ['^OpenSSH[_ ](\d+\.\d+(?:p\d+)?)']  #   regexes on a product banner; group 1 = version
  container_image: [plexinc/pms-docker, linuxserver/plex, '*/linuxserver/plex']  # image globs, no tag
  package: [plexmediaserver]                   # package names in endpoint (grype) findings
  user_agent: ['^PlexMediaServer/(\d+(?:\.\d+)+)']  # regexes on the user agent; group 1 = version
  dns: [plex.tv, plex.direct]                  # "x.y" = x.y and its subdomains; "*.x.y" = subdomains only
  os: { family: linux, pretty_name: '^Ubuntu (\d+\.\d+)' }  # endpoint OS: GOOS + /etc/os-release PRETTY_NAME
tests:                              # at least one matching test per matcher kind
  - source: container_image
    input: 'lscr.io/linuxserver/plex:1.40.0.7998-c29d4c0c8-ls210'
    version: '1.40.0.7998'          # expected version (omit: not checked; null: none)
  - source: user_agent
    input: 'PlexMediaServer/1.40.0.7998-c29d4c0c8'
    version: '1.40.0.7998'
  - source: user_agent
    input: 'curl/8.0'
    match: false                    # a negative test: must NOT be this app
```

Categories: `auth`, `automation`, `backup`, `browser`, `container-runtime`,
`database`, `dev-tools`, `dns`, `file-sharing`, `game`, `home-automation`,
`http-client`, `mail`, `media-server`, `messaging`, `monitoring`, `network`,
`operating-system`, `os-component`, `password-manager`, `productivity`,
`remote-access`, `reverse-proxy`, `saas`, `security`, `virtualization`, `vpn`,
`web-server`. Service tests take `input: { name, banner, version }`; OS tests
`input: { family, pretty_name }`.

### Rules for signatures

- **Real shapes.** `syslog_program` is the TAG as SIEMBox stores it, without
  the `[pid]` (`sshd`, `postfix/smtpd`, `Authentik Server`). Container images are
  what `docker ps` shows (`lscr.io/linuxserver/plex:1.40.0`); the tag is the
  version when it starts with a number, and `docker.io/library/` is folded
  away. User agents come from web/proxy access logs. DNS names come from DNS
  logs (Pi-hole), lower case.
- **Claim only what is yours.** A value (a program name, an image glob, a
  package, a domain, a regex) may belong to one signature only; CI checks. Do not
  claim generic names (`ssh`, `http`, `python`, `google.com`).
- **Regexes.** Plain JavaScript, no flags, at most one capture group (the
  version; use `(?:...)` for the rest), no named groups or backreferences, and
  they must pass the ReDoS check (the same one parsers and rules go through).
  Anchor where you can (`^curl/`), use `\b` before a product token.
- **Tests prove it.** Each matcher kind needs a matching test with a real
  (redacted) value; add a `match: false` test when your matcher could catch a
  neighbour (Chrome vs Edge). Tests run against the whole catalog, so a test
  also fails if another signature takes the evidence instead.

## Contributing a suggested scan

A suggested scan is a ready-made scan SIEMBox offers on its **Scheduled Scans**
page (**Suggested scans**) and in the Endpoints page's scan policies card
(**Suggested policies**). **Add** creates it **disabled**, with its options and
its schedule in the user's own time zone; the user then fills in the targets
and enables it. So a suggestion is everything about a scan except *what* to
scan.

### File format

`scans/<id>.scan.yaml`:

```yaml
schema: siembox.scan/v1
id: vuln-exposed-panels-weekly     # kebab-case; the file name without .scan.yaml
name: Weekly exposed admin panel check
kind: vulnerability                # asset | vulnerability | container | log_discovery | endpoint_policy
category: exposure                 # see the list below
tags: [nuclei, panel, exposure]    # optional, kebab-case
description: >-                    # what it does (up to 500 characters)
  Finds login and admin panels with the Nuclei panel templates, once a week.
why: >-                            # when and why to use it (up to 1000)
  An admin panel reachable from the wrong network is a common way in.
intrusive: false                   # true: it logs in, sends payloads, fuzzes or can disrupt
# intrusive_note: ...              # required when intrusive: true
load: light                        # light | moderate | heavy
schedule:                          # calendar timing, WITHOUT a timezone (the user's is used)
  frequency: weekly                # hourly (minute, every_hours) | daily (time) |
  days: [1]                        # weekly (days 0=Sun..6, time) | monthly (day_of_month, time)
  time: "05:00"                    # quote times
options:                           # the scan's options, WITHOUT targets
  templateSelection:
    tags: [panel]
    excludeTags: [intrusive, dos, fuzz]
  rateLimit: 100
inputs:                            # what the user fills in after adding it
  - field: target
    label: Host or range
    hint: A host or CIDR range you own.
  - field: shipper
    label: Run from
    hint: A log shipper on that network, if SIEMBox cannot reach it.
```

Per kind:

| `kind` | `options` | `inputs` (* = required) |
|---|---|---|
| `asset` (Nmap) | `scanType`: `ping`, `port`, `service`, `os` | `targets`*, `shipper` |
| `vulnerability` (Nuclei) | `templateSelection` (`all`, `cves`, `tags`, `templates` (ids or `<dir>/`), `severities`, `excludeTags`, `exclude`), `rateLimit`, `timeout` (ms) | `target`*, `shipper` |
| `container` (Trivy) | `all_images: true`, or nothing (one image) | `image_ref`* (unless `all_images`) |
| `log_discovery` | `mode`: `passive`, `active`, `full` | `cidrs` (empty = the saved Log Discovery scope), `shipper` |
| `endpoint_policy` | `scans`: an entry for each of `vuln`, `yara`, `packages`, `inventory`: `{ enabled, schedule \| interval_minutes, window? }`; schedules and windows (`start`, `end`) without a timezone; no top-level `schedule` | `endpoints`* |

Categories: `inventory`, `services`, `cves`, `exposure`, `misconfiguration`,
`credentials`, `tls`, `dns`, `containers`, `log-sources`, `endpoints`.

### Rules for suggested scans

- **Never a target.** No `targets`, `target`, `image_ref`, CIDRs or shipper ids
  in `options`, no IP address, CIDR or host name anywhere in `options` or
  `inputs`, and no IP address or CIDR in any other text. Describe what to fill
  in under `inputs` instead ("your LAN subnets in CIDR form").
- **Non-intrusive by default.** A Nuclei selection is intrusive when it runs
  all templates, selects an intrusive tag (`intrusive`, `dos`, `fuzz`,
  `bruteforce`, `default-login`), or does not exclude `intrusive`, `dos` and
  `fuzz`. Such a suggestion must say `intrusive: true` and explain the risk in
  `intrusive_note`; SIEMBox marks it and asks before adding it.
- **A schedule that fits the load.** Light scans can run daily or hourly; heavy
  ones belong at night, weekly or monthly. The user's time zone is applied when
  they add it, so write times as local wall-clock times.
- **Options SIEMBox accepts.** The validator runs the options through the same
  checks the Scheduled Scans and scan-policy APIs apply, and the schedule
  through the same calendar rules. A tag that is not a common nuclei-templates
  tag is a warning: check it exists.

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

# packs: schema, references (finds ../parsers and ../detections), guide markdown
npm run validate-packs -- /path/to/siembox-catalog/packs

# application signatures: schema, ReDoS, tests against the whole set (finds ../parsers)
npm run validate-applications -- /path/to/siembox-catalog/applications

# suggested scans: schema, schedules, options, no concrete targets, intrusiveness
npm run validate-scans -- /path/to/siembox-catalog/scans
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

**For a content pack:**

- [ ] `packs/<id>.pack.yaml`, `id` matching the file name.
- [ ] `version` bumped if parsers, detections or sigma changed.
- [ ] Sigma rules are convertible, accepted by the regex gate, and fit the pack's parsers.
- [ ] The setup guide says where the logs are, how to ship them, and how to check they arrive.

**For an application signature:**

- [ ] `applications/<id>.app.yaml`, `id` matching the file name.
- [ ] Matchers written for real data shapes; nothing generic claimed.
- [ ] A matching test per matcher kind (real, redacted values), plus `match: false` tests for near neighbours.

**For a suggested scan:**

- [ ] `scans/<id>.scan.yaml`, `id` matching the file name.
- [ ] No target anywhere: what to scan is listed under `inputs`.
- [ ] Intrusive selections say `intrusive: true` with an `intrusive_note`; the rest exclude `intrusive`, `dos` and `fuzz`.
- [ ] The schedule suits the scan's load.

**All:**

- [ ] The **`validate-catalog`** CI check is green.
