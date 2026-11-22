import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { GET as searchRoute } from "../src/app/api/media/search/route";
import { hydrateSceneMedia, searchLocalCatalog, searchStock } from "../src/lib/stock";
import { stockAssetKey } from "../src/lib/stock-id";
import type { Scene } from "../src/lib/types";

const originalFetch = globalThis.fetch;
const originalPexels = process.env.PEXELS_API_KEY;
const originalPixabay = process.env.PIXABAY_API_KEY;
const caches = globalThis as typeof globalThis & {
  __raMixkitPages?: Map<string, unknown>;
  __raMixkitDetails?: Map<string, unknown>;
  __raMixkitCooldownUntil?: number;
  __raPixabayPages?: Map<string, { ts: number }>;
  __raPixabayPending?: Map<string, unknown>;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalPexels === undefined) delete process.env.PEXELS_API_KEY;
  else process.env.PEXELS_API_KEY = originalPexels;
  if (originalPixabay === undefined) delete process.env.PIXABAY_API_KEY;
  else process.env.PIXABAY_API_KEY = originalPixabay;
  caches.__raMixkitPages?.clear();
  caches.__raMixkitDetails?.clear();
  caches.__raPixabayPages?.clear();
  caches.__raPixabayPending?.clear();
  delete caches.__raMixkitCooldownUntil;
});

