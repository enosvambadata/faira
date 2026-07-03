import { Router, Request, Response, NextFunction } from 'express';
import { Webhook } from 'standardwebhooks';
import AfricasTalking from 'africastalking';
import { ApiError } from '../errors/ApiError';
import { logger } from '../logger';
import type { RequestWithRawBody } from '../app';

interface SendSmsHookPayload {
  user: { phone?: string };
  sms: { otp: string };
}

const router = Router();

router.post('/supabase/send-sms', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const secret = process.env.SUPABASE_SEND_SMS_HOOK_SECRET;
    if (!secret) {
      next(new ApiError('CONFIG_ERROR', 'Send SMS hook secret is not configured', 500));
      return;
    }

    const rawBody = (req as RequestWithRawBody).rawBody;
    if (!rawBody) {
      next(new ApiError('WEBHOOK_ERROR', 'Missing raw body for signature verification', 400));
      return;
    }

    const headers = {
      'webhook-id': req.header('webhook-id') ?? req.header('svix-id') ?? '',
      'webhook-timestamp': req.header('webhook-timestamp') ?? req.header('svix-timestamp') ?? '',
      'webhook-signature': req.header('webhook-signature') ?? req.header('svix-signature') ?? '',
    };

    // Supabase's dashboard/Management API stores hook secrets as `v1,whsec_<base64>`;
    // standardwebhooks only strips a bare `whsec_` prefix itself, so strip `v1,` here first.
    const wh = new Webhook(secret.replace('v1,whsec_', ''));
    let payload: SendSmsHookPayload;
    try {
      payload = wh.verify(rawBody, headers) as SendSmsHookPayload;
    } catch {
      next(new ApiError('INVALID_SIGNATURE', 'Webhook signature verification failed', 401));
      return;
    }

    const rawPhone = payload.user?.phone;
    const otp = payload.sms?.otp;
    if (!rawPhone || !otp) {
      next(new ApiError('WEBHOOK_ERROR', 'Missing phone or otp in webhook payload', 400));
      return;
    }
    const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;

    const africastalking = AfricasTalking({
      apiKey: process.env.AFRICAS_TALKING_API_KEY || 'placeholder-api-key',
      username: process.env.AFRICAS_TALKING_USERNAME || 'sandbox',
    });

    await africastalking.SMS.send({
      to: [phone],
      message: `Your Faira Market verification code is ${otp}. It expires in 10 minutes.`,
    });

    res.status(200).json({});
  } catch (error) {
    logger.error({ err: error }, 'send-sms webhook failed');
    next(error);
  }
});

export default router;
