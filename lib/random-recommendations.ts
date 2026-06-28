import crypto from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { atomicWrite } from "./content";
import { contentPath } from "./paths";

const appId = process.env.DANDANPLAY_APP_ID?.trim() || "nipaplayv1";
const userAgent = process.env.DANDANPLAY_USER_AGENT?.trim() || "NipaPlay/1.0";
const dandanplayApiBase = trimTrailingSlash(
  process.env.DANDANPLAY_API_BASE_URL?.trim() || "https://api.dandanplay.net"
);
const defaultSecretUrls = ["https://kurisu.aimes-soft.com/nipaplay.php"];
const groupCount = 5;
const itemsPerGroup = 5;
const maxTagAttempts = 80;
const requestTimeoutMs = 10_000;

const blockedKeywords = [
  "我的英雄学院",
  "我的英雄學院",
  "僕のヒーローアカデミア",
  "ヒロアカ",
  "my hero academia",
  "boku no hero academia",
  "hero academia",
  "mha"
];

type SearchConfigTag = {
  value?: unknown;
};

type SearchConfigResponse = {
  tags?: SearchConfigTag[];
};

type TagSearchResponse = {
  bangumis?: unknown[];
};

export type DailyRandomRecommendations = {
  success: true;
  date: string;
  generatedAt: string;
  groupCount: number;
  itemsPerGroup: number;
  stale?: boolean;
  groups: RandomRecommendationGroup[];
};

export type RandomRecommendationGroup = {
  index: number;
  id: string;
  items: RandomRecommendationItem[];
};

export type RandomRecommendationItem = {
  tag: string;
  anime: SearchResultAnime;
};

type SearchResultAnime = {
  animeId: number;
  bangumiId?: string | null;
  animeTitle: string;
  type: string;
  typeDescription?: string | null;
  imageUrl?: string | null;
  startDate?: string | null;
  episodeCount: number;
  rating: number;
  isFavorited: boolean;
  rank?: number | null;
  searchKeyword?: string | null;
  isOnAir?: boolean | null;
  isRestricted?: boolean | null;
  intro?: string | null;
};

let cachedAppSecret: string | null = null;
let inFlight: Promise<DailyRandomRecommendations> | null = null;

export async function getDailyRandomRecommendations() {
  if (!inFlight) {
    inFlight = loadOrGenerateDailyRecommendations().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function loadOrGenerateDailyRecommendations(): Promise<DailyRandomRecommendations> {
  const today = shanghaiDate();
  const cached = await readCachedRecommendations();
  if (cached && cached.date === today && isCompleteDailyPayload(cached)) {
    return cached;
  }

  try {
    return await generateDailyRecommendations(today);
  } catch (error) {
    if (cached && isCompleteDailyPayload(cached)) {
      return { ...cached, stale: true };
    }
    throw error;
  }
}

async function generateDailyRecommendations(date: string): Promise<DailyRandomRecommendations> {
  const random = seededRandom(`nipaplay-random-recommendations:${date}`);
  const tags = shuffle(await fetchSearchTags(), random).slice(0, maxTagAttempts);
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    index,
    id: `${date}-${index + 1}`,
    items: [] as RandomRecommendationItem[]
  }));
  const usedAnimeIds = new Set<number>();

  for (const tag of tags) {
    if (totalItems(groups) >= groupCount * itemsPerGroup) break;

    let animes: SearchResultAnime[] = [];
    try {
      animes = await fetchAnimesByTag(tag);
    } catch {
      continue;
    }

    const candidates = shuffle(
      animes.filter((anime) => isUsableAnime(anime) && !usedAnimeIds.has(anime.animeId)),
      random
    );
    if (candidates.length === 0) continue;

    const targetGroup = groupWithFewestItems(groups);
    if (targetGroup.items.length >= itemsPerGroup) continue;

    const selected = candidates[0];
    usedAnimeIds.add(selected.animeId);
    targetGroup.items.push({ tag, anime: selected });
  }

  const nonEmptyGroups = groups.filter((group) => group.items.length > 0);
  if (nonEmptyGroups.length === 0) {
    throw new Error("No random recommendation candidates were generated");
  }

  const payload: DailyRandomRecommendations = {
    success: true,
    date,
    generatedAt: new Date().toISOString(),
    groupCount,
    itemsPerGroup,
    groups
  };
  await atomicWrite(cachePath(), `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

async function fetchSearchTags() {
  const data = await dandanplayGet<SearchConfigResponse>(
    "/api/v2/search/adv/config",
    { source: "anidb" }
  );
  const tags = Array.isArray(data.tags) ? data.tags : [];
  return tags
    .map((tag) => (typeof tag.value === "string" ? tag.value.trim() : ""))
    .filter((tag) => tag.length > 0 && tag.length <= 50);
}

async function fetchAnimesByTag(tag: string) {
  const data = await dandanplayGet<TagSearchResponse>("/api/v2/search/tag", { tags: tag });
  const bangumis = Array.isArray(data.bangumis) ? data.bangumis : [];
  return bangumis
    .map(normalizeAnime)
    .filter((anime): anime is SearchResultAnime => anime !== null)
    .slice(0, 100);
}

async function dandanplayGet<T>(apiPath: string, query: Record<string, string>) {
  const timestamp = Math.round(Date.now() / 1000);
  const appSecret = await getAppSecret();
  const url = new URL(`${dandanplayApiBase}${apiPath}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": userAgent,
      "X-AppId": appId,
      "X-Signature": generateSignature(timestamp, apiPath, appSecret),
      "X-Timestamp": String(timestamp)
    }
  });
  if (!response.ok) {
    throw new Error(`Dandanplay ${apiPath} failed with HTTP ${response.status}`);
  }
  const data = (await response.json()) as T & { success?: boolean; errorMessage?: string };
  if (data.success === false) {
    throw new Error(data.errorMessage || `Dandanplay ${apiPath} returned an error`);
  }
  return data;
}

