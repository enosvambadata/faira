import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';

const getUserMock = vi.fn();
const userRoleFindManyMock = vi.fn();
const hubFindUniqueMock = vi.fn();
const userFindUniqueMock = vi.fn();
const auditLogCreateMock = vi.fn();

const providerCreateMock = vi.fn();
const providerFindManyMock = vi.fn();
const providerFindUniqueMock = vi.fn();
const providerUpdateMock = vi.fn();

const routeCreateMock = vi.fn();
const routeFindManyMock = vi.fn();
const routeFindUniqueMock = vi.fn();
const routeUpdateMock = vi.fn();

const runCreateMock = vi.fn();
const runFindManyMock = vi.fn();
const runFindUniqueMock = vi.fn();
const runUpdateMock = vi.fn();

vi.mock('../supabase', () => ({
  supabaseAdmin: { auth: { getUser: (...args: unknown[]) => getUserMock(...args) } },
  supabasePublic: { auth: {} },
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: (...args: unknown[]) => userFindUniqueMock(...args),
    },
    userRole: { findMany: (...args: unknown[]) => userRoleFindManyMock(...args) },
    hub: { findUnique: (...args: unknown[]) => hubFindUniqueMock(...args) },
    auditLog: { create: (...args: unknown[]) => auditLogCreateMock(...args) },
    transportProvider: {
      create: (...args: unknown[]) => providerCreateMock(...args),
      findMany: (...args: unknown[]) => providerFindManyMock(...args),
      findUnique: (...args: unknown[]) => providerFindUniqueMock(...args),
      update: (...args: unknown[]) => providerUpdateMock(...args),
    },
    transportRoute: {
      create: (...args: unknown[]) => routeCreateMock(...args),
      findMany: (...args: unknown[]) => routeFindManyMock(...args),
      findUnique: (...args: unknown[]) => routeFindUniqueMock(...args),
      update: (...args: unknown[]) => routeUpdateMock(...args),
    },
    transportRun: {
      create: (...args: unknown[]) => runCreateMock(...args),
      findMany: (...args: unknown[]) => runFindManyMock(...args),
      findUnique: (...args: unknown[]) => runFindUniqueMock(...args),
      update: (...args: unknown[]) => runUpdateMock(...args),
    },
  },
}));

const { createApp } = await import('../app');

const AUTH_HEADER = { Authorization: 'Bearer valid-token' };
const ADMIN_ID = 'admin-1';
const HARARE_ID = '11111111-1111-4111-8111-111111111111';
const BULAWAYO_ID = '22222222-2222-4222-8222-222222222222';
const MUTARE_ID = '33333333-3333-4333-8333-333333333333';
const GWERU_ID = '44444444-4444-4444-8444-444444444444';
const PROVIDER_ID = '55555555-5555-4555-8555-555555555555';

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null });
  userRoleFindManyMock.mockResolvedValue([{ role: 'OPERATIONS_ADMIN', hubId: null }]);
  hubFindUniqueMock.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve([HARARE_ID, BULAWAYO_ID, MUTARE_ID, GWERU_ID].includes(where.id) ? { id: where.id, isActive: true } : null),
  );
  userFindUniqueMock.mockResolvedValue({ id: 'operator-1' });
  auditLogCreateMock.mockResolvedValue({});
});

