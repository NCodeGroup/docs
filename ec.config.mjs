// @ts-check
// Code blocks are "screens": a deep field of the brand hue with lit values on it, the same in the
// light and the dark theme. Expressive Code reads this file by itself, here and for the <Code>
// component, because a grammar and a theme are objects an Astro config cannot carry.
import { defineEcConfig } from '@astrojs/starlight/expressive-code';
import csharp from 'shiki/langs/csharp.mjs';
import { withExtensionBlocks } from './src/highlighting/csharp-extension-blocks.mjs';

// Every colour is a token of vendor/instrument/tokens.css, written as a CSS variable: Expressive Code
// passes a colour through to the page as it is, so the brand's stylesheet decides it, and a new
// token file recolours every code block with no change here. That is also why the contrast
// correction is off below: it needs colours it can compute with, and the tokens are already measured
// against the screen (6 to 1 or better).
const token = (name) => `var(--color-${name})`;

/** The one syntax theme: one hue lit to different levels, and amber kept for literal values. */
const screen = {
  name: 'instrument-screen',
  type: 'dark',
  // The two colours a theme must state as numbers. Neither reaches a page: codeBackground and
  // codeForeground below replace them, and the first rule colours every piece of code.
  colors: { 'editor.background': '#0A1F5C', 'editor.foreground': '#C3D2FF' },
  tokenColors: [
    { scope: ['source', 'text'], settings: { foreground: token('on-screen-secondary') } },
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
      settings: { foreground: token('on-screen-muted') },
    },
    {
      scope: [
        'keyword',
        'storage',
        'storage.type',
        'storage.modifier',
        'keyword.operator.new',
        'keyword.operator.expression',
        'variable.language',
        'constant.language.null',
      ],
      settings: { foreground: token('screen-lit') },
    },
    {
      scope: [
        'entity.name.type',
        'entity.name.class',
        'entity.name.function',
        'entity.name.tag',
        'support.type',
        'support.class',
        'support.function',
        'meta.function-call.generic',
      ],
      settings: { foreground: token('on-screen') },
    },
    {
      scope: [
        'constant.numeric',
        'constant.language.boolean',
        'constant.language',
        'constant.character',
        'string',
        'string.quoted',
        'punctuation.definition.string',
      ],
      settings: { foreground: token('screen-hot') },
    },
    { scope: ['entity.other.attribute-name'], settings: { foreground: token('screen-lit') } },
    // A command's arguments are not literal values.
    { scope: ['string.unquoted', 'source.shell string.unquoted'], settings: { foreground: token('on-screen') } },
  ],
};

export default defineEcConfig({
  themes: [screen],
  // One theme for both modes, so there is nothing for Starlight's theme switch to choose between,
  // and the frame takes its colours from the overrides below, not from Starlight's page colours.
  useStarlightDarkModeSwitch: false,
  useStarlightUiThemeColors: false,
  minSyntaxHighlightingColorContrast: 0,
  useThemedScrollbars: false,
  shiki: {
    // Shiki's bundled C# grammar has no rule for C# 14 extension blocks, and neither does its
    // upstream: this adds one. The patched grammar also answers to `cs` and `c#`.
    langs: withExtensionBlocks(csharp),
  },
  styleOverrides: {
    borderRadius: 'var(--radius-panel)',
    borderWidth: '0px',
    borderColor: 'transparent',
    codeBackground: token('screen'),
    codeForeground: token('on-screen-secondary'),
    codeFontFamily: 'var(--font-mono)',
    codeFontSize: 'var(--text-sm)',
    codeLineHeight: '1.7',
    codePaddingBlock: '0.875rem',
    codePaddingInline: '1.125rem',
    codeSelectionBackground: 'color-mix(in srgb, var(--color-screen-lit) 40%, transparent)',
    uiFontFamily: 'var(--font-mono)',
    uiFontSize: 'var(--text-xs)',
    uiSelectionBackground: 'color-mix(in srgb, var(--color-screen-lit) 40%, transparent)',
    uiSelectionForeground: token('on-screen'),
    focusBorder: token('screen-lit'),
    scrollbarThumbColor: token('screen-border'),
    scrollbarThumbHoverColor: token('screen-lit'),
    frames: {
      shadowColor: 'transparent',
      frameBoxShadowCssValue: 'none',
      editorBackground: token('screen'),
      editorTabBarBackground: token('screen'),
      editorTabBarBorderColor: 'transparent',
      editorTabBarBorderBottomColor: token('screen-border'),
      editorActiveTabBackground: 'transparent',
      editorActiveTabForeground: token('on-screen'),
      editorActiveTabBorderColor: 'transparent',
      editorActiveTabIndicatorTopColor: 'transparent',
      editorActiveTabIndicatorBottomColor: 'transparent',
      editorTabBorderRadius: '0px',
      terminalBackground: token('screen'),
      terminalTitlebarBackground: token('screen'),
      terminalTitlebarForeground: token('on-screen'),
      terminalTitlebarBorderBottomColor: token('screen-border'),
      terminalTitlebarDotsOpacity: '0',
      inlineButtonBackground: token('on-screen'),
      inlineButtonForeground: token('on-screen-secondary'),
      inlineButtonBorder: 'transparent',
      tooltipSuccessBackground: token('screen-lit'),
      tooltipSuccessForeground: token('screen'),
    },
    textMarkers: {
      lineMarkerAccentWidth: '3px',
      lineMarkerAccentMargin: '0px',
      markBackground: token('screen-raised'),
      markBorderColor: token('screen-lit'),
      insBackground: 'color-mix(in srgb, var(--green-500) 28%, transparent)',
      insBorderColor: 'var(--green-300)',
      delBackground: 'color-mix(in srgb, var(--red-500) 28%, transparent)',
      delBorderColor: 'var(--red-300)',
    },
  },
});
