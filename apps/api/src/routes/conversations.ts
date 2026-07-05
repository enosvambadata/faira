import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/requireAuth';
import { signChatUpload } from '../lib/cloudinary';
import { ApiError } from '../errors/ApiError';

const router = Router();

const createConversationSchema = z.object({
  listingId: z.string().uuid(),
});

const sendMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(2000).optional(),
    imageUrl: z.string().url().optional(),
  })
  .refine(data => data.body !== undefined || data.imageUrl !== undefined, {
    message: 'A message needs text, an image, or both',
  });

function listingSummary(listing: { id: string; title: string; price: { toString(): string }; imageUrls: string[] }) {
  return {
    id: listing.id,
    title: listing.title,
    price: listing.price.toString(),
    imageUrl: listing.imageUrls[0] ?? null,
  };
}

// Fetches a conversation and 403s unless the caller is one of its two
// participants — every route below a conversation ID needs this same check.
async function loadConversationForParticipant(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      listing: true,
      buyer: { select: { id: true, displayName: true, avatarUrl: true } },
      seller: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  if (!conversation) return { conversation: null, forbidden: false };
  if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
    return { conversation: null, forbidden: true };
  }
  return { conversation, forbidden: false };
}

function conversationResponse(
  conversation: NonNullable<Awaited<ReturnType<typeof loadConversationForParticipant>>['conversation']>,
  userId: string,
) {
  const otherParticipant = conversation.buyerId === userId ? conversation.seller : conversation.buyer;
  return {
    id: conversation.id,
    listingId: conversation.listingId,
    buyerId: conversation.buyerId,
    sellerId: conversation.sellerId,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    listing: listingSummary(conversation.listing),
    otherParticipant,
  };
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;

  const conversationList = await prisma.conversation.findMany({
    where: {
      OR: [
        { buyerId: userId, archivedByBuyer: false },
        { sellerId: userId, archivedBySeller: false },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      listing: true,
      buyer: { select: { id: true, displayName: true, avatarUrl: true } },
      seller: { select: { id: true, displayName: true, avatarUrl: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { messages: { where: { senderId: { not: userId }, readAt: null } } } },
    },
  });

  res.status(200).json({
    data: conversationList.map(conversation => ({
      ...conversationResponse(conversation, userId),
      lastMessage: conversation.messages[0]
        ? {
            body: conversation.messages[0].body,
            imageUrl: conversation.messages[0].imageUrl,
            senderId: conversation.messages[0].senderId,
            createdAt: conversation.messages[0].createdAt,
          }
        : null,
      unreadCount: conversation._count.messages,
    })),
  });
});

router.get('/unread-count', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;

  const count = await prisma.message.count({
    where: {
      senderId: { not: userId },
      readAt: null,
      conversation: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    },
  });

  res.status(200).json({ data: { count } });
});

router.patch('/:id/archive', requireAuth, async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
  const { conversation, forbidden } = await loadConversationForParticipant(req.params.id, req.userId!);

  if (forbidden) {
    next(new ApiError('FORBIDDEN', 'You are not part of this conversation', 403));
    return;
  }
  if (!conversation) {
    next(new ApiError('CONVERSATION_NOT_FOUND', 'Conversation not found', 404));
    return;
  }

  const isBuyer = conversation.buyerId === req.userId!;
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: isBuyer ? { archivedByBuyer: true } : { archivedBySeller: true },
  });

  res.status(200).json({ data: { id: conversation.id, archived: true } });
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const parsed = createConversationSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid conversation payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const listing = await prisma.listing.findUnique({ where: { id: parsed.data.listingId } });

  if (!listing || listing.deletedAt) {
    next(new ApiError('LISTING_NOT_FOUND', 'Listing not found', 404));
    return;
  }

  if (listing.sellerId === req.userId) {
    next(new ApiError('VALIDATION_ERROR', 'You cannot start a conversation on your own listing', 400));
    return;
  }

  const conversation = await prisma.conversation.upsert({
    where: { listingId_buyerId: { listingId: listing.id, buyerId: req.userId! } },
    update: {},
    create: { listingId: listing.id, buyerId: req.userId!, sellerId: listing.sellerId },
    include: {
      listing: true,
      buyer: { select: { id: true, displayName: true, avatarUrl: true } },
      seller: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  });

  res.status(200).json({ data: conversationResponse(conversation, req.userId!) });
});

router.post('/upload-signature', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({ data: signChatUpload() });
});

router.get('/:id', requireAuth, async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
  const { conversation, forbidden } = await loadConversationForParticipant(req.params.id, req.userId!);

  if (forbidden) {
    next(new ApiError('FORBIDDEN', 'You are not part of this conversation', 403));
    return;
  }
  if (!conversation) {
    next(new ApiError('CONVERSATION_NOT_FOUND', 'Conversation not found', 404));
    return;
  }

  res.status(200).json({ data: conversationResponse(conversation, req.userId!) });
});

router.get('/:id/messages', requireAuth, async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
  const { conversation, forbidden } = await loadConversationForParticipant(req.params.id, req.userId!);

  if (forbidden) {
    next(new ApiError('FORBIDDEN', 'You are not part of this conversation', 403));
    return;
  }
  if (!conversation) {
    next(new ApiError('CONVERSATION_NOT_FOUND', 'Conversation not found', 404));
    return;
  }

  // Opening the thread implicitly marks the other participant's messages as
  // read — there's only ever one other participant in these conversations,
  // so a single "not sent by me" sweep is all read-tracking needs here.
  await prisma.message.updateMany({
    where: { conversationId: conversation.id, senderId: { not: req.userId! }, readAt: null },
    data: { readAt: new Date() },
  });

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
  });

  res.status(200).json({
    data: messages.map(message => ({
      id: message.id,
      senderId: message.senderId,
      body: message.body,
      imageUrl: message.imageUrl,
      readAt: message.readAt,
      createdAt: message.createdAt,
    })),
  });
});

router.post('/:id/messages', requireAuth, async (req: AuthenticatedRequest & Request<{ id: string }>, res: Response, next: NextFunction) => {
  const parsed = sendMessageSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ApiError('VALIDATION_ERROR', 'Invalid message payload', 400, z.flattenError(parsed.error)));
    return;
  }

  const { conversation, forbidden } = await loadConversationForParticipant(req.params.id, req.userId!);

  if (forbidden) {
    next(new ApiError('FORBIDDEN', 'You are not part of this conversation', 403));
    return;
  }
  if (!conversation) {
    next(new ApiError('CONVERSATION_NOT_FOUND', 'Conversation not found', 404));
    return;
  }

  // Sending a message un-archives the thread for whichever side had
  // archived it — otherwise a reply to an archived conversation would
  // vanish into it permanently instead of resurfacing in the inbox.
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: req.userId!,
        body: parsed.data.body,
        imageUrl: parsed.data.imageUrl,
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date(), archivedByBuyer: false, archivedBySeller: false },
    }),
  ]);

  res.status(201).json({
    data: {
      id: message.id,
      senderId: message.senderId,
      body: message.body,
      imageUrl: message.imageUrl,
      readAt: message.readAt,
      createdAt: message.createdAt,
    },
  });
});

export default router;