function noKeys() {
  delete process.env.PEXELS_API_KEY;
  delete process.env.PIXABAY_API_KEY;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function pexelsVideo(id: number, title: string) {
  return {
    id, title, url: `https://www.pexels.com/video/${title.replace(/\s+/g, "-")}-${id}/`,
    image: `https://images.pexels.com/videos/${id}/thumb.jpg`, duration: 8, width: 1280, height: 720,
    user: { name: `Creator ${id}` },
    video_files: [
      { file_type: "video/mp4", quality: "hls", link: `https://videos.pexels.com/video-files/${id}/stream.m3u8`, width: null, height: null },
      { file_type: "video/mp4", quality: "hd", link: `https://videos.pexels.com/video-files/${id}/${id}.mp4`, width: 1280, height: 720 },
    ],
  };
}

function pixabayVideo(id: number, query: string) {
  return {
    id, tags: `${query}, nature`, user: `User ${id}`, pageURL: `https://pixabay.com/videos/${id}/`, duration: 10,
    videos: {
      large: { url: "", width: 0, height: 0 },
      medium: { url: `https://cdn.pixabay.com/video/${id}.mp4`, width: 1280, height: 720, thumbnail: `https://cdn.pixabay.com/thumb/${id}.jpg` },
    },
  };
}

function wikiPage(id: number, index: number, query: string, big = false) {
  return {
    pageid: id, index, title: `File:${query} ${id}.webm`,
    imageinfo: [{
      mime: "video/webm", url: `https://upload.wikimedia.org/${id}.webm`,
      thumburl: `https://upload.wikimedia.org/${id}.jpg`,
      width: 1920, height: 1080, duration: 10, size: big ? 100_000_000 : 1_000_000,
      user: "Uploader",
      extmetadata: { Artist: { value: "<b>Actual author</b>" }, LicenseShortName: { value: "CC BY-SA 4.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" } },
    }],
    videoinfo: big ? [{ derivatives: [{ src: `https://upload.wikimedia.org/${id}-480.webm`, type: 'video/webm; codecs="vp9"', width: 854, height: 480, bandwidth: 700_000 }] }] : [],
  };
}

function nasaItem(id: number, query: string) {
  return {
    href: `https://images-assets.nasa.gov/video/${id}/collection.json`,
    data: [{ nasa_id: `NASA${id}`, title: `${query} ${id}`, keywords: [query], center: "GSFC" }],
    links: [{ rel: "preview", href: `https://images-assets.nasa.gov/video/${id}/thumb.jpg` }],
  };
}

function mixkitListing(query: string, firstId: number, count: number, overrides: Record<number, "restricted" | "unknown" | "no-source"> = {}) {
  const items = Array.from({ length: count }, (_, index) => {
    const id = firstId + index;
    const variant = overrides[id];
    return {
      "@type": "VideoObject", "@id": `https://mixkit.co/free-stock-video/${query}-clip-${id}/#video`,
      name: `${query} clip ${id}`, duration: "PT12S",
      thumbnailUrl: `https://assets.mixkit.co/videos/${id}/${id}-thumb-360-0.jpg`,
      ...(variant === "unknown" ? {} : {
        copyrightNotice: variant === "restricted" ? "Mixkit Restricted License" : "Free",
        license: `https://mixkit.co/license/#${variant === "restricted" ? "videoRestricted" : "videoFree"}`,
      }),
      ...(variant === "no-source" ? {} : { contentUrl: `https://assets.mixkit.co/videos/${id}/${id}-360.mp4` }),
    };
  });
  return `<script type="application/ld+json" data-test-id="schema">${JSON.stringify({ "@context": "https://schema.org", "@graph": [{ "@type": "ItemList", itemListElement: items }] })}</script>`;
}

test("unavailable live services do not turn unrelated searches into the same generic clips", async () => {
  noKeys();
  const hosts: string[] = [];
  globalThis.fetch = async (input) => {
    hosts.push(new URL(String(input)).hostname);
    return new Response("offline", { status: 503 });
  };
  for (const query of ["volcano", "kangaroo"]) {
    const result = await searchStock(query, { provider: "all", limit: 24, includeAbstract: true });
    assert.deepEqual(result.assets, []);
    assert.ok(result.notices.some((notice) => notice.includes("PEXELS_API_KEY")));
    assert.ok(result.notices.some((notice) => notice.includes("Wikimedia")));
  }
  assert.ok(hosts.includes("commons.wikimedia.org"), "All Sites should query Wikimedia");
  assert.ok(hosts.includes("images-api.nasa.gov"), "All Sites should query NASA");
  const local = await searchStock("waterfall", { provider: "all", limit: 24 });
  assert.ok(local.assets.length > 0);
  assert.ok(local.assets.every((asset) => `${asset.title} ${asset.tags.join(" ")}`.toLowerCase().includes("waterfall")));
});

test("manual local searches require a subject match even with a cast filter", () => {
  assert.deepEqual(searchLocalCatalog("kangaroo", { requireTextMatch: true, peopleRepresentation: "african-american" }), []);
  const coffee = searchLocalCatalog("coffee", { requireTextMatch: true });
  const ocean = searchLocalCatalog("ocean", { requireTextMatch: true });
  assert.ok(coffee.length > 0 && ocean.length > 0);
  assert.notEqual(coffee[0].id, ocean[0].id);
  const cats = searchLocalCatalog("cat", { requireTextMatch: true });
  assert.ok(cats.every((asset) => /\bcats?\b/i.test(`${asset.title} ${asset.tags.join(" ")}`)));
});

test("Pexels uses the current API, the actual query, correct pages, and manual animation results", async () => {
  noKeys();
  process.env.PEXELS_API_KEY = "test-pexels-key";
  const calls: { url: URL; authorization: string | null }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, authorization: new Headers(init?.headers).get("authorization") });
    const page = Number(url.searchParams.get("page"));
    return json({ total_results: 4, videos: page === 1
      ? [pexelsVideo(1, "Cat portrait"), pexelsVideo(2, "Cat animation")]
      : [pexelsVideo(3, "Cat walking"), pexelsVideo(4, "Cat sleeping")] });
  };
  const first = await searchStock("cat", { provider: "pexels", limit: 2, page: 1, includeAbstract: true });
  const second = await searchStock("cat", { provider: "pexels", limit: 2, page: 2, includeAbstract: true });
  assert.deepEqual(first.assets.map((asset) => asset.id), ["pexels-video-1", "pexels-video-2"]);
  assert.deepEqual(second.assets.map((asset) => asset.id), ["pexels-video-3", "pexels-video-4"]);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, false);
  assert.equal(calls[0].url.pathname, "/v1/videos/search");
  assert.equal(calls[0].url.searchParams.get("query"), "cat");
  assert.equal(calls[1].url.searchParams.get("page"), "2");
  assert.equal(calls[0].authorization, "test-pexels-key");
  assert.deepEqual(first.assets[0].sources.map((source) => source.url), ["https://videos.pexels.com/video-files/1/1.mp4"]);
  assert.ok(!calls[0].url.toString().includes("test-pexels-key"));
  const automatic = await searchStock("cat", { provider: "pexels", limit: 2 });
  assert.deepEqual(automatic.assets.map((asset) => asset.id), ["pexels-video-1"]);
  assert.ok(!JSON.stringify(first).includes("test-pexels-key"));
});

