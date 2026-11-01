#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const USER = {
  monkeytype: "lio_dinesh",
  leetcode: "410725148010",
  codechef: "dce_25148010",
};
const DAYS = 91;
const C = {
  bg: "#0B1110", panel: "#14221D", border: "#29483D",
  text: "#ECF8F2", muted: "#91AAA0", faint: "#60776D",
  mint: "#57E6B5", cyan: "#5BD9E8", violet: "#A99BFF",
  amber: "#FFC66D", empty: "#24332F",
  levels: ["#25463A", "#287D5B", "#39B985", "#8CF2C2"],
};

const dateISO = (d) => d.toISOString().slice(0, 10);
function dateInTimezone(timeZone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}
function metric(label, value) {
  return { label, value: value === undefined || value === null || value === "" ? "--" : String(value) };
}
const addDays = (s, n) => {
  const d = new Date(s + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + n);
  return dateISO(d);
};
const timestampDate = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n < 1e12 ? n * 1000 : n);
  return Number.isNaN(d.getTime()) ? null : dateISO(d);
};
const xml = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

async function getJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(30000),
    headers: {
      accept: "application/json",
      "user-agent": "Dinesh-GitHub-Practice-Streak-Matrix/1.0",
      ...(options.headers ?? {}),
    },
  });
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("Non-JSON response (HTTP " + res.status + ")"); }
  if (!res.ok) throw new Error("HTTP " + res.status + ": " + String(data.message ?? raw).slice(0, 150));
  if (data.errors?.length) throw new Error(data.errors.map((e) => e.message).join("; ").slice(0, 150));
  return data;
}

function streaks(map, today) {
  const days = [...map.keys()].sort();
  let longest = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let cursor = map.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (map.has(cursor)) { current += 1; cursor = addDays(cursor, -1); }
  return { current, longest, activeDays: days.length, lastActiveDate: days.at(-1) ?? null };
}

function entriesToMap(entries) {
  const map = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    const d = String(e?.date ?? e?.day ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const count = Number(e.count ?? e.value ?? e.submissions ?? 0);
    if (Number.isFinite(count) && count > 0) map.set(d, (map.get(d) ?? 0) + count);
  }
  return map;
}

function monkeyActivity(activity) {
  const map = new Map();
  if (!Array.isArray(activity?.testsByDays) || !activity.lastDay) return map;
  const last = timestampDate(activity.lastDay);
  if (!last) return map;
  const values = activity.testsByDays;
  values.forEach((v, i) => {
    const count = Number(v ?? 0);
    if (count > 0) map.set(addDays(last, i - (values.length - 1)), count);
  });
  return map;
}

function unavailable(id, label, handle, color, url, note) {
  return { id, label, handle, color, url, status: "DATA UNAVAILABLE", current: null, longest: null, activeDays: null, lastActiveDate: null, activity: new Map(), activityAvailable: false, note };
}

