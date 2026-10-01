#!/usr/bin/env node
// Consolidation advisor for the SIEMBox catalog.
//
// Complements duplication-check.mjs (which FAILS CI on exact / functionally
// identical entries). This one is ADVISORY: it finds entries that are SIMILAR
// but not identical — candidates a maintainer might merge into one — scores
// each cluster, and prints a Markdown report. It never fails the build.
//
// Similarity is heuristic and deterministic (no network, no LLM):
//   Parsers    — shared event_type, overlap of mapped canonical fields, tag
//                overlap, and overlap of LITERAL tokens in the regex pattern.
//                Pattern-token overlap is weighted highest because it separates
//                "same log FORMAT" (mergeable, e.g. nginx-access variants) from
//                merely "same domain" (nginx vs caddy — both http_request, but
//                different formats, so NOT mergeable).
//   Detections — overlap of full condition tuples (field+operator+value),
//                condition-field overlap, matching aggregation field, tag
//                overlap, and same category. Full-tuple overlap dominates so
//                rules that merely share one generic condition (e.g. every web
//                rule keys on event_type=http_request) don't get flagged, while
//                genuine near-twins (two SSH brute-force rules differing only in
//                threshold) do.
//
// Similar pairs are clustered transitively (A~B, B~C -> {A,B,C}) so a family of
// variants is reported as one group.
//
// Usage:
//   node .github/scripts/similarity-scan.mjs [catalogRoot=.] [--threshold=0.6] [--json]
//
// Acting on findings: parsers and detections are AUTHORED in cladkins/SIEMBOX
// (catalog/parsers + rules) and mirrored here — land any actual merge there,
// not in this repo (a change made only here surfaces as drift in the next sync).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const rawArgs = process.argv.slice(2);
const ROOT = rawArgs.find((a) => !a.startsWith('--')) || '.';
const THRESHOLD =
  Number((rawArgs.find((a) => a.startsWith('--threshold=')) || '').split('=')[1]) || 0.6;
const AS_JSON = rawArgs.includes('--json');
const rel = (f) => f.replace(ROOT.replace(/\/$/, '') + '/', '');

function walk(dir, ext, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // dir may not exist
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (e.endsWith(ext)) out.push(p);
  }
  return out;
}

