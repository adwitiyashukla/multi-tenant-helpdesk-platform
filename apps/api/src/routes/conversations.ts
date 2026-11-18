import {
  conversationQuerySchema,
  createConversationSchema,
  createMessageSchema,
  tagInputSchema,
  updateConversationSchema,
} from '@helpdesk/contracts';
import type { FastifyInstance } from 'fastify';
import { currentAuth, requireAuth } from '../auth/guards.js';
import { enqueueNotification } from '../jobs/queue.js';
import { parse } from '../lib/validate.js';
import { publishEvent } from '../realtime/hub.js';
import { recordAudit } from '../services/audit.js';
import {
  addMessage,
  createConversation,
  getConversation,
  listConversations,
  listMessages,
  setConversationTag,
  updateConversation,
} from '../services/conversations.js';
import { invalidateMetrics } from '../services/metrics.js';

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/conversations', async (request) => {
    const auth = currentAuth(request);
    const query = parse(conversationQuerySchema, request.query);
    return listConversations(auth.organization.id, auth.user.id, query);
  });

  app.post('/conversations', async (request, reply) => {
    const auth = currentAuth(request);
    const input = parse(createConversationSchema, request.body);
    const conversation = await createConversation(auth.organization.id, input);

    await invalidateMetrics(auth.organization.id);
    await publishEvent(auth.organization.id, { type: 'conversation.created', conversation });
    await recordAudit({
      organizationId: auth.organization.id,
      actorId: auth.user.id,
      action: 'conversation.created',
      subjectType: 'conversation',
      subjectId: conversation.id,
    });

    return reply.code(201).send(conversation);
  });

  app.get('/conversations/:id', async (request) => {
    const auth = currentAuth(request);
    const { id } = request.params as { id: string };
    return getConversation(auth.organization.id, id);
  });

  app.patch('/conversations/:id', async (request) => {
    const auth = currentAuth(request);
    const { id } = request.params as { id: string };
    const input = parse(updateConversationSchema, request.body);
    const conversation = await updateConversation(auth.organization.id, id, input);

    await invalidateMetrics(auth.organization.id);
    await publishEvent(auth.organization.id, { type: 'conversation.updated', conversation });
    await recordAudit({
      organizationId: auth.organization.id,
      actorId: auth.user.id,
      action: 'conversation.updated',
      subjectType: 'conversation',
      subjectId: id,
      metadata: input,
    });

    if (conversation.assignee && conversation.assignee.id !== auth.user.id) {
      await enqueueNotification({
        organizationId: auth.organization.id,
        userId: conversation.assignee.id,
        title: 'Conversation assigned to you',
        body: conversation.subject,
        conversationId: conversation.id,
      });
    }

    return conversation;
  });

  app.get('/conversations/:id/messages', async (request) => {
    const auth = currentAuth(request);
    const { id } = request.params as { id: string };
    await getConversation(auth.organization.id, id);
    return listMessages(auth.organization.id, id);
  });

  app.post('/conversations/:id/messages', async (request, reply) => {
    const auth = currentAuth(request);
    const { id } = request.params as { id: string };
    const input = parse(createMessageSchema, request.body);
    const result = await addMessage(auth.organization.id, id, input, auth.user);

    await invalidateMetrics(auth.organization.id);
    await publishEvent(auth.organization.id, {
      type: 'message.created',
      conversationId: id,
      message: result.message,
    });
    await publishEvent(auth.organization.id, {
      type: 'conversation.updated',
      conversation: result.conversation,
    });

    return reply.code(201).send(result.message);
  });

  app.post('/conversations/:id/tags', async (request, reply) => {
    const auth = currentAuth(request);
    const { id } = request.params as { id: string };
    const input = parse(tagInputSchema, request.body);
    const conversation = await setConversationTag(auth.organization.id, id, input.name, true);
    await publishEvent(auth.organization.id, { type: 'conversation.updated', conversation });
    return reply.code(201).send(conversation);
  });

  app.delete('/conversations/:id/tags/:name', async (request) => {
    const auth = currentAuth(request);
    const { id, name } = request.params as { id: string; name: string };
    const conversation = await setConversationTag(auth.organization.id, id, name, false);
    await publishEvent(auth.organization.id, { type: 'conversation.updated', conversation });
    return conversation;
  });
}
