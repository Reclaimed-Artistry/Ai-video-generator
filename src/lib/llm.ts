/**
 * Minimal JSON-returning LLM client.
 * 1. OpenAI (if OPENAI_API_KEY is set)
 * 2. Pollinations (free, no key) — keeps AI scripting working out of the box
 * Returns null on any failure so callers can fall back to the template engine.
 */

type Message = { role: "system" | "user"; content: string };

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

type ChatResult = { content: string | null; retryAfterMs: number | null };

async function postChat(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<ChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.status === 402 || response.status === 429) {
      // Free tiers rate-limit per IP; surface how long to wait.
      const text = await response.text().catch(() => "");
      const seconds =
        Number(response.headers.get("retry-after")) ||
        Number(/retry after (\d+)\s*s/i.exec(text)?.[1] ?? NaN);
      return { content: null, retryAfterMs: Number.isFinite(seconds) ? seconds * 1000 : null };
    }
    if (!response.ok) return { content: null, retryAfterMs: null };
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    return { content: data.choices?.[0]?.message?.content ?? null, retryAfterMs: null };
  } catch {
    return { content: null, retryAfterMs: null };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function llmJson<T = unknown>(
  messages: Message[],
  opts: { timeoutMs?: number; temperature?: number } = {},
): Promise<T | null> {
  const timeoutMs = opts.timeoutMs ?? 45_000;

  if (process.env.OPENAI_API_KEY) {
    const { content } = await postChat(
      "https://api.openai.com/v1/chat/completions",
      { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      {
        model: "gpt-4o-mini",
        temperature: opts.temperature ?? 0.8,
        response_format: { type: "json_object" },
        messages,
      },
      timeoutMs,
    );
    const parsed = content ? extractJson(content) : null;
    if (parsed) return parsed as T;
  }

  if (process.env.DISABLE_FREE_LLM === "1") return null;

  // Pollinations: free without a key (rate-limited per IP); POLLINATIONS_TOKEN
  // (free at https://enter.pollinations.ai) removes the limit.
  const token = process.env.POLLINATIONS_TOKEN;
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 5_000) break;
    const { content, retryAfterMs } = await postChat(
      "https://text.pollinations.ai/openai",
      token ? { authorization: `Bearer ${token}` } : {},
      {
        model: "openai",
        messages,
        response_format: { type: "json_object" },
        seed: Math.floor(Math.random() * 1_000_000),
      },
      remaining,
    );
    const parsed = content ? extractJson(content) : null;
    if (parsed) return parsed as T;
    // Wait out a short rate-limit window once; otherwise let the caller fall back.
    if (retryAfterMs !== null && retryAfterMs <= 25_000 && deadline - Date.now() > retryAfterMs + 15_000) {
      await sleep(retryAfterMs + 500);
      continue;
    }
    break;
  }
  return null;
}

export function llmProviderName(): string {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.DISABLE_FREE_LLM === "1") return "template";
  return "pollinations";
}
