import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import test from "node:test";

import { detectMedia, fileNameFromUrl, parseText } from "../lib/parse.js";
import { chooseVideo, subtitleFileName } from "../lib/player.js";
import { loadToolbarSession } from "../lib/session.js";
import { defaultLanguage, findLanguage, LANGUAGES } from "../lib/languages.js";
import {
  checkApiKey,
  chooseZipEntry,
  decodeSubtitle,
  downloadSubtitle,
  rankSubtitles,
  searchSubtitles,
  titleMatch,
} from "../lib/subdl.js";
import { listZip, readZipEntry } from "../lib/unzip.js";

function makeZip(files) {
  const locals = [];
  const directory = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = deflateRawSync(Buffer.from(content));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    directory.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, central, end]));
}

test("reads show, season and episode from filenames", () => {
  const cases = [
    ["Breaking.Bad.S02E05.1080p.WEB-DL.x264", "Breaking Bad", 2, 5],
    ["The Office 3x07 HDTV", "The Office", 3, 7],
    ["www.site.com - Fallout.2024.S01E03.720p", "Fallout", 1, 3],
    ["Dark Season 2 Episode 4", "Dark", 2, 4],
    ["الموسم 2 الحلقة 5", null, 2, 5],
    ["[SubsPlease] Mushoku Tensei S3 - 03 (1080p) [8488B15C]", "Mushoku Tensei", 3, 3],
    ["[SubsPlease] Mushoku Tensei S3 - 01v2 (1080p) [3162D656]", "Mushoku Tensei", 3, 1],
    ["[Erai-raws] Some Show 2nd Season - 05 [1080p]", "Some Show", 2, 5],
  ];
  for (const [text, title, season, episode] of cases) {
    const parsed = parseText(text);
    assert.equal(parsed.title, title, text);
    assert.equal(parsed.season, season, text);
    assert.equal(parsed.episode, episode, text);
  }
});

test("reads anime episodes that have no season", () => {
  const parsed = parseText("[SubsPlease] Sousou no Frieren - 12v2 (1080p) [ABCD1234]");
  assert.deepEqual([parsed.title, parsed.season, parsed.episode], ["Sousou no Frieren", undefined, 12]);
  assert.equal(parseText("One Piece - 1100 1080p WEB").episode, 1100);
  assert.equal(parseText("Inception - 2010").episode, undefined);
  assert.equal(parseText("Rocky - 4 Reasons To Watch").episode, undefined);
});

test("reads movie titles without release tags", () => {
  assert.equal(parseText("Dune.Part.Two.2024.2160p.WEB-DL").title, "Dune Part Two");
  assert.equal(parseText("Dune.Part.Two.2024.2160p.WEB-DL").year, 2024);
  assert.equal(parseText("Inception.1080p.BluRay").title, "Inception");
  assert.equal(parseText("Watch Inception - MovieSite").title, "Inception");
  assert.equal(parseText("Download").title, null);
});

test("ignores meaningless link names", () => {
  assert.equal(fileNameFromUrl("https://cdn.example/a8f3k2x9q.mp4"), "");
  assert.equal(fileNameFromUrl("https://cdn.example/v/Show%20S01E02.mkv"), "Show S01E02");
  assert.equal(fileNameFromUrl("https://cdn.example/get?file=Show.S01E02.mkv"), "Show.S01E02");
  assert.equal(fileNameFromUrl("https://cdn.example/master.m3u8"), "master");
});

test("combines link and page details", () => {
  const random = detectMedia({
    url: "https://cdn.example/a8f3k2x9q.mp4",
    linkText: "Download",
    pageTitle: "Severance S02E06 - StreamSite",
  });
  assert.deepEqual(
    [random.title, random.season, random.episode, random.seasonGuessed],
    ["Severance", 2, 6, false],
  );

  const split = detectMedia({
    url: "https://cdn.example/master.m3u8",
    linkText: "Episode 7",
    pageTitle: "Severance",
  });
  assert.deepEqual([split.title, split.season, split.episode, split.seasonGuessed], ["Severance", 1, 7, true]);
});

test("matches titles", () => {
  assert.equal(titleMatch("Breaking Bad", "Breaking Bad"), 1);
  assert.ok(titleMatch("The Office", "Fargo") < 0.6);
  assert.ok(titleMatch("Mushoku Tensei", "Mushoku Tensei: Jobless Reincarnation") >= 0.6);
});

test("ranks the right episode and matching release first", () => {
  const media = { title: "Show", season: 1, episode: 2, fileName: "Show.S01E02.WEB-DL.NTb" };
  const ranked = rankSubtitles(
    [
      { release_name: "Show.S01E03.WEB-DL.NTb", season: 1, episode: 3, language: "AR" },
      { release_name: "Show.S01E02.HDTV", season: 1, episode: 2, language: "AR" },
      { release_name: "Show.S01E02.WEB-DL.NTb", season: 1, episode: 2, language: "AR" },
      { release_name: "Show.S01E02.WEB-DL.NTb", season: 1, episode: 2, language: "EN" },
      { release_name: "Pack", season: 1, full_season: true, episode_from: 1, episode_end: 8, language: "AR" },
      { release_name: "Pack2", season: 1, full_season: true, episode_from: 5, episode_end: 8, language: "AR" },
    ],
    media,
    "AR",
  );
  assert.deepEqual(
    ranked.map((s) => s.release_name),
    ["Show.S01E02.WEB-DL.NTb", "Show.S01E02.HDTV", "Pack"],
  );
});

