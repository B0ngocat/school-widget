// SchoolWidget-Blue.js — Scriptable widget for iPad: homework only, live from Schoology.
// Small (2x2), Medium (4x2), or Large — the layout adapts to the widget size you pick.
// No weather, no location — just overdue + today's homework, tests, and quizzes.
//
// SETUP: paste this whole file into a new script in Scriptable, then add a
// Scriptable widget on the home screen (Small or Medium) and pick this script.
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
      titleSize: 13, metaSize: 10, chipSize: 9, emptySize: 15,
      maxToday: 2, maxOverdue: 1, maxTotalRows: 3, rowGap: 5, sectionGap: 4, headGap: 6 }
  : IS_MEDIUM
  ? { pad: [12, 16, 10, 16], dateSize: 16, stampSize: 10, sectionSize: 11,
      titleSize: 13, metaSize: 10, chipSize: 9, emptySize: 15,
      maxToday: 3, maxOverdue: 1, maxTotalRows: 3, rowGap: 6, sectionGap: 4, headGap: 6 }
  : { pad: [16, 18, 14, 18], dateSize: 18, stampSize: 11, sectionSize: 11,
      titleSize: 14, metaSize: 11, chipSize: 10, emptySize: 17,
      maxToday: 4, maxOverdue: 2, maxTotalRows: 99, rowGap: 9, sectionGap: 5, headGap: 10 };

// Blue / white theme (matches the morning-brief card).
const THEME = {
  bg: new Color("#ffffff"),
  header: new Color("#1e3a8a"),
  text: new Color("#0f172a"),
  muted: new Color("#64748b"),
  accent: new Color("#2563eb"),
  overdue: new Color("#b91c1c"),
  chipBg: {
    homework: new Color("#dbeafe"),
    test: new Color("#fee2e2"),
    quiz: new Color("#ede9fe"),
    project: new Color("#d1fae5"),
  },
  chipText: {
    homework: new Color("#1d4ed8"),
    test: new Color("#b91c1c"),
    quiz: new Color("#6d28d9"),
    project: new Color("#047857"),
  },
};

const TYPE_LABEL = { homework: "HW", test: "TEST", quiz: "QUIZ", project: "PROJ" };
const CACHE_FEED = "school-widget-feed.json";

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

function addTypeChip(stack, type) {
  const chip = stack.addStack();
  chip.backgroundColor = THEME.chipBg[type] || THEME.chipBg.homework;
  chip.cornerRadius = 4;
  chip.setPadding(2, 6, 2, 6);
  const t = chip.addText(TYPE_LABEL[type] || "HW");
  t.font = Font.boldSystemFont(LAYOUT.chipSize);
  t.textColor = THEME.chipText[type] || THEME.chipText.homework;
  return chip;
}

function addItemRow(col, item, now, isOverdueRow) {
  const due = new Date(item.due);
  const row = col.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  addTypeChip(row, item.type);
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
  const { feed, stamp, fromCache } = await loadFeed();

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
