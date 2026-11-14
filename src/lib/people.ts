/**
 * Cast representation + abstract-footage rules.
 *
 * Who appears in a clip is ONLY read from metadata the provider/photographer
 * supplied (clip title, provider tags, explicit place names). Nothing is ever
 * inferred from how people look, so a clip without an explicit descriptor is
 * never assigned to a group. That keeps the "cast" option honest and auditable.
 */

export type CastGroup =
  | "black"
  | "african"
  | "hispanic"
  | "asian"
  | "south_asian"
  | "middle_eastern"
  | "white";

export type CastOption = "any" | CastGroup;

export const CAST_OPTIONS: { id: CastOption; label: string; note: string }[] = [
  { id: "any", label: "All races", note: "Diverse cast — any footage that fits the narration" },
  { id: "black", label: "Black / African American", note: "Tagged African American, Afro-American or Black people" },
  { id: "african", label: "African", note: "Tagged African people or filmed in African countries" },
  { id: "hispanic", label: "Hispanic / Latino", note: "Tagged Hispanic, Latino/Latina or Latin American" },
  { id: "asian", label: "Asian", note: "Tagged Asian (East, Southeast or South Asian)" },
  { id: "south_asian", label: "South Asian", note: "Tagged Indian, Pakistani, Bangladeshi, Sri Lankan…" },
  { id: "middle_eastern", label: "Middle Eastern / North African", note: "Tagged Arab, Middle Eastern or North African" },
  { id: "white", label: "White / European", note: "Tagged Caucasian, White or European" },
];

export function castLabel(cast: CastOption | null | undefined): string {
  return CAST_OPTIONS.find((option) => option.id === (cast ?? "any"))?.label ?? "All races";
}

export function isCastOption(value: unknown): value is CastOption {
  return typeof value === "string" && CAST_OPTIONS.some((option) => option.id === value);
}

/** Words that mean at least one person is visible in the shot. */
const PERSON =
  "man|men|woman|women|person|people|persons|girl|girls|boy|boys|guy|guys|lady|ladies|" +
  "family|families|couple|couples|child|children|kid|kids|teen|teens|teenager|teenagers|" +
  "student|students|businessman|businessmen|businesswoman|businesswomen|entrepreneur|" +
  "entrepreneurs|worker|workers|doctor|doctors|nurse|nurses|father|mother|dad|mom|son|" +
  "daughter|parents|model|chef|chefs|cook|athlete|athletes|baby|babies|" +
  "grandmother|grandfather|friend|friends|colleague|colleagues|coworker|coworkers|team|" +
  "employee|employees|boss|owner|vendor|vendors|seller|sellers|buyer|customer|customers|" +
  "crowd|villagers|locals|shoppers|tourists|dancers|fishermen|traders|chiefs|humans|" +
  "executive|executives|teacher|teachers|classmates|youth|brothers|sisters|wife|husband";

const PERSON_RE = new RegExp(`\\b(${PERSON})\\b`);

/** A group word immediately followed by one of these describes food/style, not people. */
const NON_PERSON_FOLLOWERS =
  "food|foods|dish|dishes|cuisine|meal|meals|recipe|recipes|cooking|snack|snacks|plate|" +
  "plates|restaurant|restaurants|feast|spices|spice|curry|noodles|style|architecture|" +
  "flag|calligraphy|pattern|patterns|ocean|elephant|elephants|lion|lions|safari|horse|" +
  "savanna|savannah|wildlife|animals|landscape|sunset";

