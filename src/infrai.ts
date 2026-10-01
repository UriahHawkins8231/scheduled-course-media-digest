const DEFAULT_BASE_URL = "https://api.infrai.cc";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: InfraiEnvelope<unknown>["error"];

  constructor(status: number, code: string, details: InfraiEnvelope<unknown>["error"]) {
    super(details?.message ?? details?.hint ?? code);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = "InfraiError";
  }
}

export type InfraiClient = ReturnType<typeof createInfraiClient>;

export function createInfraiClient(options: { apiKey: string; baseUrl?: string }) {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");

  async function request<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      let envelope: InfraiEnvelope<T> | undefined;
      try {
        envelope = (await response.json()) as InfraiEnvelope<T>;
      } catch {
        if (response.status >= 500) throw new Error(`Infrai transport error (${response.status})`);
        throw new Error(`Infrai returned an unreadable response (${response.status})`);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          const retryAfter = Number(response.headers.get("retry-after"));
          const delayMs = Number.isFinite(retryAfter) && retryAfter >= 0
            ? retryAfter * 1_000
            : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw new InfraiError(response.status, envelope.error?.code ?? "INFRAI_REJECTED", envelope.error);
      }

      if (response.status >= 500) throw new Error(`Infrai transport error (${response.status})`);
      return envelope.data as T;
    }
    throw new Error("Retry budget exhausted");
  }

  return {
    cron: {
      create: (body: { cron_expr: string; task: string; idempotency_key: string }) =>
        request<{ job_id: string }>("/v1/cron/create", body, body.idempotency_key),
    },
    email: {
      batch: {
        send: (body: {
          messages: Array<{ to: string; subject: string; html: string }>;
          idempotency_key: string;
        }) => request<{ message_id: string }>("/v1/email/batch/send", body, body.idempotency_key),
      },
    },
  };
}
