/**
 * 관리자 회원/기사 화면 검증용 소량 시드.
 * 기존 데이터를 삭제하지 않고, 고정 이메일·UUID로 upsert 하여 재실행해도 중복을 최소화한다.
 *
 * 실행: npx ts-node scripts/seed-admin-members.ts
 * 또는: npm run seed:admin-members
 */
import 'dotenv/config';

import {
  AuthProvider,
  EstimateRequestStatus,
  MoveType,
  QuoteStatus,
  Region,
  UserReportCategory,
  UserReportTarget,
  UserStatus,
  UserType,
} from '@prisma/client';

import { prisma } from '../src/lib/prisma';
import { hashAuthPassword } from '../src/utils/password.util';

/**
 * 로컬 로그인 공통 비밀번호.
 * 회원가입 규칙(영문+숫자+특수문자, 8~20자)을 만족하도록 seed1234에 **를 붙인다.
 */
const SEED_LOCAL_PASSWORD = 'seed1234**';

/** 시드 식별용 고정 UUID (재실행 upsert) */
const IDS = {
  customer1: 'a1111111-1111-4111-8111-111111111101',
  customer2: 'a1111111-1111-4111-8111-111111111102',
  customer3: 'a1111111-1111-4111-8111-111111111103',
  customer4: 'a1111111-1111-4111-8111-111111111104',
  moverA: 'a2222222-2222-4222-8222-222222222201',
  moverB: 'a2222222-2222-4222-8222-222222222202',
  moverC: 'a2222222-2222-4222-8222-222222222203',
  moverD: 'a2222222-2222-4222-8222-222222222204',
} as const;

const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
};

const daysFromNow = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
};

/** 시드 회원에 LOCAL AuthAccount를 붙여 이메일/비밀번호 로그인이 가능하게 한다. */
const upsertLocalAuth = async (userId: string, passwordHash: string) => {
  await prisma.authAccount.upsert({
    where: {
      userId_provider: {
        userId,
        provider: AuthProvider.LOCAL,
      },
    },
    update: {
      passwordHash,
    },
    create: {
      userId,
      provider: AuthProvider.LOCAL,
      passwordHash,
    },
  });
};

const upsertCustomer = async (input: {
  id: string;
  name: string;
  nickname: string;
  email: string;
  phoneNumber: string;
  createdAt: Date;
  region: Region | null;
  service: MoveType[];
  passwordHash: string;
  status?: UserStatus;
  suspendedAt?: Date | null;
  suspendedUntil?: Date | null;
}) => {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      nickname: input.nickname,
      phoneNumber: input.phoneNumber,
      userType: UserType.CUSTOMER,
      deletedAt: null,
      createdAt: input.createdAt,
    },
    create: {
      id: input.id,
      name: input.name,
      nickname: input.nickname,
      email: input.email,
      phoneNumber: input.phoneNumber,
      userType: UserType.CUSTOMER,
      createdAt: input.createdAt,
    },
  });

  await prisma.customerProfile.upsert({
    where: { userId: user.id },
    update: {
      region: input.region,
      service: input.service,
    },
    create: {
      userId: user.id,
      region: input.region,
      service: input.service,
    },
  });

  await upsertLocalAuth(user.id, input.passwordHash);

  if (input.status) {
    await prisma.userStatusInfo.upsert({
      where: { userId: user.id },
      update: {
        status: input.status,
        suspendedAt: input.suspendedAt ?? null,
        suspendedUntil: input.suspendedUntil ?? null,
      },
      create: {
        userId: user.id,
        status: input.status,
        suspendedAt: input.suspendedAt ?? null,
        suspendedUntil: input.suspendedUntil ?? null,
      },
    });
  }

  return user;
};

