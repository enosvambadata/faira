import express, { Express } from 'express';
import * as Sentry from '@sentry/node';
import pinoHttp from 'pino-http';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import { errorHandler } from './errors/errorHandler';
import { logger } from './logger';

export function createApp(): Express {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json());
  app.use('/health', healthRouter);
  app.use('/api/v1/auth', authRouter);

  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