function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[_/|,.;:()"'!?-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** Remove "<group word> <food|style word>" pairs so cuisine never counts as a cast descriptor. */
function stripNonPersonUses(text: string, words: string): string {
  return text.replace(new RegExp(`\\b(${words})\\s+(${NON_PERSON_FOLLOWERS})\\b`, "g"), " ");
}

const MENA_WORDS =
  "arab|arabs|arabian|middle eastern|middle east|emirati|saudi|qatari|kuwaiti|omani|yemeni|" +
  "jordanian|lebanese|syrian|iraqi|palestinian|egyptian|egypt|moroccan|morocco|algerian|" +
  "tunisian|libyan|persian|iranian|dubai|riyadh|cairo|beirut|amman|doha|north african|north africa";

const AFRICAN_WORDS =
  "african|africa|nigerian|nigeria|kenyan|kenya|ghanaian|ghana|ethiopian|ethiopia|ugandan|" +
  "uganda|tanzanian|tanzania|senegalese|senegal|rwandan|rwanda|cameroonian|cameroon|zambian|" +
  "zimbabwean|zimbabwe|south african|lagos|abuja|nairobi|accra|kampala|dakar|maasai|masai|" +
  "zulu|yoruba|igbo|hausa|swahili|aboki";

const HISPANIC_WORDS =
  "hispanic|latino|latina|latinos|latinas|latinx|latin american|mexican|mexico|cdmx|oaxaca|" +
  "brazilian|brasil|brazil|colombian|colombia|argentina|argentine|argentinian|peruvian|peru|" +
  "venezuelan|cuban|dominican|puerto rican|guatemalan|salvadoran|chilean|ecuadorian";

const SOUTH_ASIAN_WORDS =
  "indian|indians|india|pakistani|pakistan|bangladeshi|bangladesh|sri lankan|sri lanka|" +
  "nepali|nepalese|nepal|desi|punjabi|bengali|tamil|gujarati|mumbai|delhi|kolkata|bangalore";

const ASIAN_WORDS =
  "asian|asians|chinese|china|japanese|japan|korean|korea|taiwanese|vietnamese|vietnam|" +
  "filipino|filipina|thai|thailand|indonesian|indonesia|malaysian|singaporean|tokyo|seoul|" +
  "beijing|shanghai|hong kong|manila|bangkok|hanoi";

function has(text: string, words: string): boolean {
  return new RegExp(`\\b(${words})\\b`).test(text);
}

export type PeopleInfo = { hasPeople: boolean; groups: CastGroup[] };

/**
 * Classify a clip's cast from its own title + provider tags.
 * Returns no groups unless the metadata explicitly says so.
 */
export function detectPeople(title: string, tags: string[] = []): PeopleInfo {
  // A separator token keeps words from different tags from forming false phrases.
  const raw = normalize(`${title} zzsep ${tags.join(" zzsep ")}`);
  const hasPeople = PERSON_RE.test(raw);
  if (!hasPeople) return { hasPeople: false, groups: [] };

  // Exclusions that look like group words but are not about people.
  let text = raw
    .replace(/\b(native american|american indian|west indian|indian ocean)\b/g, " ")
    .replace(/\bafrican (american|americans)\b/g, " africanamerican ")
    .replace(/\bafro (american|americans)\b/g, " africanamerican ")
    .replace(/\bafroamerican\b/g, " africanamerican ")
    .replace(/\bsouth east asian\b/g, " southeast asian ");
  text = stripNonPersonUses(
    text,
    `${MENA_WORDS}|${AFRICAN_WORDS}|${HISPANIC_WORDS}|${SOUTH_ASIAN_WORDS}|${ASIAN_WORDS}|black|white|caucasian|european`,
  );

  const groups = new Set<CastGroup>();

  const mena = has(text, MENA_WORDS);
  if (mena) groups.add("middle_eastern");

  // Continental African evidence (North Africa already counted as MENA above).
  const africanText = text.replace(/\bnorth (african|africa)\b/g, " ");
  if (has(africanText, AFRICAN_WORDS)) groups.add("african");

  // Black / African American: explicit descriptor, never just the colour word.
  const blackPerson = new RegExp(`\\bblack (${PERSON}|owned)\\b`).test(text);
  if (/\bafricanamerican\b/.test(text) || (blackPerson && !groups.has("african"))) {
    groups.add("black");
  }

  if (has(text, HISPANIC_WORDS)) groups.add("hispanic");

  if (has(text, SOUTH_ASIAN_WORDS)) {
    groups.add("south_asian");
    groups.add("asian");
  }
  if (has(text, ASIAN_WORDS) || /\bsoutheast asian\b/.test(text)) groups.add("asian");

  const whitePerson = new RegExp(`\\bwhite (${PERSON})\\b`).test(text);
  if (has(text, "caucasian|european|scandinavian|nordic") || whitePerson) groups.add("white");

  return { hasPeople: true, groups: [...groups] };
}

export function assetMatchesCast(
  asset: { title: string; tags: string[] },
  cast: CastOption | null | undefined,
): boolean {
  if (!cast || cast === "any") return true;
  return detectPeople(asset.title, asset.tags).groups.includes(cast);
}

/** Motion graphics, renders and backgrounds — never used in generated videos. */
const ABSTRACT_RE = new RegExp(
  "\\b(abstract|animation|animated|motion graphics?|cgi|3d|render|rendering|visualization|" +
    "visualisation|particles?|light trails?|neon (sign|text|lights?)|glowing|futuristic|" +
    "digital (connection|network|background|art)|network connections?|background loop|" +
    "loop(ing)? background|gradient|bokeh background|like (and|&) subscribe|subscribe button|" +
    "kaleidoscope|fractal|hologram|holographic|wireframe|generative art|screensaver)\\b",
);

export function isAbstractAsset(asset: { title: string; tags?: string[] }): boolean {
  // Titles are authoritative; provider tag lists often contain a loose "abstract"
  // keyword on real footage, so tags only count for explicit motion-graphic terms.
  if (ABSTRACT_RE.test(normalize(asset.title))) return true;
  const tagText = normalize((asset.tags ?? []).join(" "));
  return /\b(animation|motion graphics|cgi|3d render|visualization)\b/.test(tagText);
}

/**
 * Map narration vocabulary onto the kinds of everyday scenes stock people
 * footage covers, so cast-filtered matching still lands on the right setting.
 */
const SCENE_VOCABULARY: { triggers: RegExp; tokens: string[] }[] = [
  { triggers: /\b(business|startup|company|team|meeting|strategy|sales|client|customer|pipeline|deal|boss|office|career|job|work|manager|leadership|growth|revenue|plan|planning)\w*/, tokens: ["office", "business", "meeting", "team", "work", "colleague", "client", "document", "plans", "designs", "boss", "assistant", "presentation"] },
  { triggers: /\b(tech|technology|software|app|ai|data|code|coding|computer|digital|online|internet|automation|agent|email|remote|laptop)\w*/, tokens: ["laptop", "computer", "typing", "working", "office", "remote"] },
  { triggers: /\b(food|cook|cooking|kitchen|recipe|meal|dinner|lunch|breakfast|restaurant|chef|coffee|cafe|bake|eat|eating|dish)\w*/, tokens: ["cooking", "kitchen", "food", "dinner", "cafe", "chef", "eating", "vegetables", "cutting", "dough", "grilling", "grill", "fish", "bread", "table", "coffee", "cook"] },
  { triggers: /\b(fitness|workout|gym|exercise|training|health|healthy|run|running|sport|yoga|strength|wellness)\w*/, tokens: ["gym", "workout", "exercise", "fitness", "training", "yoga"] },
  { triggers: /\b(family|home|kids|children|parent|mother|father|life|lifestyle|routine|morning|together|love)\w*/, tokens: ["family", "home", "children", "together", "parents", "baby", "mother", "daughter", "kids", "brothers", "friend", "gift", "couple"] },
  { triggers: /\b(learn|learning|school|student|course|class|education|teach|study|university|college|lesson|skill)\w*/, tokens: ["students", "student", "classroom", "school", "studying", "campus", "learning", "children", "uniform"] },
  { triggers: /\b(market|shop|shopping|money|cash|price|sell|buy|trade|finance|budget|small business|vendor)\w*/, tokens: ["market", "vendor", "money", "selling", "trading", "cash", "counting", "women"] },
  { triggers: /\b(city|street|travel|walk|community|culture|celebrat|festival|tradition|village|people)\w*/, tokens: ["street", "city", "celebration", "village", "community", "culture"] },
];

export function sceneTokensForNarration(text: string): string[] {
  const lower = text.toLowerCase();
  const out = new Set<string>();
  for (const entry of SCENE_VOCABULARY) {
    if (entry.triggers.test(lower)) entry.tokens.forEach((token) => out.add(token));
  }
  return [...out];
}

/** Extra search words that steer live providers towards the chosen cast. */
export function castSearchTerms(cast: CastOption | null | undefined): string[] {
  switch (cast) {
    case "black":
      return ["african american", "black"];
    case "african":
      return ["african", "nigerian"];
    case "hispanic":
      return ["latino", "hispanic"];
    case "asian":
      return ["asian"];
    case "south_asian":
      return ["indian"];
    case "middle_eastern":
      return ["arab"];
    case "white":
      return ["caucasian"];
    default:
      return [];
  }
}
