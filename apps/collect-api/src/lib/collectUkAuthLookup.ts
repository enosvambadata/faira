import { prisma } from '../prisma';
import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';

// User emails live in Supabase's auth.users, not the app `users` table (which
// only mirrors the id). Team management needs both directions: email -> id when
// an admin adds a teammate, and id -> email to render the member list.

export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id FROM auth.users WHERE lower(email) = ${email.trim().toLowerCase()} LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch (err) {
    logger.error({ err, userId }, 'could not look up user email');
    return null;
  }
}