test("provider pagination does not stop at the first hundred result pages", async () => {
  noKeys();
  process.env.PEXELS_API_KEY = "test-key";
  let requestedPage = "";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestedPage = url.searchParams.get("page") ?? "";
    return json({ total_results: 10_000, videos: [pexelsVideo(101, "Ocean")] });
  };
  const result = await searchStock("ocean", { provider: "pexels", limit: 2, page: 101 });
  assert.equal(requestedPage, "101");
  assert.equal(result.page, 101);
  assert.equal(result.hasMore, true);
});

test("a missing or rejected key is explained without substituting another provider", async () => {
  noKeys();
  globalThis.fetch = async () => new Response("denied", { status: 401 });
  const pixabay = await searchStock("coffee", { provider: "pixabay", limit: 24 });
  assert.deepEqual(pixabay.assets, []);
  assert.ok(pixabay.notices.some((notice) => notice.includes("PIXABAY_API_KEY")));
  const pexels = await searchStock("kangaroo", { provider: "pexels", limit: 24 });
  assert.deepEqual(pexels.assets, []);
  assert.equal(pexels.source, "pexels-pool");
  process.env.PEXELS_API_KEY = "bad-secret";
  const rejected = await searchStock("coffee", { provider: "pexels", limit: 24 });
  assert.ok(rejected.notices.some((notice) => notice.includes("rejected")));
  assert.ok(rejected.assets.every((asset) => asset.provider === "pexels"));
  assert.ok(!JSON.stringify(rejected).includes("bad-secret"));
});

test("Pixabay walks small provider quotas without duplicates or skipped hits", async () => {
  noKeys();
  process.env.PIXABAY_API_KEY = "test-pixabay-key";
  const calls: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    const page = Number(url.searchParams.get("page"));
    const start = (page - 1) * 3 + 1;
    return json({ totalHits: 5, hits: Array.from({ length: Math.min(3, Math.max(0, 6 - start)) }, (_, i) => pixabayVideo(start + i, "cat")) });
  };
  const results = await Promise.all([1, 2, 3].map((page) => searchStock("cat", { provider: "pixabay", limit: 2, page })));
  assert.deepEqual(results.flatMap((result) => result.assets.map((asset) => asset.id)), ["pixabay-1", "pixabay-2", "pixabay-3", "pixabay-4", "pixabay-5"]);
  assert.equal(results[0].hasMore, true);
  assert.equal(results[2].hasMore, false);
  assert.ok(calls.every((url) => url.searchParams.get("per_page") === "3"));
  assert.ok(calls.every((url) => url.searchParams.get("q") === "cat"));
});

test("Pixabay caches identical requests for 24 hours without exposing API keys", async () => {
  noKeys();
  process.env.PIXABAY_API_KEY = "first-secret-key";
  let count = 0;
  globalThis.fetch = async (input, init) => {
    count += 1;
    assert.equal((init as RequestInit & { next?: { revalidate?: number } })?.next?.revalidate, 86400);
    const url = new URL(String(input));
    return json({ totalHits: 1, hits: [pixabayVideo(count, url.searchParams.get("q") ?? "")] });
  };
  const [first, same] = await Promise.all([
    searchStock("coffee", { provider: "pixabay", limit: 24 }),
    searchStock("coffee", { provider: "pixabay", limit: 24 }),
  ]);
  assert.equal(count, 1, "concurrent identical requests should share one provider call");
  assert.equal(first.assets[0].id, same.assets[0].id);
  await searchStock("coffee", { provider: "pixabay", limit: 24 });
  assert.equal(count, 1);
  await searchStock("ocean", { provider: "pixabay", limit: 24 });
  assert.equal(count, 2, "a new query should not return the previous query's page");
  assert.ok([...caches.__raPixabayPages!.keys()].every((key) => !key.includes("first-secret-key")));
  for (const item of caches.__raPixabayPages!.values()) item.ts -= 86_400_001;
  await searchStock("coffee", { provider: "pixabay", limit: 24 });
  assert.equal(count, 3, "expired cache entries should refresh");
  process.env.PIXABAY_API_KEY = "second-secret-key";
  await searchStock("coffee", { provider: "pixabay", limit: 24 });
  assert.equal(count, 4, "keys must not share cached results");
});

