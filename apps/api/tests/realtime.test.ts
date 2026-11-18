import type { ServerEvent } from '@helpdesk/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import { client } from '../src/db/index.js';
import { redis } from '../src/lib/redis.js';
import { hub } from '../src/realtime/hub.js';
import { createWorkspace, resetDatabase, seedConversation, type TestApp } from './helpers.js';

let app: TestApp;
let baseUrl = '';

function connect(token: string) {
  const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws?token=${token}`);
  const events: ServerEvent[] = [];
  socket.on('message', (raw) => {
    events.push(JSON.parse(raw.toString()) as ServerEvent);
  });
  return { socket, events };
}

async function waitFor<T extends ServerEvent['type']>(
  events: ServerEvent[],
  type: T,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = events.find((event) => event.type === type);
    if (found) {
      return found as Extract<ServerEvent, { type: T }>;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${type}`);
}

beforeAll(async () => {
  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  baseUrl = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : '';
});

afterAll(async () => {
  await app.close();
  await hub.stop();
  redis.disconnect();
  await client.end({ timeout: 5 });
});

beforeEach(async () => {
  await resetDatabase();
});

describe('realtime updates', () => {
  it('closes the socket when the token is not valid', async () => {
    const { socket } = connect('not-a-real-token');
    const code = await new Promise<number>((resolve) => {
      socket.on('close', (value) => resolve(value));
    });
    expect(code).toBe(4401);
  });

  it('pushes a new conversation to every connected agent in the workspace', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const { socket, events } = connect(workspace.token);
    await waitFor(events, 'ready');

    const conversation = await seedConversation(app, workspace.auth);
    const event = await waitFor(events, 'conversation.created');

    expect(event.conversation.id).toBe(conversation.id);
    socket.close();
  });

  it('pushes new messages and the updated conversation', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);
    const { socket, events } = connect(workspace.token);
    await waitFor(events, 'ready');

    await app.inject({
      method: 'POST',
      url: `/conversations/${conversation.id}/messages`,
      headers: workspace.auth,
      payload: { body: 'Looking into this right now.', kind: 'reply' },
    });

    const message = await waitFor(events, 'message.created');
    const updated = await waitFor(events, 'conversation.updated');

    expect(message.conversationId).toBe(conversation.id);
    expect(message.message.body).toContain('Looking into this');
    expect(updated.conversation.firstResponseAt).not.toBeNull();
    socket.close();
  });

  it('reports who is online and which conversation they are viewing', async () => {
    const workspace = await createWorkspace(app, { email: 'owner@acme.test' });
    const conversation = await seedConversation(app, workspace.auth);
    const { socket, events } = connect(workspace.token);
    await waitFor(events, 'ready');
    await waitFor(events, 'presence');

    socket.send(JSON.stringify({ type: 'viewing', conversationId: conversation.id }));

    const deadline = Date.now() + 5000;
    let viewing: string | null = null;
    while (Date.now() < deadline && viewing !== conversation.id) {
      const presence = events.filter((event) => event.type === 'presence').at(-1);
      viewing = presence?.users[0]?.viewing ?? null;
      if (viewing !== conversation.id) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }

    expect(viewing).toBe(conversation.id);
    socket.close();
  });

  it('relays typing indicators between two agents', async () => {
    const owner = await createWorkspace(app, { email: 'owner@acme.test' });
    const invite = await app.inject({
      method: 'POST',
      url: '/members/invites',
      headers: owner.auth,
      payload: { email: 'agent@acme.test', role: 'agent' },
    });
    const agent = await app.inject({
      method: 'POST',
      url: '/auth/invites/accept',
      payload: { token: invite.json().token, name: 'Agent Smith', password: 'anotherpassword1' },
    });
    const conversation = await seedConversation(app, owner.auth);

    const first = connect(owner.token);
    const second = connect(agent.json().token);
    await waitFor(first.events, 'ready');
    await waitFor(second.events, 'ready');

    second.socket.send(JSON.stringify({ type: 'typing', conversationId: conversation.id }));
    const typing = await waitFor(first.events, 'typing');

    expect(typing.name).toBe('Agent Smith');
    expect(typing.conversationId).toBe(conversation.id);
    first.socket.close();
    second.socket.close();
  });
});
