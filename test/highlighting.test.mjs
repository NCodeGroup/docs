// Guards the C# 14 extension-block grammar patch against a Shiki update: the patched grammar scopes
// an extension block as a declaration, one version of Shiki is locked, and a built page shows it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createHighlighter } from 'shiki';
import csharp from 'shiki/langs/csharp.mjs';
import { withExtensionBlocks } from '../src/highlighting/csharp-extension-blocks.mjs';
import { build, root } from './helpers.mjs';

const code = `public static class BufferExtensions
{
    extension<T>(Span<T> span)
        where T : unmanaged
    {
        public SecureSpanLifetime<T> GetSecureLifetime() => new(span);
    }

    extension(CryptographicOperations)
    {
        public static void ZeroMemory<T>(Span<T> buffer) where T : unmanaged { }
    }
}`;

test('C# 14 extension blocks are highlighted as declarations', async () => {
  const highlighter = await createHighlighter({ themes: ['github-dark'], langs: withExtensionBlocks(csharp) });
  const tokens = highlighter
    .codeToTokensBase(code, { lang: 'cs', theme: 'github-dark', includeExplanation: true })
    .flat()
    .flatMap((token) => token.explanation)
    .map((part) => [part.content.trim(), part.scopes.at(-1).scopeName]);
  const scopesOf = (text) => tokens.filter(([content]) => content === text).map(([, scope]) => scope);

  assert.deepEqual(scopesOf('extension'), ['storage.type.extension.cs', 'storage.type.extension.cs']);
  assert.deepEqual(scopesOf('public'), [
    'storage.modifier.public.cs',
    'storage.modifier.public.cs',
    'storage.modifier.public.cs',
  ]);
  assert.deepEqual(scopesOf('CryptographicOperations'), ['entity.name.type.cs']);
  assert.deepEqual(scopesOf('span').slice(0, 1), ['entity.name.variable.parameter.cs']);
  assert.deepEqual(scopesOf('where'), ['storage.modifier.where.cs', 'storage.modifier.where.cs']);
  assert.ok(scopesOf('}').every((scope) => scope === 'punctuation.curlybrace.close.cs'));
  highlighter.dispose();
});

test('one version of shiki is locked: the grammar is patched for the highlighter that uses it', () => {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const versions = Object.entries(lock.packages)
    .filter(([path]) => path === 'node_modules/shiki' || path.endsWith('/node_modules/shiki'))
    .map(([, entry]) => entry.version);
  assert.deepEqual(
    [...new Set(versions)],
    [JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies.shiki],
  );
});

test('a built page colours the members of an extension block', () => {
  const result = build('highlighting');
  assert.equal(result.code, 0, result.output);
  const html = readFileSync(join(result.out, 'guides/extension-members/index.html'), 'utf8');
  // "extension" and the "public" inside the block are keywords: lit, as "static class" is outside it.
  assert.match(html, /<span style="--0:var\(--color-screen-lit\)">extension<\/span>/);
  assert.match(
    html,
    /<span style="--0:var\(--color-screen-lit\)">public<\/span><span[^>]*> <\/span><span style="--0:var\(--color-screen-lit\)">void<\/span>/,
  );
  assert.match(html, /<span style="--0:var\(--color-on-screen\)">CopyTo<\/span>/);
});
