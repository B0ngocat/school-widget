// SchoolWidget-Dark.js — Scriptable widget for iPad: homework only, live from Schoology (dark theme).
// Small (2x2), Medium (4x2), or Large — the layout adapts to the widget size you pick.
// Overdue + today's homework, tests, and quizzes. Large also shows a one-line
// weather strip on top (condition icon, temp, feels-like, UV).
//
// SETUP: normally you never paste this file — SchoolWidget-Loader.js pulls
// it from GitHub on every run. Direct paste also works; add a Scriptable
// widget on the home screen and pick this script.
//
// The homework feed refreshes on its own (a job on Scout's side regenerates
// it from Schoology). The widget itself just fetches the feed URL below.
// iOS decides how often widgets refresh; tapping the widget opens Scriptable.

// ---------------------------------------------------------------------------
// CONFIG — tweak these freely.
// ---------------------------------------------------------------------------
const CONFIG = {
  // Public feed URL. Assignment titles + due dates only; no grades, no names.
  feedUrl: "https://b0ngocat.github.io/school-widget/today.json",
  // Verified coordinates (geocoded Nov 2026) for the weather strip.
  home:   { name: "Aventura",   tag: "Home",     lat: 25.97063, lon: -80.12587 },
  school: { name: "Plantation", tag: "Heritage", lat: 26.11984, lon: -80.30883 },
  schoolRadiusKm: 2,          // within this of school => school weather
  schoolHoursStartMin: 7 * 60 + 30,  // 7:30 AM, weekdays (fallback only)
  schoolHoursEndMin: 15 * 60 + 45,   // 3:45 PM, weekdays (fallback only)
};

// Widget family: Scriptable sets config.widgetFamily when running as a
// widget ('small' | 'medium' | 'large' | 'extraLarge'). In-app runs and
// the Node harness have no config — default to the full large layout.
const FAMILY = (typeof config !== 'undefined' && config.widgetFamily) || 'large';
const IS_SMALL = FAMILY === 'small';
const IS_MEDIUM = FAMILY === 'medium';

// Layout values per family. Small is a square, so it gets smaller type and
// fewer rows. maxTotalRows caps rows across both sections so small/medium
// never overflow their slot (the phone's medium slot is short).
const LAYOUT = IS_SMALL
  ? { pad: [12, 16, 10, 16], dateSize: 17, stampSize: 10, sectionSize: 10,
      titleSize: 13, metaSize: 10, labelSize: 10, emptySize: 15,
      maxToday: 2, maxOverdue: 1, maxTotalRows: 3, rowGap: 5, sectionGap: 4, headGap: 6 }
  : IS_MEDIUM
  ? { pad: [12, 16, 10, 16], dateSize: 16, stampSize: 10, sectionSize: 11,
      titleSize: 13, metaSize: 10, labelSize: 10, emptySize: 15,
      maxToday: 3, maxOverdue: 1, maxTotalRows: 3, rowGap: 6, sectionGap: 4, headGap: 6 }
  : { pad: [16, 18, 14, 18], dateSize: 18, stampSize: 11, sectionSize: 11,
      titleSize: 14, metaSize: 11, labelSize: 11, emptySize: 17,
      maxToday: 6, maxOverdue: 2, maxTotalRows: 6, rowGap: 9, sectionGap: 5, headGap: 10 };

// Dark theme — same layout and logic as the Blue version.
const THEME = {
  bg: new Color("#0b1220"),
  header: new Color("#ffffff"),
  text: new Color("#e2e8f0"),
  muted: new Color("#94a3b8"),
  accent: new Color("#60a5fa"),
  overdue: new Color("#f87171"),
  typeColor: {
    homework: new Color("#60a5fa"),
    test: new Color("#f87171"),
    quiz: new Color("#c084fc"),
    project: new Color("#34d399"),
  },
};

const TYPE_LABEL = { homework: "HW", test: "TEST", quiz: "QUIZ", project: "PROJ" };
const CACHE_FEED = "school-widget-feed.json";
const CACHE_WEATHER = "school-widget-weather.json";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtTime(date) {
  const df = new DateFormatter();
  df.dateFormat = "h:mm a";
  return df.string(date);
}

