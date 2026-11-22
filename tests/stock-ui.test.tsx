import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import type { ComponentType } from "react";
import type { Project, StockAsset } from "../src/lib/types";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
let ui: typeof import("@testing-library/react");
let Studio: ComponentType<{ initialProject: Project; ephemeralMode?: boolean }>;
const originalFetch = globalThis.fetch;

before(async () => {
  Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, "self", { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, "document", { value: dom.window.document, configurable: true });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  Object.defineProperty(globalThis, "HTMLElement", { value: dom.window.HTMLElement, configurable: true });
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true, writable: true });
  ui = await import("@testing-library/react");
  // The full Studio tree can render slowly when CI runs lint/build in parallel.
  ui.configure({ asyncUtilTimeout: 5000 });
  Studio = (await import("../src/components/Studio")).default;
});

afterEach(() => {
  ui.cleanup();
  globalThis.fetch = originalFetch;
  dom.window.localStorage.clear();
  dom.window.sessionStorage.clear();
});

after(() => dom.window.close());

function project(): Project {
  return {
    id: "stock-ui-test", title: "Test project", prompt: "Test prompt", status: "ready", progress: 0,
    stage: "ready", error: null, voice: "en-US-AriaNeural", resolution: "360p", aspect: "16:9",
    tone: "friendly", style: "modern", language: "en", duration: 30,
    script: {
      title: "Test", summary: "Test",
      scenes: [{ id: "scene-1", narration: "A quiet scene", caption: "Quiet", mediaQuery: "initial", mediaId: null, mediaType: "video", duration: null, transition: "none" }],
      options: { peopleRepresentation: "all" },
    },
    outputPath: null, posterPath: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };
}

function asset(id: string, title: string): StockAsset {
  return {
    id, provider: "pexels", type: "video", title, tags: [title.toLowerCase()], creator: "Creator",
    pageUrl: `https://www.pexels.com/video/${id}/`, thumb: "https://images.pexels.com/test.jpg",
    sources: [{ url: "https://videos.pexels.com/test.mp4", width: 1280, height: 720 }],
  };
}

function response(assets: StockAsset[], hasMore = false): Response {
  return new Response(JSON.stringify({ assets, source: "pexels-live", hasMore, notices: [] }), { status: 200, headers: { "content-type": "application/json" } });
}

test("Studio ignores a slower initial or previous query after a newer search", async () => {
  const pending = new Map<string, { resolve: (value: Response) => void; signal?: AbortSignal | null }>();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/voices") return new Response(JSON.stringify({ voices: [] }));
    if (url.pathname === "/api/media/search") {
      return new Promise<Response>((resolve) => pending.set(url.searchParams.get("q") ?? "", { resolve, signal: init?.signal }));
    }
    return new Response("{}", { status: 200 });
  };
  ui.render(<Studio initialProject={project()} />);
  await ui.waitFor(() => assert.ok(pending.has("initial")));
  const search = ui.screen.getByRole("textbox", { name: "Search stock videos" });
  ui.fireEvent.change(search, { target: { value: "coffee" } });
  ui.fireEvent.keyDown(search, { key: "Enter", code: "Enter" });
  await ui.waitFor(() => assert.ok(pending.has("coffee")));
  ui.fireEvent.change(search, { target: { value: "ocean" } });
  ui.fireEvent.keyDown(search, { key: "Enter", code: "Enter" });
  await ui.waitFor(() => assert.ok(pending.has("ocean")));
  assert.equal(pending.get("initial")?.signal?.aborted, true);
  assert.equal(pending.get("coffee")?.signal?.aborted, true);
  await ui.act(async () => pending.get("ocean")!.resolve(response([asset("pexels-video-3", "Ocean newest")])));
  assert.ok(await ui.screen.findByRole("button", { name: "Use Ocean newest for scene 1" }));
  // The mock deliberately ignores abort signals, just like a response that arrived
  // before cancellation. Request identity must still prevent stale overwrites.
  await ui.act(async () => {
    pending.get("coffee")!.resolve(response([asset("pexels-video-2", "Coffee stale")]));
    pending.get("initial")!.resolve(response([asset("pexels-video-1", "Initial stale")]));
  });
  assert.ok(ui.screen.getByRole("button", { name: "Use Ocean newest for scene 1" }));
  assert.equal(ui.screen.queryByRole("button", { name: "Use Coffee stale for scene 1" }), null);
  assert.equal(ui.screen.queryByRole("button", { name: "Use Initial stale for scene 1" }), null);
});

