// Searches SubDL and turns its results into a single subtitle text.

import { findLanguage } from "./languages.js";
import { isZip, listZip, readZipEntry } from "./unzip.js";

const API_URL = "https://api.subdl.com/api/v1/subtitles";
const DOWNLOAD_URL = "https://dl.subdl.com";
const SUBTITLE_FILE = /\.(srt|ass|ssa|vtt|sub)$/i;
const MIN_TITLE_MATCH = 0.6;
const SEARCH_ERRORS = {
  not_authorized: "SubDL didn't accept your API key. Update it in Settings.",
  "can't find movie or tv": "SubDL couldn't find this title. Try a shorter or different name.",
};

function tokens(text) {
  return (text ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export function titleMatch(wanted, found) {
  const wantedTokens = tokens(wanted);
  if (!wantedTokens.length) return 0;
  const foundTokens = new Set(tokens(found));
  // Official names are often longer: "Mushoku Tensei: Jobless Reincarnation".
  return wantedTokens.filter((token) => foundTokens.has(token)).length / wantedTokens.length;
}

function isLanguage(subtitle, code) {
  const value = subtitle.language ?? subtitle.lang;
  return !value || value.length > 5 || value.toUpperCase() === code.toUpperCase();
}

function coversEpisode(subtitle, season, episode) {
  if (subtitle.season && subtitle.season !== season) return false;
  if (subtitle.full_season) {
    const { episode_from: from, episode_end: to } = subtitle;
    return !from || !to || (episode >= from && episode <= to);
  }
  return !subtitle.episode || subtitle.episode === episode;
}

function score(subtitle, fileName, titleTokens) {
  const release = new Set(tokens(subtitle.release_name ?? subtitle.name));
  const shared = tokens(fileName).filter((t) => release.has(t) && !titleTokens.has(t)).length;
  return shared - (subtitle.full_season ? 2 : 0) - (subtitle.hi ? 1 : 0);
}

export function rankSubtitles(subtitles, media, language) {
  const titleTokens = new Set(tokens(media.title));
  return subtitles
    .filter((subtitle) => isLanguage(subtitle, language))
    .filter((subtitle) => !media.episode || coversEpisode(subtitle, media.season, media.episode))
    .map((subtitle) => ({ ...subtitle, score: score(subtitle, media.fileName, titleTokens) }))
    .sort((a, b) => b.score - a.score);
}

export async function searchSubtitles(media, { apiKey, language }) {
  const params = new URLSearchParams({
    api_key: apiKey,
    film_name: media.title,
    type: media.type,
    languages: language,
    subs_per_page: "30",
    unpack: "1",
    client: "custom_integration",
  });
  if (media.episode) {
    params.set("season_number", media.season);
    params.set("episode_number", media.episode);
  }
  if (media.year && !media.episode) params.set("year", media.year);

  const response = await fetch(`${API_URL}?${params}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.status === false) {
    throw new Error(SEARCH_ERRORS[body.error] ?? body.error ?? `SubDL returned ${response.status}`);
  }

  const showName = body.results?.[0]?.name ?? "";
  return {
    showName,
    subtitles: rankSubtitles(body.subtitles ?? [], media, language),
    titleConfident: titleMatch(media.title, showName) >= MIN_TITLE_MATCH,
  };
}

// Returns true or false, or null when SubDL couldn't be reached to check.
export async function checkApiKey(apiKey) {
  const params = new URLSearchParams({ api_key: apiKey, film_name: "Inception", subs_per_page: "1" });
  try {
    const response = await fetch(`${API_URL}?${params}`);
    const body = await response.json().catch(() => ({}));
    return body.error !== "not_authorized" && response.status !== 403;
  } catch {
    return null;
  }
}

function episodePattern(season, episode) {
  const pad = (n) => String(n).padStart(2, "0");
  return new RegExp(
    `s0*${season}[\\s._-]*e0*${episode}(?!\\d)|\\b0*${season}x${pad(episode)}(?!\\d)|[\\s_]-[\\s_]0*${episode}(?:v\\d+)?(?!\\d)`,
    "i",
  );
}

export function chooseZipEntry(entries, media, { wantedName, isPack } = {}) {
  const files = entries.filter((entry) => SUBTITLE_FILE.test(entry.name));
  if (wantedName) {
    const named = files.find((entry) => entry.name.endsWith(wantedName));
    if (named) return named;
  }
  if (media.episode) {
    const pattern = episodePattern(media.season, media.episode);
    const match = files.find((entry) => pattern.test(entry.name));
    if (match) return match;
    if (isPack && files.length > 1) throw new Error("This subtitle pack has no file for that episode");
  }
  return files[0];
}

export function decodeSubtitle(bytes, language) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder(findLanguage(language)?.encoding ?? "windows-1252").decode(bytes);
  }
}

async function fetchBytes(path) {
  const response = await fetch(`${DOWNLOAD_URL}${path}`);
  if (!response.ok) throw new Error(await describeFailure(response));
  return new Uint8Array(await response.arrayBuffer());
}

function formatWait(seconds) {
  const minutes = Math.ceil(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

async function describeFailure(response) {
  const body = (await response.text().catch(() => "")).trim();
  let details = {};
  try {
    details = JSON.parse(body);
  } catch {
    // Not every failure comes back as JSON.
  }
  if (details.error === "api_download_limit_exceeded") {
    const wait = details.retryAfterSeconds;
    return `SubDL's free daily download limit is used up.${wait ? ` Try again in ${formatWait(wait)}.` : ""}`;
  }

  const pageTitle = body.match(/<title[^>]*>([^<]*)/i)?.[1];
  const reason = pageTitle ?? (body.startsWith("<") ? "" : body.slice(0, 200));
  const retryAfter = response.headers.get("retry-after");
  return [
    `SubDL refused the download (${response.status})`,
    reason,
    retryAfter && `Retry after ${retryAfter}s`,
  ]
    .filter(Boolean)
    .join(": ");
}

export async function downloadSubtitle(subtitle, media, language) {
  // Always use the zip: single-file links returned 429 with a free key.
  const bytes = await fetchBytes(subtitle.url);
  if (!isZip(bytes)) return { text: decodeSubtitle(bytes, language), extension: "srt" };

  const wantedName = subtitle.unpack_files?.find(
    (file) => file.episode === media.episode && (!file.season || file.season === media.season),
  )?.name;
  const entry = chooseZipEntry(listZip(bytes), media, { wantedName, isPack: subtitle.full_season });
  if (!entry) throw new Error("No subtitle file found in the download");
  return {
    text: decodeSubtitle(await readZipEntry(bytes, entry), language),
    extension: entry.name.match(SUBTITLE_FILE)[1].toLowerCase(),
  };
}
