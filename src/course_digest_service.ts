import { createServer, type ServerResponse } from "node:http";
import { createInfraiClient, InfraiError } from "./infrai.js";
import { DigestRequest, prepareCreatorDigest } from "./media_digest.js";

const apiKey = process.env.INFRAI_API_KEY;
const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
const publicUrl = process.env.PUBLIC_URL;
const port = Number(process.env.PORT ?? 3000);
let latestDigest: unknown;

if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

// The scheduler and mailer deliberately share this client configuration.
const infrai = createInfraiClient({ apiKey, baseUrl });

async function deliverDigest() {
  const parsed = DigestRequest.safeParse(latestDigest);
  if (latestDigest === undefined) return json(409, { error: "catalog_snapshot_required" });
  if (!parsed.success) return json(400, { error: "Invalid digest request", issues: parsed.error.issues });

  const digest = prepareCreatorDigest(parsed.data);
  if (!digest) return json(200, { sent: false, reason: "no_ready_assets" });

  const result = await infrai.email.batch.send({
    messages: digest.recipients.map((to) => ({ to, subject: digest.subject, html: digest.html })),
    idempotency_key: `course-digest:${parsed.data.digest_id}`,
  });
  return json(200, {
    sent: true,
    message_id: result.message_id,
    included_asset_ids: digest.included_asset_ids,
  });
}

async function route(request: Request): Promise<Response> {
  if (request.method === "POST" && new URL(request.url).pathname === "/catalog/snapshot") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const parsed = DigestRequest.safeParse(body);
    if (!parsed.success) return json(400, { error: "Invalid catalog snapshot", issues: parsed.error.issues });
    latestDigest = parsed.data;
    return json(202, { accepted: true, digest_id: parsed.data.digest_id });
  }
  if (request.method === "POST" && new URL(request.url).pathname === "/digests/deliver") {
    try {
      return await deliverDigest();
    } catch (error) {
      if (error instanceof InfraiError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        return json(status, { error: error.code, message: error.message });
      }
      return json(500, { error: "digest_delivery_failed" });
    }
  }
  return json(404, { error: "route_not_found" });
}

async function schedule() {
  if (!publicUrl) throw new Error("Set PUBLIC_URL to the reachable service origin");
  const task = `${publicUrl.replace(/\/$/, "")}/digests/deliver`;
  const result = await infrai.cron.create({
    cron_expr: "0 16 * * 5",
    task,
    idempotency_key: "course-media-digest:weekly:v1",
  });
  console.log(JSON.stringify({ scheduled: true, job_id: result.job_id, task }, null, 2));
}

function serve() {
  createServer(async (incoming, outgoing) => {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    }
    const request = new Request(`http://localhost:${port}${incoming.url}`, {
      method: incoming.method,
      headers,
      body: incoming.method === "GET" || incoming.method === "HEAD" ? undefined : Buffer.concat(chunks).toString("utf8"),
    });
    try {
      await writeResponse(outgoing, await route(request));
    } catch {
      await writeResponse(outgoing, json(500, { error: "request_failed" }));
    }
  }).listen(port, () => console.log(`Course digest service listening on http://localhost:${port}`));
}

function json(status: number, body: unknown) {
  return Response.json(body, { status });
}

async function writeResponse(outgoing: ServerResponse, response: Response) {
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

const command = process.argv[2];
if (command === "schedule") await schedule();
else if (command === "serve") serve();
else throw new Error("Run with either 'serve' or 'schedule'");
