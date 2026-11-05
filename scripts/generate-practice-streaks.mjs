#!/usr/bin/env node
// Daily profile dashboard: refresh platform data and regenerate the 3D practice matrix.
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
    const [heatmapPayload, summaryPayload, profilePayload, ratingPayload] = await Promise.all([
      getJson("https://codechef-stats.tashif.codes/heatmap/" + encodeURIComponent(USER.codechef) + "?view=all"),
      getJson("https://codechef-stats.tashif.codes/" + encodeURIComponent(USER.codechef)),
      getJson("https://codechef-stats.tashif.codes/profile/" + encodeURIComponent(USER.codechef)),
      getJson("https://codechef-stats.tashif.codes/rating/" + encodeURIComponent(USER.codechef)),
    ]);
    const data = heatmapPayload.data ?? heatmapPayload;
    const summary = summaryPayload.data ?? summaryPayload;
    const profileInfo = profilePayload.profile ?? profilePayload.data?.profile ?? {};
    const ratingHistory = Array.isArray(ratingPayload.ratingData)
      ? ratingPayload.ratingData
      : Array.isArray(ratingPayload.data?.history)
        ? ratingPayload.data.history
        : [];
    const ratingValues = ratingHistory
      .map((item) => Number(item?.rating))
      .filter((value) => Number.isFinite(value) && value > 0);
    const lastRating = [...ratingHistory].reverse()
      .map((item) => Number(item?.rating))
      .find((value) => Number.isFinite(value) && value > 0);
    const currentRating = profileInfo.currentRating ?? summary.currentRating ?? lastRating ?? null;
    const highestRating = profileInfo.highestRating ?? summary.maxRating ??
      (ratingValues.length ? Math.max(...ratingValues) : null);
    const stars = profileInfo.stars ?? summary.rank ?? null;

    if (heatmapPayload.status === "error" || data.status === "error") {
      throw new Error(heatmapPayload.message ?? data.message ?? "Profile heatmap could not be read.");
    }

    const map = entriesToMap(data.dailyContributions ?? data.heatMap ?? data.heatmap ?? []);
    const derived = streaks(map, today);
    const metrics = [
      metric("SOLVED", summary.totalSolved ?? profileInfo.totalSolved),
      metric("RATING", currentRating),
      metric("BEST RATING", highestRating),
      metric("STARS", stars),
    ].filter((item) => item.value !== "--");

    if (metrics.length < 4 && summary.totalActiveDays !== undefined) {
      metrics.push(metric("ACTIVE DAYS", summary.totalActiveDays));
    }
    if (metrics.length < 4 && summary.totalContests !== undefined) {
      metrics.push(metric("CONTESTS", summary.totalContests));
    }

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

async function githubActivity(today) {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN was not supplied to the workflow.");

    const query = `query ProfileActivity($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }`;
    const payload = await getJson("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, variables: { login: "lio-dinesh" } }),
    });

    const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
    if (!calendar) throw new Error("GitHub contribution calendar was not returned.");

    const map = new Map();
    for (const week of calendar.weeks ?? []) {
      for (const day of week.contributionDays ?? []) {
        const count = Number(day.contributionCount ?? 0);
        if (count > 0) map.set(day.date, count);
      }
    }
    const derived = streaks(map, today);
    const recent = activityWindow(map, today);
    const peak = Math.max(0, ...recent.map((day) => day.count));
    const metrics = [
      metric("CONTRIBUTIONS · 12M", calendar.totalContributions),
      metric("ACTIVE DAYS · 13W", recent.filter((day) => day.count > 0).length),
      metric("PEAK DAY · 13W", peak),
      metric("AVG / ACTIVE DAY", recent.filter((day) => day.count > 0).length
        ? (recent.reduce((sum, day) => sum + day.count, 0) / recent.filter((day) => day.count > 0).length).toFixed(1)
        : "0"),
    ];

    return {
      id: "github",
      label: "GITHUB",
      handle: "lio-dinesh",
      color: "#58A6FF",
      url: "https://github.com/lio-dinesh",
      status: "GITHUB GRAPHQL",
      current: derived.current,
      longest: derived.longest,
      activeDays: derived.activeDays,
      lastActiveDate: derived.lastActiveDate,
      activity: map,
      activityAvailable: true,
      metrics,
      note: "GitHub contribution calendar; updates when GitHub records a contribution",
    };
  } catch (error) {
    return unavailable(
      "github",
      "GITHUB",
      "lio-dinesh",
      "#58A6FF",
      "https://github.com/lio-dinesh",
      "GitHub contribution data unavailable: " + error.message
    );
  }
}

