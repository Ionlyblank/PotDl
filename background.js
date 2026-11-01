import { detectMedia } from "./lib/parse.js";
import { downloadSubtitle, searchSubtitles } from "./lib/subdl.js";
import { getSettings, playInPotPlayer } from "./lib/player.js";

const MENU_ID = "open-in-potplayer";
const BADGES = {
  working: { text: "…", color: "#6F6A60" },
  done: { text: "✓", color: "#8A6500" },
  failed: { text: "!", color: "#A3321F" },
};
const BADGE_SECONDS = 4;

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Open in PotPlayer",
    contexts: ["link"],
    targetUrlPatterns: ["http://*/*", "https://*/*"],
  });
  if (reason === "install") chrome.runtime.openOptionsPage();
});

async function setBadge(state) {
  const badge = BADGES[state];
  await chrome.action.setBadgeBackgroundColor({ color: badge.color });
  await chrome.action.setBadgeText({ text: badge.text });
  if (state !== "working") {
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), BADGE_SECONDS * 1000);
  }
}

async function readPageContext(info, tab) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
      func: (href) => ({
        pageTitle: document.title,
        linkText: [...document.links].find((link) => link.href === href)?.textContent.trim() ?? "",
      }),
      args: [info.linkUrl],
    });
    return result;
  } catch {
    return { pageTitle: tab?.title ?? "", linkText: "" };
  }
}

async function openPicker(session) {
  await setBadge("failed");
  await chrome.storage.local.set({ picker: session });
  await chrome.windows.create({ url: "subtitles.html?window", type: "popup", width: 640, height: 680 });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const url = info.linkUrl;
  const settings = await getSettings();
  if (!settings.apiKey) {
    await chrome.runtime.openOptionsPage();
    return;
  }

  await setBadge("working");
  const media = detectMedia({ url, ...(await readPageContext(info, tab)) });
  const session = { url, media, tabId: tab?.id, language: settings.language };

  if (!media.title) {
    await openPicker({ ...session, message: "Couldn't tell what this video is. Enter its title to search." });
    return;
  }

  let subtitles;
  try {
    const found = await searchSubtitles(media, settings);
    subtitles = found.subtitles;
    const { titleConfident } = found;
    const best = subtitles[0];
    if (!best || !titleConfident || media.seasonGuessed) {
      const message = best ? "Please confirm this is the right video." : "No subtitles found.";
      await openPicker({ ...session, subtitles, message });
      return;
    }

    const subtitle = await downloadSubtitle(best, media, settings.language);
    const outcome = await playInPotPlayer(url, subtitle, tab?.id, { language: settings.language });
    if (!outcome.ok) {
      const message = `The video opened without subtitles. ${outcome.error}`;
      await openPicker({ ...session, subtitles, message, isError: true });
      return;
    }
    await chrome.storage.local.set({ picker: { ...session, subtitles, currentUrl: best.url } });
    await setBadge("done");
  } catch (error) {
    await openPicker({ ...session, subtitles, message: error.message, isError: true });
  }
});