async function getAppSecret() {
  if (cachedAppSecret) return cachedAppSecret;

  const plainSecret = process.env.DANDANPLAY_APP_SECRET?.trim();
  if (plainSecret) {
    cachedAppSecret = plainSecret;
    return cachedAppSecret;
  }

  const encryptedSecret = process.env.DANDANPLAY_ENCRYPTED_APP_SECRET?.trim();
  if (encryptedSecret) {
    cachedAppSecret = decodeEncryptedAppSecret(encryptedSecret);
    return cachedAppSecret;
  }

  for (const url of appSecretUrls()) {
    try {
      const response = await fetchWithTimeout(new URL(url), {
        headers: { Accept: "application/json", "User-Agent": userAgent }
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as { encryptedAppSecret?: unknown };
      if (typeof payload.encryptedAppSecret === "string" && payload.encryptedAppSecret.trim()) {
        cachedAppSecret = decodeEncryptedAppSecret(payload.encryptedAppSecret);
        return cachedAppSecret;
      }
    } catch {
      // Try the next source.
    }
  }

  throw new Error("DANDANPLAY_APP_SECRET is not configured and no encrypted secret source is available");
}

function appSecretUrls() {
  const configured = process.env.DANDANPLAY_APP_SECRET_URLS?.split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  return configured && configured.length > 0 ? configured : defaultSecretUrls;
}

function generateSignature(timestamp: number, apiPath: string, appSecret: string) {
  return crypto
    .createHash("sha256")
    .update(`${appId}${timestamp}${apiPath}${appSecret}`)
    .digest("base64");
}

function decodeEncryptedAppSecret(input: string) {
  const mirrored = Array.from(input)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (char.toLowerCase() !== char.toUpperCase()) {
        const base = char === char.toUpperCase() ? "A".charCodeAt(0) : "a".charCodeAt(0);
        return String.fromCharCode(base + 25 - (code - base));
      }
      return char;
    })
    .join("");
  const rotated =
    mirrored.length >= 5
      ? `${mirrored.slice(1, -4)}${mirrored[0]}${mirrored.slice(-4)}`
      : mirrored;
  const digitFlipped = Array.from(rotated)
    .map((char) => {
      if (char >= "0" && char <= "9") {
        return String.fromCharCode("0".charCodeAt(0) + (10 - Number.parseInt(char, 10)));
      }
      return char;
    })
    .join("");
  return Array.from(digitFlipped)
    .map((char) => {
      if (char.toLowerCase() !== char.toUpperCase()) {
        return char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase();
      }
      return char;
    })
    .join("");
}