function fmtDayShort(date) {
  const df = new DateFormatter();
  df.dateFormat = "EEE";
  return df.string(date);
}

// ---------------------------------------------------------------------------
// Data: feed with a local cache fallback.
// ---------------------------------------------------------------------------
function cachePath(name) {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), name);
}

function readCache(name) {
  try {
    const fm = FileManager.local();
    const p = cachePath(name);
    if (!fm.fileExists(p)) return null;
    return JSON.parse(fm.readString(p));
  } catch (e) {
    return null;
  }
}

function writeCache(name, obj) {
  try {
    FileManager.local().writeString(cachePath(name), JSON.stringify(obj));
  } catch (e) {
    // Cache is best-effort; the widget works without it.
  }
}

async function loadFeed() {
  try {
    const req = new Request(CONFIG.feedUrl);
    req.timeoutInterval = 15;
    const feed = await req.loadJSON();
    if (!feed || !Array.isArray(feed.items)) throw new Error("feed shape");
    const stamp = new Date();
    writeCache(CACHE_FEED, { savedAt: stamp.toISOString(), feed });
    return { feed, stamp, fromCache: false };
  } catch (e) {
    const cached = readCache(CACHE_FEED);
    if (cached && cached.feed && Array.isArray(cached.feed.items)) {
      return { feed: cached.feed, stamp: new Date(cached.savedAt), fromCache: true };
    }
    return { feed: null, stamp: null, fromCache: false };
  }
}

