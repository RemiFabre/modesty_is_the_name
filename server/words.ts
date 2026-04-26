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

export function drawPool(lang: Language, size: number): string[] {
  const list = load(lang);
  if (size > list.length) {
    throw new Error(`pool size ${size} exceeds dictionary size ${list.length}`);
  }
  const indices = new Set<number>();
  while (indices.size < size) {
    indices.add(Math.floor(Math.random() * list.length));
  }
  return Array.from(indices, (i) => list[i]);
}