test("sends language, season and episode to SubDL", async (t) => {
  let requested;
  t.mock.method(globalThis, "fetch", async (url) => {
    requested = new URL(url);
    return Response.json({ status: true, results: [{ name: "Show" }], subtitles: [] });
  });
  const result = await searchSubtitles(
    { title: "Show", season: 2, episode: 5, type: "tv", fileName: "" },
    { apiKey: "k", language: "AR" },
  );
  assert.equal(requested.searchParams.get("languages"), "AR");
  assert.equal(requested.searchParams.get("season_number"), "2");
  assert.equal(requested.searchParams.get("episode_number"), "5");
  assert.equal(requested.searchParams.get("type"), "tv");
  assert.equal(result.titleConfident, true);
});

test("reports SubDL errors", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ status: false, error: "Bad key" }, { status: 200 }),
  );
  await assert.rejects(
    searchSubtitles({ title: "Show", type: "movie" }, { apiKey: "k", language: "AR" }),
    /Bad key/,
  );
});

test("reads zip files", async () => {
  const bytes = makeZip({ "readme.txt": "x", "a.srt": "subtitle text" });
  const entries = listZip(bytes);
  assert.deepEqual(entries.map((e) => e.name), ["readme.txt", "a.srt"]);
  const data = await readZipEntry(bytes, entries[1]);
  assert.equal(new TextDecoder().decode(data), "subtitle text");
});

test("picks the episode from a season pack", () => {
  const entries = [{ name: "Show.S01E01.srt" }, { name: "Show.S01E10.srt" }, { name: "Show.S01E02.srt" }];
  assert.equal(chooseZipEntry(entries, { season: 1, episode: 1 }).name, "Show.S01E01.srt");
  assert.equal(chooseZipEntry(entries, { season: 1, episode: 2 }).name, "Show.S01E02.srt");
  assert.throws(() => chooseZipEntry(entries, { season: 1, episode: 5 }, { isPack: true }), /no file/);
  assert.equal(chooseZipEntry(entries, { season: 1, episode: 5 }).name, "Show.S01E01.srt");
  assert.equal(chooseZipEntry([{ name: "only.srt" }], { season: 1, episode: 5 }).name, "only.srt");

  const anime = [{ name: "[Rhythm] Show - 02.ass" }, { name: "[Rhythm] Show - 03v2.ass" }];
  assert.equal(chooseZipEntry(anime, { season: 3, episode: 3 }).name, "[Rhythm] Show - 03v2.ass");
});

test("downloads the zip and uses SubDL's file list to find the episode", async (t) => {
  const fetched = [];
  const zip = makeZip({ "pack/one.srt": "first", "pack/two.ass": "second" });
  t.mock.method(globalThis, "fetch", async (url) => {
    fetched.push(url);
    return new Response(zip);
  });
  const result = await downloadSubtitle(
    {
      url: "/subtitle/pack.zip",
      full_season: true,
      unpack_files: [
        { episode: 1, name: "one.srt", url: "/subtitle/p/one" },
        { episode: 2, name: "two.ass", url: "/subtitle/p/two" },
      ],
    },
    { season: 1, episode: 2 },
    "AR",
  );
  assert.deepEqual(fetched, ["https://dl.subdl.com/subtitle/pack.zip"]);
  assert.deepEqual(result, { text: "second", extension: "ass" });
});

test("explains the daily download limit", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: "api_download_limit_exceeded", message: "Free daily download limit reached (50/day).", limit: 50, retryAfterSeconds: 6024 },
      { status: 429 },
    ),
  );
  await assert.rejects(
    downloadSubtitle({ url: "/a.zip" }, {}, "AR"),
    /^Error: SubDL's free daily download limit is used up\. Try again in 1 h 41 min\.$/,
  );
});

test("shows why SubDL refused a download", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    new Response('{"error":"daily limit"}', { status: 429, headers: { "retry-after": "60" } }),
  );
  await assert.rejects(
    downloadSubtitle({ url: "/a.zip" }, {}, "AR"),
    /refused the download \(429\): \{"error":"daily limit"\}: Retry after 60s/,
  );

  fetchMock.mock.mockImplementation(async () =>
    new Response("<html><title>Too Many Requests</title><body>x</body></html>", { status: 429 }),
  );
  await assert.rejects(downloadSubtitle({ url: "/a.zip" }, {}, "AR"), /\(429\): Too Many Requests$/);
});

