// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// @ts-check
// Code blocks are "screens": a deep field of the brand hue with lit values on it, the same in the
// light and the dark theme. Expressive Code reads this file by itself, here and for the <Code>
// component, because a grammar and a theme are objects an Astro config cannot carry.
import screen from './vendor/brand/syntax/instrument-screen.json' with { type: 'json' };
import { defineEcConfig } from '@astrojs/starlight/expressive-code';
import csharp from 'shiki/langs/csharp.mjs';
import { withExtensionBlocks } from './src/highlighting/csharp-extension-blocks.mjs';

// The syntax theme is the brand's, vendored: each of its colours is a token of vendor/brand/tokens/tokens.css,
// written as a CSS variable, and so is each colour of the frame below. Expressive Code passes a colour through to
// the page as it is, so the brand's stylesheet decides it, and a brand release recolours every code block with no
// change here. That is also why the contrast correction is off below: it needs colours it can compute with, and
// the brand holds each role at 4.5 to 1 or better on the screen.
const token = (name) => `var(--nc-color-${name})`;

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
    borderRadius: 'var(--nc-radius-panel)',
    borderWidth: '0px',
    borderColor: 'transparent',
    codeBackground: token('screen'),
    codeForeground: token('on-screen-secondary'),
    codeFontFamily: 'var(--nc-font-mono)',
    codeFontSize: 'var(--sl-text-code)',
    codeLineHeight: '1.7',
    codePaddingBlock: '0.875rem',
    codePaddingInline: '1.125rem',
    codeSelectionBackground: 'color-mix(in srgb, var(--nc-color-screen-lit) 40%, transparent)',
    uiFontFamily: 'var(--nc-font-mono)',
    uiFontSize: 'var(--sl-text-2xs)',
    uiSelectionBackground: 'color-mix(in srgb, var(--nc-color-screen-lit) 40%, transparent)',
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
      // An inserted or deleted line takes the success or danger colour's wash and mark: theme.css sets the screen
      // dark in both themes, so each is its dark theme's value there.
      insBackground: token('success-subtle'),
      insBorderColor: token('success-mark'),
      delBackground: token('danger-subtle'),
      delBorderColor: token('danger-mark'),
    },
  },
});
