/**
 * Minimal OpenAI-compatible Chat Completions stand-in used to exercise the
 * LLM client without touching a real provider (the sandbox has no egress).
 *
 * Behaviour is selected by MODEL:
 *   ok        -> strict JSON
 *   fenced    -> JSON wrapped in a ```json fence (must still be recovered)
 *   truncated -> JSON cut off mid-object (must be reported, not crash)
 *   empty     -> 200 with an empty body
 *   badkey    -> 401
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4599);

const BEHAVIOURS = ["ok", "fenced", "truncated", "empty", "badkey"];
let requestCount = 0;

const SCENES = (n) =>
  Array.from({ length: n }, (_, i) => ({
    narration: `Scene ${i + 1}: the light shifts across the water.`,
    caption: `Scene ${i + 1}`,
    mediaQuery: `ocean sunrise ${i + 1}`,
  }));

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    let body = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      /* fall through */
    }
    const model = String(body.model || "");
    // Cycle through scenarios so one server run covers every branch.
    const mode = BEHAVIOURS[requestCount % BEHAVIOURS.length];
    requestCount += 1;
    const send = (status, payload) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    console.log(
      `[mock] mode=${mode} ` +
        `model=${model} ` +
        `max_tokens=${body.max_completion_tokens ?? "-"} ` +
        `json_mode=${JSON.stringify(body.response_format ?? null)} ` +
        `reasoning=${JSON.stringify(body.reasoning_effort ?? null)}`,
    );

    if (mode === "badkey") {
      return send(401, { error: { message: "Invalid API Key" } });
    }
    if (mode === "empty") {
      return send(200, { choices: [{ message: { content: "" }, finish_reason: "stop" }] });
    }
    if (mode === "truncated") {
      const full = JSON.stringify({
        title: "Ocean Sunrise",
        summary: "cut",
        scenes: SCENES(3),
      });
      return send(200, {
        choices: [
          { message: { content: full.slice(0, Math.floor(full.length * 0.6)) }, finish_reason: "length" },
        ],
      });
    }
    if (mode === "fenced") {
      return send(200, {
        choices: [
          {
            message: {
              content:
                "Here you go:\n```json\n" +
                JSON.stringify({ title: "Ocean Sunrise", summary: "s", scenes: SCENES(2) }) +
                "\n```",
            },
            finish_reason: "stop",
          },
        ],
      });
    }

    const scenes = SCENES(3);
    return send(200, {
      choices: [
        {
          message: {
            content: JSON.stringify({ title: "Ocean Sunrise", summary: "three scenes", scenes }),
          },
          finish_reason: "stop",
        },
      ],
      usage: { completion_tokens: 210, prompt_tokens: 95 },
    });
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`[mock] listening on http://127.0.0.1:${PORT}`);
});