test("Pixabay preserves a partial final page and stops cleanly at its API limit", async () => {
  noKeys();
  process.env.PIXABAY_API_KEY = "test-pixabay-key";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const perPage = Number(url.searchParams.get("per_page"));
    const page = Number(url.searchParams.get("page"));
    if (page * perPage > 500) return new Response('ERROR: "page" is out of valid range.', { status: 400 });
    const first = (page - 1) * perPage + 1;
    return json({ totalHits: 500, hits: Array.from({ length: perPage }, (_, index) => pixabayVideo(first + index, "ocean")) });
  };
  const last = await searchStock("ocean", { provider: "pixabay", limit: 24, page: 21 });
  assert.deepEqual(last.assets.map((asset) => asset.id), Array.from({ length: 20 }, (_, index) => `pixabay-${481 + index}`));
  assert.equal(last.hasMore, false);
  const beyond = await searchStock("ocean", { provider: "pixabay", limit: 24, page: 22 });
  assert.deepEqual(beyond.assets, []);
  assert.deepEqual(beyond.notices, []);
});

test("Wikimedia pagination preserves search order, derivatives, and per-file licences", async () => {
  noKeys();
  const calls: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    const offset = Number(url.searchParams.get("gsroffset"));
    const pages = offset === 0
      ? { "900": wikiPage(900, 2, "cat", true), "100": wikiPage(100, 1, "cat") }
      : { "200": wikiPage(200, 3, "cat") };
    return json({ ...(offset === 0 ? { continue: { gsroffset: 2 } } : {}), query: { pages } });
  };
  const first = await searchStock("cat", { provider: "wikimedia", limit: 2, page: 1 });
  const second = await searchStock("cat", { provider: "wikimedia", limit: 2, page: 2 });
  assert.deepEqual(first.assets.map((asset) => asset.id), ["wikimedia-100", "wikimedia-900"]);
  assert.deepEqual(second.assets.map((asset) => asset.id), ["wikimedia-200"]);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, false);
  assert.equal(first.assets[0].creator, "Actual author");
  assert.equal(first.assets[0].license, "CC BY-SA 4.0");
  assert.equal(first.assets[1].sources[0].url, "https://upload.wikimedia.org/900-480.webm");
  assert.equal(calls[0].searchParams.get("gsrsearch"), "filetype:video cat");
  assert.equal(calls[1].searchParams.get("gsroffset"), "2");
});

test("NASA fetches the requested page and only resolves official manifests", async () => {
  noKeys();
  const calls: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.hostname === "images-api.nasa.gov") {
      const page = Number(url.searchParams.get("page"));
      return json({ collection: { metadata: { total_hits: 2 }, items: [nasaItem(page, "moon")] } });
    }
    return json([
      "https://not-nasa.example/clip~mobile.mp4",
      `http://images-assets.nasa.gov/video/${url.pathname.split("/")[2]}/clip~mobile.mp4`,
    ]);
  };
  const first = await searchStock("moon", { provider: "nasa", limit: 1, page: 1 });
  const second = await searchStock("moon", { provider: "nasa", limit: 1, page: 2 });
  assert.deepEqual(first.assets.map((asset) => asset.id), ["nasa-NASA1"]);
  assert.deepEqual(second.assets.map((asset) => asset.id), ["nasa-NASA2"]);
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, false);
  assert.ok(first.assets[0].sources[0].url.startsWith("https://images-assets.nasa.gov/"));
  assert.ok(calls.some((url) => url.searchParams.get("page") === "2"));
});

test("Mixkit uses published free-licence results and pages within its native listing", async () => {
  noKeys();
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url.toString());
    const page = Number(url.searchParams.get("page") ?? 1);
    if (url.pathname !== "/free-stock-video/ocean/") {
      return new Response('<div class="download-video-options__download"><a data-license="videoFree">Free</a></div>');
    }
    return new Response(page === 1
      ? mixkitListing("ocean", 1, 24, { 2: "restricted", 3: "unknown" }) + '<a href="?page=2">Next</a>'
      : mixkitListing("ocean", 25, 6), { status: 200 });
  };
  const first = await searchStock("ocean", { provider: "mixkit", limit: 6, page: 1 });
  const second = await searchStock("ocean", { provider: "mixkit", limit: 6, page: 2 });
  const fifth = await searchStock("ocean", { provider: "mixkit", limit: 6, page: 5 });
  assert.deepEqual(first.assets.map((asset) => asset.id), ["mixkit-1", "mixkit-4", "mixkit-5", "mixkit-6"]);
  assert.deepEqual(second.assets.map((asset) => asset.id), ["mixkit-7", "mixkit-8", "mixkit-9", "mixkit-10", "mixkit-11", "mixkit-12"]);
  assert.equal(fifth.assets[0].id, "mixkit-25");
  assert.equal(fifth.hasMore, false);
  assert.equal(first.assets[0].sources[0].url, "https://assets.mixkit.co/videos/1/1-360.mp4");
  assert.ok(first.assets.every((asset) => asset.license?.includes("Free License")));
  assert.equal(requests.filter((url) => url === "https://mixkit.co/free-stock-video/ocean/").length, 1, "native first page should be cached irrespective of requested limit");
  assert.ok(requests.some((url) => url.endsWith("/ocean-clip-1/")), "listing licences must be verified against the detail page");
});

