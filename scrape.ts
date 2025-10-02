#!/usr/bin/env node
import fs from "fs-extra";
import path from "path";
import * as cheerio from "cheerio";

type ScorePoint = {
  timestamp: string; // ISO string
  points: number;
};

type TextEntry = {
  name: string;
  url: string;
  score: ScorePoint[];
};

type Schema = TextEntry[];

const DEFAULT_URL = "https://texte.wien/texte.html";
const DEFAULT_OUT = path.join(process.cwd(), `/out/${new Date().getFullYear()}-scores.json`);

// --- Utility to prefix logs with current datetime ---
function log(message: string) {
  const now = new Date().toISOString().replace("T", " ").replace("Z", "");
  console.log(`[${now}] ${message}`);
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return await res.text();
}

function parsePointsFromLi($li: cheerio.Cheerio, $: cheerio.Root): number {
  const divText = $li.find("div.punkte").first().text().trim();
  if (divText) {
    const m = divText.match(/(\d{1,5})/);
    if (m) return parseInt(m[1], 10);
  }

  const classList = ($li.attr("class") || "") + " " + ($li.find("div").attr("class") || "");
  const m2 = classList.match(/pt-(\d{1,5})/);
  if (m2) return parseInt(m2[1], 10);

  const liHtml = $li.html() || "";
  const m3 = liHtml.match(/(?:\(|\s)(\d{1,5})(?:\s*Punkte|\s*punkt|<\/span>|\))/i);
  if (m3) return parseInt(m3[1], 10);

  return 0;
}

function normalizeName(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

async function loadExisting(outPath: string): Promise<Schema> {
  try {
    const txt = await fs.readFile(outPath, "utf8");
    return JSON.parse(txt) as Schema;
  } catch {
    return [];
  }
}

async function saveOut(outPath: string, data: Schema): Promise<void> {
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), "utf8");
}

async function main() {
  const argv = process.argv.slice(2);
  const pageUrl = argv[0] ?? DEFAULT_URL;
  const outPath = argv[1] ?? DEFAULT_OUT;

  if (pageUrl === DEFAULT_URL) {
    log("Warning: using default URL. Replace DEFAULT_URL or pass a URL as first arg.");
  }

  log(`Fetching ${pageUrl} ...`);
  const html = await fetchHtml(pageUrl);
  const $ = cheerio.load(html);

  const items = $("ul#textlist li[data-cnt]");
  if (items.length === 0) {
    log("No items found with selector 'ul#textlist li[data-cnt]'. Trying fallback 'li[data-cnt]' ...");
  }
  const itemsFallback = items.length ? items : $("li[data-cnt]");

  const base = new URL(pageUrl);
  const parsedEntries: TextEntry[] = [];

  itemsFallback.each((_, el) => {
    const $li = $(el);
    const $a = $li.find("a").first();
    if (!$a || $a.length === 0) return;

    const name = normalizeName($a.text());
    let href = $a.attr("href") || "";
    try {
      href = new URL(href, base).href;
    } catch {
      href = href;
    }

    const points = parsePointsFromLi($li, $);
    parsedEntries.push({
      name,
      url: href,
      score: [{ timestamp: new Date().toISOString(), points }],
    });
  });

  const existing = await loadExisting(outPath);
  const existingMap = new Map<string, TextEntry>();
  for (const e of existing) existingMap.set(e.url || e.name, e);

  for (const p of parsedEntries) {
    const key = p.url || p.name;
    const existingEntry = existingMap.get(key);

    if (!existingEntry) {
      existingMap.set(key, p);
      log(`✅ New entry: "${p.name}" -> ${p.score[0].points} points`);
    } else {
      const last = existingEntry.score.length > 0 ? existingEntry.score[existingEntry.score.length - 1] : null;
      const currentPoints = p.score[0].points;
      if (!last || last.points !== currentPoints) {
        existingEntry.score.push({ timestamp: p.score[0].timestamp, points: currentPoints });
        log(`⬆️ Updated "${existingEntry.name}": ${last ? last.points : "N/A"} -> ${currentPoints}`);
      } else {
        log(`⏸ No change for "${existingEntry.name}" (still ${currentPoints})`);
      }
    }
  }

  const merged: Schema = Array.from(existingMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  await saveOut(outPath, merged);
  log(`💾 Saved ${merged.length} entries to ${outPath}`);
}

main().catch((err) => {
  log(`❌ Error: ${err}`);
  process.exit(1);
});