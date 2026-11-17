// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

// .template/Test-FileHeaders.ps1 reads only script and C-family files, so the Astro components and the stylesheets,
// which carry the same two lines in their own comment syntax, are checked here.
const COPYRIGHT = 'Copyright © NCode Group';
const LICENSE = 'SPDX-License-Identifier: Apache-2.0';
const root = join(import.meta.dirname, '..');

/** What is wrong with the first lines of the file at `path`, or undefined when they carry the header. */
function headerProblem(path, text) {
  const lines = text.split(/\r?\n/);
  if (path.endsWith('.astro')) {
    if (lines[0] !== '---' || lines[1] !== `// ${COPYRIGHT}` || lines[2] !== `// ${LICENSE}`) {
      return `${path}: lines 2 and 3, right after the opening ---, must be "// ${COPYRIGHT}" and "// ${LICENSE}"`;
    }
  } else if (lines[0] !== `/* ${COPYRIGHT} */` || lines[1] !== `/* ${LICENSE} */`) {
    return `${path}: lines 1 and 2 must be "/* ${COPYRIGHT} */" and "/* ${LICENSE} */"`;
  }
  return undefined;
}

describe('the source file headers', () => {
  it('are in every Astro component and stylesheet', () => {
    // vendor/ holds copies, which keep their source's lines, and fixture/ is a library's content.
    const files = execFileSync('git', ['ls-files', '--', '*.astro', '*.css'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((path) => path && !path.startsWith('vendor/') && !path.startsWith('fixture/'));
    assert.ok(files.length > 0, 'git ls-files found no Astro component or stylesheet');
    const problems = files.map((path) => headerProblem(path, readFileSync(join(root, path), 'utf8')));
    assert.deepEqual(problems.filter(Boolean), []);
  });

  it('fail a component or a stylesheet without them', () => {
    assert.match(headerProblem('a.astro', '---\nconst a = 1;\n---\n'), /^a\.astro: lines 2 and 3/);
    assert.match(headerProblem('a.css', ':root {}\n'), /^a\.css: lines 1 and 2/);
    assert.equal(headerProblem('a.astro', `---\n// ${COPYRIGHT}\n// ${LICENSE}\n---\n`), undefined);
    assert.equal(headerProblem('a.css', `/* ${COPYRIGHT} */\n/* ${LICENSE} */\n`), undefined);
  });
});