function normalizeAnime(input: unknown): SearchResultAnime | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  const animeId = numberField(data.animeId);
  const animeTitle = stringField(data.animeTitle);
  if (!animeId || !animeTitle) return null;

  return {
    animeId,
    bangumiId: nullableString(data.bangumiId),
    animeTitle,
    type: stringField(data.type) || "",
    typeDescription: nullableString(data.typeDescription),
    imageUrl: nullableString(data.imageUrl),
    startDate: nullableString(data.startDate),
    episodeCount: numberField(data.episodeCount) ?? 0,
    rating: numberField(data.rating) ?? 0,
    isFavorited: Boolean(data.isFavorited),
    rank: nullableNumber(data.rank),
    searchKeyword: nullableString(data.searchKeyword),
    isOnAir: nullableBoolean(data.isOnAir),
    isRestricted: nullableBoolean(data.isRestricted),
    intro: nullableString(data.intro)
  };
}

function isUsableAnime(anime: SearchResultAnime) {
  if (anime.animeId <= 0 || anime.animeTitle.trim().length === 0) return false;
  if (!anime.imageUrl || anime.imageUrl.trim().length === 0) return false;
  if (anime.isRestricted === true) return false;
  const normalizedTitle = anime.animeTitle.trim().toLowerCase();
  return !blockedKeywords.some((keyword) => normalizedTitle.includes(keyword));
}

function groupWithFewestItems(groups: RandomRecommendationGroup[]) {
  return groups.reduce((fewest, group) =>
    group.items.length < fewest.items.length ? group : fewest
  );
}

function totalItems(groups: RandomRecommendationGroup[]) {
  return groups.reduce((total, group) => total + group.items.length, 0);
}

async function readCachedRecommendations() {
  try {
    await stat(cachePath());
    const data = JSON.parse(await readFile(cachePath(), "utf8")) as unknown;
    return normalizeDailyPayload(data);
  } catch {
    return null;
  }
}

function normalizeDailyPayload(input: unknown): DailyRandomRecommendations | null {
  if (!input || typeof input !== "object") return null;
  const payload = input as Record<string, unknown>;
  if (payload.success !== true) return null;
  if (typeof payload.date !== "string" || typeof payload.generatedAt !== "string") return null;
  if (!Array.isArray(payload.groups)) return null;

  const groups = payload.groups
    .map(normalizeGroup)
    .filter((group): group is RandomRecommendationGroup => group !== null);
  if (groups.length === 0) return null;
  return {
    success: true,
    date: payload.date,
    generatedAt: payload.generatedAt,
    groupCount: numberField(payload.groupCount) ?? groupCount,
    itemsPerGroup: numberField(payload.itemsPerGroup) ?? itemsPerGroup,
    stale: payload.stale === true ? true : undefined,
    groups
  };
}

function normalizeGroup(input: unknown): RandomRecommendationGroup | null {
  if (!input || typeof input !== "object") return null;
  const group = input as Record<string, unknown>;
  const index = numberField(group.index);
  if (index === null) return null;
  const items = Array.isArray(group.items)
    ? group.items
        .map(normalizeRecommendationItem)
        .filter((item): item is RandomRecommendationItem => item !== null)
    : [];
  return {
    index,
    id: stringField(group.id) || String(index),
    items
  };
}

function normalizeRecommendationItem(input: unknown): RandomRecommendationItem | null {
  if (!input || typeof input !== "object") return null;
  const item = input as Record<string, unknown>;
  const tag = stringField(item.tag);
  const anime = normalizeAnime(item.anime);
  return tag && anime ? { tag, anime } : null;
}

function isCompleteDailyPayload(payload: DailyRandomRecommendations) {
  return (
    payload.groups.length === groupCount &&
    payload.groups.every((group) => group.items.length > 0)
  );
}

async function fetchWithTimeout(url: URL, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function cachePath() {
  return contentPath("random_recommendations", "daily.json");
}

function shanghaiDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function seededRandom(seedInput: string) {
  let seed = crypto.createHash("sha256").update(seedInput).digest().readUInt32LE(0);
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}
