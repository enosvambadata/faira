import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../supabase';
import { prisma } from '../prisma';
import { ApiError } from '../errors/ApiError';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token) {
    next(new ApiError('UNAUTHENTICATED', 'Missing or malformed Authorization header', 401));
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    next(new ApiError('UNAUTHENTICATED', 'Invalid or expired access token', 401));
    return;
  }

  // Supabase's auth.users row exists the moment someone signs up, but our
  // own public.users row (needed for FKs like listings.seller_id) doesn't
  // get created anywhere else — provision it here, on first authenticated
  // request, rather than requiring every caller to remember to.
  await prisma.user.upsert({
    where: { id: data.user.id },
    update: {},
    create: { id: data.user.id },
  });

  req.userId = data.user.id;
  next();
}