async function monkeytype(today) {
  const url = "https://api.monkeytype.com/users/" + encodeURIComponent(USER.monkeytype) + "/profile";
  try {
    const response = await getJson(url);
    const p = response.data ?? response;
    const typingStats = p.typingStats ?? {};
    const pbTime = Array.isArray(p.personalBests?.time?.["60"]) ? p.personalBests.time["60"] : [];
    const pbWords = Array.isArray(p.personalBests?.words?.["50"]) ? p.personalBests.words["50"] : [];
    const best = [...pbTime, ...pbWords]
      .filter((item) => Number.isFinite(Number(item?.wpm)))
      .sort((a, b) => Number(b.wpm) - Number(a.wpm))[0];
    const metrics = [
      metric("BEST WPM", best ? Math.round(Number(best.wpm)) : "--"),
      metric("ACCURACY", best ? Math.round(Number(best.acc)) + "%" : "--"),
      metric("TESTS DONE", typingStats.completedTests ?? "--"),
      metric("TYPING TIME", typingStats.timeTyping ? Math.round(Number(typingStats.timeTyping) / 3600) + "h" : "--"),
    ];
    let map = monkeyActivity(p.testActivity);
    let activityAvailable = Boolean(p.testActivity);
    if (!activityAvailable && process.env.MONKEYTYPE_API_KEY) {
      try {
        const activityPayload = await getJson("https://api.monkeytype.com/users/currentTestActivity", {
          headers: { authorization: "ApeKey " + process.env.MONKEYTYPE_API_KEY },
        });
        map = monkeyActivity(activityPayload.data ?? activityPayload);
        activityAvailable = true;
      } catch (activityError) {
        console.warn("Monkeytype activity calendar unavailable: " + activityError.message);
      }
    }
    const stats = streaks(map, today);
    const current = Number(p.streak);
    const longest = Number(p.maxStreak);
    if (Number.isFinite(current) && Number.isFinite(longest)) {
      return {
        id: "monkeytype", label: "MONKEYTYPE", handle: USER.monkeytype, color: C.amber,
        url: "https://monkeytype.com/profile/" + USER.monkeytype,
        status: "PUBLIC PROFILE", current, longest,
        activeDays: activityAvailable ? stats.activeDays : null, lastActiveDate: stats.lastActiveDate,
        activity: map, activityAvailable, metrics,
        note: activityAvailable ? "Official current and maximum streak from public profile" : "Official streaks; daily activity calendar is private",
      };
    }
    throw new Error("Public profile did not return streak fields.");
  } catch (publicError) {
    const key = process.env.MONKEYTYPE_API_KEY;
    if (key) {
      try {
        const headers = { authorization: "ApeKey " + key };
        const result = await Promise.all([
          getJson("https://api.monkeytype.com/users/streak", { headers }),
          getJson("https://api.monkeytype.com/users/currentTestActivity", { headers }),
        ]);
        const s = result[0].data ?? result[0];
        const map = monkeyActivity(result[1].data ?? result[1]);
        const derived = streaks(map, today);
        return {
          id: "monkeytype", label: "MONKEYTYPE", handle: USER.monkeytype, color: C.amber,
          url: "https://monkeytype.com/profile/" + USER.monkeytype,
          status: "APEKEY CONNECTED", current: Number(s.length ?? derived.current),
          longest: Number(s.maxLength ?? derived.longest), activeDays: derived.activeDays,
          lastActiveDate: timestampDate(s.lastResultTimestamp) ?? derived.lastActiveDate,
          activity: map, activityAvailable: true, note: "Official Monkeytype streak endpoint",
        };
      } catch (keyError) {
        return unavailable("monkeytype", "MONKEYTYPE", USER.monkeytype, C.amber, "https://monkeytype.com/profile/" + USER.monkeytype, "API unavailable: " + keyError.message);
      }
    }
    return unavailable("monkeytype", "MONKEYTYPE", USER.monkeytype, C.amber, "https://monkeytype.com/profile/" + USER.monkeytype, "Public streak unavailable; optional MONKEYTYPE_API_KEY enables authenticated fallback.");
  }
}

const LEET_QUERY = "query UserCalendar($username: String!, $year: Int) { matchedUser(username: $username) { username submitStats { acSubmissionNum { difficulty count submissions } } userCalendar(year: $year) { activeYears streak totalActiveDays submissionCalendar } } }";

async function leetCalendar(year) {
  const payload = await getJson("https://leetcode.com/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", referer: "https://leetcode.com/", origin: "https://leetcode.com" },
    body: JSON.stringify({ query: LEET_QUERY, variables: { username: USER.leetcode, year } }),
  });
  const user = payload.data?.matchedUser;
  if (!user?.userCalendar) throw new Error(payload.errors?.[0]?.message ?? "LeetCode profile/calendar not found.");
  return { calendar: user.userCalendar, submitStats: user.submitStats ?? {} };
}

function mergeCalendar(calendar, map) {
  let data = calendar?.submissionCalendar ?? {};
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { data = {}; }
  }
  for (const [stamp, raw] of Object.entries(data)) {
    const count = Number(raw);
    const day = timestampDate(stamp);
    if (day && count > 0) map.set(day, (map.get(day) ?? 0) + count);
  }
}

