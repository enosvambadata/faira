import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../supabase';
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

  req.userId = data.user.id;
  next();
}
