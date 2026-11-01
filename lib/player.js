// Hands videos and subtitles to PotPlayer through its potplayer: link, with the optional helper as a backup.

import { defaultLanguage, findLanguage } from "./languages.js";

const HOST_NAME = "com.potdl.helper";
const SUBTITLE_FOLDER = "PotDl";
const KEEP_DAYS = 3;
const SAVE_TIMEOUT_MS = 10000;
const NEEDS_HELPER =
  "PotPlayer can't read subtitles from a folder with spaces or non-English letters in its name. " +
  "Install the free helper from Setup and help to fix this.";

export async function getSettings() {
  return chrome.storage.local.get({ apiKey: "", language: defaultLanguage() });
}

export async function getNowPlaying() {
  try {
    const reply = await chrome.runtime.sendNativeMessage(HOST_NAME, { nowPlaying: true });
    return reply?.ok ? reply : {};
  } catch {
    return {};
  }
}

function readableUrl(url) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

// Decides which video subtitle changes act on: "stored", "playing" or "none".
export function chooseVideo(stored, nowPlaying) {
  const { title, url } = nowPlaying;
  if (stored && (!title || readableUrl(stored.url).includes(title))) return "stored";
  if (url && title && readableUrl(url).includes(title)) return "playing";
  return stored ? "stored" : "none";
}

export function subtitleFileName(language, now = Date.now()) {
  // PotPlayer matches its preferred languages against the track name.
  const name = (findLanguage(language)?.name ?? language).replace(/[^\p{L}]+/gu, "-").replace(/-$/, "");
  return `subtitle-${now}.${name}`;
}

// PotPlayer doesn't decode /sub= paths and stops reading at a space, so only plain paths work.
export function isLinkSafePath(path) {
  return /^[A-Za-z0-9:\\/._~()-]+$/.test(path);
}

// The "potplayer:" form matters: Chrome rewrites "potplayer://https://", and PotPlayer then ignores the options.
export function openLink(url, subtitlePath) {
  return `potplayer:${url}${subtitlePath ? `%20/sub=${subtitlePath}` : ""}`;
}

export function swapLink(subtitlePath) {
  return `potplayer:${subtitlePath}%20/current`;
}

async function launch(link, tabId) {
  // Opening from the page lets Chrome offer "Always allow" for that site.
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (target) => {
        window.location.href = target;
      },
      args: [link],
    });
  } catch {
    await chrome.tabs.update(tabId, { url: link }).catch(() => {});
  }
}

function toDataUrl(text) {
  const bytes = new TextEncoder().encode(`﻿${text}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:text/plain;base64,${btoa(binary)}`;
}

function waitForDownload(id) {
  return new Promise((resolve, reject) => {
    const finish = (settle, value) => {
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(watch);
      settle(value);
    };
    const watch = (delta) => {
      if (delta.id !== id) return;
      if (delta.state?.current === "complete") finish(resolve);
      if (delta.state?.current === "interrupted") finish(reject, new Error("The subtitle couldn't be saved"));
    };
    const timer = setTimeout(() => finish(reject, new Error("Saving the subtitle took too long")), SAVE_TIMEOUT_MS);
    chrome.downloads.onChanged.addListener(watch);
  });
}

async function removeOldSubtitles() {
  const oldest = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const old = await chrome.downloads.search({ filenameRegex: `${SUBTITLE_FOLDER}.subtitle-`, endedBefore: oldest });
  for (const { id } of old) {
    await chrome.downloads.removeFile(id).catch(() => {});
    await chrome.downloads.erase({ id });
  }
}

async function saveSubtitle({ text, extension }, language) {
  await chrome.downloads.setUiOptions({ enabled: false }).catch(() => {});
  try {
    const id = await chrome.downloads.download({
      url: toDataUrl(text),
      filename: `${SUBTITLE_FOLDER}/${subtitleFileName(language)}.${extension}`,
      conflictAction: "uniquify",
      saveAs: false,
    });
    await waitForDownload(id);
    const [item] = await chrome.downloads.search({ id });
    return item.filename;
  } finally {
    await chrome.downloads.setUiOptions({ enabled: true }).catch(() => {});
    removeOldSubtitles().catch(() => {});
  }
}

async function sendToHelper(url, subtitle, language, replace) {
  try {
    const message = { url, subtitle, fileName: subtitleFileName(language), replace };
    const reply = await chrome.runtime.sendNativeMessage(HOST_NAME, message);
    return reply?.ok ? { ok: true } : { ok: false, error: reply?.error ?? NEEDS_HELPER };
  } catch {
    return { ok: false, error: NEEDS_HELPER };
  }
}

export async function playInPotPlayer(url, subtitle, tabId, { language = "EN", replace = false } = {}) {
  if (!subtitle) {
    await launch(openLink(url), tabId);
    return { ok: true };
  }

  try {
    const path = await saveSubtitle(subtitle, language);
    if (isLinkSafePath(path)) {
      await launch(replace ? swapLink(path) : openLink(url, path), tabId);
      return { ok: true };
    }
    const outcome = await sendToHelper(url, subtitle, language, replace);
    if (!outcome.ok && !replace) await launch(openLink(url), tabId);
    return outcome;
  } catch (error) {
    if (!replace) await launch(openLink(url), tabId);
    return { ok: false, error: error.message };
  }
}
