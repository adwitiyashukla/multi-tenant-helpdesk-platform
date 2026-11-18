# multi-tenant-helpdesk-platform

A shared support inbox for small teams. Customer emails land as conversations, agents claim them,
reply or leave internal notes, and every open ticket runs against an SLA clock. Built as a full
stack project with a Next.js web app, an Expo mobile app, and one Fastify API behind both.

## What it does

- Sign up creates a workspace with its own inbound email address, tags, and canned replies
- Email sent to that address opens a conversation, and follow ups thread onto the same one
- Agents assign, reply, snooze, tag, and close conversations from the web app or the phone
- Every agent sees changes live: new messages, status changes, who is online, who is typing
- The SLA clock starts when a customer writes and stops on the first agent reply
- Analytics shows open volume, median first response, median resolution, and per agent load
- Owners invite teammates up to the plan seat limit and upgrade through Stripe checkout

## Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js 16 App Router, React 19, TypeScript, Tailwind 4, TanStack Query |
| Mobile | Expo SDK 57, React Native 0.86, Expo Router, secure token storage |
| API | Fastify 5, TypeScript, Zod validation, Drizzle ORM |
| Data | Postgres 16, Redis 7 |
| Jobs | BullMQ workers for SLA sweeps, snooze wakeups, and push delivery |
| Realtime | WebSockets with Redis pub/sub fanout |
| Tests | Vitest against a real Postgres, Playwright against a real browser |
| CI | GitHub Actions: lint, typecheck, API tests, web build, mobile bundle, end to end |

## How it fits together

The API is the only thing that talks to Postgres. The web app and the mobile app both call it, so
the same rules apply on both. Shared Zod schemas live in `packages/contracts` and all three
packages import them, which means a change to a response shape breaks the build instead of
breaking at runtime.

Sessions are cookie based for the web and bearer token based for mobile, both backed by the same
`sessions` table with hashed tokens. Passwords are hashed with Argon2id.

Every workspace scoped query filters on `organization_id` inside the service layer, not in the
route handler, so a missing filter cannot slip through. There are tests that try to read and write
another workspace's data and expect a 404.

Realtime updates go through Redis pub/sub rather than in process events, so several API instances
can serve sockets and still deliver every event to every connected agent. Presence lives in a Redis
hash with a TTL, so it survives a restart of any single instance.

## Running it

You need Node 22 or newer, pnpm, and Docker.

```
git clone https://github.com/adwitiyashukla/multi-tenant-helpdesk-platform.git
cd multi-tenant-helpdesk-platform
pnpm install
cp .env.example .env
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

On Windows use `copy` instead of `cp`. `pnpm install` also builds the shared contracts package, so
there is no separate build step.

The web app is on http://localhost:3000 and the API on http://localhost:4000. The seed creates a
workspace with 60 conversations and four agents. Sign in with `demo@helpdesk.test` and the password
`demo-password-123`. Running the seed again leaves an existing demo workspace alone, and
`pnpm db:seed --reset` rebuilds it from scratch.

If Postgres or Redis already run on your machine, ports 5432 and 6379 will be taken. Set
`POSTGRES_PORT` and `REDIS_PORT` in `.env` to free ports and use the same ports in `DATABASE_URL`
and `REDIS_URL`.

Background workers run separately:

```
pnpm --filter @helpdesk/api worker
```

The mobile app:

```
pnpm --filter @helpdesk/mobile start
```

Stripe and S3 are optional. Leave those variables empty and billing returns a clear error while
attachments are stored on local disk. To try S3 compatible storage, start MinIO with
`docker compose --profile storage up -d` and fill in the S3 variables.

## Tests

```
pnpm test
pnpm test:e2e
```

54 API tests run against a real Postgres and Redis, not mocks. They cover signup and login, invite
acceptance, seat limits, role checks, the conversation lifecycle, SLA sweeps, snooze wakeups,
inbound email threading and deduplication, full text search, rate limiting, CORS, and workspace
isolation. 6 Playwright tests drive a real browser through signup, opening a conversation,
replying, leaving an internal note, searching, analytics, invites, and sign out.

Two problems showed up in these tests rather than from clicking around by hand. The API allowed
only GET, HEAD, and POST through CORS, so every PATCH and DELETE from the browser was blocked before
it left the page. And the conversation update route passed the request body to the service layer without
validating it. Both are covered by tests now.

## Numbers

Measured on a 2 vCPU Linux container running the API, Postgres, and Redis together, against a
seeded workspace of 100,000 conversations and 190,000 messages in a 165 MB database. 25 concurrent
connections, 10 seconds per endpoint.

| Endpoint | req/sec | p50 ms | p95 ms | p99 ms |
| --- | --- | --- | --- | --- |
| Inbox page | 335 | 69 | 124 | 155 |
| Inbox filtered by status | 377 | 64 | 98 | 109 |
| Full text search | 36 | 644 | 934 | 988 |
| Conversation detail | 605 | 40 | 58 | 68 |
| Thread messages | 420 | 58 | 80 | 88 |
| Workspace metrics | 335 | 25 | 83 | 113 |

WebSocket fanout to 20 connected clients: p50 21 ms, p95 32 ms from the moment a reply is accepted
to the moment the last client has it.

The search number is the slowest one because the benchmark searches a term that matches 8,334 of
the 100,000 conversations. The seed data cycles through twelve subject lines, so a term hits about
8 percent of rows. A search that matches a few hundred rows returns in single digit milliseconds.

Reproduce with:

```
pnpm db:seed --reset --conversations=100000
pnpm bench
```

### What the first run found

The first benchmark run was much worse, and fixing it was the most useful part of the project.

| Change | Before | After |
| --- | --- | --- |
| Inbox query plan | 84 ms, sequential scan and sort of 100,000 rows | 0.45 ms, index scan |
| Inbox endpoint under load | 14 req/sec, p50 1604 ms | 335 req/sec, p50 69 ms |
| Search query | 228 ms, sequential scan | 54 ms, two index scans |
| Metrics endpoint | 423 ms every request | 25 ms p50 |

The inbox index existed but Postgres would not use it. `ORDER BY last_message_at DESC` defaults to
`NULLS FIRST`, and the generated index was `DESC NULLS LAST`, so the ordering did not match and the
planner fell back to sorting the whole table. Rebuilding the index as `DESC NULLS FIRST` made it a
straight index scan.

Search was slow because the query was written as `subject matches OR a message matches`. An OR
across two tables stops Postgres from using either GIN index, so it scanned every row. Rewriting it
as a union of two indexed subqueries let both indexes do their job.

Metrics recomputed two median percentiles over every conversation on every request. It now caches
in Redis for 30 seconds and clears the key whenever a conversation changes, so the dashboard is
still correct the moment something moves.

## Layout

```
apps/api         Fastify API, Drizzle schema, workers, tests, benchmark
apps/web         Next.js web app and Playwright tests
apps/mobile      Expo app
packages/contracts   Zod schemas and types shared by all three
```