async function leetcode(today) {
  try {
    const year = Number(today.slice(0, 4));
    const currentPayload = await leetCalendar(year);
    const currentCalendar = currentPayload.calendar;
    const submitStats = currentPayload.submitStats;
    const years = Array.isArray(currentCalendar.activeYears)
      ? [...new Set(currentCalendar.activeYears.map(Number).filter((y) => Number.isInteger(y) && y > 2000 && y <= year))]
      : [year];
    if (!years.includes(year)) years.push(year);
    const historyYears = years.filter((y) => y !== year);
    const calendars = await Promise.all(historyYears.map((y) => leetCalendar(y).catch(() => null)));
    const map = new Map();
    mergeCalendar(currentCalendar, map);
    calendars.filter(Boolean).forEach((result) => {
      if (result?.calendar) mergeCalendar(result.calendar, map);
    });
    const derived = streaks(map, today);
    const accepted = submitStats?.acSubmissionNum ?? [];
    const acceptedCount = (difficulty) => Number(accepted.find((item) => String(item.difficulty).toLowerCase() === difficulty.toLowerCase())?.count ?? 0);
    const metrics = [
      metric("SOLVED", acceptedCount("All")),
      metric("EASY", acceptedCount("Easy")),
      metric("MEDIUM", acceptedCount("Medium")),
      metric("HARD", acceptedCount("Hard")),
    ];
    return {
      id: "leetcode", label: "LEETCODE", handle: USER.leetcode, color: C.cyan,
      url: "https://leetcode.com/u/" + USER.leetcode + "/",
      status: "PUBLIC CALENDAR",
      current: Number.isFinite(Number(currentCalendar.streak)) ? Number(currentCalendar.streak) : derived.current,
      longest: derived.longest,
      activeDays: Number(currentCalendar.totalActiveDays ?? derived.activeDays),
      lastActiveDate: derived.lastActiveDate,
      activity: map, activityAvailable: true, metrics,
      note: "Current streak from LeetCode; longest calculated across available calendar years",
    };
  } catch (error) {
    return unavailable("leetcode", "LEETCODE", USER.leetcode, C.cyan, "https://leetcode.com/u/" + USER.leetcode + "/", "LeetCode calendar unavailable: " + error.message);
  }
}

async function codechef(today) {
  try {
    const [heatmapPayload, summaryPayload] = await Promise.all([
      getJson("https://codechef-stats.tashif.codes/heatmap/" + encodeURIComponent(USER.codechef) + "?view=all"),
      getJson("https://codechef-stats.tashif.codes/" + encodeURIComponent(USER.codechef)),
    ]);
    const data = heatmapPayload.data ?? heatmapPayload;
    const summary = summaryPayload.data ?? summaryPayload;
    if (heatmapPayload.status === "error" || data.status === "error") {
      throw new Error(heatmapPayload.message ?? data.message ?? "Profile heatmap could not be read.");
    }
    const map = entriesToMap(data.dailyContributions ?? data.heatMap ?? data.heatmap ?? []);
    const derived = streaks(map, today);
    const metrics = [
      metric("SOLVED", summary.totalSolved),
      metric("RATING", summary.currentRating),
      metric("BEST RATING", summary.maxRating),
      metric("STARS", summary.rank),
    ];
    return {
      id: "codechef", label: "CODECHEF", handle: USER.codechef, color: C.violet,
      url: "https://www.codechef.com/users/" + USER.codechef,
      status: "PUBLIC HEATMAP",
      current: Number.isFinite(Number(data.currentStreak)) ? Number(data.currentStreak) : derived.current,
      longest: Number.isFinite(Number(data.longestStreak)) ? Number(data.longestStreak) : derived.longest,
      activeDays: Number(data.totalActiveDays ?? derived.activeDays),
      lastActiveDate: data.lastActiveDate ?? derived.lastActiveDate,
      activity: map, activityAvailable: true, metrics,
      note: "Heatmap-derived submission streak; CodeChef streak freezes may not be reflected",
    };
  } catch (error) {
    return unavailable("codechef", "CODECHEF", USER.codechef, C.violet,
      "https://www.codechef.com/users/" + USER.codechef,
      "CodeChef heatmap unavailable: " + error.message);
  }
}

