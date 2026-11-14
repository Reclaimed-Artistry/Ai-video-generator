/**
 * Adds cast-tagged Pexels people footage to src/lib/stock-catalog.json, drops
 * abstract/motion-graphic clips, and fixes mis-parsed rendition sizes.
 *
 * Every clip's cast comes from Pexels' own title + thumbnail tag slug (the
 * uploader's keywords). The app's classifier (src/lib/people.ts) is run on each
 * entry and anything that does not classify into its intended group is dropped.
 *
 *   node --experimental-strip-types scripts/build-people-catalog.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectPeople, isAbstractAsset } from "../src/lib/people.ts";

// id | intended group | page slug | thumbnail tag slug | creator | seconds | known file | English title override
const CURATED = [
  [6930468, "black", "man-wearing-face-mask-while-using-a-laptop", "adult-afro-afro-american-bulgaria", "Mikhail Nilov", 10, "6930468-uhd_2160_3840_25fps.mp4"],
  [10374960, "black", "a-man-typing-on-a-laptop", "afro-american-black-black-owned-business", "RDNE Stock project", 10, "10374960-uhd_3840_2160_24fps.mp4"],
  [5271740, "black", "man-typing-on-his-laptop", "black-man-home-study-laptop-remote-learning", "Vlada Karpovich", 10, "5271740-hd_1080_1920_25fps.mp4"],
  [6950267, "black", "mother-teaching-her-daughter-to-cook", "african-american-african-american-family-afro-black", "Andy Barbour", 19, "6950267-uhd_2160_3840_25fps.mp4"],
  [6950271, "black", "woman-flattening-dough-using-rolling-pin", "african-american-african-american-family-afro-black", "Andy Barbour", 9, "6950271-uhd_2160_3840_25fps.mp4"],
  [10375421, "black", "woman-showing-designs-to-the-client", "afro-american-black-black-owned-business", "RDNE Stock project", 10, "10375421-hd_1920_1080_30fps.mp4"],
  [10375437, "black", "a-couple-signing-a-document", "afro-american-black-black-owned-business", "RDNE Stock project", 15, "10375437-hd_1920_1080_30fps.mp4"],
  [10375429, "black", "woman-giving-the-key-and-house-plan-to-the-couple", "afro-american-black-black-owned-business", "RDNE Stock project", 18, "10375429-hd_1920_1080_30fps.mp4"],
  [10375425, "black", "woman-showing-floor-plans-to-a-couple", "adult-afro-american-black-black-owned-business", "RDNE Stock project", 7, "10375425-hd_1920_1080_30fps.mp4"],

  [27165162, "african", "a-woman-holding-money-in-her-hand-at-a-market", "abuja-market-african-market-bariga-market-business-woman", "Shedrack Salami", 30, "12087886_3840_2160_25fps.mp4"],
  [37080143, "african", "nigerian-market-woman-counting-cash-outdoors", "counting-money-lagos-market-marina-market-market-woman", "Murisiku Amure", 9, "15708451_3840_2160_60fps.mp4"],
  [28097107, "african", "a-bus-drives-down-a-street-in-a-city", "africa-african-african-girl-african-woman", "Wavy. revolution", 6, "12297162_1920_1080_50fps.mp4"],
  [26798382, "african", "women-carrying-jerry-cans", "africa-african-women-jerry-can-kenya", "Thirty Story", 10, "12009144_1920_1080_24fps.mp4"],
  [27858252, "african", "black-kids", "african-black-children-health", "Bamsey O'bamise", 11, "12245702_3840_2160_24fps.mp4"],
  [31948112, "african", "children-playing-outdoors-under-shelter", "4kvideo-active-play-african-child", "B. Aristotle Guweh Jr", 15, "13610921_1920_1080_60fps.mp4"],
  [20432307, "african", "brothers-love", "brothers-children-playing-kids-nigerian", "Jonathan Chukwudifu", 9, "20432307-hd_1080_1920_30fps.mp4"],
  [27835100, "african", "villagers", "african-cheifs-king-men", "Bamsey O'bamise", 11, "12239379_3840_2160_24fps.mp4"],
  [31063175, "african", "traditional-ghanaian-storytelling-gathering-in-forest", "african-culture-african-dance-artistic-family-storytelling-ghana", "Zeal Creative Studios", 4, "13275669_3840_2160_24fps.mp4"],
  [25781660, "african", "african-woman-grilling-fish", "african-woman-fish-grill-grate-grill-master", "Mika Mark", 32, "11908391_3840_2160_30fps.mp4"],
  [27165007, "african", "lagos-market-women-trading", "abuja-market-african-market-bariga-market-business-woman", "Shedrack Salami", 18, "12087874_3840_2160_25fps.mp4"],
  [35827779, "african", "vibrant-african-market-with-female-vendor", "african-market-west-africa", "B. Aristotle Guweh Jr", 11, "15191693_3840_2160_30fps.mp4"],
  [32778876, "african", "rural-african-school-classroom-scene", "africa-african-children-african-rural-school-african-students", "TimePRO TV", 17, "13973092_3840_2160_30fps.mp4"],
  [32778875, "african", "engaged-students-learning-in-rural-classroom", "africa-african-children-african-rural-school-african-students", "TimePRO TV", 10, "13973004_3840_2160_30fps.mp4"],
  [29430344, "african", "engaged-students-in-african-classroom-setting", "active-learning-african-girl-back-to-school", "B. Aristotle Guweh Jr", 10, "12670228_1920_1080_30fps.mp4"],
  [33787982, "african", "african-school-children-in-uniform-gathering-outdoors", "african-children-back-to-school", "B. Aristotle Guweh Jr", 15, "14341219_3840_2160_30fps.mp4"],

  [18321884, "hispanic", "executive-woman-with-glasses-working-on-the-computer", "computador-latin-american-woman-latina-woman-using-computer", "23 Audiovisual", 9, "18321884-hd_1920_1080_30fps.mp4"],
  [14375091, "hispanic", "brazilian-patriots-celebrating", "brasil-brazilian-flag-brazilian-man-brazilian-woman", "Geancarlo Peruzzolo", 7, "14375091-uhd_3840_2160_60fps.mp4"],
  [18516189, "hispanic", "a-city-street-with-people-walking-and-a-building", "cdmx-historic-center-latinos-mexico", "Vintage Lenses", 120, "18516189-hd_1080_1920_30fps.mp4"],
  [20559820, "hispanic", "a-group-of-people-sitting-around-a-table-with-food", "cdmx-company-director-group-of-people-humans", "Israel Torres", 7, "20559820-hd_1920_1080_60fps.mp4"],
  [8279995, "hispanic", "people-toasting-wine-while-celebrating", "adult-alcohol-argentina-argentina-food", "Los Muertos Crew", 7, "8279995-hd_1920_1080_24fps.mp4"],
  [8279992, "hispanic", "people-eating-at-a-dinner-table", "adult-affection-argentina-argentina-food", "Los Muertos Crew", 27, "8279992-hd_1920_1080_24fps.mp4"],

  [7844849, "asian", "people-working-together", "administration-adult-asian-beauty-asian-boss", "RDNE Stock project", 7, "7844849-hd_1920_1080_30fps.mp4"],
  [7845250, "asian", "a-smiling-man-posing-in-an-office", "accomplishment-achievement-asian-beauty-asian-boss", "RDNE Stock project", 8, "7845250-hd_1920_1080_30fps.mp4"],
  [7844896, "asian", "a-man-holding-a-disposable-cup-in-an-office", "accomplishment-achievement-ambition-asian-beauty", "RDNE Stock project", 8, "7844896-hd_1920_1080_30fps.mp4"],
  [7844873, "asian", "a-man-looking-at-a-document", "achievement-administration-adult-asian-beauty", "RDNE Stock project", 7, "7844873-hd_1080_1920_30fps.mp4"],
  [7844884, "asian", "a-man-talking-to-his-assistant-in-an-office", "adult-asian-beauty-asian-boss-asian-culture", "RDNE Stock project", 7, "7844884-hd_1920_1080_30fps.mp4"],
  [7844951, "asian", "employees-applauding-their-co-worker", "administration-adult-asian-beauty-asian-boss", "RDNE Stock project", 12, "7844951-hd_1080_1920_30fps.mp4"],
  [7652400, "asian", "parents-kissing-their-baby", "affection-asian-baby-breakfast", "ShotPot", 6, "7652400-uhd_3840_2160_25fps.mp4"],
  [19552321, "asian", "woman-interacting-with-waitress-in-cafe", "asian-woman-asian-women-bar-cafe-cafe", "Hindustani Lens", 12, "19552321-hd_1920_1080_25fps.mp4"],

  [5461718, "south_asian", "a-woman-cutting-vegetables", "bengali-woman-hindu-woman-indian-women-indian-womens", "Biplab Sau", 50, "5461718-hd_1920_1080_25fps.mp4"],
  [7684918, "south_asian", "woman-giving-gift-to-a-friend", "authentic-celebration-colors-in-india-colours", "RDNE Stock project", 15, "7684918-hd_1920_1080_30fps.mp4"],
  [36879534, "south_asian", "bustling-college-campus-in-india-vibrant-student-life", "4k-hd-free-videos-india-timelapse", "Samar L.", 11, "15622877_3840_2160_60fps.mp4"],

  [8939825, "middle_eastern", "a-man-talking-and-doing-hand-gestures-while-sitting-in-an-office-chair", "adult-arab-bristle-business", "Mikhail Nilov", 18, "8939825-hd_1080_1920_25fps.mp4"],
  [8940135, "middle_eastern", "a-man-putting-on-his-eyeglasses", "adult-arab-beach-bristle", "Mikhail Nilov", 18, "8940135-hd_1080_1920_25fps.mp4"],
  [8940125, "middle_eastern", "a-businessman-reading-a-book", "adult-arab-blur-book-series", "Mikhail Nilov", 17, "8940125-hd_1920_1080_25fps.mp4"],
  [8939686, "middle_eastern", "a-female-executive-using-a-laptop-on-a-couch", "access-adult-arab-beautiful", "Mikhail Nilov", 13, "8939686-hd_1920_1080_25fps.mp4"],
  [5137046, "middle_eastern", "a-woman-smiling-for-the-camera", "adult-arab-arabian-arabic", "Artem Podrez", 11, "5137046-uhd_3840_2160_30fps.mp4"],
  [8939705, "middle_eastern", "a-woman-facing-her-laptop", "adult-arab-beautiful-business", "Mikhail Nilov", 8, "8939705-hd_1080_1920_25fps.mp4"],
  [8296444, "middle_eastern", "dating-couple-having-coffee", "adult-arab-arabian-cafe", "Mikhail Nilov", 20, "8296444-hd_1080_1920_25fps.mp4"],
  [8296449, "middle_eastern", "a-couple-talking-while-holding-a-mug", "adolescent-adult-arab-arabian", "Mikhail Nilov", 23, "8296449-hd_1920_1080_25fps.mp4"],
  [7583801, "middle_eastern", "a-woman-holding-a-laptop-and-notebook", "abstract-academic-adult-arab", "Mikhail Nilov", 22, "7583801-hd_1080_1920_25fps.mp4"],
];

/** Exact Pexels slugs where the curated entry uses a readable English title instead. */
const SLUG_OVERRIDES = {
  10375421: { page: "woman-showing-designs-the-the-client" },
  25781660: { page: "african-grilling-in-karlsruhe" },
  18321884: { page: "mujer-con-lentes-ejecutiva-trabajando-en-la-computadora" },
  14375091: { page: "brasileiros-patriotas-em-comemoracao" },
  36879534: { thumb: "4k-4k-hd-free-videos-4k-india-4k-timelapse" },
};