const upsertMover = async (input: {
  id: string;
  name: string;
  nickname: string;
  email: string;
  phoneNumber: string;
  createdAt: Date;
  service: MoveType[];
  career: number;
  shortDescription: string;
  description: string;
  regions: Region[];
  passwordHash: string;
  status?: UserStatus;
  suspendedAt?: Date | null;
  suspendedUntil?: Date | null;
}) => {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      nickname: input.nickname,
      phoneNumber: input.phoneNumber,
      userType: UserType.MOVER,
      deletedAt: null,
      createdAt: input.createdAt,
    },
    create: {
      id: input.id,
      name: input.name,
      nickname: input.nickname,
      email: input.email,
      phoneNumber: input.phoneNumber,
      userType: UserType.MOVER,
      createdAt: input.createdAt,
    },
  });

  const profile = await prisma.moverProfile.upsert({
    where: { userId: user.id },
    update: {
      service: input.service,
      career: input.career,
      shortDescription: input.shortDescription,
      description: input.description,
    },
    create: {
      userId: user.id,
      service: input.service,
      career: input.career,
      shortDescription: input.shortDescription,
      description: input.description,
    },
  });

  // 서비스 지역은 프로필마다 교체해 시드 재실행 시에도 의도한 값만 남긴다.
  await prisma.moverServiceRegion.deleteMany({
    where: { moverProfileId: profile.id },
  });
  await prisma.moverServiceRegion.createMany({
    data: input.regions.map((region) => ({
      moverProfileId: profile.id,
      region,
    })),
  });

  await upsertLocalAuth(user.id, input.passwordHash);

  if (input.status) {
    await prisma.userStatusInfo.upsert({
      where: { userId: user.id },
      update: {
        status: input.status,
        suspendedAt: input.suspendedAt ?? null,
        suspendedUntil: input.suspendedUntil ?? null,
      },
      create: {
        userId: user.id,
        status: input.status,
        suspendedAt: input.suspendedAt ?? null,
        suspendedUntil: input.suspendedUntil ?? null,
      },
    });
  }

  return user;
};

/**
 * 확정 견적(+선택 리뷰) 1건.
 * comment에 seedKey를 넣어 재실행 시 동일 건을 건너뛴다.
 */
