/**
 * demo.customer@example.com 의 "작성 가능한 리뷰" 탭용 시드 (10건).
 * 현실적인 주소·가격·이사유형·서로 다른 기사를 넣는다. 리뷰는 만들지 않는다.
 *
 * 실행: npm run reviews:seed-demo-writable
 *
 * 재실행 시 quote.comment 의 seedKey 로 동일 건을 건너뛴다.
 * 고객 계정이 없으면 실패한다 (생성하지 않음).
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';

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
import { hashAuthPassword } from '../src/utils/password.util';

const DEMO_CUSTOMER_EMAIL = 'demo.customer@example.com';
const SEED_LOCAL_PASSWORD = 'seed1234**';
const SEED_KEY_PREFIX = 'demo-writable-';

const daysAgo = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
};

const stableUuid = (label: string) => {
  const hex = createHash('sha256')
    .update(`demo-writable-mover:${label}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
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

const upsertMover = async (input: {
  key: string;
  name: string;
  nickname: string;
  email: string;
  phoneNumber: string;
  career: number;
  shortDescription: string;
  description: string;
  service: MoveType[];
  regions: Region[];
  passwordHash: string;
}) => {
  const userId = stableUuid(input.key);

  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      nickname: input.nickname,
      phoneNumber: input.phoneNumber,
      userType: UserType.MOVER,
      deletedAt: null,
    },
    create: {
      id: userId,
      name: input.name,
      nickname: input.nickname,
      email: input.email,
      phoneNumber: input.phoneNumber,
      userType: UserType.MOVER,
      createdAt: daysAgo(400),
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

const DEMO_MOVERS = [
  {
    key: 'minsu',
    name: '김민수',
    nickname: 'demo_writable_minsu',
    email: 'demo.writable.mover.minsu@example.com',
    phoneNumber: '010-5111-1001',
    career: 8,
    shortDescription: '가정·소형 이사 전문',
    description:
      '서울·경기 가정이사와 원룸 소형 이사를 중심으로, 파손 없이 안전하게 옮깁니다.',
    service: [MoveType.HOME, MoveType.SMALL] as MoveType[],
    regions: [Region.SEOUL, Region.GYEONGGI] as Region[],
  },
  {
    key: 'jihun',
    name: '박지훈',
    nickname: 'demo_writable_jihun',
    email: 'demo.writable.mover.jihun@example.com',
    phoneNumber: '010-5111-1002',
    career: 12,
    shortDescription: '사무실·야간 이사 가능',
    description:
      '업무 지장 최소화를 위해 주말·야간 사무실 이전에도 대응합니다. 대형 집기 포장에 익숙합니다.',
    service: [MoveType.OFFICE, MoveType.HOME] as MoveType[],
    regions: [Region.SEOUL, Region.GYEONGGI, Region.INCHEON] as Region[],
  },
  {
    key: 'soyeon',
    name: '이서연',
    nickname: 'demo_writable_soyeon',
    email: 'demo.writable.mover.soyeon@example.com',
    phoneNumber: '010-5111-1003',
    career: 6,
    shortDescription: '꼼꼼한 포장·원룸 특화',
    description:
      '혼자 사는 고객님 위주로 포장부터 배치까지 꼼꼼히 도와드립니다. 여성 기사 요청에도 대응합니다.',
    service: [MoveType.SMALL, MoveType.HOME] as MoveType[],
    regions: [Region.SEOUL, Region.GYEONGGI] as Region[],
  },
  {
    key: 'dongwook',
    name: '최동욱',
    nickname: 'demo_writable_dongwook',
    email: 'demo.writable.mover.dongwook@example.com',
    phoneNumber: '010-5111-1004',
    career: 15,
    shortDescription: '장거리·대형가구 안심',
    description:
      '피아노·냉장고 등 대형 가전과 장거리 이사 경험이 많습니다. 보험 안내까지 함께합니다.',
    service: [MoveType.HOME, MoveType.OFFICE, MoveType.SMALL] as MoveType[],
    regions: [Region.SEOUL, Region.GYEONGGI, Region.INCHEON] as Region[],
  },
  {
    key: 'haeun',
    name: '정하은',
    nickname: 'demo_writable_haeun',
    email: 'demo.writable.mover.haeun@example.com',
    phoneNumber: '010-5111-1005',
    career: 5,
    shortDescription: '합리적인 소형·가정 이사',
    description:
      '가성비와 일정 유연성을 중시하는 고객님께 맞춰 소형·가정 이사를 진행합니다.',
    service: [MoveType.SMALL, MoveType.HOME] as MoveType[],
    regions: [Region.SEOUL, Region.INCHEON, Region.GYEONGGI] as Region[],
  },
] as const;

type WritableCase = {
  seedKey: string;
  moverKey: (typeof DEMO_MOVERS)[number]['key'];
  moveType: MoveType;
  isDesignated: boolean;
  price: number;
  moveDaysAgo: number;
  departureZipCode: string;
  departureAddress: string;
  departureDetailAddress: string;
  arrivalZipCode: string;
  arrivalAddress: string;
  arrivalDetailAddress: string;
};

/** 탭에 보이는 카드가 실제 서비스처럼 보이도록 구성한 10건 */
const WRITABLE_CASES: WritableCase[] = [
  {
    seedKey: `${SEED_KEY_PREFIX}01`,
    moverKey: 'soyeon',
    moveType: MoveType.SMALL,
    isDesignated: false,
    price: 220_000,
    moveDaysAgo: 5,
    departureZipCode: '04146',
    departureAddress: '서울특별시 마포구 독막로',
    departureDetailAddress: '311 서교빌라 302호',
    arrivalZipCode: '03450',
    arrivalAddress: '서울특별시 은평구 연서로',
    arrivalDetailAddress: '45 은평타워 805호',
  },
  {
    seedKey: `${SEED_KEY_PREFIX}02`,
    moverKey: 'minsu',
    moveType: MoveType.HOME,
    isDesignated: true,
    price: 680_000,
    moveDaysAgo: 12,
    departureZipCode: '06236',
    departureAddress: '서울특별시 강남구 테헤란로',
    departureDetailAddress: '152 강남푸르지오 1203호',
    arrivalZipCode: '13529',
    arrivalAddress: '경기도 성남시 분당구 판교역로',
    arrivalDetailAddress: '235 에이치스퀘어 1002호',
  },
  {
    seedKey: `${SEED_KEY_PREFIX}03`,
    moverKey: 'jihun',
    moveType: MoveType.OFFICE,
    isDesignated: false,
    price: 1_400_000,
    moveDaysAgo: 18,
    departureZipCode: '03154',
    departureAddress: '서울특별시 종로구 종로',
    departureDetailAddress: '1 서울글로벌센터 8층',
    arrivalZipCode: '13494',
    arrivalAddress: '경기도 성남시 분당구 대왕판교로',
    arrivalDetailAddress: '670 유스페이스2 B동 5층',
  },
  {
    seedKey: `${SEED_KEY_PREFIX}04`,
    moverKey: 'haeun',
    moveType: MoveType.SMALL,
    isDesignated: false,
    price: 250_000,
    moveDaysAgo: 25,
    departureZipCode: '08788',
    departureAddress: '서울특별시 관악구 신림로',
    departureDetailAddress: '90 관악원룸 401호',
    arrivalZipCode: '06974',
    arrivalAddress: '서울특별시 동작구 상도로',
    arrivalDetailAddress: '369 상도힐스테이트 502호',
  },
  {
    seedKey: `${SEED_KEY_PREFIX}05`,
    moverKey: 'minsu',
    moveType: MoveType.HOME,
    isDesignated: false,
    price: 550_000,
    moveDaysAgo: 32,
    departureZipCode: '05510',
    departureAddress: '서울특별시 송파구 올림픽로',
    departureDetailAddress: '240 잠실엘스 2104호',
    arrivalZipCode: '13647',
    arrivalAddress: '경기도 성남시 수정구 위례광장로',
    arrivalDetailAddress: '19 위례자이 1501호',
  },
  {
    seedKey: `${SEED_KEY_PREFIX}06`,
    moverKey: 'dongwook',
    moveType: MoveType.HOME,
    isDesignated: true,
    price: 720_000,
    moveDaysAgo: 40,
    departureZipCode: '16489',
    departureAddress: '경기도 수원시 팔달구 효원로',
    departureDetailAddress: '241 수원아이파크 903호',
    arrivalZipCode: '16827',
    arrivalAddress: '경기도 용인시 수지구 수지로',
    arrivalDetailAddress: '17 수지자이 702호',
  },
  {
    seedKey: `${SEED_KEY_PREFIX}07`,
    moverKey: 'soyeon',
    moveType: MoveType.SMALL,
    isDesignated: false,
    price: 190_000,
    moveDaysAgo: 48,
    departureZipCode: '01695',
    departureAddress: '서울특별시 노원구 동일로',
    departureDetailAddress: '1000 상계주공 305동 201호',
    arrivalZipCode: '01337',
    arrivalAddress: '서울특별시 도봉구 도봉로',
    arrivalDetailAddress: '552 창동두산 1102호',
  },
  {
    seedKey: `${SEED_KEY_PREFIX}08`,
    moverKey: 'jihun',
    moveType: MoveType.OFFICE,
    isDesignated: false,
    price: 950_000,
    moveDaysAgo: 55,
    departureZipCode: '07325',
    departureAddress: '서울특별시 영등포구 여의대로',
    departureDetailAddress: '24 전경련회관 15층',
    arrivalZipCode: '08506',
    arrivalAddress: '서울특별시 금천구 가산디지털1로',
    arrivalDetailAddress: '168 우림라이온스밸리 A동 3층',
  },
  {
    seedKey: `${SEED_KEY_PREFIX}09`,
    moverKey: 'haeun',
    moveType: MoveType.HOME,
    isDesignated: false,
    price: 480_000,
    moveDaysAgo: 70,
    departureZipCode: '21998',
    departureAddress: '인천광역시 연수구 컨벤시아대로',
    departureDetailAddress: '69 송도더샵 1803호',
    arrivalZipCode: '14547',
    arrivalAddress: '경기도 부천시 원미구 부천로',
    arrivalDetailAddress: '29 중동센트럴파크 1105호',
  },
  {
    seedKey: `${SEED_KEY_PREFIX}10`,
    moverKey: 'dongwook',
    moveType: MoveType.HOME,
    isDesignated: true,
    price: 610_000,
    moveDaysAgo: 85,
    departureZipCode: '02830',
    departureAddress: '서울특별시 성북구 보문로',
    departureDetailAddress: '168 성북힐스테이트 601호',
    arrivalZipCode: '02045',
    arrivalAddress: '서울특별시 중랑구 망우로',
    arrivalDetailAddress: '286 면목래미안 1402호',
  },
];