const STOP = new Set(["a", "an", "the", "of", "and", "in", "on", "at", "to", "her", "his", "their", "with", "while", "for", "is", "it", "pexels", "photo", "free", "videos", "video", "hd", "4k", "4kvideo", "adult", "abstract", "beautiful", "access", "series", "blur", "bristle"]);

const words = (slug) =>
  slug.split("-").map((w) => w.toLowerCase()).filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));

const titleFromSlug = (slug) => {
  const t = slug.replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

async function head(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok ? Number(res.headers.get("content-length") ?? 0) : null;
  } catch {
    return null;
  }
}

/** Parse "<id>-uhd_3840_2160_25fps.mp4" or "<fileId>_3840_2160_25fps.mp4". */
function parseFile(file) {
  const m = /(?:-(?:uhd|hd|sd))?_?(\d{3,4})_(\d{3,4})_(\d+)fps\.mp4$/.exec(file);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]), fps: Number(m[3]) };
}

async function renditions(id, file) {
  const base = `https://videos.pexels.com/video-files/${id}/`;
  const known = parseFile(file);
  const out = [];
  const knownBytes = await head(base + file);
  if (known && knownBytes !== null) out.push({ url: base + file, ...known, bytes: knownBytes });
  // Old-style names have predictable smaller renditions; new-style file ids do not.
  if (known && file.startsWith(`${id}-`)) {
    const portrait = known.height > known.width;
    const sizes = portrait
      ? [["hd", 1080, 1920], ["hd", 720, 1280], ["sd", 540, 960], ["sd", 360, 640]]
      : [["hd", 1920, 1080], ["hd", 1280, 720], ["sd", 960, 540], ["sd", 640, 360]];
    for (const [q, w, h] of sizes) {
      const name = `${id}-${q}_${w}_${h}_${known.fps}fps.mp4`;
      if (name === file) continue;
      const bytes = await head(base + name);
      if (bytes !== null) out.push({ url: base + name, width: w, height: h, fps: known.fps, bytes });
    }
  }
  return out.sort((a, b) => Math.min(a.width, a.height) - Math.min(b.width, b.height));
}

