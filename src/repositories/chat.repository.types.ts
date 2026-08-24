import {
  Prisma,
  type ChatRoom,
  type ChatRoomType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

export type ChatRoomRecord = ChatRoom;
export type ChatDbClient = typeof prisma | Prisma.TransactionClient;
export type ChatTransactionClient = Prisma.TransactionClient;

export interface PartnerReadStatus {
  lastReadMessageId: number;
  readAt: Date;
}

export interface PartnerRoomFilter {
  roomId: number;
  partnerId: string;
}

export interface FindRoomByEstimateAndParticipantsParams {
  estimateRequestId: number;
  roomType?: ChatRoomType;
  roomTypes?: ChatRoomType[];
  participantIds: string[];
}

export interface PromoteRoomToDesignatedParams {
  roomId: number;
  designatedMoverId: number;
  quoteId?: number;
}
