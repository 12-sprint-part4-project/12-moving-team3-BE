import type {
  UserReportCategory,
  UserReportTarget,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface CreateUserReportInput {
  reporterId: string;
  target: UserReportTarget;
  targetId: string;
  category: UserReportCategory;
}

export const findDuplicateReport = async ({
  reporterId,
  target,
  targetId,
}: {
  reporterId: string;
  target: UserReportTarget;
  targetId: string;
}) => {
  return prisma.userReport.findUnique({
    where: {
      reporterId_target_targetId: {
        reporterId,
        target,
        targetId,
      },
    },
    select: { id: true },
  });
};

export const createUserReport = async (input: CreateUserReportInput) => {
  return prisma.userReport.create({
    data: {
      reporterId: input.reporterId,
      target: input.target,
      targetId: input.targetId,
      category: input.category,
    },
    select: {
      id: true,
      reporterId: true,
      target: true,
      targetId: true,
      category: true,
      status: true,
      createdAt: true,
    },
  });
};

/** 대상 존재 여부 + 소유자 id(자기 신고 검사용). 없으면 null */
export const findReportTargetOwner = async ({
  target,
  targetId,
}: {
  target: UserReportTarget;
  targetId: string;
}): Promise<{ ownerId: string | null } | null> => {
  switch (target) {
    case 'USER': {
      const user = await prisma.user.findFirst({
        where: { id: targetId, deletedAt: null },
        select: { id: true },
      });
      if (!user) return null;
      return { ownerId: user.id };
    }
    case 'REVIEW': {
      const id = Number(targetId);
      const review = await prisma.review.findFirst({
        where: { id, deletedAt: null },
        select: { userId: true },
      });
      if (!review) return null;
      return { ownerId: review.userId };
    }
    case 'ARTICLE': {
      const id = Number(targetId);
      const post = await prisma.post.findFirst({
        where: { id, deletedAt: null },
        select: { userId: true },
      });
      if (!post) return null;
      return { ownerId: post.userId };
    }
    case 'COMMENT': {
      const id = Number(targetId);
      const comment = await prisma.comment.findFirst({
        where: { id, deletedAt: null },
        select: { userId: true },
      });
      if (!comment) return null;
      return { ownerId: comment.userId };
    }
    case 'MESSAGE': {
      const id = Number(targetId);
      const message = await prisma.chatMessage.findFirst({
        where: { id },
        select: { senderId: true },
      });
      if (!message) return null;
      return { ownerId: message.senderId };
    }
    case 'CHAT_ROOM': {
      const id = Number(targetId);
      const room = await prisma.chatRoom.findFirst({
        where: { id },
        select: { id: true },
      });
      if (!room) return null;
      // 채팅방은 단일 소유자가 없어 자기 신고 검사 대상에서 제외
      return { ownerId: null };
    }
    default:
      return null;
  }
};
