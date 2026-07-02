import express, { Express } from 'express';
import healthRouter from './routes/health';
import { errorHandler } from './errors/errorHandler';

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use('/health', healthRouter);

  app.use(errorHandler);

  return app;
}
