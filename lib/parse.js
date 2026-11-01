// Works out the show or movie, season and episode from the text around a link.

const EPISODE_PATTERNS = [
  /\bS(\d{1,2})[\s._-]*E(\d{1,3})\b/i,
  /\b(\d{1,2})x(\d{2,3})\b/i,
  /\bSeason\s*(\d{1,2})\D{0,12}Episode\s*(\d{1,3})\b/i,
  /الموسم\s*(\d{1,2})\D{0,12}الحلقة\s*(\d{1,3})/,
  // Anime releases: "Show S3 - 03" and "Show 2nd Season - 05v2".
  /\bS(\d{1,2})\s*-\s*(\d{1,4})(?:v\d+)?\b/i,
  /\b(\d{1,2})(?:st|nd|rd|th)\s+Season\s*-?\s*(?:Episode\s*)?(\d{1,4})(?:v\d+)?\b/i,
];
// Anime releases also use "Show - 12 (1080p)", which needs care to avoid matching subtitles of titles.
const LONE_EPISODE =
  /\b(?:Episode|Ep|E)[\s._-]*(\d{1,4})(?:v\d+)?\b|الحلقة\s*(\d{1,4})|\s-\s(?!(?:19|20)\d{2}\b)(\d{1,4})(?:v\d+)?(?=\s*(?:\(|$)|\s+\d{3,4}p\b)/i;
const YEAR = /\b(19\d{2}|20\d{2})\b/;
const RELEASE_TAG =
  /\b(?:480p|576p|720p|1080p|1440p|2160p|4k|uhd|hdr|web[\s-]?dl|webrip|web|bluray|blu[\s-]?ray|brrip|bdrip|dvdrip|hdtv|hdrip|x26[45]|h[\s.]?26[45]|hevc|aac|ddp?5|amzn|nf|proper|repack)\b/i;
const GENERIC_TEXT =
  /^(?:download|watch|play|stream|video|movie|link|here|click here|open|server\s*\d*|index|master|playlist|manifest|episode|\d+p?)$/i;
const NAME_PARAMS = ["filename", "file", "name", "title"];
const VIDEO_EXTENSION = /\.(?:mkv|mp4|avi|mov|webm|m4v|ts|m3u8|mpd|flv|wmv)$/i;

function tidy(text) {
  return text
    .replace(/^www\.\S+\s*[-–]\s*/i, "")
    .replace(/[._+]+/g, " ")
    .replace(/\[[^\]]*\]|\{[^}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(text) {
  const title = text
    .replace(/^(?:watch|download)\s+/i, "")
    .replace(/[\s([–—:|-]+$/, "")
    .replace(/^[\s\])–—:|-]+/, "")
    .trim();
  const usable = title.length >= 2 && /\p{L}/u.test(title) && !GENERIC_TEXT.test(title);
  return usable ? title : null;
}

export function parseText(raw) {
  if (!raw) return {};
  const text = tidy(raw);
  const yearMatch = text.match(YEAR);
  const year = yearMatch ? Number(yearMatch[1]) : undefined;

  for (const pattern of EPISODE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        title: cleanTitle(text.slice(0, match.index).replace(YEAR, " ")),
        season: Number(match[1]),
        episode: Number(match[2]),
        year,
      };
    }
  }

  const lone = text.match(LONE_EPISODE);
  if (lone) {
    return {
      title: cleanTitle(text.slice(0, lone.index).replace(YEAR, " ")),
      episode: Number(lone[1] ?? lone[2] ?? lone[3]),
      year,
    };
  }

  const cut = [yearMatch?.index, text.search(RELEASE_TAG), text.search(/\s[|–—]\s|\s-\s/)]
    .filter((index) => index > 0)
    .reduce((lowest, index) => Math.min(lowest, index), text.length);
  return { title: cleanTitle(text.slice(0, cut)), year };
}

export function fileNameFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }

  const decode = (value) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  for (const param of NAME_PARAMS) {
    const value = parsed.searchParams.get(param);
    if (value) return value.replace(VIDEO_EXTENSION, "");
  }

  const segment = decode(parsed.pathname.split("/").filter(Boolean).pop() ?? "");
  const name = segment.replace(VIDEO_EXTENSION, "");
  // Long random-looking ids say nothing about the video.
  const looksRandom = !/[\s._-]/.test(name) && /\d/.test(name) && /[a-z]/i.test(name);
  return looksRandom && !EPISODE_PATTERNS.some((pattern) => pattern.test(name)) ? "" : name;
}

export function detectMedia({ url, linkText, pageTitle }) {
  const fileName = fileNameFromUrl(url);
  const candidates = [fileName, linkText, pageTitle].map(parseText);

  const full = candidates.find((c) => c.title && c.season && c.episode);
  const titled = full ?? candidates.find((c) => c.title);
  const numbered = full ?? candidates.find((c) => c.season && c.episode);
  const lone = candidates.find((c) => c.episode);

  const episode = numbered?.episode ?? lone?.episode;
  const season = numbered?.season ?? (episode ? 1 : undefined);
  return {
    title: titled?.title ?? "",
    season,
    episode,
    year: titled?.year,
    type: episode ? "tv" : "movie",
    seasonGuessed: Boolean(episode && !numbered),
    fileName,
  };
}
