// Copyright © NCode Group
// SPDX-License-Identifier: Apache-2.0

// A Chromium-based browser driven over its DevTools pipe (--remote-debugging-pipe), so the layout check needs
// no package and no download: the pipe is NUL-separated JSON on file descriptors 3 (commands) and 4 (replies
// and events), and the toolchain's dependencies stay as ADR-1005 sets them.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** How long a page may take to load, in milliseconds. */
const LOAD_TIMEOUT = 30_000;
/** How long the browser may take to exit after it is asked to close, in milliseconds. */
const CLOSE_TIMEOUT = 10_000;
/**
 * How long one DevTools command may take to answer, in milliseconds. A page's script that never settles is
 * caught by it.
 */
const COMMAND_TIMEOUT = 60_000;

/**
 * Starts the browser in a fresh profile folder. Rejects with a message naming the browser when it does not
 * start.
 *
 * @param {string} executable The path of a Chromium-based browser, or its command on PATH.
 * @param {{ commandTimeout?: number }} [options] commandTimeout: how long one command may take, COMMAND_TIMEOUT by
 *   default.
 * @returns {Promise<{ newPage: () => Promise<object>, close: () => Promise<void> }>}
 */
export async function launchBrowser(executable, { commandTimeout = COMMAND_TIMEOUT } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'ncode-layout-'));
  // Windows can hold the profile's files for a moment after the browser exits, so the removal retries.
  const removeProfile = () => rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  const flags = [
    '--headless',
    '--no-sandbox',
    '--hide-scrollbars',
    '--remote-debugging-pipe',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ];
  const child = spawn(executable, flags, { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

  /** The commands waiting for a reply, by id. */
  const pending = new Map();
  const listeners = new Set();
  /** Why the browser can no longer be used, once it cannot. */
  let failure;
  let nextId = 0;

  /** Rejects every pending command; later commands reject at once. */
  function fail(reason) {
    failure ??= reason;
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error(failure));
    }
    pending.clear();
  }

  /** Resolves when the browser has exited, or could not start. */
  const exited = new Promise((resolve) => {
    child.once('exit', resolve);
    child.once('error', resolve);
  });
  child.on('error', (error) => fail(error.message));
  child.on('exit', (code, signal) => fail(`the browser exited (${signal ?? `code ${code}`})`));

  const toBrowser = child.stdio[3];
  const fromBrowser = child.stdio[4];
  toBrowser?.on('error', (error) => fail(error.message));
  fromBrowser?.on('error', (error) => fail(error.message));
  let buffered = '';
  fromBrowser?.setEncoding('utf8');
  fromBrowser?.on('data', (chunk) => {
    buffered += chunk;
    const messages = buffered.split('\0');
    buffered = messages.pop();
    for (const text of messages) {
      if (!text) continue;
      const message = JSON.parse(text);
      if (message.id === undefined) {
        for (const listener of [...listeners]) listener(message);
      } else if (pending.has(message.id)) {
        const { resolve, reject, timer } = pending.get(message.id);
        clearTimeout(timer);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
    }
  });

  /** Sends one DevTools command and resolves with its result. */
  function send(method, params, sessionId) {
    if (failure) return Promise.reject(new Error(failure));
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(
        () => fail(`the browser did not answer ${method} in ${commandTimeout / 1000} s`),
        commandTimeout,
      );
      pending.set(id, { resolve, reject, timer });
      toBrowser.write(`${JSON.stringify({ id, method, params, sessionId })}\0`, (error) => {
        if (error) fail(error.message);
      });
    });
  }

  /** Stops the browser, and deletes its profile folder. */
  async function close() {
    if (failure) {
      // A browser that failed may not answer Browser.close: stop it at once.
      child.kill();
    } else {
      // The browser may have exited already; the exit is awaited next.
      await send('Browser.close').catch(() => {});
    }
    const timer = setTimeout(() => child.kill(), CLOSE_TIMEOUT);
    await exited;
    clearTimeout(timer);
    removeProfile();
  }

  try {
    await send('Browser.getVersion');
  } catch (error) {
    child.kill();
    await exited;
    removeProfile();
    throw new Error(
      `The browser ${executable} did not start: ${error.message}. Name a Chromium-based browser, such as Google Chrome or Microsoft Edge, with --browser or DOCS_BROWSER.`,
    );
  }

  /** Opens a blank page in a tab of its own. */
  async function newPage() {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', undefined, sessionId);
    return {
      /** Sets the window's width, with a height of 900. */
      async setWidth(width) {
        await send(
          'Emulation.setDeviceMetricsOverride',
          { width, height: 900, deviceScaleFactor: 1, mobile: false },
          sessionId,
        );
      },
      /** Loads a URL, and resolves once the page's load event fires. */
      async goto(url) {
        let listener;
        let timer;
        const loaded = new Promise((resolve, reject) => {
          listener = (message) => {
            if (message.sessionId === sessionId && message.method === 'Page.loadEventFired') resolve();
          };
          listeners.add(listener);
          timer = setTimeout(() => reject(new Error(`${url} did not load in ${LOAD_TIMEOUT / 1000} s`)), LOAD_TIMEOUT);
        });
        // Marks the rejection handled until it is awaited below, which surfaces it.
        loaded.catch(() => {});
        try {
          const { errorText } = await send('Page.navigate', { url }, sessionId);
          if (errorText) throw new Error(`${url} did not load: ${errorText}`);
          await loaded;
        } finally {
          clearTimeout(timer);
          listeners.delete(listener);
        }
      },
      /** Runs an expression in the page and returns its value; a promise is awaited. */
      async evaluate(expression) {
        const { result, exceptionDetails } = await send(
          'Runtime.evaluate',
          { expression, awaitPromise: true, returnByValue: true },
          sessionId,
        );
        if (exceptionDetails) {
          throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        }
        return result.value;
      },
    };
  }

  return { newPage, close };
}