test("Mixkit handles listing cards and download-offer markup with sparse JSON-LD", async () => {
  noKeys();
  const pageUrl = "https://mixkit.co/free-stock-video/stewing-tomato-sauce-3804/";
  const listing = `<script type="application/ld+json" data-test-id="schema_org_data-0">${JSON.stringify({
    "@context": "https://schema.org", "@graph": [{ "@type": "ItemList", itemListElement: [
      { "@type": "VideoObject", "@id": `${pageUrl}#video`, copyrightNotice: "Free", license: "https://mixkit.co/license/#videoFree" },
    ] }],
  })}</script><div class="item-grid-card"><a href="/free-stock-video/stewing-tomato-sauce-3804/">Stewing tomato sauce</a>
  <img alt="Stewing tomato sauce" src="https://assets.mixkit.co/videos/3804/3804-thumb-360-0.jpg">
  <video src="https://assets.mixkit.co/videos/3804/3804-360.mp4"></video></div>`;
  const detail = `<div class="download-video-options__download"><a href="/license/#videoFree" data-license="videoFree">Mixkit Stock Video Free License</a></div>
  <video src="https://assets.mixkit.co/videos/3804/3804-720.mp4"></video>`;
  globalThis.fetch = async (input) => new Response(String(input) === pageUrl ? detail : listing);
  const result = await searchStock("tomato", { provider: "mixkit", limit: 6 });
  assert.equal(result.assets.length, 1);
  assert.equal(result.assets[0].title, "stewing tomato sauce");
  assert.equal(result.assets[0].pageUrl, pageUrl);
  assert.equal(result.assets[0].thumb, "https://assets.mixkit.co/videos/3804/3804-thumb-360-0.jpg");
  assert.equal(result.assets[0].sources[0].url, "https://assets.mixkit.co/videos/3804/3804-720.mp4");
});

test("Mixkit checks the download licence even when a listing publishes a video URL", async () => {
  noKeys();
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/ocean/")) return new Response(mixkitListing("ocean", 1, 3));
    if (url.endsWith("/ocean-clip-1/")) {
      // The listing can be stale or optimistic; the download offer wins.
      return new Response('<div class="download-video-options__download"><a data-license="videoRestricted">Personal only</a></div>');
    }
    if (url.endsWith("/ocean-clip-2/")) return new Response("busy", { status: 503 });
    return new Response('<div class="download-video-options__download"><a data-license="videoFree">Commercial free</a></div>');
  };
  const result = await searchStock("ocean", { provider: "mixkit", limit: 3 });
  assert.deepEqual(result.assets.map((asset) => asset.id), ["mixkit-3"]);
  assert.ok(result.notices.some((notice) => notice.includes("could not be verified")));
  assert.ok(calls.some((url) => url.endsWith("/ocean-clip-1/")));
});

test("Mixkit resolves missing media from the published detail page without guessing URLs", async () => {
  noKeys();
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/ocean/")) return new Response(mixkitListing("ocean", 10, 1, { 10: "no-source" }));
    return new Response(`<a data-license="videoFree">Free</a><script type="application/ld+json">${JSON.stringify({ "@type": "VideoObject", license: "https://mixkit.co/license/#videoFree", contentUrl: "https://assets.mixkit.co/videos/10/10-720.mp4" })}</script>`);
  };
  const result = await searchStock("ocean", { provider: "mixkit", limit: 6 });
  assert.equal(result.assets[0].sources[0].url, "https://assets.mixkit.co/videos/10/10-720.mp4");
  assert.equal(requests.length, 2);
});

test("All Sites includes every configured source and does not skip provider pages", async () => {
  noKeys();
  process.env.PEXELS_API_KEY = "test-pexels-key";
  process.env.PIXABAY_API_KEY = "test-pixabay-key";
  const queries: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.pexels.com") {
      const page = Number(url.searchParams.get("page"));
      const count = Number(url.searchParams.get("per_page"));
      queries.push(`pexels:${url.searchParams.get("query")}`);
      return json({ total_results: 8, videos: Array.from({ length: count }, (_, i) => pexelsVideo(page * 100 + i, "cat")) });
    }
    if (url.hostname === "pixabay.com") {
      const page = Number(url.searchParams.get("page"));
      const count = Number(url.searchParams.get("per_page"));
      queries.push(`pixabay:${url.searchParams.get("q")}`);
      return json({ totalHits: 8, hits: Array.from({ length: count }, (_, i) => pixabayVideo(page * 100 + i, "cat")) });
    }
    if (url.hostname === "mixkit.co") {
      if (url.pathname !== "/free-stock-video/cat/") {
        return new Response('<a data-license="videoFree">Free</a>');
      }
      queries.push(`mixkit:${url.pathname}`);
      return new Response(mixkitListing("cat", 1, 24));
    }
    if (url.hostname === "commons.wikimedia.org") {
      const offset = Number(url.searchParams.get("gsroffset"));
      const count = Number(url.searchParams.get("gsrlimit"));
      queries.push(`wikimedia:${url.searchParams.get("gsrsearch")}`);
      return json({ ...(offset === 0 ? { continue: { gsroffset: count } } : {}), query: { pages: Object.fromEntries(Array.from({ length: count }, (_, i) => [`${offset + i + 1}`, wikiPage(offset + i + 1, offset + i + 1, "cat")])) } });
    }
    if (url.hostname === "images-api.nasa.gov") {
      const page = Number(url.searchParams.get("page"));
      const count = Number(url.searchParams.get("page_size"));
      queries.push(`nasa:${url.searchParams.get("q")}`);
      return json({ collection: { metadata: { total_hits: 8 }, items: Array.from({ length: count }, (_, i) => nasaItem(page * 100 + i, "cat")) } });
    }
    if (url.hostname === "images-assets.nasa.gov") return json([`https://images-assets.nasa.gov${url.pathname.replace("collection.json", "clip~mobile.mp4")}`]);
    throw new Error(`Unexpected provider: ${url.hostname}`);
  };
  const first = await searchStock("cat", { provider: "all", limit: 20, page: 1, includeAbstract: true });
  const second = await searchStock("cat", { provider: "all", limit: 20, page: 2, includeAbstract: true });
  assert.equal(first.assets.length, 20);
  assert.equal(second.assets.length, 20);
  assert.deepEqual(new Set(first.assets.map((asset) => asset.provider)), new Set(["pexels", "mixkit", "wikimedia", "nasa", "pixabay"]));
  const firstKeys = new Set(first.assets.map(stockAssetKey));
  assert.ok(second.assets.every((asset) => !firstKeys.has(stockAssetKey(asset))));
  assert.ok(queries.includes("pexels:cat") && queries.includes("pixabay:cat") && queries.includes("wikimedia:filetype:video cat") && queries.includes("nasa:cat"));
});