// WMO weather codes -> short label + SF Symbol name + icon tint.
function weatherForCode(code, isNight) {
  if (code === 0) return { label: "Clear", symbol: isNight ? "moon.stars" : "sun.max", tint: isNight ? "#94a3b8" : "#f59e0b" };
  if (code === 1 || code === 2) return { label: "Partly cloudy", symbol: isNight ? "cloud.moon" : "cloud.sun", tint: "#f59e0b" };
  if (code === 3) return { label: "Cloudy", symbol: "cloud", tint: "#94a3b8" };
  if (code === 45 || code === 48) return { label: "Fog", symbol: "cloud.fog", tint: "#94a3b8" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", symbol: "cloud.drizzle", tint: "#3b82f6" };
  if (code >= 61 && code <= 67) return { label: "Rain", symbol: "cloud.rain", tint: "#3b82f6" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "Snow", symbol: "cloud.snow", tint: "#38bdf8" };
  if (code >= 80 && code <= 82) return { label: "Showers", symbol: "cloud.heavyrain", tint: "#3b82f6" };
  if (code >= 95) return { label: "Storms", symbol: "cloud.bolt.rain", tint: "#a78bfa" };
  return { label: "—", symbol: "cloud", tint: "#94a3b8" };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Location: GPS near school => Plantation, else Aventura; time-based fallback.
async function pickLocation() {
  try {
    const loc = await Promise.race([
      Location.current(),
      new Promise((resolve) => Timer.schedule(8000, false, () => resolve(null))),
    ]);
    if (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
      const d = haversineKm(loc.latitude, loc.longitude, CONFIG.school.lat, CONFIG.school.lon);
      return d <= CONFIG.schoolRadiusKm ? CONFIG.school : CONFIG.home;
    }
  } catch (e) {
    // Location denied or unavailable — fall through to school hours.
  }
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const mins = now.getHours() * 60 + now.getMinutes();
  const inSchoolHours = day >= 1 && day <= 5 &&
    mins >= CONFIG.schoolHoursStartMin && mins < CONFIG.schoolHoursEndMin;
  return inSchoolHours ? CONFIG.school : CONFIG.home;
}

async function loadWeather(place) {
  const url = "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${place.lat}&longitude=${place.lon}` +
    "&current=temperature_2m,apparent_temperature,weather_code,is_day" +
    "&daily=uv_index_max" +
    "&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=1";
  try {
    const req = new Request(url);
    req.timeoutInterval = 15;
    const wx = await req.loadJSON();
    if (!wx || !wx.current || wx.current.temperature_2m == null) throw new Error("weather shape");
    writeCache(CACHE_WEATHER, { savedAt: new Date().toISOString(), place: place.name, wx });
    return wx;
  } catch (e) {
    const cached = readCache(CACHE_WEATHER);
    if (cached && cached.wx && cached.wx.current && cached.place === place.name) return cached.wx;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Widget building blocks
// ---------------------------------------------------------------------------
function addText(stack, str, font, color, opts = {}) {
  const t = stack.addText(str);
  t.font = font;
  t.textColor = color;
  if (opts.lineLimit) t.lineLimit = opts.lineLimit;
  if (opts.minScale) t.minimumScaleFactor = opts.minScale;
  if (opts.align === "center") t.centerAlignText();
  if (opts.align === "right") t.rightAlignText();
  return t;
}

// Type labels are plain colored text, NOT pills: on Nathan's phone (iOS 26
// Clear appearance) a nested stack's background renders as a blank white
// pill and its text never shows. Colored text renders reliably.
function addTypeLabel(stack, type) {
  const t = stack.addText(TYPE_LABEL[type] || "HW");
  t.font = Font.boldSystemFont(LAYOUT.labelSize);
  t.textColor = THEME.typeColor[type] || THEME.typeColor.homework;
  return t;
}

function addItemRow(col, item, now, isOverdueRow) {
  const due = new Date(item.due);
  const row = col.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  addTypeLabel(row, item.type);
  row.addSpacer(7);
  const texts = row.addStack();
  texts.layoutVertically();
  addText(texts, item.title, Font.semiboldSystemFont(LAYOUT.titleSize), THEME.text, { lineLimit: 1, minScale: 0.85 });
  const meta = isOverdueRow
    ? `${item.course} · was due ${fmtDayShort(due)} ${fmtTime(due)}`
    : `${item.course} · due ${fmtTime(due)}`;
  addText(texts, meta, Font.systemFont(LAYOUT.metaSize), isOverdueRow ? THEME.overdue : THEME.muted, { lineLimit: 1, minScale: 0.85 });
  col.addSpacer(LAYOUT.rowGap);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function buildWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = THEME.bg;
  widget.setPadding(...LAYOUT.pad);

  const now = new Date();
  // Feed + weather (large only) load in parallel.
  const feedPromise = loadFeed();
  const wxPromise = (!IS_SMALL && !IS_MEDIUM)
    ? (async () => loadWeather(await pickLocation()))()
    : Promise.resolve(null);
  const [{ feed, stamp, fromCache }, wx] = await Promise.all([feedPromise, wxPromise]);

  // One-line weather strip on top, large only: condition icon, temp,
  // feels-like, UV. Small/medium are too short — homework only there.
  if (wx && wx.current) {
    const cur = wx.current;
    const cond = weatherForCode(cur.weather_code, cur.is_day === 0);
    const uv = wx.daily && wx.daily.uv_index_max && wx.daily.uv_index_max[0];
    const wxRow = widget.addStack();
    wxRow.layoutHorizontally();
    wxRow.centerAlignContent();
    const icon = wxRow.addImage(SFSymbol.named(cond.symbol).image);
    icon.imageSize = new Size(18, 18);
    icon.tintColor = new Color(cond.tint);
    wxRow.addSpacer(6);
    const parts = [`${Math.round(cur.temperature_2m)}°`];
    if (cur.apparent_temperature != null) parts.push(`Feels ${Math.round(cur.apparent_temperature)}°`);
    if (uv != null) parts.push(`UV ${Math.round(uv)}`);
    addText(wxRow, parts.join(" · "), Font.semiboldSystemFont(13), THEME.text, { lineLimit: 1 });
    widget.addSpacer(6);
  }

  const df = new DateFormatter();
  df.dateFormat = IS_SMALL ? "EEE, MMM d" : "EEEE, MMMM d";
  const stampStr = stamp ? `${fromCache ? "Cached" : "Updated"} ${fmtTime(stamp)}` : "Feed unavailable";
  if (IS_MEDIUM) {
    // One header row on medium: the phone's medium slot is short, so the
    // date and stamp share a line instead of stacking.
    const headRow = widget.addStack();
    headRow.layoutHorizontally();
    addText(headRow, df.string(now), Font.boldSystemFont(LAYOUT.dateSize), THEME.header, { lineLimit: 1, minScale: 0.9 });
    headRow.addSpacer();
    addText(headRow, stampStr, Font.systemFont(LAYOUT.stampSize), THEME.muted, { lineLimit: 1 });
  } else {
    addText(widget, df.string(now), Font.boldSystemFont(LAYOUT.dateSize), THEME.header, { lineLimit: 1, minScale: 0.9 });
    addText(widget, stampStr, Font.systemFont(LAYOUT.stampSize), THEME.muted, { lineLimit: 1 });
  }
  widget.addSpacer(LAYOUT.headGap);

  const items = (feed?.items || []).map((it) => ({ ...it, dueDate: new Date(it.due) }))
    .filter((it) => !Number.isNaN(it.dueDate.getTime()))
    .sort((a, b) => a.dueDate - b.dueDate);

  const overdue = items.filter((it) => it.dueDate < now);
  const today = items.filter((it) => it.dueDate >= now && sameDay(it.dueDate, now));
  const upcoming = items.filter((it) => it.dueDate >= now && !sameDay(it.dueDate, now));

  if (!feed) {
    addText(widget, "Homework unavailable", Font.boldSystemFont(LAYOUT.emptySize), THEME.text, { lineLimit: 1 });
    widget.addSpacer(4);
    addText(widget, "The feed didn't load and no saved copy exists.", Font.systemFont(LAYOUT.titleSize), THEME.muted, { lineLimit: 2 });
  }

  // Combined row budget: small/medium show at most maxTotalRows across both
  // sections, so the widget never overflows its slot.
  const overdueShown = overdue.slice(0, LAYOUT.maxOverdue);
  const todayCap = Math.max(0, Math.min(LAYOUT.maxToday, LAYOUT.maxTotalRows - overdueShown.length));
  const todayShown = today.slice(0, todayCap);
  const hidden = (overdue.length - overdueShown.length) + (today.length - todayShown.length);

  if (feed && overdue.length > 0) {
    addText(widget, `OVERDUE · ${overdue.length}`, Font.boldSystemFont(LAYOUT.sectionSize), THEME.overdue, { lineLimit: 1 });
    widget.addSpacer(LAYOUT.sectionGap);
    for (const it of overdueShown) addItemRow(widget, it, now, true);
  }

  if (feed && today.length > 0) {
    addText(widget, `DUE TODAY · ${today.length}`, Font.boldSystemFont(LAYOUT.sectionSize), THEME.accent, { lineLimit: 1 });
    widget.addSpacer(LAYOUT.sectionGap);
    for (const it of todayShown) addItemRow(widget, it, now, false);
  } else if (feed && overdue.length === 0) {
    addText(widget, "All caught up", Font.boldSystemFont(LAYOUT.emptySize), THEME.text, { lineLimit: 1 });
    widget.addSpacer(4);
    if (upcoming.length > 0) {
      const nx = upcoming[0];
      addText(widget, `Next: ${nx.title}`, Font.systemFont(LAYOUT.titleSize), THEME.text, { lineLimit: 1, minScale: 0.85 });
      addText(widget, `${nx.course} · ${fmtDayShort(nx.dueDate)} ${fmtTime(nx.dueDate)}`,
        Font.systemFont(LAYOUT.metaSize), THEME.muted, { lineLimit: 1 });
    } else {
      addText(widget, "Nothing coming up.", Font.systemFont(LAYOUT.titleSize), THEME.muted, { lineLimit: 1 });
    }
  }
  if (feed && hidden > 0) {
    widget.addSpacer(LAYOUT.sectionGap);
    addText(widget, `+${hidden} more`, Font.systemFont(LAYOUT.metaSize), THEME.muted, { lineLimit: 1 });
  }
  widget.addSpacer();

  return widget;
}

async function main() {
  let widget;
  try {
    widget = await buildWidget();
  } catch (e) {
    // Never crash: render a minimal fallback widget.
    widget = new ListWidget();
    widget.backgroundColor = THEME.bg;
    widget.setPadding(16, 18, 16, 18);
    const t = widget.addText("School Widget");
    t.font = Font.boldSystemFont(18);
    t.textColor = THEME.header;
    const s = widget.addText("Couldn't load right now — check connection and try again.");
    s.font = Font.systemFont(13);
    s.textColor = THEME.muted;
  }
  Script.setWidget(widget);
  Script.complete();
}

await main();
