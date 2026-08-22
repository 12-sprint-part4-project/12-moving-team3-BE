/**
 * 대량 리뷰 검증용 시드.
 *
 * - 리뷰가 많은 기사 1명
 * - 리뷰를 많이 작성했고, 작성 가능한 확정 견적도 많은 고객 1명
 *
 * 리뷰 작성 가능 조건에 맞춤:
 * - Quote CONFIRMED + EstimateRequest.confirmedQuoteId 일치
 * - EstimateRequest COMPLETED (또는 moveDate 경과)
 * - 활성 리뷰 없음 → writable
 *
 * 실행:
 *   npx ts-node scripts/seed-heavy-reviews.ts
 *
 * 수량 조절 (선택):
 *   SEED_HEAVY_WRITTEN=50 SEED_HEAVY_WRITABLE=50 SEED_HEAVY_FILLER=50 npx ts-node scripts/seed-heavy-reviews.ts
 *
 * 진행 로그 간격 (선택, 기본 1=매 건):
 *   SEED_HEAVY_PROGRESS_EVERY=5 npx ts-node scripts/seed-heavy-reviews.ts
 */
import 'dotenv/config';

import {
  AuthProvider,
  EstimateRequestStatus,
  MoveType,
  QuoteStatus,
  Region,
  UserStatus,
  UserType,
} from '@prisma/client';

import { runWithManualAudit } from '../src/lib/audit-context';
import { prisma } from '../src/lib/prisma';
import { hashAuthPassword } from '../src/utils/auth-password.util';

const SEED_LOCAL_PASSWORD = 'seed1234**';

const WRITTEN_COUNT = Number(process.env.SEED_HEAVY_WRITTEN ?? 50);
const WRITABLE_COUNT = Number(process.env.SEED_HEAVY_WRITABLE ?? 50);
const FILLER_REVIEW_COUNT = Number(process.env.SEED_HEAVY_FILLER ?? 50);

/** 시드 식별용 고정 UUID (재실행 upsert) */
const IDS = {
  customer: 'b1111111-1111-4111-8111-111111111101',
  mover: 'b2222222-2222-4222-8222-222222222201',
} as const;

const FILLER_CUSTOMER_COUNT = 10;

const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
};

