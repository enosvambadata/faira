import express, { Express, Request } from 'express';
import * as Sentry from '@sentry/node';
import pinoHttp from 'pino-http';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import webhooksRouter from './routes/webhooks';
import { errorHandler } from './errors/errorHandler';
import { logger } from './logger';

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export function createApp(): Express {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as RequestWithRawBody).rawBody = buf;
      },
    }),
  );
  app.use('/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/webhooks', webhooksRouter);

  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