function dashboardSnapshot(platforms, today) {
  const generatedAt = new Date().toISOString();
  const generatedAtIST = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date());

  return {
    schemaVersion: 1,
    owner: "Dinesh G",
    generatedAt,
    generatedAtIST,
    timezone: "Asia/Kolkata",
    activityDate: today,
    refreshIntervalSeconds: 300,
    platforms: platforms.map((platform) => {
      const recent = activityWindow(platform.activity, today);
      return {
        id: platform.id,
        label: platform.label,
        handle: platform.handle,
        url: platform.url,
        status: platform.status,
        currentStreak: platform.current,
        longestStreak: platform.longest,
        activeDays: platform.activityAvailable
          ? recent.filter((day) => Number(day.count) > 0).length
          : null,
        lastActiveDate: platform.lastActiveDate,
        activityAvailable: Boolean(platform.activityAvailable),
        note: platform.note,
        metrics: platform.metrics ?? [],
        dailyActivity: recent.map((day) => ({
          date: day.date,
          count: Number(day.count ?? 0),
        })),
      };
    }),
  };
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
function rect(x, y, width, height, fill, attrs = "") {
  return '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" fill="' + fill + '" ' + attrs + '/>';
}
function label(x, y, value, size, color, weight = 500, anchor = "start", extra = "") {
  return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" font-weight="' + weight + '" fill="' + color + '" text-anchor="' + anchor + '" ' + extra + '>' + xml(value) + '</text>';
}
function heatColor(count, max) {
  if (count <= 0) return "#161B22";
  const ratio = count / Math.max(1, max);
  if (ratio <= .25) return "#0E4429";
  if (ratio <= .50) return "#006D32";
  if (ratio <= .75) return "#26A641";
  return "#39D353";
}
function drawCard(p, x, today) {
  const y = 126, w = 372, h = 438;
  const arr = activityWindow(p.activity, today);
  const max = Math.max(1, ...arr.map((a) => a.count));
  const active = arr.filter((a) => a.count > 0).length;
  const activeLabel = p.activityAvailable ? active + " / 91 days" : "Private / unavailable";
  const current = Number.isFinite(p.current) ? String(p.current) : "—";
  const longest = Number.isFinite(p.longest) ? String(p.longest) : "—";
  const out = [];
  out.push('<g class="platform-card">');
  out.push(rect(x, y, w, h, "#0D1117", 'rx="10" stroke="#30363D" stroke-width="1.2"'));
  out.push(label(x + 22, y + 34, p.label, 16, "#E6EDF3", 700));
  out.push(label(x + 22, y + 55, p.handle, 10, "#8B949E", 400));
  out.push('<a href="' + xml(p.url) + '" target="_blank">');
  out.push(label(x + w - 20, y + 34, "OPEN PROFILE ↗", 9, "#58A6FF", 600, "end"));
  out.push('</a>');
  out.push('<line x1="' + (x + 20) + '" y1="' + (y + 72) + '" x2="' + (x + w - 20) + '" y2="' + (y + 72) + '" stroke="#21262D"/>');

  out.push(label(x + 22, y + 116, current, 42, "#F0F6FC", 700));
  out.push(label(x + 22, y + 137, "CURRENT STREAK", 9, "#8B949E", 600, "start", 'letter-spacing=".5"'));
  out.push(label(x + 202, y + 116, longest, 42, "#F0F6FC", 700));
  out.push(label(x + 202, y + 137, "LONGEST STREAK", 9, "#8B949E", 600, "start", 'letter-spacing=".5"'));
  out.push(label(x + 22, y + 160, p.note.length > 58 ? p.note.slice(0, 55) + "…" : p.note, 8.5, "#6E7681", 400));
  out.push('<line x1="' + (x + 20) + '" y1="' + (y + 177) + '" x2="' + (x + w - 20) + '" y2="' + (y + 177) + '" stroke="#21262D"/>');

  const metricItems = Array.isArray(p.metrics) ? p.metrics.slice(0, 4) : [];
  metricItems.forEach((item, index) => {
    const col = index % 2, row = Math.floor(index / 2);
    const mx = x + 22 + col * 174, my = y + 205 + row * 43;
    out.push(label(mx, my, item.value, 15, "#E6EDF3", 650));
    out.push(label(mx, my + 13, item.label, 8, "#8B949E", 600, "start", 'letter-spacing=".4"'));
  });

  out.push('<line x1="' + (x + 20) + '" y1="' + (y + 278) + '" x2="' + (x + w - 20) + '" y2="' + (y + 278) + '" stroke="#21262D"/>');
  out.push(label(x + 22, y + 301, "ACTIVITY · LAST 13 WEEKS", 9, "#C9D1D9", 650, "start", 'letter-spacing=".5"'));
  const gx = x + 24, gy = y + 318, cell = 11, gap = 3;
  for (let col = 0; col < 13; col += 1) {
    for (let row = 0; row < 7; row += 1) {
      const a = arr[col * 7 + row];
      const px = gx + col * (cell + gap), py = gy + row * (cell + gap);
      const date = a.date;
      out.push('<rect x="' + px + '" y="' + py + '" width="' + cell + '" height="' + cell + '" rx="2" fill="' + heatColor(a.count, max) + '" stroke="#30363D" stroke-width=".35"><title>' + xml(date + ": " + a.count + " activity") + '</title></rect>');
    }
  }
  out.push(label(x + 22, y + 416, "ACTIVE DAYS", 8, "#8B949E", 600));
  out.push(label(x + 103, y + 416, activeLabel, 9, "#C9D1D9", 600));
  out.push(label(x + w - 20, y + 416, "LAST " + formatDate(p.lastActiveDate), 8, "#8B949E", 500, "end"));
  out.push('</g>');
  return out.join("");
}
function renderSvg(platforms, today) {
  const now = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date()).toUpperCase();
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="620" viewBox="0 0 1200 620" role="img" aria-labelledby="title desc">');
  out.push('<title id="title">Dinesh G — Daily Coding Practice</title>');
  out.push('<desc id="desc">A clean, GitHub-style activity breakdown for Monkeytype, LeetCode and CodeChef, with streak totals, platform metrics and 13-week activity heatmaps.</desc>');
  out.push('<style>text{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.platform-card{opacity:1}@media(prefers-reduced-motion:reduce){*{animation:none!important}}</style>');
  out.push(rect(0, 0, 1200, 620, "#010409"));
  out.push(label(30, 43, "DAILY CODING PRACTICE", 24, "#F0F6FC", 700));
  out.push(label(31, 68, "MONKEYTYPE  /  LEETCODE  /  CODECHEF", 10, "#8B949E", 600, "start", 'letter-spacing="1"'));
  out.push(label(1170, 43, "UPDATED " + now + " IST", 9, "#8B949E", 500, "end"));
  out.push('<line x1="30" y1="87" x2="1170" y2="87" stroke="#21262D"/>');
  [24, 414, 804].forEach((x, i) => out.push(drawCard(platforms[i], x, today)));
  out.push(label(30, 592, "ACTIVITY LEVEL", 8, "#8B949E", 600, "start", 'letter-spacing=".5"'));
  ["#161B22", "#0E4429", "#006D32", "#26A641", "#39D353"].forEach((color, i) => {
    out.push(rect(125 + i * 17, 581, 11, 11, color, 'rx="2" stroke="#30363D" stroke-width=".35"'));
  });
  out.push(label(224, 590, "Less", 8, "#8B949E", 400));
  out.push(label(265, 590, "More", 8, "#8B949E", 400));
  out.push(label(1170, 592, "13-WEEK WINDOW · PLATFORM LINKS OPEN SOURCE PROFILES", 8, "#6E7681", 400, "end"));
  out.push('</svg>');
  return out.join("\n");
}
async function main() {
  const today = dateInTimezone("Asia/Kolkata");
  const results = await Promise.allSettled([
    monkeytype(today),
    leetcode(today),
    codechef(today),
    githubActivity(today),
  ]);
  const fallback = [
    ["monkeytype", "MONKEYTYPE", USER.monkeytype, C.amber, "https://monkeytype.com/profile/" + USER.monkeytype],
    ["leetcode", "LEETCODE", USER.leetcode, C.cyan, "https://leetcode.com/u/" + USER.leetcode + "/"],
    ["codechef", "CODECHEF", USER.codechef, C.violet, "https://www.codechef.com/users/" + USER.codechef],
    ["github", "GITHUB", "lio-dinesh", "#58A6FF", "https://github.com/lio-dinesh"],
  ];
  const platforms = results.map((r, i) => r.status === "fulfilled" ? r.value : unavailable(...fallback[i], r.reason?.message ?? "Unknown error"));

  const output = path.resolve(process.cwd(), "assets/practice-streaks.svg");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, renderSvg(platforms.slice(0, 3), today), "utf8");

  const dashboardPath = path.resolve(process.cwd(), "dashboard/data.json");
  await fs.mkdir(path.dirname(dashboardPath), { recursive: true });
  const snapshot = dashboardSnapshot(platforms, today);
  await fs.writeFile(dashboardPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

  // Keep one compact, source-backed record per IST day. The file is rewritten
  // only when that day's actual platform values change, avoiding 5-minute churn.
  const historyDir = path.resolve(process.cwd(), "dashboard/history");
  await fs.mkdir(historyDir, { recursive: true });
  const dailyRecord = {
    schemaVersion: 1,
    date: today,
    timezone: "Asia/Kolkata",
    platforms: platforms.map((platform) => {
      const todayItem = activityWindow(platform.activity, today).at(-1);
      return {
        id: platform.id,
        label: platform.label,
        handle: platform.handle,
        status: platform.status,
        activityAvailable: Boolean(platform.activityAvailable),
        activityCount: Number(todayItem?.count ?? 0),
        currentStreak: platform.current,
        longestStreak: platform.longest,
        lastActiveDate: platform.lastActiveDate,
        metrics: platform.metrics ?? [],
      };
    }),
  };
  const dailyPath = path.join(historyDir, today + ".json");
  const dailyContent = JSON.stringify(dailyRecord, null, 2) + "\n";
  let existingDaily = "";
  try { existingDaily = await fs.readFile(dailyPath, "utf8"); } catch {}
  if (existingDaily !== dailyContent) {
    await fs.writeFile(dailyPath, dailyContent, "utf8");
  }

  const historyFiles = (await fs.readdir(historyDir))
    .filter((name) => /^\\d{4}-\\d{2}-\\d{2}\\.json$/.test(name))
    .sort()
    .slice(-730)
    .reverse();
  const historyIndex = {
    schemaVersion: 1,
    timezone: "Asia/Kolkata",
    retainedDays: historyFiles.length,
    dates: historyFiles.map((name) => name.slice(0, 10)),
  };
  const indexPath = path.join(historyDir, "index.json");
  const indexContent = JSON.stringify(historyIndex, null, 2) + "\n";
  let existingIndex = "";
  try { existingIndex = await fs.readFile(indexPath, "utf8"); } catch {}
  if (existingIndex !== indexContent) {
    await fs.writeFile(indexPath, indexContent, "utf8");
  }

  console.log("Generated SVG, dashboard/data.json and daily history for IST date " + today);
  for (const p of platforms) {
    console.log(p.label + ": current=" + (p.current ?? "n/a") +
      " longest=" + (p.longest ?? "n/a") +
      " activeDays=" + (p.activeDays ?? "private/unavailable") +
      " metrics=" + JSON.stringify(p.metrics ?? []) +
      " status=" + p.status);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
