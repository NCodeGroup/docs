// The vendored brand files are the files their manifest names, and the check notices an edit.
import assert from 'node:assert/strict';
import { appendFileSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { checkVendor } from '../scripts/check-vendor.mjs';
import { root, work } from './helpers.mjs';

describe('the vendored theme', () => {
  it('matches its manifest', () => {
    assert.deepEqual(checkVendor(join(root, 'vendor')), []);
  });

  it('fails the check when a vendored file was edited, added or removed', () => {
    const copy = join(work, 'vendor-copy');
    rmSync(copy, { recursive: true, force: true });
    cpSync(join(root, 'vendor'), copy, { recursive: true });
    assert.deepEqual(checkVendor(copy), []);

    appendFileSync(join(copy, 'instrument', 'tokens.css'), '\n:root { --brand: red; }\n');
    writeFileSync(join(copy, 'instrument', 'extra.css'), '');
    rmSync(join(copy, 'instrument', 'fonts.css'));
    const problems = checkVendor(copy).join('\n');
    assert.match(problems, /vendor\/instrument\/tokens\.css: was edited/);
    assert.match(problems, /vendor\/instrument\/extra\.css: not named in manifest\.json/);
    assert.match(problems, /vendor\/instrument\/fonts\.css: named in manifest\.json, but the file is missing/);
  });
});
