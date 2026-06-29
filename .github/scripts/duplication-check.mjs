#!/usr/bin/env node
// Duplicate-submission guard for the SIEMBox catalog.
//
// Fails CI if two parsers share a `name` (the upsert key on import), or if two
// detections share a `name` or a filename — i.e. a submission that would clobber
// or shadow an existing entry. Matching is case-insensitive.
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

let failures = 0;

// entries: [{ file, key }] — report any key shared by 2+ files (case-insensitive).
function checkUnique(label, entries) {
  const seen = new Map();
  for (const { file, key } of entries) {
    if (key == null || String(key).trim() === '') continue;
    const norm = String(key).trim().toLowerCase();
    if (!seen.has(norm)) seen.set(norm, []);
    seen.get(norm).push({ file, key });
  }
  for (const group of seen.values()) {
    if (group.length > 1) {
      failures++;
      console.error(`✗ duplicate ${label}: ${JSON.stringify(group[0].key)}`);
      for (const g of group) console.error(`    ${g.file}`);
    }
  }
}

// Parsers — unique `name`.
const parsers = walk(join(ROOT, 'parsers'), '.parser.json').map((f) => {
  let name;
  try { name = JSON.parse(readFileSync(f, 'utf8')).name; }
  catch (e) { console.error(`✗ ${rel(f)}: invalid JSON (${e.message})`); failures++; }
  return { file: rel(f), key: name };
});
checkUnique('parser name', parsers);

// Detections — unique `name` and unique filename (catches duplicate rule IDs).
const detFiles = walk(join(ROOT, 'detections'), '.yaml');
const detNames = [];
const detBasenames = [];
for (const f of detFiles) {
  let name;
  try { name = (yaml.load(readFileSync(f, 'utf8')) || {}).name; }
  catch (e) { console.error(`✗ ${rel(f)}: invalid YAML (${e.message})`); failures++; }
  detNames.push({ file: rel(f), key: name });
  detBasenames.push({ file: rel(f), key: f.split('/').pop().replace(/\.yaml$/, '') });
}
checkUnique('detection name', detNames);
checkUnique('detection filename', detBasenames);

if (failures) {
  console.error(`\nDuplication check FAILED: ${failures} issue(s). Each parser/detection must be uniquely named.`);
  process.exit(1);
}
console.log(`Duplication check passed: ${parsers.length} parsers, ${detFiles.length} detections — no duplicates.`);
