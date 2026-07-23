import express, { Express, Request } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import { logger } from './logger';
import { errorHandler } from './errors/errorHandler';
import healthRouter from './routes/health';
import fulfilmentRolesRouter from './routes/fulfilmentRoles';
import fulfilmentSellersRouter from './routes/fulfilmentSellers';
import fulfilmentHubsRouter from './routes/fulfilmentHubs';
import fulfilmentShipmentsRouter from './routes/fulfilmentShipments';
import hubOpsRouter from './routes/hubOps';
import transportRouter from './routes/transport';
import manifestsRouter from './routes/manifests';
import trackingRouter from './routes/tracking';

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export function createApp(): Express {
  const app = express();

  // Railway terminates TLS at its proxy; exactly one trusted hop (see the
  // marketplace API note) so express-rate-limit keys off the real client IP.
  app.set('trust proxy', 1);

  app.use(pinoHttp({ logger }));
  app.use(cors());
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as RequestWithRawBody).rawBody = buf;
      },
    }),
  );

  app.use('/health', healthRouter);
  app.use('/api/v1/fulfilment/user-roles', fulfilmentRolesRouter);
  app.use('/api/v1/fulfilment/sellers', fulfilmentSellersRouter);
  app.use('/api/v1/fulfilment/hubs', fulfilmentHubsRouter);
  app.use('/api/v1/fulfilment/shipments', fulfilmentShipmentsRouter);
  app.use('/api/v1/fulfilment/hub-ops', hubOpsRouter);
  app.use('/api/v1/fulfilment/transport', transportRouter);
  app.use('/api/v1/fulfilment/manifests', manifestsRouter);
  app.use('/api/v1/fulfilment/tracking', trackingRouter);

  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
