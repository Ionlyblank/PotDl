import { getSettings } from "./lib/player.js";
import { mountKeyField, mountLanguage } from "./lib/settings-form.js";

const languageSaved = document.getElementById("languageSaved");

function markStep(id, done) {
  const step = document.getElementById(id);
  step.classList.toggle("done", done);
  step.querySelector(".step-mark").textContent = done ? "✓" : step.dataset.number;
}

async function refreshAllSet() {
  const { apiKey } = await getSettings();
  markStep("stepKey", Boolean(apiKey));
  document.getElementById("allSet").hidden = !apiKey;
}

for (const step of document.querySelectorAll(".step")) {
  step.dataset.number = step.querySelector(".step-mark").textContent;
}
markStep("stepLanguage", true);

mountLanguage(document.getElementById("language"), () => {
  languageSaved.textContent = "✓ Saved";
  setTimeout(() => (languageSaved.textContent = ""), 1800);
});
mountKeyField(document.getElementById("keyField"), refreshAllSet);
refreshAllSet();