test("bundled and live copies of a Pexels video have the same identity", () => {
  assert.equal(stockAssetKey({ id: "v123", provider: "pexels" }), stockAssetKey({ id: "pexels-video-123", provider: "pexels" }));
  assert.notEqual(stockAssetKey({ id: "pixabay-123", provider: "pixabay" }), stockAssetKey({ id: "v123", provider: "pexels" }));
});

test("a manually selected animation survives project hydration", () => {
  const scene = { id: "one", narration: "", caption: "", mediaQuery: "neon animation", mediaId: "pexels-video-2", mediaType: "video", mediaUrl: "https://videos.pexels.com/video-files/2/2.mp4", mediaTitle: "Neon animation", mediaLocked: true, duration: null, transition: "none" } satisfies Scene;
  assert.deepEqual(hydrateSceneMedia(scene), scene);
  const automatic = hydrateSceneMedia({ ...scene, mediaLocked: false });
  assert.notEqual(automatic.mediaId, scene.mediaId);
});

test("search route validates inputs and returns page metadata without caching", async () => {
  noKeys();
  globalThis.fetch = async () => new Response("offline", { status: 503 });
  const invalid = await searchRoute(new Request("http://localhost/api/media/search?provider=not-a-provider"));
  assert.equal(invalid.status, 400);
  const result = await searchRoute(new Request("http://localhost/api/media/search?q=kangaroo&provider=pexels&page=bad&limit=NaN"));
  const body = await result.json();
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(body.page, 1);
  assert.equal(body.hasMore, false);
  assert.deepEqual(body.assets, []);
  assert.ok(body.notices.some((notice: string) => notice.includes("PEXELS_API_KEY")));
});