test("Studio loads later pages without duplicating clips and resets when the provider changes", async () => {
  const calls: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/voices") return new Response(JSON.stringify({ voices: [] }));
    if (url.pathname !== "/api/media/search") return new Response("{}", { status: 200 });
    calls.push(url);
    const page = url.searchParams.get("page");
    if (url.searchParams.get("provider") === "pixabay") return response([asset("pexels-video-7", "New provider result")]);
    return page === "1"
      ? response([asset("v1", "First clip")], true)
      : response([asset("pexels-video-1", "Duplicate clip"), asset("pexels-video-2", "Second clip")]);
  };
  ui.render(<Studio initialProject={project()} />);
  assert.ok(await ui.screen.findByRole("button", { name: "Use First clip for scene 1" }));
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Load more clips" }));
  assert.ok(await ui.screen.findByRole("button", { name: "Use Second clip for scene 1" }));
  assert.equal(ui.screen.queryByRole("button", { name: "Use Duplicate clip for scene 1" }), null);
  assert.equal(calls[1].searchParams.get("page"), "2");
  assert.equal(calls[1].searchParams.get("q"), "initial");
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Pixabay" }));
  assert.ok(await ui.screen.findByRole("button", { name: "Use New provider result for scene 1" }));
  assert.equal(ui.screen.queryByRole("button", { name: "Use First clip for scene 1" }), null);
  assert.equal(calls.at(-1)?.searchParams.get("page"), "1");
  assert.equal(calls.at(-1)?.searchParams.get("provider"), "pixabay");
});

test("a manually chosen clip keeps its source and licence with the scene", async () => {
  const clip = { ...asset("wikimedia-9", "Licensed cat"), provider: "wikimedia", pageUrl: "https://commons.wikimedia.org/wiki/File:Cat.webm", license: "CC BY-SA 4.0" };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/voices") return new Response(JSON.stringify({ voices: [] }));
    if (url.pathname === "/api/media/search") return response([clip]);
    return new Response("{}", { status: 200 });
  };
  ui.render(<Studio initialProject={project()} />);
  ui.fireEvent.click(await ui.screen.findByRole("button", { name: "Use Licensed cat for scene 1" }));
  const source = ui.screen.getByRole("link", { name: "View clip source and licence" });
  assert.equal(source.getAttribute("href"), clip.pageUrl);
  await ui.waitFor(() => {
    const stored = JSON.parse(dom.window.localStorage.getItem("ra:project:stock-ui-test") ?? "{}");
    const scene = stored.script?.scenes?.[0];
    assert.equal(scene?.mediaId, clip.id);
    assert.equal(scene?.mediaLocked, true);
    assert.equal(scene?.mediaSource, "stock");
    assert.equal(scene?.mediaLicense, "CC BY-SA 4.0");
    assert.equal(scene?.mediaPageUrl, clip.pageUrl);
  });
});

test("an empty filtered page can still load later results and shows the limited-library notice", async () => {
  const pages: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/voices") return new Response(JSON.stringify({ voices: [] }));
    if (url.pathname !== "/api/media/search") return new Response("{}", { status: 200 });
    const page = url.searchParams.get("page") ?? "";
    pages.push(page);
    return page === "1"
      ? new Response(JSON.stringify({ assets: [], source: "No results", hasMore: true, notices: ["Pexels is showing the small bundled library. Set PEXELS_API_KEY for live search."] }))
      : response([asset("pexels-video-10", "Later result")]);
  };
  ui.render(<Studio initialProject={project()} />);
  assert.ok(await ui.screen.findByText(/small bundled library/i));
  assert.ok(ui.screen.getByText(/No usable clips on this page/i));
  ui.fireEvent.click(ui.screen.getByRole("button", { name: "Load more clips" }));
  assert.ok(await ui.screen.findByRole("button", { name: "Use Later result for scene 1" }));
  assert.deepEqual(pages, ["1", "2"]);
});
