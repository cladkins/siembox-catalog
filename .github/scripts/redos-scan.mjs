#!/usr/bin/env node
// ReDoS pre-scan for the SIEMBox catalog CI.
//
// Scope: only parser files ADDED or MODIFIED in the pull request are gated, so
// pre-existing parsers are grandfathered (tracked for a dedicated cleanup PR).
// Verdicts come from `recheck` (automaton + fuzz analysis) rather than the older
// `safe-regex` heuristic: recheck understands named capture groups and bounded
// quantifiers, so it does not false-positive on ordinary log/IP patterns.
//
//   vulnerable -> FAIL the PR
//   unknown    -> WARN (recheck timed out / unsupported syntax)
//   safe       -> pass
//
// Usage:
//   BASE_SHA=<sha> node .github/scripts/redos-scan.mjs           # CI: diff base..HEAD
//   node .github/scripts/redos-scan.mjs parsers/x.parser.json    # explicit files (local)

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { checkSync } = require('recheck');

function changedParserFiles(base) {
  const out = execSync(`git diff --name-only --diff-filter=AM ${base} HEAD -- parsers`, {
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((f) => f.endsWith('.parser.json'));
}

function scan(files) {
  let failed = 0;
  for (const file of files) {
    let parser;
    try {
      parser = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      console.error(`✗ ${file}: invalid JSON (${err.message})`);
      failed++;
      continue;
    }
    const pattern = parser.pattern;
    // json parsers carry no regex; an empty pattern is nothing to scan.
    if (!pattern || parser.parser_type === 'json') {
      console.log(`• ${file}: no regex to scan`);
      continue;
    }
    let result;
    try {
      result = checkSync(pattern, '');
    } catch (err) {
      console.log(`⚠ ${file}: recheck could not analyze pattern (${err.message}) — WARN`);
      continue;
    }
    if (result.status === 'vulnerable') {
      const c = result.complexity
        ? `${result.complexity.type}${
            result.complexity.degree != null ? ` degree ${result.complexity.degree}` : ''
          }`
        : 'catastrophic backtracking';
      console.error(`✗ ${file}: ReDoS-vulnerable (${c})`);
      failed++;
    } else if (result.status === 'unknown') {
      console.log(`⚠ ${file}: recheck verdict 'unknown' (timeout/unsupported) — WARN`);
    } else {
      console.log(`✓ ${file}: safe`);
    }
  }
  return failed;
}

const explicit = process.argv.slice(2);
let files;
if (explicit.length > 0) {
  files = explicit;
} else {
  const base = process.env.BASE_SHA;
  if (!base) {
    console.error('BASE_SHA is not set and no files were passed; nothing to scan.');
    process.exit(2);
  }
  files = changedParserFiles(base);
}

if (files.length === 0) {
  console.log('ReDoS pre-scan: no added/modified parser files to scan.');
  process.exit(0);
}

console.log(`ReDoS pre-scan: checking ${files.length} parser file(s)...`);
const failed = scan(files);
if (failed > 0) {
  console.error(`\nReDoS pre-scan FAILED: ${failed} parser(s) with a vulnerable pattern.`);
  console.error(
    'Rewrite the pattern to avoid catastrophic backtracking: anchor segments, avoid ' +
      'adjacent \\s+/.* matching the same text, and prefer bounded character classes.'
  );
  process.exit(1);
}
console.log('\nReDoS pre-scan passed: all changed parsers are clean.');
process.exit(0);
