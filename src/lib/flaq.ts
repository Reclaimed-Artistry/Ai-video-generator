/**
 * Flaq AI client (https://flaq.ai) — one key for image, video and LLM models.
 *
 * Task-based API: submit a job, then poll until it reaches a terminal state.
 *   POST /api/v1/{image,video}/task  ->  { data: { task_id } }
 *   GET  /api/v1/{image,video}/{id}  ->  { data: { task_status, task_result } }
 *
 * `task_status` is one of "succeed" / "failed" / a pending value. Results land
 * in `task_result.images[0].url` or `task_result.videos[0].url`.
 *
 * Note the field is `model_name` on both endpoints, even though some of Flaq's
 * own blog posts show `model`. The per-model pages and the MCP server use
 * `model_name`, so that is what we send.
 */

export const FLAQ_DEFAULT_BASE = "https://api.flaq.ai/api/v1";

export function flaqKey(): string | null {
  return process.env.FLAQ_API_KEY || process.env.FLAQ_API_TOKEN || null;
}

export function flaqBase(): string {
  return (process.env.FLAQ_BASE_URL || FLAQ_DEFAULT_BASE).replace(/\/+$/, "");
}

export type FlaqKind = "image" | "video";

type TaskResult = {
  images?: { url?: string }[];
  videos?: { url?: string }[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function numFromEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

async function submitTask(
  kind: FlaqKind,
  body: Record<string, unknown>,
): Promise<string> {
  const key = flaqKey();
  if (!key) throw new Error("FLAQ_API_KEY is not set");

  const response = await fetch(`${flaqBase()}/${kind}/task`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Flaq ${kind} task rejected (${response.status})${
        detail ? `: ${detail.slice(0, 220)}` : ""
      }`,
    );
  }

  const data = (await response.json()) as {
    data?: { task_id?: string };
    task_id?: string;
  };
  const id = data.data?.task_id ?? data.task_id;
  if (!id) throw new Error(`Flaq ${kind} returned no task_id`);
  return id;
}

/**
 * Polls until the task succeeds or fails. Returns the first asset URL.
 *
 * The extraction is deliberately defensive: if Flaq changes the result shape,
 * we throw with the raw payload rather than silently returning nothing, so the
 * failure is diagnosable instead of looking like "the provider is down".
 */
async function waitForTask(kind: FlaqKind, id: string): Promise<string> {
  const key = flaqKey() as string;
  const timeoutMs = numFromEnv(
    kind === "video" ? "FLAQ_VIDEO_TIMEOUT_MS" : "FLAQ_IMAGE_TIMEOUT_MS",
    kind === "video" ? 600_000 : 180_000,
  );
  const pollMs = numFromEnv("FLAQ_POLL_MS", 5_000);
  const deadline = Date.now() + timeoutMs;
  const key0 = kind === "image" ? "images" : "videos";
  let lastStatus = "unknown";

  while (Date.now() < deadline) {
    const response = await fetch(`${flaqBase()}/${kind}/${id}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!response.ok) {
      throw new Error(`Flaq ${kind} poll failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      data?: {
        task_status?: string;
        task_status_msg?: string;
        task_result?: TaskResult;
      };
    };
    const data = payload.data ?? {};
    const status = (data.task_status ?? "").toLowerCase();
    lastStatus = status || lastStatus;

    if (status === "succeed") {
      const list = data.task_result?.[key0];
      const url = list?.[0]?.url;
      if (!url) {
        throw new Error(
          `Flaq ${kind} task succeeded but exposed no ${key0}[0].url — ` +
            `payload: ${JSON.stringify(data.task_result ?? data).slice(0, 300)}`,
        );
      }
      return url;
    }

    if (status === "failed") {
      throw new Error(
        `Flaq ${kind} task failed: ${data.task_status_msg ?? "no reason given"}`,
      );
    }

    await sleep(pollMs);
  }

  throw new Error(
    `Flaq ${kind} task ${id} timed out after ${timeoutMs}ms (last status: ${lastStatus})`,
  );
}

/** Runs a full submit -> poll -> download cycle and returns the raw bytes. */
export async function generateFlaqMedia(
  kind: FlaqKind,
  body: Record<string, unknown>,
): Promise<{ data: Buffer; ext: string }> {
  const id = await submitTask(kind, body);
  const url = await waitForTask(kind, id);

  const asset = await fetch(url);
  if (!asset.ok) {
    throw new Error(`Could not download Flaq ${kind} (${asset.status}) from ${url}`);
  }
  const buffer = Buffer.from(await asset.arrayBuffer());
  if (!buffer.length) throw new Error(`Flaq ${kind} returned an empty file`);
  return { data: buffer, ext: kind === "video" ? "mp4" : "jpg" };
}
