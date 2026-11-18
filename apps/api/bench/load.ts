import autocannon from 'autocannon';
import WebSocket from 'ws';

const baseUrl = process.env.BENCH_API_URL ?? 'http://127.0.0.1:4000';
const email = process.env.BENCH_EMAIL ?? 'demo@helpdesk.test';
const password = process.env.BENCH_PASSWORD ?? 'demo-password-123';
const duration = Number(process.env.BENCH_DURATION ?? 10);
const connections = Number(process.env.BENCH_CONNECTIONS ?? 25);
const socketCount = Number(process.env.BENCH_SOCKETS ?? 20);

type Scenario = { name: string; path: string };

async function login() {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`login failed with ${response.status}`);
  }
  const payload = (await response.json()) as { token: string; organization: { id: string } };
  return payload.token;
}

async function firstConversationId(token: string) {
  const response = await fetch(`${baseUrl}/conversations?limit=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const payload = (await response.json()) as { items: Array<{ id: string }> };
  const id = payload.items[0]?.id;
  if (!id) {
    throw new Error('no conversations to benchmark against, run db:seed first');
  }
  return id;
}

async function runScenario(scenario: Scenario, token: string) {
  const result = await autocannon({
    url: `${baseUrl}${scenario.path}`,
    connections,
    duration,
    headers: { authorization: `Bearer ${token}` },
  });
  return {
    name: scenario.name,
    rps: Math.round(result.requests.average),
    p50: result.latency.p50,
    p95: result.latency.p97_5,
    p99: result.latency.p99,
    errors: result.errors + result.non2xx,
  };
}

async function measureFanout(token: string, conversationId: string) {
  const sockets: WebSocket[] = [];
  const received: number[] = [];
  let sentAt = 0;

  await Promise.all(
    Array.from({ length: socketCount }, () => {
      return new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws?token=${token}`);
        sockets.push(socket);
        socket.on('message', (raw: Buffer) => {
          const event = JSON.parse(raw.toString()) as { type: string };
          if (event.type === 'ready') {
            resolve();
          }
          if (event.type === 'message.created' && sentAt > 0) {
            received.push(Date.now() - sentAt);
          }
        });
        socket.on('error', reject);
      });
    }),
  );

  const samples: number[] = [];
  for (let round = 0; round < 10; round += 1) {
    received.length = 0;
    sentAt = Date.now();
    await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: `benchmark fanout round ${round}`, kind: 'note' }),
    });

    const deadline = Date.now() + 5000;
    while (received.length < socketCount && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    samples.push(...received);
  }

  for (const socket of sockets) {
    socket.close();
  }

  samples.sort((a, b) => a - b);
  const at = (q: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * q))];
  return { samples: samples.length, p50: at(0.5), p95: at(0.95), max: samples.at(-1) };
}

async function run() {
  const token = await login();
  const conversationId = await firstConversationId(token);

  const scenarios: Scenario[] = [
    { name: 'inbox page', path: '/conversations?limit=25' },
    { name: 'inbox filtered', path: '/conversations?status=open&limit=25' },
    { name: 'full text search', path: '/conversations?q=webhook&limit=25' },
    { name: 'conversation detail', path: `/conversations/${conversationId}` },
    { name: 'thread messages', path: `/conversations/${conversationId}/messages` },
    { name: 'workspace metrics', path: '/metrics' },
  ];

  const rows = [];
  for (const scenario of scenarios) {
    rows.push(await runScenario(scenario, token));
  }

  process.stdout.write(
    `\nhttp load: ${connections} connections, ${duration}s each\n` +
      `${'endpoint'.padEnd(22)}${'rps'.padStart(8)}${'p50 ms'.padStart(9)}${'p95 ms'.padStart(9)}${'p99 ms'.padStart(9)}${'errors'.padStart(8)}\n`,
  );
  for (const row of rows) {
    process.stdout.write(
      `${row.name.padEnd(22)}${String(row.rps).padStart(8)}${String(row.p50).padStart(9)}${String(row.p95).padStart(9)}${String(row.p99).padStart(9)}${String(row.errors).padStart(8)}\n`,
    );
  }

  const fanout = await measureFanout(token, conversationId);
  process.stdout.write(
    `\nwebsocket fanout to ${socketCount} clients over ${fanout.samples} deliveries\n` +
      `p50 ${fanout.p50} ms, p95 ${fanout.p95} ms, max ${fanout.max} ms\n`,
  );
}

run().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