const ensureWritableQuote = async (input: {
  case: WritableCase;
  customerId: string;
  moverId: string;
}) => {
  const { case: item, customerId, moverId } = input;

  const existing = await prisma.quote.findFirst({
    where: {
      comment: item.seedKey,
      deletedAt: null,
    },
    select: {
      id: true,
      estimateRequest: { select: { userId: true } },
      reviews: {
        where: { userId: customerId, deletedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (existing) {
    if (existing.estimateRequest.userId !== customerId) {
      throw new Error(
        `Seed key ${item.seedKey} already used by another customer (quote ${existing.id})`
      );
    }

    return {
      quoteId: existing.id,
      created: false,
      hasReview: existing.reviews.length > 0,
    };
  }

  const estimateRequest = await prisma.estimateRequest.create({
    data: {
      userId: customerId,
      moveType: item.moveType,
      moveDate: daysAgo(item.moveDaysAgo),
      departureZipCode: item.departureZipCode,
      departureAddress: item.departureAddress,
      departureDetailAddress: item.departureDetailAddress,
      arrivalZipCode: item.arrivalZipCode,
      arrivalAddress: item.arrivalAddress,
      arrivalDetailAddress: item.arrivalDetailAddress,
      currentStep: 4,
      totalSteps: 4,
      status: EstimateRequestStatus.COMPLETED,
      submittedAt: daysAgo(item.moveDaysAgo + 14),
      confirmedAt: daysAgo(item.moveDaysAgo + 7),
    },
  });

  const quote = await prisma.quote.create({
    data: {
      estimateRequestId: estimateRequest.id,
      moverId,
      price: item.price,
      comment: item.seedKey,
      status: QuoteStatus.CONFIRMED,
      isDesignated: item.isDesignated,
    },
  });

  await prisma.estimateRequest.update({
    where: { id: estimateRequest.id },
    data: { confirmedQuoteId: quote.id },
  });

  return {
    quoteId: quote.id,
    created: true,
    hasReview: false,
  };
};

const main = async () => {
  console.log(`[demo-writable] looking up ${DEMO_CUSTOMER_EMAIL}...`);

  const customer = await prisma.user.findFirst({
    where: {
      email: DEMO_CUSTOMER_EMAIL,
      deletedAt: null,
      userType: UserType.CUSTOMER,
    },
    select: { id: true, email: true, name: true },
  });

  if (!customer) {
    throw new Error(
      `Customer not found: ${DEMO_CUSTOMER_EMAIL}. Create/login that account first.`
    );
  }

  console.log(`[demo-writable] customer id=${customer.id} name=${customer.name}`);

  const passwordHash = await hashAuthPassword(SEED_LOCAL_PASSWORD);

  await runWithManualAudit(async () => {
    const moversByKey = new Map<string, { id: string; name: string }>();

    for (const mover of DEMO_MOVERS) {
      const user = await upsertMover({
        ...mover,
        passwordHash,
      });
      moversByKey.set(mover.key, { id: user.id, name: user.name });
      console.log(`[demo-writable] mover ready: ${mover.name} (${mover.email})`);
    }

    let created = 0;
    let skipped = 0;
    let withReview = 0;

    for (const item of WRITABLE_CASES) {
      const mover = moversByKey.get(item.moverKey);
      if (!mover) {
        throw new Error(`Missing mover for key=${item.moverKey}`);
      }

      const result = await ensureWritableQuote({
        case: item,
        customerId: customer.id,
        moverId: mover.id,
      });

      if (result.created) {
        created += 1;
      } else {
        skipped += 1;
      }
      if (result.hasReview) {
        withReview += 1;
      }

      console.log(
        `[demo-writable] ${item.seedKey} quote=${result.quoteId} mover=${mover.name} ` +
          `${item.moveType} ${item.price.toLocaleString('ko-KR')}원 ` +
          `(${result.created ? 'created' : 'exists'}${result.hasReview ? ', has review' : ''})`
      );
    }

    console.log('[demo-writable] Done.');
    console.log({
      customer: {
        email: customer.email,
        id: customer.id,
      },
      writableCases: WRITABLE_CASES.length,
      created,
      skipped,
      alreadyHasReview: withReview,
      note:
        withReview > 0
          ? 'Some quotes already have reviews and will not appear in writable tab.'
          : 'All 10 should appear under 작성 가능한 리뷰 (if not already reviewed).',
    });
  });
};

main()
  .catch((error) => {
    console.error('[demo-writable] failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
