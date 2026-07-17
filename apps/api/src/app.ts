import express, { Express, Request } from 'express';
import cors from 'cors';
import * as Sentry from '@sentry/node';
import pinoHttp from 'pino-http';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import webhooksRouter from './routes/webhooks';
import profileRouter from './routes/profile';
import listingsRouter from './routes/listings';
import categoriesRouter from './routes/categories';
import wishlistRouter from './routes/wishlist';
import conversationsRouter from './routes/conversations';
import sellersRouter from './routes/sellers';
import verificationRouter from './routes/verification';
import accountRouter from './routes/account';
import adminRouter from './routes/admin';
import ordersRouter from './routes/orders';
import reviewsRouter from './routes/reviews';
import reportsRouter from './routes/reports';
import fulfilmentRolesRouter from './routes/fulfilmentRoles';
import fulfilmentSellersRouter from './routes/fulfilmentSellers';
import fulfilmentHubsRouter from './routes/fulfilmentHubs';
import fulfilmentShipmentsRouter from './routes/fulfilmentShipments';
import hubOpsRouter from './routes/hubOps';
import transportRouter from './routes/transport';
import manifestsRouter from './routes/manifests';
import trackingRouter from './routes/tracking';
import collectUkCompaniesRouter from './routes/collectUkCompanies';
import collectUkCompanyRolesRouter from './routes/collectUkCompanyRoles';
import collectUkBookingsRouter from './routes/collectUkBookings';
import collectUkSchedulingRouter from './routes/collectUkScheduling';
import collectUkDriverPortalRouter from './routes/collectUkDriverPortal';
import collectUkShipmentsRouter, { collectUkShipmentTrackingRouter } from './routes/collectUkShipments';
import collectUkFreightRatesRouter from './routes/collectUkFreightRates';
import collectUkPaymentsRouter from './routes/collectUkPayments';
import collectUkTeamRouter from './routes/collectUkTeam';
import { errorHandler } from './errors/errorHandler';
import { logger } from './logger';

export interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

export function createApp(): Express {
  const app = express();

  // Railway terminates TLS at its proxy, so client IPs arrive via
  // X-Forwarded-For. Without this, express-rate-limit keys every request
  // off the proxy's own IP -- ONE shared bucket for all clients, meaning a
  // single busy customer exhausts the public booking/tracking limits for
  // everyone (surfaced as ERR_ERL_UNEXPECTED_X_FORWARDED_FOR in staging
  // logs). Exactly one trusted hop; a client-forged X-Forwarded-For can't
  // spoof past the proxy's own appended entry.
  app.set('trust proxy', 1);

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
  app.use('/api/v1/listings', listingsRouter);
  app.use('/api/v1/categories', categoriesRouter);
  app.use('/api/v1/wishlist', wishlistRouter);
  app.use('/api/v1/conversations', conversationsRouter);
  app.use('/api/v1/sellers', sellersRouter);
  app.use('/api/v1/verification', verificationRouter);
  app.use('/api/v1/account', accountRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/orders', ordersRouter);
  app.use('/api/v1/reviews', reviewsRouter);
  app.use('/api/v1/reports', reportsRouter);
  app.use('/api/v1/fulfilment/user-roles', fulfilmentRolesRouter);
  app.use('/api/v1/fulfilment/sellers', fulfilmentSellersRouter);
  app.use('/api/v1/fulfilment/hubs', fulfilmentHubsRouter);
  app.use('/api/v1/fulfilment/shipments', fulfilmentShipmentsRouter);
  app.use('/api/v1/fulfilment/hub-ops', hubOpsRouter);
  app.use('/api/v1/fulfilment/transport', transportRouter);
  app.use('/api/v1/fulfilment/manifests', manifestsRouter);
  app.use('/api/v1/fulfilment/tracking', trackingRouter);
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