test("reads the real files from the screenshot through to a confident match", () => {
  const media = detectMedia({
    url: "https://cdn.example/%5BSubsPlease%5D%20Mushoku%20Tensei%20S3%20-%2003%20(1080p)%20%5B8488B15C%5D.mkv",
    linkText: "",
    pageTitle: "Unrestrict links",
  });
  assert.deepEqual([media.title, media.season, media.episode, media.seasonGuessed], ["Mushoku Tensei", 3, 3, false]);
});

test("the toolbar button acts on the video that is really playing", () => {
  const episode3 = { url: "https://x/%5BSub%5D%20Show%20-%2003.mkv" };
  const playing3 = { title: "[Sub] Show - 03.mkv", url: "https://x/%5BSub%5D%20Show%20-%2003.mkv" };
  const playing4 = { title: "[Sub] Show - 04.mkv", url: "https://x/%5BSub%5D%20Show%20-%2004.mkv" };

  assert.equal(chooseVideo(episode3, playing3), "stored");
  assert.equal(chooseVideo(episode3, playing4), "playing");
  assert.equal(chooseVideo(undefined, playing4), "playing");
  assert.equal(chooseVideo(episode3, {}), "stored");
  assert.equal(chooseVideo(undefined, {}), "none");
  assert.equal(chooseVideo(undefined, { title: "Local file.mkv", url: "" }), "none");
});

test("the popup lists subtitles for the right video", async (t) => {
  const stored = { url: "https://x/Show.S01E03.mkv", media: { title: "Show" }, subtitles: [{ url: "/a" }] };
  let nowPlaying = { ok: true, title: "Show.S01E03.mkv", url: stored.url };
  let picker = stored;
  globalThis.chrome = {
    storage: { local: { get: async () => ({ picker }) } },
    runtime: { sendNativeMessage: async () => nowPlaying },
  };
  t.after(() => delete globalThis.chrome);

  const same = await loadToolbarSession();
  assert.deepEqual([same.session, same.isPlaying, same.helperReady], [stored, true, true]);

  nowPlaying = { ok: true, title: "Other.S02E05.mkv", url: "https://x/Other.S02E05.mkv" };
  const other = await loadToolbarSession();
  assert.deepEqual([other.session.media.title, other.session.media.season, other.session.media.episode], ["Other", 2, 5]);

  nowPlaying = { ok: true, title: "", url: "" };
  picker = undefined;
  assert.equal((await loadToolbarSession()).session, null);

  nowPlaying = undefined;
  assert.equal((await loadToolbarSession()).helperReady, false);
});

test("names subtitle files after their language", () => {
  assert.equal(subtitleFileName("AR", 123), "subtitle-123.Arabic");
  assert.equal(subtitleFileName("EN", 123), "subtitle-123.English");
  assert.equal(subtitleFileName("BR_PT", 123), "subtitle-123.Portuguese-Brazil");
  assert.equal(subtitleFileName("BG_EN", 123), "subtitle-123.Bulgarian-English");
});

test("every language has a unique code and a usable decoder", () => {
  assert.equal(new Set(LANGUAGES.map((l) => l.code)).size, LANGUAGES.length);
  for (const { encoding } of LANGUAGES) {
    assert.doesNotThrow(() => new TextDecoder(encoding ?? "windows-1252"));
  }
});

test("picks a sensible default language from the browser", () => {
  assert.equal(defaultLanguage("ar-SA"), "AR");
  assert.equal(defaultLanguage("pt-BR"), "BR_PT");
  assert.equal(defaultLanguage("zh-TW"), "ZH_BG");
  assert.equal(defaultLanguage("xx-YY"), "EN");
  assert.equal(findLanguage("AR").name, "Arabic");
});

test("decodes older subtitle files using the chosen language", () => {
  const russian = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
  assert.equal(decodeSubtitle(russian, "RU"), "Привет");
});

test("checks API keys", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ status: false, statusCode: 403, error: "not_authorized" }, { status: 403 }),
  );
  assert.equal(await checkApiKey("bad"), false);

  fetchMock.mock.mockImplementation(async () => Response.json({ status: true, subtitles: [] }));
  assert.equal(await checkApiKey("good"), true);

  fetchMock.mock.mockImplementation(async () => {
    throw new TypeError("offline");
  });
  assert.equal(await checkApiKey("unknown"), null);
});

test("gives clear search errors", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ status: false, error: "can't find movie or tv" }));
  await assert.rejects(
    searchSubtitles({ title: "Nope", type: "movie" }, { apiKey: "k", language: "AR" }),
    /couldn't find this title/,
  );
});

test("decodes Arabic subtitles in older encodings", () => {
  const windows1256 = new Uint8Array([0xc7, 0xe1, 0xda, 0xd1, 0xc8, 0xed, 0xc9]);
  assert.equal(decodeSubtitle(windows1256, "AR"), "العربية");
  assert.equal(decodeSubtitle(Buffer.from("العربية"), "AR"), "العربية");
});
