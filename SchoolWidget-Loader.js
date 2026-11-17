// SchoolWidget-Loader.js — paste this ONCE into Scriptable. On every run it
// pulls the latest widget code from GitHub, so updates land without
// re-pasting. Falls back to the last cached copy when offline, and to the
// previous copy if a fresh download is broken.

// "dark" or "blue" — the theme to load.
const WIDGET_THEME = "dark";

const CODE_URL = `https://raw.githubusercontent.com/B0ngocat/school-widget/main/SchoolWidget-${WIDGET_THEME === "blue" ? "Blue" : "Dark"}.js`;

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), `school-widget-code-${WIDGET_THEME}.js`);
const prevPath = fm.joinPath(fm.documentsDirectory(), `school-widget-code-${WIDGET_THEME}-prev.js`);

// The widget code is a full script with top-level await, so run it inside an
// async wrapper. It sets the widget and completes the script itself.
async function runCode(code) {
  await eval(`(async () => {\n${code}\n})()`);
}

let code = null;
try {
  const fresh = await new Request(CODE_URL).loadString();
  // Sanity: a 404 page or empty body must never overwrite the good cache.
  if (fresh && fresh.length > 1000 && fresh.includes("SchoolWidget")) {
    // Rotate: keep the last good copy as a fallback for a bad push.
    if (fm.fileExists(cachePath)) {
      const old = fm.readString(cachePath);
      if (old !== fresh) fm.writeString(prevPath, old);
    }
    fm.writeString(cachePath, fresh);
    code = fresh;
  }
} catch (e) {
  // Offline or fetch failed — fall through to the cache below.
}
if (!code && fm.fileExists(cachePath)) code = fm.readString(cachePath);

let ran = false;
if (code) {
  try {
    await runCode(code);
    ran = true;
  } catch (e) {
    // Broken download — fall through to the previous copy below.
  }
}
if (!ran && fm.fileExists(prevPath)) {
  try {
    await runCode(fm.readString(prevPath));
    ran = true;
  } catch (e) {}
}
if (!ran) {
  const widget = new ListWidget();
  widget.backgroundColor = new Color("#0b1220");
  widget.setPadding(16, 18, 16, 18);
  const t = widget.addText("School Widget");
  t.font = Font.boldSystemFont(18);
  t.textColor = new Color("#ffffff");
  const s = widget.addText("Couldn't download the widget code — open Scriptable once with internet.");
  s.font = Font.systemFont(13);
  s.textColor = new Color("#94a3b8");
  Script.setWidget(widget);
  Script.complete();
}
