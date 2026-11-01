// Hands a video, and optionally a subtitle, to the local PotDl helper.

import { defaultLanguage, findLanguage } from "./languages.js";

const HOST_NAME = "com.potdl.helper";
const HELPER_MISSING = "The PotDl helper isn't installed, so subtitles can't load. Open Setup and help to add it.";

export async function getSettings() {
  return chrome.storage.local.get({ apiKey: "", language: defaultLanguage() });
}

function friendlyError(error) {
  return error.message.includes("not found") ? HELPER_MISSING : error.message;
}

export async function checkHelper() {
  try {
    const reply = await chrome.runtime.sendNativeMessage(HOST_NAME, { ping: true });
    return reply?.ok ? { ok: true } : { ok: false, error: reply?.error ?? "The helper did not respond" };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
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

export async function playInPotPlayer(url, subtitle, tabId, { language = "EN", replace = false } = {}) {
  const fileName = subtitleFileName(language);
  try {
    const message = { url, subtitle, fileName, replace };
    const reply = await chrome.runtime.sendNativeMessage(HOST_NAME, message);
    if (reply?.ok) return { ok: true };
    throw new Error(reply?.error ?? "The helper did not respond");
  } catch (error) {
    // Without the helper the video can still open, just without subtitles.
    if (!replace) await chrome.tabs.update(tabId, { url: `potplayer://${url}` }).catch(() => {});
    return { ok: false, error: friendlyError(error) };
  }
}
