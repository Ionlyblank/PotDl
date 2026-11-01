// Works out which video the toolbar popup should list subtitles for.

import { detectMedia } from "./parse.js";
import { chooseVideo, getNowPlaying } from "./player.js";

export async function loadToolbarSession() {
  const [{ picker }, nowPlaying] = await Promise.all([chrome.storage.local.get("picker"), getNowPlaying()]);
  const choice = chooseVideo(picker, nowPlaying);

  const sessions = {
    none: null,
    stored: picker,
    playing: { url: nowPlaying.url, media: detectMedia({ url: nowPlaying.url, pageTitle: nowPlaying.title }) },
  };
  return { session: sessions[choice], isPlaying: Boolean(nowPlaying.title), helperReady: Boolean(nowPlaying.ok) };
}
