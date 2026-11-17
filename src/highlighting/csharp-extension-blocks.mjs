// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// C# 14 extension blocks for Shiki's bundled "csharp" TextMate grammar.
//
// The grammar Shiki bundles (dotnet/csharp-tmLanguage, through microsoft/vscode and tm-grammars) has no rule
// for `extension<T>(Receiver receiver) where T : ... { members }`: it reads the header as a constructor or as
// plain text, and the members as statements. This module adds the missing rule, modelled on the rules the
// grammar has for `class`, `struct` and `union` declarations, and includes it wherever a type declaration may
// appear: a class body, a namespace body, and the top level of a snippet.
//
// Usage: pass `withExtensionBlocks(csharp)` as the site generator's Shiki `langs` option, where `csharp` is
// the default export of `shiki/langs/csharp.mjs`. The patched grammar keeps the name `csharp` and the aliases
// `cs` and `c#`, so it takes the place of the bundled grammar.

/** @typedef {import('shiki').LanguageRegistration} LanguageRegistration */

/**
 * The whole extension declaration: the `extension` keyword, an optional type parameter list, the receiver,
 * optional constraint clauses, then a body of ordinary members.
 * A type cannot be named `extension` in C# 14, so in a class body `extension(` is never a constructor.
 */
export const extensionDeclaration = {
  begin: '(?<![.@\\w])(extension)\\b(?=\\s*(?:<[^<>()]*>\\s*)?\\()',
  beginCaptures: { 1: { name: 'storage.type.extension.cs' } },
  end: '(?<=\\})|(?=;)',
  patterns: [
    { include: '#comment' },
    { include: '#preprocessor' },
    { include: '#type-parameter-list' },
    { include: '#extension-receiver' },
    { include: '#generic-constraints' },
    {
      begin: '\\{',
      beginCaptures: { 0: { name: 'punctuation.curlybrace.open.cs' } },
      end: '\\}',
      endCaptures: { 0: { name: 'punctuation.curlybrace.close.cs' } },
      patterns: [{ include: '#class-or-struct-members' }],
    },
  ],
};

/** The receiver: `(Type name)`, or `(Type)` for static members; attributes and ref, in and scoped allowed. */
export const extensionReceiver = {
  begin: '\\(',
  beginCaptures: { 0: { name: 'punctuation.parenthesis.open.cs' } },
  end: '\\)',
  endCaptures: { 0: { name: 'punctuation.parenthesis.close.cs' } },
  patterns: [
    { include: '#comment' },
    { include: '#attribute-section' },
    { match: '\\b(ref|readonly|in|scoped)\\b', name: 'storage.modifier.$1.cs' },
    { include: '#parameter' },
    { include: '#type' },
  ],
};

/** The rules of the bundled grammar that the two rules above include or extend. */
const requiredRules = [
  'type-declarations',
  'class-or-struct-members',
  'type-parameter-list',
  'generic-constraints',
  'parameter',
  'type',
  'comment',
  'preprocessor',
  'attribute-section',
];

/**
 * Returns the given Shiki language registrations with the C# grammar replaced by a copy that also understands
 * C# 14 extension blocks. Leaves a C# grammar that already has a rule for them untouched, and throws when a
 * rule this patch builds on is gone, so a Shiki update either keeps working or fails the build.
 *
 * @param {LanguageRegistration[]} languages The default export of `shiki/langs/csharp.mjs`.
 * @returns {LanguageRegistration[]}
 */
export function withExtensionBlocks(languages) {
  if (!languages.some((language) => language.scopeName === 'source.cs')) {
    throw new Error('withExtensionBlocks: no C# grammar (scope "source.cs") in the given languages.');
  }
  return languages.map((language) => {
    const repository = language.repository ?? {};
    if (language.scopeName !== 'source.cs' || Object.keys(repository).some((name) => name.includes('extension')))
      return language;
    for (const rule of requiredRules) {
      if (!repository[rule])
        throw new Error(
          `withExtensionBlocks: the C# grammar has no "${rule}" rule; review csharp-extension-blocks.mjs.`,
        );
    }
    const patched = structuredClone(language);
    patched.repository['extension-declaration'] = structuredClone(extensionDeclaration);
    patched.repository['extension-receiver'] = structuredClone(extensionReceiver);
    patched.repository['type-declarations'].patterns.unshift({ include: '#extension-declaration' });
    return patched;
  });
}