function jaccard(a, b) {
  const A = a instanceof Set ? a : new Set(a);
  const B = b instanceof Set ? b : new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

// Literal, format-discriminating tokens from a regex pattern: alphanumeric runs
// >= 3 chars, with named-group headers and backslash escapes removed so field
// names and \d/\s noise don't inflate similarity. Generic structural words are
// dropped — they appear across unrelated formats and add no merge signal.
const PATTERN_STOPWORDS = new Set([
  'timestamp', 'host', 'hostname', 'message', 'msg', 'time', 'date', 'level',
]);
function patternTokens(pattern) {
  const stripped = String(pattern || '')
    .replace(/\(\?<[^>]+>/g, '(') // drop named-group headers
    .replace(/\\[a-zA-Z]/g, ' '); // drop \d \s \w etc.
  const toks = stripped.match(/[A-Za-z][A-Za-z0-9]{2,}/g) || [];
  return new Set(toks.map((t) => t.toLowerCase()).filter((t) => !PATTERN_STOPWORDS.has(t)));
}

function parserFeatures(p) {
  const fm = p.field_mappings || {};
  // field_mappings is {group: field}, but some seeded parsers wrote it reversed;
  // include both sides so field overlap is robust to direction.
  const fields = new Set(
    [...Object.keys(fm), ...Object.values(fm)].map((s) => String(s).toLowerCase())
  );
  const tags = new Set((p.metadata?.tags || []).map((s) => String(s).toLowerCase()));
  return {
    name: p.name,
    event_type: p.event_type || null,
    parser_type: p.parser_type || null,
    fields,
    tags,
    tokens: patternTokens(p.pattern),
  };
}

function parserSimilarity(a, b) {
  const eventTypeMatch = a.event_type && a.event_type === b.event_type ? 1 : 0;
  const fieldJ = jaccard(a.fields, b.fields);
  const tagJ = jaccard(a.tags, b.tags);
  const tokenJ = jaccard(a.tokens, b.tokens);
  const typeMatch = a.parser_type === b.parser_type ? 1 : 0;
  const score = 0.25 * eventTypeMatch + 0.2 * fieldJ + 0.1 * tagJ + 0.4 * tokenJ + 0.05 * typeMatch;
  const drivers = [];
  if (eventTypeMatch) drivers.push(`same event_type \`${a.event_type}\``);
  if (tokenJ >= 0.3) drivers.push(`${Math.round(tokenJ * 100)}% shared pattern tokens`);
  if (fieldJ >= 0.5) drivers.push(`${Math.round(fieldJ * 100)}% shared fields`);
  if (tagJ >= 0.5) drivers.push(`${Math.round(tagJ * 100)}% shared tags`);
  return { score, drivers };
}

// ---------------------------------------------------------------------------
// Detections
// ---------------------------------------------------------------------------

function normVal(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim().replace(/^["']|["']$/g, '').toLowerCase();
}

function detectionFeatures(r, file) {
  const conds = Array.isArray(r.conditions) ? r.conditions : [];
  const condFields = new Set(conds.map((c) => String(c.field).toLowerCase()));
  const condTuples = new Set(
    conds.map((c) => `${String(c.field).toLowerCase()}|${String(c.operator).toLowerCase()}|${normVal(c.value)}`)
  );
  const tags = new Set((Array.isArray(r.tags) ? r.tags : []).map((s) => String(s).toLowerCase()));
  const category = rel(file).split('/')[1] || ''; // detections/<category>/<file>
  return {
    name: r.name,
    condFields,
    condTuples,
    tags,
    category,
    aggField: r.aggregation?.field ? String(r.aggregation.field).toLowerCase() : null,
    severity: r.severity || null,
  };
}

function detectionSimilarity(a, b) {
  const tupleJ = jaccard(a.condTuples, b.condTuples);
  const fieldJ = jaccard(a.condFields, b.condFields);
  const aggMatch = a.aggField && a.aggField === b.aggField ? 1 : 0;
  const tagJ = jaccard(a.tags, b.tags);
  const catMatch = a.category && a.category === b.category ? 1 : 0;
  const score = 0.5 * tupleJ + 0.15 * fieldJ + 0.1 * aggMatch + 0.1 * tagJ + 0.15 * catMatch;
  const drivers = [];
  if (tupleJ >= 0.5) drivers.push(`${Math.round(tupleJ * 100)}% identical conditions`);
  else if (fieldJ >= 0.5) drivers.push(`${Math.round(fieldJ * 100)}% shared condition fields`);
  if (aggMatch) drivers.push(`same aggregation field \`${a.aggField}\``);
  if (tagJ >= 0.5) drivers.push(`${Math.round(tagJ * 100)}% shared tags`);
  if (catMatch) drivers.push(`same category \`${a.category}\``);
  return { score, drivers };
}

// ---------------------------------------------------------------------------
// Pairwise scan + transitive clustering (union-find)
// ---------------------------------------------------------------------------

function analyze(items, simFn) {
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const { score, drivers } = simFn(items[i].feat, items[j].feat);
      if (score >= THRESHOLD) {
        pairs.push({ a: i, b: j, score, drivers });
      }
    }
  }

  // Union-find to group transitively-similar items into clusters.
  const parent = items.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (x, y) => {
    parent[find(x)] = find(y);
  };
  for (const p of pairs) union(p.a, p.b);

  const groups = new Map();
  for (const p of pairs) {
    const root = find(p.a);
    if (!groups.has(root)) groups.set(root, { members: new Set(), pairs: [] });
    const g = groups.get(root);
    g.members.add(p.a);
    g.members.add(p.b);
    g.pairs.push(p);
  }

  return [...groups.values()]
    .map((g) => ({
      members: [...g.members].map((i) => items[i].feat.name),
      files: [...g.members].map((i) => rel(items[i].file)),
      maxScore: Math.max(...g.pairs.map((p) => p.score)),
      pairs: g.pairs
        .map((p) => ({
          a: items[p.a].feat.name,
          b: items[p.b].feat.name,
          score: p.score,
          drivers: p.drivers,
        }))
        .sort((x, y) => y.score - x.score),
    }))
    .sort((x, y) => y.maxScore - x.maxScore);
}

// ---------------------------------------------------------------------------
// Load catalog
// ---------------------------------------------------------------------------

function loadParsers() {
  const out = [];
  for (const file of walk(join(ROOT, 'parsers'), '.parser.json')) {
    try {
      const p = JSON.parse(readFileSync(file, 'utf8'));
      out.push({ file, feat: parserFeatures(p) });
    } catch {
      /* invalid file — duplication/validation CI reports these */
    }
  }
  return out;
}

function loadDetections() {
  const out = [];
  for (const file of walk(join(ROOT, 'detections'), '.yaml')) {
    try {
      const r = yaml.load(readFileSync(file, 'utf8'));
      if (r && typeof r === 'object') out.push({ file, feat: detectionFeatures(r, file) });
    } catch {
      /* invalid yaml — validation CI reports these */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function renderClusters(title, clusters) {
  let md = `## ${title}\n\n`;
  if (clusters.length === 0) {
    md += `_No consolidation candidates above ${Math.round(THRESHOLD * 100)}% similarity._\n\n`;
    return md;
  }
  for (const c of clusters) {
    md += `### ${c.members.join(' · ')}\n\n`;
    md += `Top similarity: **${Math.round(c.maxScore * 100)}%**\n\n`;
    for (const f of c.files) md += `- \`${f}\`\n`;
    md += `\n`;
    for (const p of c.pairs) {
      md += `- **${p.a}** ↔ **${p.b}** — ${Math.round(p.score * 100)}%`;
      if (p.drivers.length) md += ` (${p.drivers.join('; ')})`;
      md += `\n`;
    }
    md += `\n`;
  }
  return md;
}

const parsers = loadParsers();
const detections = loadDetections();
const parserClusters = analyze(parsers, parserSimilarity);
const detectionClusters = analyze(detections, detectionSimilarity);

if (AS_JSON) {
  process.stdout.write(
    JSON.stringify(
      { threshold: THRESHOLD, parsers: parserClusters, detections: detectionClusters },
      null,
      2
    ) + '\n'
  );
} else {
  const total = parserClusters.length + detectionClusters.length;
  let md = `# Catalog consolidation candidates\n\n`;
  md += `Advisory scan for **similar** parsers/detections that may be worth combining `;
  md += `(threshold ${Math.round(THRESHOLD * 100)}%). This does not fail CI — a human decides. `;
  md += `Exact duplicates are handled separately by \`duplication-check.mjs\`.\n\n`;
  md += `**${parsers.length}** parsers and **${detections.length}** detections scanned · `;
  md += `**${total}** candidate group(s) found.\n\n`;
  md += `> Parsers/detections are authored in [cladkins/SIEMBOX](https://github.com/cladkins/SIEMBOX) `;
  md += `(\`catalog/parsers\` + \`rules\`) and mirrored here — land any merge there, not in this repo.\n\n`;
  md += renderClusters('Parsers', parserClusters);
  md += renderClusters('Detections', detectionClusters);
  process.stdout.write(md);
}
