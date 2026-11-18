import pino from 'pino';
import { env } from '../env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'password', '*.password'],
    remove: true,
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
});