const parsePositiveInt = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a non-negative integer (got ${value})`);
  }
  return value;
};

const upsertLocalAuth = async (userId: string, passwordHash: string) => {
  await prisma.authAccount.upsert({
    where: {
      userId_provider: {
        userId,
        provider: AuthProvider.LOCAL,
      },
    },
    update: { passwordHash },
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
  region: Region;
  service: MoveType[];
  passwordHash: string;
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

  await prisma.userStatusInfo.upsert({
    where: { userId: user.id },
    update: {
      status: UserStatus.ACTIVE,
      suspendedAt: null,
      suspendedUntil: null,
    },
    create: {
      userId: user.id,
      status: UserStatus.ACTIVE,
    },
  });

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

  await prisma.userStatusInfo.upsert({
    where: { userId: user.id },
    update: {
      status: UserStatus.ACTIVE,
      suspendedAt: null,
      suspendedUntil: null,
    },
    create: {
      userId: user.id,
      status: UserStatus.ACTIVE,
    },
  });

  return user;
};

const fillerCustomerId = (index: number) => {
  const n = String(index).padStart(12, '0');
  return `b3333333-3333-4333-8333-${n.slice(-12)}`;
};

/**
 * 확정·이사완료 견적 1건 (+선택 리뷰).
 * quote.comment 에 seedKey 를 넣어 재실행 시 동일 건을 건너뛴다.
 */
const ensureCompletedConfirmedQuote = async (input: {
  seedKey: string;
  customerId: string;
  moverId: string;
  moveType: MoveType;
  price: number;
  moveDaysAgo: number;
  rating?: number;
  reviewContent?: string;
}) => {
  const existing = await prisma.quote.findFirst({
    where: {
      moverId: input.moverId,
      comment: input.seedKey,
      deletedAt: null,
    },
    select: {
      id: true,
      reviews: {
        where: { userId: input.customerId, deletedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (existing) {
    if (
      input.rating != null &&
      input.reviewContent &&
      existing.reviews.length === 0
    ) {
      await prisma.review.create({
        data: {
          userId: input.customerId,
          quoteId: existing.id,
          rating: input.rating,
          content: input.reviewContent,
        },
      });
      return {
        quoteId: existing.id,
        quoteCreated: false,
        reviewCreated: true,
        hasReview: true,
      };
    }

    return {
      quoteId: existing.id,
      quoteCreated: false,
      reviewCreated: false,
      hasReview: existing.reviews.length > 0,
    };
  }

  const estimateRequest = await prisma.estimateRequest.create({
    data: {
      userId: input.customerId,
      moveType: input.moveType,
      moveDate: daysAgo(input.moveDaysAgo),
      departureZipCode: '06236',
      departureAddress: '서울시 강남구',
      departureDetailAddress: `시드 출발 ${input.seedKey}`,
      arrivalZipCode: '13529',
      arrivalAddress: '경기도 성남시',
      arrivalDetailAddress: `시드 도착 ${input.seedKey}`,
      currentStep: 4,
      totalSteps: 4,
      status: EstimateRequestStatus.COMPLETED,
      submittedAt: daysAgo(input.moveDaysAgo + 10),
      confirmedAt: daysAgo(input.moveDaysAgo + 5),
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

  let reviewCreated = false;
  if (input.rating != null && input.reviewContent) {
    await prisma.review.create({
      data: {
        userId: input.customerId,
        quoteId: quote.id,
        rating: input.rating,
        content: input.reviewContent,
      },
    });
    reviewCreated = true;
  }

  return {
    quoteId: quote.id,
    quoteCreated: true,
    reviewCreated,
    hasReview: reviewCreated,
  };
};

const moveTypes = [MoveType.HOME, MoveType.SMALL, MoveType.OFFICE] as const;

const logStep = (message: string) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

/** 매 건 또는 N건마다 진행 로그 (기본 1 = 매 건) */
const PROGRESS_EVERY = Math.max(
  1,
  Number(process.env.SEED_HEAVY_PROGRESS_EVERY ?? 1)
);

const logProgress = (label: string, current: number, total: number) => {
  if (current === 1 || current === total || current % PROGRESS_EVERY === 0) {
    logStep(`${label}: ${current}/${total}`);
  }
};

const main = async () => {
  const writtenCount = parsePositiveInt(WRITTEN_COUNT, 'SEED_HEAVY_WRITTEN');
  const writableCount = parsePositiveInt(WRITABLE_COUNT, 'SEED_HEAVY_WRITABLE');
  const fillerReviewCount = parsePositiveInt(
    FILLER_REVIEW_COUNT,
    'SEED_HEAVY_FILLER'
  );

  logStep('Seeding heavy review data...');
  logStep(
    `counts: written=${writtenCount}, writable=${writableCount}, fillerReviews=${fillerReviewCount}`
  );

  logStep('hashing password...');
  const passwordHash = await hashAuthPassword(SEED_LOCAL_PASSWORD);
  logStep('password hashed');

  logStep('pinging database (SELECT 1)...');
  await prisma.$queryRaw`SELECT 1`;
  logStep('database ok');

  // 시드 대량 INSERT 시 histories 트리거 생략 (속도·터널 부하 완화)
  await runWithManualAudit(async () => {
    logStep('upserting main customer...');
    const customer = await upsertCustomer({
      id: IDS.customer,
      name: '대량리뷰고객',
      nickname: 'seed_heavy_customer',
      email: 'seed.heavy.customer@example.com',
      phoneNumber: '010-9100-0001',
      createdAt: daysAgo(400),
      region: Region.SEOUL,
      service: [MoveType.HOME, MoveType.SMALL, MoveType.OFFICE],
      passwordHash,
    });
    logStep(`main customer ready id=${customer.id}`);

    logStep('upserting main mover...');
    const mover = await upsertMover({
      id: IDS.mover,
      name: '대량리뷰기사',
      nickname: 'seed_heavy_mover',
      email: 'seed.heavy.mover@example.com',
      phoneNumber: '010-9200-0001',
      createdAt: daysAgo(500),
      service: [MoveType.HOME, MoveType.SMALL, MoveType.OFFICE],
      career: 10,
      shortDescription: '리뷰 대량 시드용 기사',
      description: '페이지네이션·통계 검증을 위한 대량 리뷰 시드 기사입니다.',
      regions: [Region.SEOUL, Region.GYEONGGI, Region.INCHEON],
      passwordHash,
    });
    logStep(`main mover ready id=${mover.id}`);

    logStep(`upserting filler customers (1..${FILLER_CUSTOMER_COUNT})...`);
    const fillerCustomers = [];
    for (let i = 1; i <= FILLER_CUSTOMER_COUNT; i += 1) {
      const padded = String(i).padStart(2, '0');
      const filler = await upsertCustomer({
        id: fillerCustomerId(i),
        name: `시드필러고객${padded}`,
        nickname: `seed_heavy_filler_${padded}`,
        email: `seed.heavy.filler${padded}@example.com`,
        phoneNumber: `010-9300-00${padded}`,
        createdAt: daysAgo(300 - i),
        region: Region.GYEONGGI,
        service: [MoveType.HOME, MoveType.SMALL],
        passwordHash,
      });
      fillerCustomers.push(filler);
      logProgress('filler customers', i, FILLER_CUSTOMER_COUNT);
    }
    logStep('filler customers ready');

    let quoteCreated = 0;
    let reviewCreated = 0;
    let writableCreated = 0;

    // 1) 메인 고객이 기사에게 남긴 리뷰 (작성 완료)
    logStep(`creating written reviews (1..${writtenCount})...`);
    for (let i = 1; i <= writtenCount; i += 1) {
      const result = await ensureCompletedConfirmedQuote({
        seedKey: `heavy-written-${i}`,
        customerId: customer.id,
        moverId: mover.id,
        moveType: moveTypes[(i - 1) % moveTypes.length],
        price: 150000 + i * 1000,
        moveDaysAgo: 20 + i,
        rating: ((i - 1) % 5) + 1,
        reviewContent: `시드 작성 리뷰 #${i} — 대량 리뷰 검증용입니다.`,
      });
      if (result.quoteCreated) {
        quoteCreated += 1;
      }
      if (result.reviewCreated) {
        reviewCreated += 1;
      }
      logProgress('written', i, writtenCount);
    }

    // 2) 메인 고객의 리뷰 작성 가능 견적 (리뷰 없음)
    logStep(`creating writable quotes (1..${writableCount})...`);
    for (let i = 1; i <= writableCount; i += 1) {
      const result = await ensureCompletedConfirmedQuote({
        seedKey: `heavy-writable-${i}`,
        customerId: customer.id,
        moverId: mover.id,
        moveType: moveTypes[(i - 1) % moveTypes.length],
        price: 200000 + i * 1000,
        moveDaysAgo: 5 + (i % 30),
      });
      if (result.quoteCreated) {
        quoteCreated += 1;
      }
      if (!result.hasReview) {
        writableCreated += 1;
      }
      logProgress('writable', i, writableCount);
    }

    // 3) 필러 고객 → 기사 리뷰 (기사 총 리뷰 수 보강)
    logStep(`creating filler reviews (1..${fillerReviewCount})...`);
    for (let i = 1; i <= fillerReviewCount; i += 1) {
      const filler = fillerCustomers[(i - 1) % fillerCustomers.length];
      const result = await ensureCompletedConfirmedQuote({
        seedKey: `heavy-filler-${i}`,
        customerId: filler.id,
        moverId: mover.id,
        moveType: moveTypes[(i - 1) % moveTypes.length],
        price: 180000 + i * 500,
        moveDaysAgo: 40 + i,
        rating: ((i - 1) % 5) + 1,
        reviewContent: `필러 고객 리뷰 #${i} — 기사 리뷰 목록 대량 검증용.`,
      });
      if (result.quoteCreated) {
        quoteCreated += 1;
      }
      if (result.reviewCreated) {
        reviewCreated += 1;
      }
      logProgress('filler reviews', i, fillerReviewCount);
    }

    logStep('Done.');
    console.log({
      customer: {
        email: 'seed.heavy.customer@example.com',
        password: SEED_LOCAL_PASSWORD,
        id: customer.id,
      },
      mover: {
        email: 'seed.heavy.mover@example.com',
        password: SEED_LOCAL_PASSWORD,
        id: mover.id,
      },
      createdThisRun: {
        quotes: quoteCreated,
        reviews: reviewCreated,
        writableTargets: writableCreated,
      },
      targets: {
        customerWrittenReviews: writtenCount,
        customerWritableQuotes: writableCount,
        moverReviewsApprox: writtenCount + fillerReviewCount,
      },
    });
  });
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
