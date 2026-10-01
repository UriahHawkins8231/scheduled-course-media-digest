import { z } from "zod";

export const DigestRequest = z.object({
  digest_id: z.string().min(1),
  course_title: z.string().min(1),
  subscribers: z.array(z.string().email()).min(1),
  assets: z.array(z.object({
    asset_id: z.string().min(1),
    title: z.string().min(1),
    kind: z.enum(["lesson", "livestream", "workshop"]),
    status: z.enum(["ingested", "processing", "ready"]),
    watch_url: z.string().url(),
  })),
});

export type DigestInput = z.infer<typeof DigestRequest>;

export function prepareCreatorDigest(input: DigestInput) {
  const readyAssets = input.assets.filter((asset) => asset.status === "ready");
  if (readyAssets.length === 0) return null;

  const lessons = readyAssets.map((asset) =>
    `<li><a href="${escapeHtml(asset.watch_url)}">${escapeHtml(asset.title)}</a> (${asset.kind})</li>`,
  ).join("");

  return {
    subject: `${input.course_title}: ${readyAssets.length} new learning ${readyAssets.length === 1 ? "resource" : "resources"}`,
    html: `<h1>${escapeHtml(input.course_title)}</h1><p>Your processed media is ready to learn from.</p><ul>${lessons}</ul>`,
    recipients: input.subscribers,
    included_asset_ids: readyAssets.map((asset) => asset.asset_id),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] as string);
}
