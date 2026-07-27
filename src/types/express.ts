import type { UserType } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        userType: UserType;
      };
    }
  }
}

export {};