const ensureConfirmedQuote = async (input: {
  seedKey: string;
  customerId: string;
  moverId: string;
  moveType: MoveType;
  price: number;
  rating?: number;
  reviewContent?: string;
}) => {
  const existing = await prisma.quote.findFirst({
    where: {
      moverId: input.moverId,
      comment: input.seedKey,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (existing) {
    return { quoteId: existing.id, created: false, reviewed: false };
  }

  const estimateRequest = await prisma.estimateRequest.create({
    data: {
      userId: input.customerId,
      moveType: input.moveType,
      moveDate: daysAgo(10),
      departureZipCode: '06236',
      departureAddress: '서울시 강남구',
      departureDetailAddress: '시드 출발지',
      arrivalZipCode: '13529',
      arrivalAddress: '경기도 성남시',
      arrivalDetailAddress: '시드 도착지',
      currentStep: 4,
      totalSteps: 4,
      status: EstimateRequestStatus.CONFIRMED,
      submittedAt: daysAgo(20),
    },
  });

  const quote = await prisma.quote.create({
    data: {
      estimateRequestId: estimateRequest.id,
      moverId: input.moverId,
      price: input.price,
      comment: input.seedKey,
      status: QuoteStatus.CONFIRMED,
      isDesignated: false,
    },
  });

  await prisma.estimateRequest.update({
    where: { id: estimateRequest.id },
    data: { confirmedQuoteId: quote.id },
  });

  let reviewed = false;
  if (input.rating != null && input.reviewContent) {
    await prisma.review.create({
      data: {
        userId: input.customerId,
        quoteId: quote.id,
        rating: input.rating,
        content: input.reviewContent,
      },
    });
    reviewed = true;
  }

  return { quoteId: quote.id, created: true, reviewed };
};

const ensureReport = async (input: {
  reporterId: string;
  targetUserId: string;
  category: UserReportCategory;
}) => {
  try {
    await prisma.userReport.create({
      data: {
        reporterId: input.reporterId,
        target: UserReportTarget.USER,
        targetId: input.targetUserId,
        category: input.category,
      },
    });
    return true;
  } catch {
    // @@unique([reporterId, target, targetId]) — 이미 있으면 스킵
    return false;
  }
};

const main = async () => {
  console.log('Seeding admin member verification data...');

  const passwordHash = await hashAuthPassword(SEED_LOCAL_PASSWORD);

  // --- CUSTOMER 4명 ---
  const customer1 = await upsertCustomer({
    id: IDS.customer1,
    name: '시드고객일',
    nickname: 'seed_customer_1',
    email: 'seed.customer1@example.com',
    phoneNumber: '010-7000-0001',
    createdAt: daysAgo(3),
    region: Region.SEOUL,
    service: [MoveType.HOME, MoveType.SMALL],
    passwordHash,
    status: UserStatus.ACTIVE,
  });

  const customer2 = await upsertCustomer({
    id: IDS.customer2,
    name: '시드고객이',
    nickname: 'seed_customer_2',
    email: 'seed.customer2@example.com',
    phoneNumber: '010-7000-0002',
    createdAt: daysAgo(120),
    region: Region.GYEONGGI,
    service: [MoveType.OFFICE],
    passwordHash,
    status: UserStatus.SUSPENDED,
    suspendedAt: daysAgo(5),
    suspendedUntil: daysFromNow(25),
  });

  const customer3 = await upsertCustomer({
    id: IDS.customer3,
    name: '시드고객삼',
    nickname: 'seed_customer_3',
    email: 'seed.customer3@example.com',
    phoneNumber: '010-7000-0003',
    createdAt: daysAgo(45),
    region: Region.BUSAN,
    service: [MoveType.SMALL],
    passwordHash,
    status: UserStatus.ACTIVE,
  });

  const customer4 = await upsertCustomer({
    id: IDS.customer4,
    name: '시드고객사',
    nickname: 'seed_customer_4',
    email: 'seed.customer4@example.com',
    phoneNumber: '010-7000-0004',
    createdAt: daysAgo(200),
    region: Region.INCHEON,
    service: [MoveType.HOME],
    passwordHash,
    // UserStatusInfo 없음 → 목록에서 ACTIVE로 정규화
  });

  // --- MOVER 4명 (프로필·지역·경력 서로 다르게) ---
  const moverA = await upsertMover({
    id: IDS.moverA,
    name: '시드기사에이',
    nickname: 'seed_mover_a',
    email: 'seed.mover.a@example.com',
    phoneNumber: '010-8000-0001',
    createdAt: daysAgo(400),
    service: [MoveType.HOME, MoveType.OFFICE],
    career: 8,
    shortDescription: '서울·경기 가정/사무실 이사 전문',
    description:
      '안전하고 꼼꼼한 포장·운반을 약속드립니다. 대형 가구 경험 다수.',
    regions: [Region.SEOUL, Region.GYEONGGI],
    passwordHash,
    status: UserStatus.ACTIVE,
  });

  const moverB = await upsertMover({
    id: IDS.moverB,
    name: '시드기사비',
    nickname: 'seed_mover_b',
    email: 'seed.mover.b@example.com',
    phoneNumber: '010-8000-0002',
    createdAt: daysAgo(90),
    service: [MoveType.SMALL],
    career: 3,
    shortDescription: '부산·경남 소형 이사 빠른 대응',
    description: '원룸·소형 짐 위주로 당일 견적도 가능합니다.',
    regions: [Region.BUSAN, Region.GYEONGNAM],
    passwordHash,
    status: UserStatus.ACTIVE,
  });

  const moverC = await upsertMover({
    id: IDS.moverC,
    name: '시드기사씨',
    nickname: 'seed_mover_c',
    email: 'seed.mover.c@example.com',
    phoneNumber: '010-8000-0003',
    createdAt: daysAgo(30),
    service: [MoveType.HOME, MoveType.SMALL],
    career: 12,
    shortDescription: '대구 기반 베테랑 기사',
    description: '장기 경력으로 파손 없는 이사에 집중합니다.',
    regions: [Region.DAEGU, Region.GYEONGBUK],
    passwordHash,
    status: UserStatus.SUSPENDED,
    suspendedAt: daysAgo(2),
    suspendedUntil: daysFromNow(14),
  });

  const moverD = await upsertMover({
    id: IDS.moverD,
    name: '시드기사디',
    nickname: 'seed_mover_d',
    email: 'seed.mover.d@example.com',
    phoneNumber: '010-8000-0004',
    createdAt: daysAgo(7),
    service: [MoveType.OFFICE],
    career: 1,
    shortDescription: '제주 사무실 이사 신규 기사',
    description: '사무실 이전 동선 정리와 야간 작업 가능합니다.',
    regions: [Region.JEJU],
    passwordHash,
    status: UserStatus.ACTIVE,
  });

  // --- 신고: customer1=0, customer2=1, customer3=2, moverC=1 ---
  let reportCreated = 0;
  const reportResults = await Promise.all([
    ensureReport({
      reporterId: customer1.id,
      targetUserId: customer2.id,
      category: UserReportCategory.INAPPROPRIATE_PROFILE,
    }),
    ensureReport({
      reporterId: customer1.id,
      targetUserId: customer3.id,
      category: UserReportCategory.ABUSIVE_LANGUAGE,
    }),
    ensureReport({
      reporterId: customer4.id,
      targetUserId: customer3.id,
      category: UserReportCategory.INAPPROPRIATE_PROFILE,
    }),
    ensureReport({
      reporterId: customer2.id,
      targetUserId: moverC.id,
      category: UserReportCategory.ABUSIVE_LANGUAGE,
    }),
  ]);
  reportCreated = reportResults.filter(Boolean).length;

  // --- 기사 A: 확정 견적 8 + 리뷰 5 (평점 4.8 = 5,5,5,5,4) ---
  const moverAJobs: Array<{
    customerId: string;
    seedKey: string;
    rating?: number;
    review?: string;
  }> = [
    {
      customerId: customer1.id,
      seedKey: 'admin-seed-mover-a-q1',
      rating: 5,
      review: '아주 만족스러웠습니다.',
    },
    {
      customerId: customer2.id,
      seedKey: 'admin-seed-mover-a-q2',
      rating: 5,
      review: '시간 약속 잘 지켜주셨어요.',
    },
    {
      customerId: customer3.id,
      seedKey: 'admin-seed-mover-a-q3',
      rating: 5,
      review: '포장이 꼼꼼했습니다.',
    },
    {
      customerId: customer4.id,
      seedKey: 'admin-seed-mover-a-q4',
      rating: 5,
      review: '다시 이용하고 싶습니다.',
    },
    {
      customerId: customer1.id,
      seedKey: 'admin-seed-mover-a-q5',
      rating: 4,
      review: '전반적으로 좋았습니다.',
    },
    { customerId: customer2.id, seedKey: 'admin-seed-mover-a-q6' },
    { customerId: customer3.id, seedKey: 'admin-seed-mover-a-q7' },
    { customerId: customer4.id, seedKey: 'admin-seed-mover-a-q8' },
  ];

  let quoteCreated = 0;
  let reviewCreated = 0;

  for (const job of moverAJobs) {
    const result = await ensureConfirmedQuote({
      seedKey: job.seedKey,
      customerId: job.customerId,
      moverId: moverA.id,
      moveType: MoveType.HOME,
      price: 250000,
      rating: job.rating,
      reviewContent: job.review,
    });
    if (result.created) {
      quoteCreated += 1;
    }
    if (result.reviewed) {
      reviewCreated += 1;
    }
  }

  // --- 기사 B: 확정 견적 3 + 리뷰 2 (평점 4.0 = 5,3) ---
  const moverBJobs: Array<{
    customerId: string;
    seedKey: string;
    rating?: number;
    review?: string;
  }> = [
    {
      customerId: customer3.id,
      seedKey: 'admin-seed-mover-b-q1',
      rating: 5,
      review: '소형 이사에 딱이었습니다.',
    },
    {
      customerId: customer4.id,
      seedKey: 'admin-seed-mover-b-q2',
      rating: 3,
      review: '조금 늦게 도착했어요.',
    },
    { customerId: customer1.id, seedKey: 'admin-seed-mover-b-q3' },
  ];

  for (const job of moverBJobs) {
    const result = await ensureConfirmedQuote({
      seedKey: job.seedKey,
      customerId: job.customerId,
      moverId: moverB.id,
      moveType: MoveType.SMALL,
      price: 120000,
      rating: job.rating,
      reviewContent: job.review,
    });
    if (result.created) {
      quoteCreated += 1;
    }
    if (result.reviewed) {
      reviewCreated += 1;
    }
  }

  console.log('Admin member seed completed');
  console.log('CUSTOMER: 4');
  console.log('MOVER: 4');
  console.log(`Local login password (all seed users): ${SEED_LOCAL_PASSWORD}`);
  console.log(`Reports created this run: ${reportCreated} (targets: 1+2+1)`);
  console.log(`Confirmed quotes created this run: ${quoteCreated}`);
  console.log(`Reviews created this run: ${reviewCreated}`);
  console.log('UI check targets:');
  console.log(`- customer1 (0 reports, ACTIVE, recent): ${customer1.id}`);
  console.log(`- customer2 (1 report, SUSPENDED, old): ${customer2.id}`);
  console.log(`- customer3 (2 reports, ACTIVE): ${customer3.id}`);
  console.log(`- customer4 (0 reports, no status row): ${customer4.id}`);
  console.log(`- moverA (4.8 / 5 reviews / 8 confirmed): ${moverA.id}`);
  console.log(`- moverB (4.0 / 2 reviews / 3 confirmed): ${moverB.id}`);
  console.log(`- moverC (SUSPENDED, 1 report, no stats): ${moverC.id}`);
  console.log(`- moverD (new, no stats): ${moverD.id}`);
};

main()
  .catch((error: unknown) => {
    console.error('Admin member seed failed');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
