import { randomUUID } from 'node:crypto';
import { clientEventSchema } from '@helpdesk/contracts';
import type { FastifyInstance } from 'fastify';
import { resolveSession } from '../auth/session.js';
import { env } from '../env.js';
import { type Client, hub, publishEvent } from './hub.js';

const heartbeatMs = 25 * 1000;

export async function websocketRoutes(app: FastifyInstance) {
  await hub.start();

  app.get('/ws', { websocket: true }, async (socket, request) => {
    const query = request.query as { token?: string };
    const token = request.cookies[env.SESSION_COOKIE_NAME] ?? query.token;
    const auth = token ? await resolveSession(token) : null;

    if (!auth) {
      socket.close(4401, 'unauthorized');
      return;
    }

    const client: Client = {
      id: randomUUID(),
      socket,
      organizationId: auth.organization.id,
      userId: auth.user.id,
      name: auth.user.name,
      viewing: null,
    };

    await hub.add(client);
    socket.send(JSON.stringify({ type: 'ready', userId: auth.user.id }));

    const heartbeat = setInterval(() => {
      if (socket.readyState === socket.OPEN) {
        socket.ping();
        void hub.touchPresence(client);
      }
    }, heartbeatMs);

    socket.on('message', (raw: Buffer) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const event = clientEventSchema.safeParse(parsed);
      if (!event.success) {
        return;
      }

      if (event.data.type === 'viewing') {
        client.viewing = event.data.conversationId;
        void hub.touchPresence(client).then(() => hub.broadcastPresence(client.organizationId));
        return;
      }
      if (event.data.type === 'typing') {
        void publishEvent(client.organizationId, {
          type: 'typing',
          conversationId: event.data.conversationId,
          userId: client.userId,
          name: client.name,
        });
      }
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      void hub.remove(client);
    });
  });
}
