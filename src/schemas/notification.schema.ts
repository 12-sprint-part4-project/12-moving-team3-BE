import { z } from 'zod';

/** PATCH /api/notifications/:notificationId */
export const notificationIdParamsSchema = z.object({
  notificationId: z.coerce.number().int().positive(),
});

export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;

/** GET /api/notifications/stream?accessToken= */
export const notificationStreamQuerySchema = z.object({
  accessToken: z.string().min(1),
});

export type NotificationStreamQuery = z.infer<
  typeof notificationStreamQuerySchema
>;
