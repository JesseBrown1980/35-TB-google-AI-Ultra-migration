// Spine self-test for the 35TB cloud-store leg. No dependencies.
// Run: node --test test/spine.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

test('required spine files exist', () => {
  for (const f of ['README.md', 'MIGRATION-PLAN.md', '.gitignore']) {
    assert.ok(existsSync(join(ROOT, f)), `missing ${f}`);
  }
});

test('.gitignore blocks the critical secret patterns', () => {
  const gi = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  for (const pat of ['*.key', '*.pem', 'application_default_credentials.json', 'vault.', '.env']) {
    assert.ok(gi.includes(pat), `.gitignore missing pattern: ${pat}`);
  }
});

test('NO real secret VALUES are committed (public-repo safety)', () => {
  // patterns assembled from fragments so this scanner never self-triggers
  const patterns = [
    new RegExp('gh' + '[po]_' + '[A-Za-z0-9]{30,}'),       // github token
    new RegExp('AI' + 'za' + '[0-9A-Za-z_-]{30,}'),        // google api key
    new RegExp('AK' + 'IA' + '[0-9A-Z]{16}'),              // aws access key
    new RegExp('ya' + '29\\.' + '[A-Za-z0-9_-]{20,}'),     // google oauth token
    new RegExp('-----' + 'BEGIN [A-Z ]*PRIVATE KEY'),      // private key block
    new RegExp('plasmatoid' + '@'),                        // operator personal email
  ];
  const offenders = [];
  for (const file of walk(ROOT)) {
    if (file.endsWith('spine.test.mjs')) continue;         // don't scan the scanner
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    for (const re of patterns) {
      if (re.test(text)) offenders.push(`${relative(ROOT, file)} :: ${re.source}`);
    }
  }
  assert.deepEqual(offenders, [], `secret values found: ${offenders.join(' | ')}`);
});
