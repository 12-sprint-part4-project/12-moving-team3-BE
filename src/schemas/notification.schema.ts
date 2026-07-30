import { z } from 'zod';

/** PATCH /api/notifications/:notificationId */
export const notificationIdParamsSchema = z.object({
  notificationId: z.coerce.number().int().positive(),
});

export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;
