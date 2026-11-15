/**
 * Mock of the Flaq AI task API used to verify the client without egress or
 * credits. Mirrors the documented shape:
 *   POST /api/v1/{image,video}/task -> { data: { task_id } }
 *   GET  /api/v1/{image,video}/{id} -> { data: { task_status, task_result } }
 *
 * Modes cycle per submit so one run covers success, async transition and failure.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_FLAQ_PORT || 4598);
const PAYLOAD = Buffer.from("fake-media-bytes");

const MODES = ["ok", "pending-then-ok", "failed", "ok-but-no-url"];
const tasks = new Map();
let submitCount = 0;

createServer((req, res) => {
  // Only the API surface needs auth; asset URLs are meant to be fetchable
  // without a key, exactly like a real CDN link.
  if ((req.url || "").startsWith("/api/v1/")) {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "Missing bearer token" } }));
    }
  }

  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const url = req.url || "";
    const send = (status, payload) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    // --- submit ---
    if (/\/api\/v1\/(image|video)\/task$/.test(url) && req.method === "POST") {
      const kind = url.includes("/image/") ? "image" : "video";
      let body = {};
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        /* ignore */
      }
      const mode = MODES[submitCount % MODES.length];
      submitCount += 1;
      const id = `task-${submitCount}`;
      tasks.set(id, { kind, mode, polls: 0 });
      console.log(
        `[mock-flaq] SUBMIT ${kind} mode=${mode} model_name=${body.model_name} ` +
          `duration=${body.duration ?? "-"} ratio=${body.aspect_ratio ?? "-"} ` +
          `res=${body.resolution ?? "-"}`,
      );
      return send(200, { data: { task_id: id } });
    }

    // --- poll ---
    const poll = /^\/api\/v1\/(image|video)\/(task-\d+)$/.exec(url);
    if (poll && req.method === "GET") {
      const [, kind, id] = poll;
      const task = tasks.get(id);
      if (!task) return send(404, { error: { message: "unknown task" } });
      task.polls += 1;
      console.log(`[mock-flaq] POLL   ${kind} ${id} mode=${task.mode} n=${task.polls}`);

      if (task.mode === "failed") {
        return send(200, {
          data: { task_status: "failed", task_status_msg: "insufficient credits" },
        });
      }
      if (task.mode === "ok-but-no-url") {
        return send(200, { data: { task_status: "succeed", task_result: {} } });
      }
      if (task.mode === "pending-then-ok" && task.polls < 2) {
        return send(200, { data: { task_status: "processing" } });
      }

      const list = [{ url: `http://127.0.0.1:${PORT}/asset/${id}` }];
      return send(200, {
        data: {
          task_status: "succeed",
          task_result: kind === "image" ? { images: list } : { videos: list },
        },
      });
    }

    // --- asset download ---
    if (/^\/asset\//.test(url)) {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end(PAYLOAD);
    }

    return send(404, { error: { message: "not found" } });
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-flaq] listening on http://127.0.0.1:${PORT}`);
});
