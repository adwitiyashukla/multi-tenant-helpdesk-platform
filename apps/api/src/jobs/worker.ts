import { Worker } from 'bullmq';
import { purgeExpiredSessions } from '../auth/session.js';
import { client } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { createRedis, redis } from '../lib/redis.js';
import { markSlaBreaches, wakeSnoozedConversations } from '../services/maintenance.js';
import { sendPush } from '../services/notifications.js';
import {
  maintenanceQueueName,
  type NotificationJob,
  notificationQueueName,
  scheduleMaintenance,
} from './queue.js';

const notificationWorker = new Worker<NotificationJob>(
  notificationQueueName,
  async (job) => {
    const delivered = await sendPush(job.data.userId, {
      title: job.data.title,
      body: job.data.body,
      conversationId: job.data.conversationId,
    });
    return { delivered };
  },
  { connection: createRedis(), concurrency: 10 },
);

const maintenanceWorker = new Worker(
  maintenanceQueueName,
  async () => {
    const [breaches, woken, purged] = await Promise.all([
      markSlaBreaches(),
      wakeSnoozedConversations(),
      purgeExpiredSessions(),
    ]);
    if (breaches || woken || purged) {
      logger.info({ breaches, woken, purged }, 'maintenance sweep');
    }
    return { breaches, woken, purged };
  },
  { connection: createRedis(), concurrency: 1 },
);

for (const worker of [notificationWorker, maintenanceWorker]) {
  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error }, 'job failed');
  });
}

await scheduleMaintenance();
logger.info('workers started');

const shutdown = async () => {
  await notificationWorker.close();
  await maintenanceWorker.close();
  await client.end({ timeout: 5 });
  redis.disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
