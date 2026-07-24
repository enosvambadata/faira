import express, { Express, Request } from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import { logger } from './logger';
import { errorHandler } from './errors/errorHandler';
import healthRouter from './routes/health';
import webhooksRouter from './routes/webhooks';
import collectUkCompaniesRouter from './routes/collectUkCompanies';
import collectUkCompanyRolesRouter from './routes/collectUkCompanyRoles';
import collectUkBookingsRouter from './routes/collectUkBookings';
import collectUkSchedulingRouter from './routes/collectUkScheduling';
import collectUkDriverPortalRouter from './routes/collectUkDriverPortal';
import collectUkShipmentsRouter, { collectUkShipmentTrackingRouter } from './routes/collectUkShipments';
import collectUkFreightRatesRouter from './routes/collectUkFreightRates';
import collectUkPaymentsRouter from './routes/collectUkPayments';
import collectUkTeamRouter from './routes/collectUkTeam';

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export function createApp(): Express {
  const app = express();

  // Railway terminates TLS at its proxy; exactly one trusted hop so
  // express-rate-limit keys off the real client IP (see the api note).
  app.set('trust proxy', 1);

  app.use(pinoHttp({ logger }));
  app.use(cors());
  // The Stripe webhook verifies the signature against the exact raw bytes, so
  // capture them here before JSON parsing (same seam as the marketplace API).
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as RequestWithRawBody).rawBody = buf;
      },
    }),
  );

  app.use('/health', healthRouter);
  app.use('/api/v1/webhooks', webhooksRouter);
  app.use('/api/v1/collect-uk/companies', collectUkCompaniesRouter);
  app.use('/api/v1/collect-uk/companies', collectUkShipmentsRouter);
  app.use('/api/v1/collect-uk/companies', collectUkFreightRatesRouter);
  app.use('/api/v1/collect-uk/companies', collectUkPaymentsRouter);
  app.use('/api/v1/collect-uk/companies', collectUkTeamRouter);
  app.use('/api/v1/admin/collect-uk/company-roles', collectUkCompanyRolesRouter);
  app.use('/api/v1/collect-uk', collectUkBookingsRouter);
  app.use('/api/v1/collect-uk', collectUkShipmentTrackingRouter);
  app.use('/api/v1/admin/collect-uk', collectUkSchedulingRouter);
  app.use('/api/v1/collect-uk/driver', collectUkDriverPortalRouter);

  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
