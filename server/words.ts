import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Language } from "../shared/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wordsDir = path.resolve(__dirname, "..", "words");

const cache = new Map<Language, readonly string[]>();

function load(lang: Language): readonly string[] {
  const cached = cache.get(lang);
  if (cached) return cached;
  const raw = readFileSync(path.join(wordsDir, `${lang}.json`), "utf8");
  const list = JSON.parse(raw) as string[];
  cache.set(lang, list);
  return list;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Draw `size` words from the union of `langs`, sampling roughly equally per
 * language and avoiding any word in `exclude`. Final result is shuffled so
 * languages are interleaved.
 *
 * If a language doesn't have enough words after the exclude filter, we backfill
 * from any other language. Cross-language duplicates (e.g., "radio" exists in
 * EN, ES, IT) are deduped.
 */
export function drawPool(
  langs: readonly Language[],
  size: number,
  exclude?: ReadonlySet<string>,
): string[] {
  const langList = langs.length > 0 ? Array.from(langs) : ["en" as Language];

  // Compute target per language: floor(size/n), with the remainder spread across the first few langs.
  const base = Math.floor(size / langList.length);
  let remainder = size - base * langList.length;
  const target = new Map<Language, number>();
  // Shuffle the language order so the +1 remainders aren't always the same languages.
  for (const l of shuffle(langList)) {
    target.set(l, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }

  const excludeSet = new Set(exclude ?? []);
  const result = new Set<string>();

  // Pass 1: try to pull each language's target.
  for (const lang of langList) {
    const list = load(lang);
    const candidates = list.filter(
      (w) => !excludeSet.has(w) && !result.has(w),
    );
    const want = target.get(lang) ?? 0;
    if (candidates.length === 0) continue;
    const picks = sampleN(candidates, Math.min(want, candidates.length));
    for (const w of picks) result.add(w);
  }

  // Pass 2: backfill any deficit from any language (deduped against result + exclude).
  if (result.size < size) {
    const allLang = shuffle(langList);
    let attempts = 0;
    while (result.size < size && attempts < 1000) {
      const lang = allLang[attempts % allLang.length];
      const list = load(lang);
      const w = list[Math.floor(Math.random() * list.length)];
      if (!excludeSet.has(w) && !result.has(w)) result.add(w);
      attempts++;
    }
    if (result.size < size) {
      throw new Error(
        `Could not fill pool of ${size} from ${langList.join(",")} after exclusions (got ${result.size}).`,
      );
    }
  }

  return shuffle(Array.from(result));
}

function sampleN(arr: readonly string[], n: number): string[] {
  if (n >= arr.length) return arr.slice();
  const indices = new Set<number>();
  while (indices.size < n) {
    indices.add(Math.floor(Math.random() * arr.length));
  }
  return Array.from(indices, (i) => arr[i]);
}