function formatDate(value) {
  if (!value) return "NO RECENT ACTIVITY";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T00:00:00Z")).toUpperCase();
}
function activityWindow(map, today) {
  const result = [];
  for (let i = DAYS - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    result.push({ date, count: Number(map.get(date) ?? 0) });
  }
  return result;
}
function level(count, max) {
  if (count <= 0) return 0;
  if (max <= 1) return 4;
  const ratio = count / max;
  return ratio <= .25 ? 1 : ratio <= .5 ? 2 : ratio <= .75 ? 3 : 4;
}
function poly(points, fill, attrs = "") {
  return '<polygon points="' + points + '" fill="' + fill + '" ' + attrs + '/>';
}
function isoTile(x, y, n) {
  const top = n === 0 ? C.empty : C.levels[n - 1];
  const left = n === 0 ? "#1A2924" : n < 3 ? "#174A38" : "#267B59";
  const right = n === 0 ? "#1D2D28" : n < 3 ? "#1D6248" : "#2F9A6B";
  const a = x + "," + (y + 4);
  const b = (x + 8) + "," + y;
  const c = (x + 16) + "," + (y + 4);
  const d = (x + 8) + "," + (y + 8);
  return poly(a + " " + d + " " + (x + 8) + "," + (y + 11) + " " + x + "," + (y + 7), left) +
    poly(d + " " + c + " " + (x + 16) + "," + (y + 7) + " " + (x + 8) + "," + (y + 11), right) +
    poly(a + " " + b + " " + c + " " + d, top, 'stroke="#0D1814" stroke-width=".7"');
}
function label(x, y, value, size, color, weight = 500, anchor = "start", extra = "") {
  return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="' + weight + '" fill="' + color + '" text-anchor="' + anchor + '" ' + extra + '>' + xml(value) + '</text>';
}
function drawCard(p, x, today) {
  const y = 132, w = 372, h = 420;
  const arr = activityWindow(p.activity, today);
  const max = Math.max(1, ...arr.map((a) => a.count));
  const active = arr.filter((a) => a.count > 0).length;
  const activeLabel = p.activityAvailable ? active + " / 91" : "PRIVATE";
  const current = Number.isFinite(p.current) ? String(p.current) : "--";
  const longest = Number.isFinite(p.longest) ? String(p.longest) : "--";
  const out = [];
  out.push('<g class="platform-card">');
  out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="22" fill="url(#cardGradient)" stroke="' + p.color + '" stroke-opacity=".42" stroke-width="1.4"/>');
  out.push('<path d="M' + (x + 22) + ' ' + (y + 2) + ' H' + (x + w - 22) + '" stroke="' + p.color + '" stroke-width="3" stroke-linecap="round"/>');
  out.push('<circle cx="' + (x + w - 34) + '" cy="' + (y + 37) + '" r="14" fill="' + p.color + '" opacity=".12"/>');
  out.push('<circle cx="' + (x + w - 34) + '" cy="' + (y + 37) + '" r="5" fill="' + p.color + '" class="pulse"/>');
  out.push(label(x + 24, y + 43, p.label, 17, C.text, 850));
  out.push(label(x + 24, y + 65, p.handle, 11, C.muted, 500));
  out.push('<rect x="' + (x + 223) + '" y="' + (y + 20) + '" width="121" height="24" rx="12" fill="' + p.color + '" opacity=".13"/>');
  out.push(label(x + 283.5, y + 36, p.status, 8.5, p.color, 800, "middle", 'letter-spacing=".75"'));
  out.push(label(x + 24, y + 126, current, 51, C.text, 850));
  out.push(label(x + 26, y + 150, "CURRENT STREAK · DAYS", 9, C.muted, 750, "start", 'letter-spacing=".7"'));
  out.push('<line x1="' + (x + 194) + '" y1="' + (y + 91) + '" x2="' + (x + 194) + '" y2="' + (y + 160) + '" stroke="' + C.border + '"/>');
  out.push(label(x + 218, y + 124, longest, 38, p.color, 850));
  out.push(label(x + 220, y + 150, "LONGEST · DAYS", 9, C.muted, 750, "start", 'letter-spacing=".7"'));
  out.push(label(x + 24, y + 181, p.note.length > 55 ? p.note.slice(0, 52) + "…" : p.note, 8.5, C.faint, 500));
  const metricItems = Array.isArray(p.metrics) ? p.metrics.slice(0, 4) : [];
  metricItems.forEach((item, index) => {
    const mx = x + 24 + index * 82;
    out.push(label(mx, y + 209, item.value, 13, p.color, 850));
    out.push(label(mx, y + 225, item.label, 7, C.muted, 750, "start", 'letter-spacing=".35"'));
  });
  out.push(label(x + 24, y + 249, "13-WEEK ACTIVITY · ISOMETRIC VIEW", 9.5, C.muted, 750, "start", 'letter-spacing=".7"'));
  const gx = x + 44, gy = y + 288;
  for (let col = 0; col < 13; col += 1) {
    for (let row = 0; row < 7; row += 1) {
      const a = arr[col * 7 + row];
      out.push(isoTile(gx + col * 17 + row * 7, gy + col * 6 - row * 6, level(a.count, max)));
    }
  }
  out.push(label(x + 24, y + 385, "ACTIVE DAYS", 9, C.faint, 750, "start", 'letter-spacing=".7"'));
  out.push(label(x + 112, y + 385, activeLabel, 10, C.text, 750));
  out.push(label(x + w - 24, y + 385, "LAST " + formatDate(p.lastActiveDate), 8.5, C.muted, 750, "end"));
  out.push(label(x + 24, y + 406, (p.activityAvailable ? "OPEN PLATFORM PROFILE FOR FULL ACTIVITY DETAILS" : "ACTIVITY CALENDAR PRIVATE — STREAKS FROM PROFILE"), 7.5, C.faint, 600));
  out.push('</g>');
  return out.join("");
}
function renderSvg(platforms, today) {
  const now = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date()).toUpperCase();
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="620" viewBox="0 0 1200 620" role="img" aria-labelledby="title desc">');
  out.push('<title id="title">Dinesh G — 3D Daily Practice Streak Matrix</title>');
  out.push('<desc id="desc">Current streaks, longest streaks and isometric activity calendars for Monkeytype, LeetCode and CodeChef.</desc>');
  out.push('<defs>');
  out.push('<linearGradient id="pageGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1110"/><stop offset=".55" stop-color="#101D19"/><stop offset="1" stop-color="#111A24"/></linearGradient>');
  out.push('<linearGradient id="cardGradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#172521"/><stop offset="1" stop-color="#101A18"/></linearGradient>');
  out.push('<radialGradient id="glow"><stop offset="0" stop-color="#45D5A0" stop-opacity=".2"/><stop offset="1" stop-color="#45D5A0" stop-opacity="0"/></radialGradient>');
  out.push('<style>text{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.platform-card{animation:rise .7s ease both;transform-box:fill-box;transform-origin:center}.platform-card:nth-of-type(2){animation-delay:.12s}.platform-card:nth-of-type(3){animation-delay:.24s}.pulse{animation:pulse 2.8s ease-in-out infinite}@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}</style>');
  out.push('</defs><rect width="1200" height="620" rx="26" fill="url(#pageGradient)"/>');
  out.push('<circle cx="90" cy="48" r="190" fill="url(#glow)"/><circle cx="1110" cy="46" r="170" fill="url(#glow)"/>');
  out.push('<path d="M32 96 H1168" stroke="#29483D"/>');
  out.push(label(34, 46, "DAILY PRACTICE / STREAK MATRIX", 26, C.text, 850, "start", 'letter-spacing="1.1"'));
  out.push(label(35, 72, "THREE PLATFORMS · ONE CONSISTENT ROUTINE · 3D ACTIVITY VIEW", 10, C.muted, 700, "start", 'letter-spacing="1"'));
  out.push('<rect x="950" y="28" width="218" height="34" rx="17" fill="#1C332B" stroke="#315D4C"/><circle cx="970" cy="45" r="4" fill="' + C.mint + '" class="pulse"/>');
  out.push(label(983, 49, "UPDATED " + now + " IST", 8.5, C.mint, 800));
  [24, 414, 804].forEach((x, i) => out.push(drawCard(platforms[i], x, today)));
  out.push(label(34, 584, "SOURCE NOTES", 9, C.mint, 800, "start", 'letter-spacing="1"'));
  out.push(label(145, 584, "Monkeytype = official profile · LeetCode = public calendar · CodeChef = heatmap estimate (freeze days may differ)", 8.0, C.muted, 500));
  out.push(label(34, 603, "Activity data is shown for the last 13 weeks. Use the platform links in the README for the authoritative account view.", 8.5, C.faint, 500));
  out.push('</svg>');
  return out.join("\n");
}

async function main() {
  const today = dateInTimezone("Asia/Kolkata");
  const results = await Promise.allSettled([monkeytype(today), leetcode(today), codechef(today)]);
  const fallback = [
    ["monkeytype", "MONKEYTYPE", USER.monkeytype, C.amber, "https://monkeytype.com/profile/" + USER.monkeytype],
    ["leetcode", "LEETCODE", USER.leetcode, C.cyan, "https://leetcode.com/u/" + USER.leetcode + "/"],
    ["codechef", "CODECHEF", USER.codechef, C.violet, "https://www.codechef.com/users/" + USER.codechef],
  ];
  const platforms = results.map((r, i) => r.status === "fulfilled" ? r.value : unavailable(...fallback[i], r.reason?.message ?? "Unknown error"));
  const output = path.resolve(process.cwd(), "assets/practice-streaks.svg");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, renderSvg(platforms, today), "utf8");
  console.log("Generated assets/practice-streaks.svg for IST date " + today);
  for (const p of platforms) {
    console.log(p.label + ": current=" + (p.current ?? "n/a") +
      " longest=" + (p.longest ?? "n/a") +
      " activeDays=" + (p.activeDays ?? "private/unavailable") +
      " status=" + p.status);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