describe('POST /api/v1/fulfilment/transport/providers', () => {
  it('creates a provider', async () => {
    providerCreateMock.mockResolvedValue({
      id: PROVIDER_ID,
      name: 'Swift Logistics',
      contactPhone: '+263771111111',
      isActive: true,
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/transport/providers')
      .set(AUTH_HEADER)
      .send({ name: 'Swift Logistics', contactPhone: '+263771111111' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Swift Logistics');
  });

  it('403s for a non-admin role', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'SELLER', hubId: null }]);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/transport/providers').set(AUTH_HEADER).send({ name: 'X' });

    expect(res.status).toBe(403);
    expect(providerCreateMock).not.toHaveBeenCalled();
  });

  it('403s for a Transport Operator (read-only role)', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'TRANSPORT_OPERATOR', hubId: null }]);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/transport/providers').set(AUTH_HEADER).send({ name: 'X' });

    expect(res.status).toBe(403);
  });

  it('400s when name is missing', async () => {
    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/transport/providers').set(AUTH_HEADER).send({});

    expect(res.status).toBe(400);
    expect(providerCreateMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/fulfilment/transport/providers', () => {
  it('lists providers for a Transport Operator', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'TRANSPORT_OPERATOR', hubId: null }]);
    providerFindManyMock.mockResolvedValue([
      { id: PROVIDER_ID, name: 'Swift Logistics', contactPhone: null, isActive: true, createdAt: new Date() },
    ]);

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/transport/providers').set(AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('404s GET /providers/:id for an unknown provider', async () => {
    providerFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get(`/api/v1/fulfilment/transport/providers/${PROVIDER_ID}`).set(AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/fulfilment/transport/providers/:id', () => {
  it('updates a provider', async () => {
    providerFindUniqueMock.mockResolvedValue({ id: PROVIDER_ID, name: 'Old', contactPhone: null, isActive: true, createdAt: new Date() });
    providerUpdateMock.mockResolvedValue({ id: PROVIDER_ID, name: 'New Name', contactPhone: null, isActive: false, createdAt: new Date() });

    const app = createApp();
    const res = await request(app)
      .patch(`/api/v1/fulfilment/transport/providers/${PROVIDER_ID}`)
      .set(AUTH_HEADER)
      .send({ name: 'New Name', isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New Name');
    expect(res.body.data.isActive).toBe(false);
  });

  it('404s when the provider does not exist', async () => {
    providerFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).patch(`/api/v1/fulfilment/transport/providers/${PROVIDER_ID}`).set(AUTH_HEADER).send({ name: 'X' });

    expect(res.status).toBe(404);
    expect(providerUpdateMock).not.toHaveBeenCalled();
  });

  it('403s for a non-admin role', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'SELLER', hubId: null }]);

    const app = createApp();
    const res = await request(app).patch(`/api/v1/fulfilment/transport/providers/${PROVIDER_ID}`).set(AUTH_HEADER).send({ name: 'X' });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/fulfilment/transport/routes', () => {
  it('creates a route between the pilot pair', async () => {
    routeCreateMock.mockResolvedValue({
      id: 'route-1',
      originHubId: HARARE_ID,
      destinationHubId: BULAWAYO_ID,
      providerId: null,
      isActive: true,
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/transport/routes')
      .set(AUTH_HEADER)
      .send({ originHubId: HARARE_ID, destinationHubId: BULAWAYO_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.originHubId).toBe(HARARE_ID);
  });

  it('creates a route between two hubs that are not the pilot pair (Mutare <-> Gweru)', async () => {
    routeCreateMock.mockResolvedValue({
      id: 'route-2',
      originHubId: MUTARE_ID,
      destinationHubId: GWERU_ID,
      providerId: null,
      isActive: true,
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/transport/routes')
      .set(AUTH_HEADER)
      .send({ originHubId: MUTARE_ID, destinationHubId: GWERU_ID });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual(
      expect.objectContaining({ originHubId: MUTARE_ID, destinationHubId: GWERU_ID }),
    );
    expect(routeCreateMock).toHaveBeenCalledWith({
      data: { originHubId: MUTARE_ID, destinationHubId: GWERU_ID, providerId: null },
    });
  });

  it('404s when the origin hub does not exist', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/transport/routes')
      .set(AUTH_HEADER)
      .send({ originHubId: '99999999-9999-4999-8999-999999999999', destinationHubId: BULAWAYO_ID });

    expect(res.status).toBe(404);
    expect(routeCreateMock).not.toHaveBeenCalled();
  });

  it('400s when origin and destination are the same hub', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/transport/routes')
      .set(AUTH_HEADER)
      .send({ originHubId: HARARE_ID, destinationHubId: HARARE_ID });

    expect(res.status).toBe(400);
    expect(routeCreateMock).not.toHaveBeenCalled();
  });

  it('409s when a route between these hubs already exists', async () => {
    routeCreateMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '0.0.0' }),
    );

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/transport/routes')
      .set(AUTH_HEADER)
      .send({ originHubId: HARARE_ID, destinationHubId: BULAWAYO_ID });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_EXISTS');
  });

  it('rethrows non-P2002 errors as a 500', async () => {
    routeCreateMock.mockRejectedValue(new Error('unexpected db failure'));

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/transport/routes')
      .set(AUTH_HEADER)
      .send({ originHubId: HARARE_ID, destinationHubId: BULAWAYO_ID });

    expect(res.status).toBe(500);
  });

  it('403s for a non-admin role', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'TRANSPORT_OPERATOR', hubId: null }]);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/transport/routes')
      .set(AUTH_HEADER)
      .send({ originHubId: HARARE_ID, destinationHubId: BULAWAYO_ID });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/fulfilment/transport/routes/:id', () => {
  it('updates a route', async () => {
    routeFindUniqueMock.mockResolvedValue({
      id: 'route-1',
      originHubId: HARARE_ID,
      destinationHubId: BULAWAYO_ID,
      providerId: null,
      isActive: true,
      createdAt: new Date(),
    });
    routeUpdateMock.mockResolvedValue({
      id: 'route-1',
      originHubId: HARARE_ID,
      destinationHubId: BULAWAYO_ID,
      providerId: null,
      isActive: false,
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app).patch('/api/v1/fulfilment/transport/routes/route-1').set(AUTH_HEADER).send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('404s when the route does not exist', async () => {
    routeFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).patch('/api/v1/fulfilment/transport/routes/route-1').set(AUTH_HEADER).send({ isActive: false });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/fulfilment/transport/runs', () => {
  const ROUTE_ID = '66666666-6666-4666-8666-666666666666';
  const VALID_RUN = {
    routeId: ROUTE_ID,
    scheduledDeparture: '2026-08-01T08:00:00.000Z',
    scheduledArrival: '2026-08-01T14:00:00.000Z',
  };

  it('creates a run for an existing route', async () => {
    routeFindUniqueMock.mockResolvedValue({ id: 'route-1', originHubId: HARARE_ID, destinationHubId: BULAWAYO_ID });
    runCreateMock.mockResolvedValue({
      id: 'run-1',
      routeId: 'route-1',
      providerId: null,
      operatorUserId: null,
      vehicleReference: null,
      scheduledDeparture: new Date(VALID_RUN.scheduledDeparture),
      scheduledArrival: new Date(VALID_RUN.scheduledArrival),
      actualDeparture: null,
      actualArrival: null,
      status: 'SCHEDULED',
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/transport/runs').set(AUTH_HEADER).send(VALID_RUN);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('SCHEDULED');
  });

  it('404s when the route does not exist', async () => {
    routeFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/transport/runs').set(AUTH_HEADER).send(VALID_RUN);

    expect(res.status).toBe(404);
    expect(runCreateMock).not.toHaveBeenCalled();
  });

  it('400s when scheduled arrival is before scheduled departure', async () => {
    routeFindUniqueMock.mockResolvedValue({ id: 'route-1', originHubId: HARARE_ID, destinationHubId: BULAWAYO_ID });

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/transport/runs')
      .set(AUTH_HEADER)
      .send({ ...VALID_RUN, scheduledArrival: '2026-08-01T06:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(runCreateMock).not.toHaveBeenCalled();
  });

  it('404s when the operator user does not exist', async () => {
    routeFindUniqueMock.mockResolvedValue({ id: 'route-1', originHubId: HARARE_ID, destinationHubId: BULAWAYO_ID });
    userFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/v1/fulfilment/transport/runs')
      .set(AUTH_HEADER)
      .send({ ...VALID_RUN, operatorUserId: '77777777-7777-4777-8777-777777777777' });

    expect(res.status).toBe(404);
    expect(runCreateMock).not.toHaveBeenCalled();
  });

  it('403s for a non-admin role', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'TRANSPORT_OPERATOR', hubId: null }]);

    const app = createApp();
    const res = await request(app).post('/api/v1/fulfilment/transport/runs').set(AUTH_HEADER).send(VALID_RUN);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/fulfilment/transport/runs', () => {
  it('lists runs for a Transport Operator', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'TRANSPORT_OPERATOR', hubId: null }]);
    runFindManyMock.mockResolvedValue([]);

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/transport/runs').set(AUTH_HEADER);

    expect(res.status).toBe(200);
  });

  it('403s for a Seller', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'SELLER', hubId: null }]);

    const app = createApp();
    const res = await request(app).get('/api/v1/fulfilment/transport/runs').set(AUTH_HEADER);

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/fulfilment/transport/runs/:id', () => {
  it('updates run status', async () => {
    runFindUniqueMock.mockResolvedValue({
      id: 'run-1',
      routeId: 'route-1',
      scheduledDeparture: new Date('2026-08-01T08:00:00.000Z'),
      scheduledArrival: new Date('2026-08-01T14:00:00.000Z'),
    });
    runUpdateMock.mockResolvedValue({
      id: 'run-1',
      routeId: 'route-1',
      providerId: null,
      operatorUserId: null,
      vehicleReference: null,
      scheduledDeparture: new Date('2026-08-01T08:00:00.000Z'),
      scheduledArrival: new Date('2026-08-01T14:00:00.000Z'),
      actualDeparture: null,
      actualArrival: null,
      status: 'DEPARTED',
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app).patch('/api/v1/fulfilment/transport/runs/run-1').set(AUTH_HEADER).send({ status: 'DEPARTED' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DEPARTED');
  });

  it('400s when the updated arrival would be before the updated departure', async () => {
    runFindUniqueMock.mockResolvedValue({
      id: 'run-1',
      routeId: 'route-1',
      scheduledDeparture: new Date('2026-08-01T08:00:00.000Z'),
      scheduledArrival: new Date('2026-08-01T14:00:00.000Z'),
    });

    const app = createApp();
    const res = await request(app)
      .patch('/api/v1/fulfilment/transport/runs/run-1')
      .set(AUTH_HEADER)
      .send({ scheduledDeparture: '2026-08-01T20:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(runUpdateMock).not.toHaveBeenCalled();
  });

  it('404s when the run does not exist', async () => {
    runFindUniqueMock.mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).patch('/api/v1/fulfilment/transport/runs/run-1').set(AUTH_HEADER).send({ status: 'DEPARTED' });

    expect(res.status).toBe(404);
  });

  it('403s for a non-admin role', async () => {
    userRoleFindManyMock.mockResolvedValue([{ role: 'TRANSPORT_OPERATOR', hubId: null }]);

    const app = createApp();
    const res = await request(app).patch('/api/v1/fulfilment/transport/runs/run-1').set(AUTH_HEADER).send({ status: 'DEPARTED' });

    expect(res.status).toBe(403);
  });
});
