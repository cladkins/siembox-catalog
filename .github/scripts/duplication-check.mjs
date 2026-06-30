#!/usr/bin/env node
// Duplicate-submission guard for the SIEMBox catalog.
//
// Fails CI if a submission duplicates an existing entry by NAME or by CONTENT:
//   - parsers: same `name` (the upsert key on import), OR identical functional
//     content (parser_type + pattern + field_mappings + derivations).
//   - detections: same `name`, same filename, OR identical match logic
//     (conditions + aggregation).
//
// Name/filename matching is case-insensitive. Content matching ignores cosmetic
// fields (description, metadata, priority, event_type, test_samples, alert text)
// so it catches "a differently-named copy that does the same thing". Note: two
// parsers with the same pattern but different field_mappings (e.g. a different
// `service` label) are NOT duplicates — they produce different output.
//
// Usage: node .github/scripts/duplication-check.mjs [catalogRoot=.]

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const ROOT = process.argv[2] || '.';
const rel = (f) => f.replace(ROOT.replace(/\/$/, '') + '/', '');

function walk(dir, ext, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; } // dir may not exist
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (e.endsWith(ext)) out.push(p);
  }
  return out;
}

// Deterministic fingerprint: sort object keys recursively; preserve array order.
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) o[k] = canon(v[k]);
    return o;
  }
  return v;
}
const fp = (v) => JSON.stringify(canon(v));

let failures = 0;

// entries: [{ file, key }]; flag any key shared by 2+ files.
function flagDuplicates(kind, entries, { ci = false, showKey = true } = {}) {
  const seen = new Map();
  for (const { file, key } of entries) {
    if (key == null || String(key).trim() === '') continue;
    const norm = ci ? String(key).trim().toLowerCase() : String(key);
    if (!seen.has(norm)) seen.set(norm, []);
    seen.get(norm).push({ file, key });
  }
  for (const group of seen.values()) {
    if (group.length > 1) {
      failures++;
      console.error(`✗ duplicate ${kind}${showKey ? `: ${JSON.stringify(group[0].key)}` : ''}`);
      for (const g of group) console.error(`    ${g.file}`);
    }
  }
}

// ---- Parsers: unique name + unique functional content ----
const parsers = walk(join(ROOT, 'parsers'), '.parser.json').map((f) => {
  let d = {};
  try { d = JSON.parse(readFileSync(f, 'utf8')); }
  catch (e) { console.error(`✗ ${rel(f)}: invalid JSON (${e.message})`); failures++; }
  return { file: rel(f), d };
});
flagDuplicates('parser name', parsers.map((p) => ({ file: p.file, key: p.d.name })), { ci: true });
flagDuplicates(
  'parser content (same pattern, or same field_mappings+derivations for json)',
  parsers.map((p) => ({
    file: p.file,
    // Two regex/grok parsers with an identical pattern parse the same lines and
    // can't be routed apart by source, so they're duplicates regardless of the
    // labels they map to. json parsers have no pattern → compare their mapping.
    key: p.d.pattern && String(p.d.pattern).trim() !== ''
      ? 'pattern:' + p.d.pattern
      : 'json:' + fp({ field_mappings: p.d.field_mappings, derivations: p.d.derivations || [] }),
  })),
  { showKey: false }
);

// ---- Detections: unique name + filename + match logic ----
const detFiles = walk(join(ROOT, 'detections'), '.yaml');
const dets = detFiles.map((f) => {
  let d = {};
  try { d = yaml.load(readFileSync(f, 'utf8')) || {}; }
  catch (e) { console.error(`✗ ${rel(f)}: invalid YAML (${e.message})`); failures++; }
  return { file: rel(f), base: f.split('/').pop().replace(/\.yaml$/, ''), d };
});
flagDuplicates('detection name', dets.map((x) => ({ file: x.file, key: x.d.name })), { ci: true });
flagDuplicates('detection filename', dets.map((x) => ({ file: x.file, key: x.base })), { ci: true });
flagDuplicates(
  'detection logic (identical conditions + aggregation)',
  dets.map((x) => ({ file: x.file, key: fp({ conditions: x.d.conditions || [], aggregation: x.d.aggregation || null }) })),
  { showKey: false }
);

if (failures) {
  console.error(`\nDuplication check FAILED: ${failures} issue(s). Each parser/detection must be unique in name and behavior.`);
  process.exit(1);
}
console.log(`Duplication check passed: ${parsers.length} parsers, ${detFiles.length} detections — no name or content duplicates.`);