const catalogPath = resolve(process.cwd(), "src/lib/stock-catalog.json");
const existing = JSON.parse(readFileSync(catalogPath, "utf8"));

// 1. Drop abstract clips and repair rendition sizes parsed from "<fileId>_W_H_FPS" names.
let removedAbstract = [];
let repaired = 0;
const kept = existing.filter((asset) => {
  if (asset.type === "video" && isAbstractAsset(asset)) {
    removedAbstract.push(asset.title);
    return false;
  }
  return true;
});
for (const asset of kept) {
  for (const s of asset.sources ?? []) {
    if (s.width > 10000) {
      const p = parseFile(s.url.split("/").pop());
      if (p) Object.assign(s, p);
      repaired += 1;
    }
  }
}

// 2. Build + verify the curated people clips.
const byId = new Map(kept.map((a) => [a.id, a]));
const report = {};
const dropped = [];
for (const [id, group, slug, thumbSlug, creator, duration, file] of CURATED) {
  const title = titleFromSlug(slug);
  // Keep the uploader's tag slug as one phrase (word order matters, e.g.
  // "african american" or "argentina food"), then add topic words for matching.
  // Topic words must never carry cast meaning on their own (e.g. a lone "african"
  // split out of "african-american"), so drop any word the classifier reacts to.
  const isCastWord = (w) => detectPeople(`person ${w}`).groups.length > 0;
  const topicWords = [...new Set([...words(slug), ...words(thumbSlug)])].filter((w) => !isCastWord(w));
  const tags = [thumbSlug.replace(/-/g, " "), ...topicWords].slice(0, 16);
  const people = detectPeople(title, tags);
  const allowed = (g) => g === group || (group === "south_asian" && g === "asian");
  if (!people.groups.includes(group) || !people.groups.every(allowed)) {
    dropped.push(`${id} (${group}) -> ${JSON.stringify(people)}`);
    continue;
  }
  const sources = await renditions(id, file);
  if (sources.length === 0) {
    dropped.push(`${id} (${group}) -> no reachable rendition`);
    continue;
  }
  const portrait = sources[0].height > sources[0].width;
  byId.set(`v${id}`, {
    id: `v${id}`,
    provider: "pexels",
    type: "video",
    title,
    tags,
    creator,
    pageUrl: `https://www.pexels.com/video/${SLUG_OVERRIDES[id]?.page ?? slug}-${id}/`,
    thumb: `https://images.pexels.com/videos/${id}/${SLUG_OVERRIDES[id]?.thumb ?? thumbSlug}-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&${portrait ? "h=1200&w=630" : "h=630&w=1200"}`,
    duration,
    portrait,
    sources,
  });
  report[group] = (report[group] ?? 0) + 1;
}

const catalog = [...byId.values()];
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));

// 3. Coverage summary straight from the classifier.
const coverage = {};
for (const asset of catalog.filter((a) => a.type === "video")) {
  for (const g of detectPeople(asset.title, asset.tags).groups) coverage[g] = (coverage[g] ?? 0) + 1;
}
console.log("removed abstract clips:", removedAbstract.length, removedAbstract);
console.log("repaired rendition sizes:", repaired);
console.log("added per group:", report);
console.log("dropped:", dropped);
const others = catalog.filter((a) => a.type === "video" && !CURATED.some(([id]) => `v${id}` === a.id))
  .map((a) => [a.title, detectPeople(a.title, a.tags).groups])
  .filter(([, g]) => g.length > 0);
console.log("existing library clips with cast tags:", others);
console.log("final videos:", catalog.filter((a) => a.type === "video").length, "| cast coverage:", coverage);
