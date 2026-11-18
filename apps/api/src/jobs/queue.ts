import { Queue } from 'bullmq';
import { env } from '../env.js';
import { createRedis } from '../lib/redis.js';

export type NotificationJob = {
  organizationId: string;
  userId: string;
  title: string;
  body: string;
  conversationId: string;
};

export const notificationQueueName = 'notifications';
export const maintenanceQueueName = 'maintenance';

const jobsEnabled = env.NODE_ENV !== 'test';

let notifications: Queue<NotificationJob> | null = null;
let maintenance: Queue | null = null;

export function notificationQueue(): Queue<NotificationJob> {
  if (!notifications) {
    notifications = new Queue<NotificationJob>(notificationQueueName, {
      connection: createRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 500,
        removeOnFail: 200,
      },
    });
  }
  return notifications;
}

export function maintenanceQueue(): Queue {
  if (!maintenance) {
    maintenance = new Queue(maintenanceQueueName, {
      connection: createRedis(),
      defaultJobOptions: { removeOnComplete: 50, removeOnFail: 50 },
    });
  }
  return maintenance;
}

export async function enqueueNotification(job: NotificationJob) {
  if (!jobsEnabled) {
    return;
  }
  await notificationQueue().add('push', job);
}

export async function scheduleMaintenance() {
  if (!jobsEnabled) {
    return;
  }
  await maintenanceQueue().upsertJobScheduler(
    'sweep',
    { every: 60_000 },
    { name: 'sweep', data: {} },
  );
}

export async function closeQueues() {
  await notifications?.close();
  await maintenance?.close();
  notifications = null;
  maintenance = null;
}
