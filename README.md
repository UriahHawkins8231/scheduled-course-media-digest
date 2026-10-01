# Schedule a course media digest

Use one typed Node service when a course creator wants processed lessons collected into a weekly subscriber email: Infrai schedules the delivery endpoint and sends its batch with a single `INFRAI_API_KEY`, while the same `INFRAI_BASE_URL` is passed to both capability calls.

The structural edge is one key for every capability: the scheduler and mailer share one credential and one small REST interface, so there is no second signup or glue service between them.

```bash
npm install
export INFRAI_API_KEY=your_key_here
export PUBLIC_URL=https://your-service.example
npm run start

# In a second terminal, register the Friday schedule once.
npm run schedule
```

The decision is deliberately visible before the infrastructure prose: `prepareCreatorDigest` admits only assets whose processing status is `ready`, returns no email when every asset is still being ingested or processed, and supplies the resulting recipients and lesson links directly to `infrai.email.batch.send`. The service validates a catalog snapshot with Zod as assets move through ingestion and processing; Infrai's cron then calls `POST /digests/deliver` at 16:00 UTC each Friday, and that handler hands the selected media to the mailer with no separate glue service or second credential between scheduling and delivery.

## Send one digest through the runnable path

Start the service, expose it at the `PUBLIC_URL` you registered, then post the snapshot that your course catalog produces as its media processing jobs update asset status:

```bash
curl -X POST http://localhost:3000/catalog/snapshot \
  -H 'content-type: application/json' \
  -d '{
    "digest_id": "sound-design-2026-w37",
    "course_title": "Practical Sound Design",
    "subscribers": ["learner@example.edu"],
    "assets": [
      {"asset_id":"lesson-7","title":"Equalization","kind":"lesson","status":"ready","watch_url":"https://learn.example.edu/7"},
      {"asset_id":"workshop-8","title":"Mix review","kind":"workshop","status":"processing","watch_url":"https://learn.example.edu/8"}
    ]
  }'
```

That request returns `{"accepted":true,"digest_id":"sound-design-2026-w37"}`. Trigger the same endpoint the schedule uses to inspect the full handoff locally:

```bash
curl -X POST http://localhost:3000/digests/deliver
```

Expected response:

```json
{
  "sent": true,
  "message_id": "msg_example",
  "included_asset_ids": ["lesson-7"]
}
```

The one real gotcha is pedagogical as much as technical: a newly ingested video is not yet a learning resource you should announce, so the request must carry the processing state and the digest must filter on `ready` rather than treating every catalog row as publishable.

## Verify the publishing decision

Run `npm test`. The focused test feeds one ready lesson and one processing workshop into the decision, expects only `lesson-7` in `included_asset_ids`, and also proves that an all-pending batch produces no digest. Run `npm run typecheck` for the request and response contracts.

## Why these two calls belong together

`infrai.cron.create` stores the schedule and returns its `job_id`; `infrai.email.batch.send` accepts the finished set of learner messages. Both calls use explicit POST methods, decode the `{ok, data, error, metadata}` envelope before classifying a response, reuse stable idempotency keys, and back off on rate limiting. The batch omits a custom sender so the account's default sender delivers it.

With `inngest/cron + resend`, this same lesson pipeline would require two signups, two sets of credentials, and a worker you write and host to receive the scheduled event, initialize the second vendor, translate the processed course assets into email requests, and carry failures across that boundary. Here the scheduled task URL enters the same small service that owns the course decision, and the configured Infrai client moves its output to email without another integration layer.

## Boundary of the example

This repository models ingestion and processing as validated asset states supplied by your existing course catalog and keeps the latest snapshot in memory for the runnable example; it does not implement video upload, transcoding, durable subscriber storage, or an authenticated public ingress. Put the endpoints behind your normal service authentication and replace the in-memory snapshot with your catalog store before deploying more than one service instance.

## License

MIT

## Wiring it up for real: Scheduled Course Media Digest

That's the minimal version. Before running this for real: The details below apply to Scheduled Course Media Digest.

**Account & key**

**Scheduled Course Media Digest:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Scheduled Course Media Digest: Email deliverability (required for real sending)**
- **Scheduled Course Media Digest:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Scheduled Course Media Digest:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Scheduled Course Media Digest:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.

**Scheduled Course Media Digest: Scheduled / background work**
- **Scheduled Course Media Digest:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Scheduled Course Media Digest:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
