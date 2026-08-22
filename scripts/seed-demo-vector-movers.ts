/**
 * 벡터 검색 시연용 기사 시드.
 * 테마별 shortDescription/description을 넣어 keyword 의미 검색을 보여 주기 쉽게 한다.
 *
 * 실행: npm run movers:seed-demo-vector
 * 이후: npm run movers:index-embeddings
 *
 * 재실행 시 동일 이메일로 upsert. 소개 문구가 바뀌면 embedding을 NULL로 비워 백필 대상이 된다.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';

import {
  AuthProvider,
  MoveType,
  Region,
  UserType,
} from '@prisma/client';

import { prisma } from '../src/lib/prisma';
import { hashAuthPassword } from '../src/utils/password.util';

const SEED_LOCAL_PASSWORD = 'seed1234**';
const PER_THEME = 30;

/** 시연 검색어와 맞춰 둔 테마 */
const THEMES = [
  {
    key: 'kind',
    namePrefix: '친절',
    shortDescription: '친절·안전 최우선',
    description:
      '고객님을 가족처럼 대하며 친절하고 안전한 이사만 고집합니다. 짐 옮기는 중에도 설명과 배려를 아끼지 않습니다.',
    services: [MoveType.HOME, MoveType.SMALL] as MoveType[],
    regions: [Region.SEOUL, Region.GYEONGGI] as Region[],
  },
  {
    key: 'careful',
    namePrefix: '꼼꼼',
    shortDescription: '꼼꼼 포장 전문',
    description:
      '파손 걱정 없이 꼼꼼한 포장과 정리로 끝까지 책임집니다. 유리·가전·취약 짐도 세심하게 다룹니다.',
    services: [MoveType.HOME, MoveType.OFFICE] as MoveType[],
    regions: [Region.SEOUL, Region.INCHEON] as Region[],
  },
  {
    key: 'office',
    namePrefix: '사무실',
    shortDescription: '야간 사무실 이사',
    description:
      '업무에 지장 없도록 야간·주말 사무실 이사에 특화되어 있습니다. 데스크·서버·문서 이관을 안전하게 진행합니다.',
    services: [MoveType.OFFICE] as MoveType[],
    regions: [Region.SEOUL, Region.GYEONGGI, Region.BUSAN] as Region[],
  },
  {
    key: 'oneroom',
    namePrefix: '원룸',
    shortDescription: '원룸 가성비 이사',
    description:
      '원룸·오피스텔 소형 이사를 합리적인 견적으로 빠르게 끝냅니다. 혼자 사는 분께 부담 없는 가성비 서비스를 제공합니다.',
    services: [MoveType.SMALL] as MoveType[],
    regions: [Region.SEOUL, Region.DAEGU, Region.BUSAN] as Region[],
  },
  {
    key: 'piano',
    namePrefix: '피아노',
    shortDescription: '피아노·대형가구',
    description:
      '피아노와 대형 가구·가전 운반 경험이 많습니다. 계단·엘리베이터 협소 구간도 전문 장비로 안전하게 옮깁니다.',
    services: [MoveType.HOME, MoveType.OFFICE] as MoveType[],
    regions: [Region.SEOUL, Region.GYEONGNAM, Region.DAEJEON] as Region[],
  },
] as const;

/** 이메일 기반 결정적 UUID (재실행 동일 id) */
const demoUserId = (email: string): string => {
  const hex = createHash('sha256').update(`demo-vector-mover:${email}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
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

const clearProfileEmbedding = async (profileId: number) => {
  await prisma.$executeRawUnsafe(
    `UPDATE mover_profiles
     SET embedding = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    profileId
  );
};

const main = async () => {
  const passwordHash = await hashAuthPassword(SEED_LOCAL_PASSWORD);
  let upserted = 0;

  console.log(
    `[seed-demo-vector] themes=${THEMES.length}, perTheme=${PER_THEME}, total=${THEMES.length * PER_THEME}`
  );

  for (let themeIndex = 0; themeIndex < THEMES.length; themeIndex += 1) {
    const theme = THEMES[themeIndex];
    if (!theme) {
      continue;
    }

    for (let index = 1; index <= PER_THEME; index += 1) {
      const seq = String(index).padStart(2, '0');
      const email = `demo.vector.${theme.key}.${seq}@example.com`;
      const nickname = `demo_vec_${theme.key}_${seq}`;
      // 010 + 8자리 유니크 (테마·순번 기반)
      const phoneNumber = `010${String(70000000 + themeIndex * 1000 + index).padStart(8, '0')}`;
      const userId = demoUserId(email);
      const region = theme.regions[(index - 1) % theme.regions.length];
      const career = 3 + ((index - 1) % 15);

      const user = await prisma.user.upsert({
        where: { email },
        update: {
          name: `${theme.namePrefix}기사${seq}`,
          nickname,
          phoneNumber,
          userType: UserType.MOVER,
          deletedAt: null,
        },
        create: {
          id: userId,
          name: `${theme.namePrefix}기사${seq}`,
          nickname,
          email,
          phoneNumber,
          userType: UserType.MOVER,
        },
      });

      const profile = await prisma.moverProfile.upsert({
        where: { userId: user.id },
        update: {
          service: [...theme.services],
          career,
          shortDescription: theme.shortDescription,
          description: theme.description,
        },
        create: {
          userId: user.id,
          service: [...theme.services],
          career,
          shortDescription: theme.shortDescription,
          description: theme.description,
        },
      });

      await prisma.moverServiceRegion.deleteMany({
        where: { moverProfileId: profile.id },
      });
      await prisma.moverServiceRegion.createMany({
        data: [{ moverProfileId: profile.id, region }],
      });

      await upsertLocalAuth(user.id, passwordHash);
      // 소개가 갱신됐을 수 있으니 재임베딩 대상으로 표시
      await clearProfileEmbedding(profile.id);

      upserted += 1;
    }

    console.log(`[seed-demo-vector] theme=${theme.key} done (${PER_THEME})`);
  }

  console.log(`[seed-demo-vector] upserted=${upserted}`);
  console.log('[seed-demo-vector] next: npm run movers:index-embeddings');
};

main()
  .catch((error: unknown) => {
    console.error('[seed-demo-vector] failed');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
