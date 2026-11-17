// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

// .template/Test-FileHeaders.ps1 reads only script and C-family files and skips .d.ts files, which are often generated,
// so the Astro components, the stylesheets and the hand-written .d.ts files are checked here.
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
  } else if (path.endsWith('.d.ts')) {
    if (lines[0] !== `// ${COPYRIGHT}` || lines[1] !== `// ${LICENSE}`) {
      return `${path}: lines 1 and 2 must be "// ${COPYRIGHT}" and "// ${LICENSE}"`;
    }
  } else if (lines[0] !== `/* ${COPYRIGHT} */` || lines[1] !== `/* ${LICENSE} */`) {
    return `${path}: lines 1 and 2 must be "/* ${COPYRIGHT} */" and "/* ${LICENSE} */"`;
  }
  return undefined;
}

describe('the source file headers', () => {
  it('are in every Astro component, stylesheet and .d.ts file', () => {
    // vendor/ holds copies, which keep their source's lines, and fixture/ is a library's content.
    const files = execFileSync('git', ['ls-files', '--', '*.astro', '*.css', '*.d.ts'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((path) => path && !path.startsWith('vendor/') && !path.startsWith('fixture/'));
    assert.ok(files.length > 0, 'git ls-files found no Astro component, stylesheet or .d.ts file');
    const problems = files.map((path) => headerProblem(path, readFileSync(join(root, path), 'utf8')));
    assert.deepEqual(problems.filter(Boolean), []);
  });

  it('fail a component, a stylesheet or a .d.ts file without them', () => {
    assert.match(headerProblem('a.astro', '---\nconst a = 1;\n---\n'), /^a\.astro: lines 2 and 3/);
    assert.match(headerProblem('a.css', ':root {}\n'), /^a\.css: lines 1 and 2/);
    assert.match(headerProblem('a.d.ts', 'declare const a: number;\n'), /^a\.d\.ts: lines 1 and 2/);
    // Each line on its own: a check that stops comparing one of them fails here.
    assert.match(headerProblem('a.astro', `---\n// ${COPYRIGHT}\nconst a = 1;\n---\n`), /^a\.astro: lines 2 and 3/);
    assert.match(headerProblem('a.astro', `---\nconst a = 1;\n// ${LICENSE}\n---\n`), /^a\.astro: lines 2 and 3/);
    assert.match(headerProblem('a.astro', `// ${COPYRIGHT}\n// ${LICENSE}\n---\n---\n`), /^a\.astro: lines 2 and 3/);
    assert.match(headerProblem('a.css', `/* ${COPYRIGHT} */\n:root {}\n`), /^a\.css: lines 1 and 2/);
    assert.match(headerProblem('a.css', `:root {}\n/* ${LICENSE} */\n`), /^a\.css: lines 1 and 2/);
    assert.match(headerProblem('a.d.ts', `// ${COPYRIGHT}\ndeclare const a: number;\n`), /^a\.d\.ts: lines 1 and 2/);
    assert.match(headerProblem('a.d.ts', `declare const a: number;\n// ${LICENSE}\n`), /^a\.d\.ts: lines 1 and 2/);
    assert.equal(headerProblem('a.astro', `---\n// ${COPYRIGHT}\n// ${LICENSE}\n---\n`), undefined);
    assert.equal(headerProblem('a.css', `/* ${COPYRIGHT} */\n/* ${LICENSE} */\n`), undefined);
    assert.equal(headerProblem('a.d.ts', `// ${COPYRIGHT}\n// ${LICENSE}\n`), undefined);
  });
});
