// The subtitle list. Runs as the toolbar popup, and as a window when a right-click needs a decision.

import { findLanguage } from "./lib/languages.js";
import { getSettings, playInPotPlayer } from "./lib/player.js";
import { loadToolbarSession } from "./lib/session.js";
import { downloadSubtitle, searchSubtitles } from "./lib/subdl.js";

const isWindow = new URLSearchParams(location.search).has("window");
if (isWindow) document.body.classList.replace("popup", "window");

const searchForm = document.getElementById("search");
const titleInput = document.getElementById("title");
const seasonInput = document.getElementById("season");
const episodeInput = document.getElementById("episode");
const videoTitle = document.getElementById("videoTitle");
const videoMeta = document.getElementById("videoMeta");
const editButton = document.getElementById("editSearch");
const noSubsButton = document.getElementById("noSubs");
const status = document.getElementById("status");
const results = document.getElementById("results");

const settings = await getSettings();
const languageName = findLanguage(settings.language)?.name ?? settings.language;
let session;
let lastResults = [];

function setStatus(text, kind = "") {
  status.textContent = text;
  status.className = `status ${kind}`;
}

function setBusy(busy) {
  for (const button of document.querySelectorAll(".result, #searchButton, #noSubs")) button.disabled = busy;
}

function showResultCount() {
  const count = lastResults.length;
  setStatus(`${count} ${languageName} subtitle${count === 1 ? "" : "s"}`);
}

function currentMedia() {
  const season = Number(seasonInput.value) || undefined;
  const episode = Number(episodeInput.value) || undefined;
  return {
    ...session.media,
    title: titleInput.value.trim(),
    season: episode ? (season ?? 1) : undefined,
    episode,
    type: episode ? "tv" : "movie",
  };
}

function showVideo(media, label = "") {
  const episode = media.episode ? `Season ${media.season} · Episode ${media.episode}` : "";
  videoTitle.textContent = media.title || "Subtitles";
  videoTitle.title = media.fileName || session.url;
  videoMeta.textContent = [label, episode].filter(Boolean).join(" · ");
}

function fillForm(media) {
  titleInput.value = media.title;
  seasonInput.value = media.season ?? "";
  episodeInput.value = media.episode ?? "";
}

function chipsFor(subtitle, index) {
  const labels = [];
  if (subtitle.url === session.currentUrl) labels.push(["Playing now", "chip accent"]);
  else if (index === 0) labels.push(["Best match", "chip"]);
  if (subtitle.full_season) labels.push(["Season pack", "chip"]);
  else if (subtitle.season && subtitle.episode) {
    labels.push([`S${subtitle.season} E${subtitle.episode}`, "chip"]);
  }
  if (subtitle.hi) labels.push(["Hearing impaired", "chip"]);
  if (subtitle.fps) labels.push([`${subtitle.fps} fps`, "chip"]);

  const chips = document.createElement("span");
  chips.className = "chips";
  for (const [text, className] of labels) {
    const chip = document.createElement("span");
    chip.className = className;
    chip.textContent = text;
    chips.append(chip);
  }
  return chips;
}

function showResults(subtitles) {
  const scrollTop = results.scrollTop;
  lastResults = subtitles;
  results.replaceChildren(
    ...subtitles.map((subtitle, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const name = document.createElement("span");
      button.className = "result";
      button.classList.toggle("current", subtitle.url === session.currentUrl);
      name.className = "result-name";
      name.dir = "auto";
      name.textContent = subtitle.release_name ?? subtitle.name ?? subtitle.url;
      button.append(name, chipsFor(subtitle, index));
      button.addEventListener("click", () => play(subtitle));
      item.append(button);
      return item;
    }),
  );
  results.scrollTop = scrollTop;
}

async function saveSession() {
  const { changing, ...stored } = session;
  await chrome.storage.local.set({
    picker: { ...stored, media: currentMedia(), subtitles: lastResults, language: settings.language },
  });
}

async function play(choice) {
  setStatus(session.changing ? "Loading subtitle..." : "Opening in PotPlayer...");
  setBusy(true);
  try {
    const subtitle = choice
      ? await downloadSubtitle(choice, currentMedia(), settings.language)
      : undefined;
    const outcome = await playInPotPlayer(session.url, subtitle, session.tabId, {
      language: settings.language,
      replace: session.changing,
    });
    if (!outcome.ok) throw new Error(outcome.error);
    session.currentUrl = choice?.url;
    await saveSession();
    if (!session.changing) {
      window.close();
      return;
    }
    // Stay open so another subtitle can be tried straight away.
    showResults(lastResults);
    setStatus("✓ Subtitle loaded", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
  setBusy(false);
}

async function search() {
  const media = currentMedia();
  setStatus("Finding subtitles...");
  setBusy(true);
  try {
    const { subtitles } = await searchSubtitles(media, settings);
    showResults(subtitles);
    showVideo(media);
    await saveSession();
    if (subtitles.length) {
      showResultCount();
      if (!isWindow) searchForm.hidden = true;
    } else {
      setStatus(`No ${languageName} subtitles found. Edit the search, or change the language in Setup and help.`, "error");
      searchForm.hidden = false;
    }
  } catch (error) {
    setStatus(error.message, "error");
    searchForm.hidden = false;
  } finally {
    setBusy(false);
  }
}

async function startWindow() {
  ({ picker: session } = await chrome.storage.local.get("picker"));
  showVideo(session.media);
  fillForm(session.media);
  searchForm.hidden = false;
  noSubsButton.hidden = Boolean(session.changing);
  showResults(session.subtitles ?? []);
  const needsAttention = session.isError || (!session.subtitles?.length && Boolean(session.message));
  setStatus(session.message ?? "", needsAttention ? "error" : "");
}

async function startPopup() {
  setStatus("Looking for your video...");
  const { session: found, isPlaying, helperReady } = await loadToolbarSession();

  if (!helperReady) {
    setStatus("PotPlayer isn't connected yet. Open Setup and help to finish.", "error");
  } else if (!settings.apiKey) {
    setStatus("Add your SubDL key in Setup and help to find subtitles.", "error");
  } else if (!found) {
    setStatus("Nothing is playing. Right-click a video link and choose Open in PotPlayer.");
  } else {
    session = { ...found, changing: true };
    showVideo(session.media, isPlaying ? "" : "Last opened");
    fillForm(session.media);
    editButton.hidden = false;
    if (session.subtitles?.length && session.language === settings.language) {
      showResults(session.subtitles);
      showResultCount();
    } else {
      await search();
    }
  }
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  search();
});

editButton.addEventListener("click", () => {
  searchForm.hidden = !searchForm.hidden;
  if (!searchForm.hidden) titleInput.focus();
});

noSubsButton.addEventListener("click", () => play());

document.getElementById("openSetup").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  if (!isWindow) window.close();
});

await (isWindow ? startWindow() : startPopup());
