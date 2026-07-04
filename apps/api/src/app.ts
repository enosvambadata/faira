import express, { Express, Request } from 'express';
import cors from 'cors';
import * as Sentry from '@sentry/node';
import pinoHttp from 'pino-http';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import webhooksRouter from './routes/webhooks';
import profileRouter from './routes/profile';
import { errorHandler } from './errors/errorHandler';
import { logger } from './logger';

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export function createApp(): Express {
  const app = express();

  app.use(pinoHttp({ logger }));
  // Auth is Bearer-token based (no cookies), so a permissive CORS policy
  // doesn't expose ambient credentials the way it would for cookie auth —
  // needed so the Expo web build (and any other web client) can call this API.
  app.use(cors());
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
  app.use('/api/v1/profile', profileRouter);

  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
