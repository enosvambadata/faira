import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../logger';

const router = Router();

// Liveness: the process is up. Deliberately DB-free -- a transient DB blip
// must not fail the deploy healthcheck and trigger a restart loop.
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Readiness: can the app actually serve, i.e. is Postgres reachable? Point
// uptime/monitoring here (not the liveness route) so a dead database surfaces
// as unhealthy instead of a silent 200.
router.get('/ready', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    logger.error({ err }, 'readiness check failed: database unreachable');
    res.status(503).json({ status: 'unavailable' });
  }
});

export default router;
