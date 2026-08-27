/**
 * 커뮤니티(게시판·가구나눔) 게시글 시드.
 *
 * S3 posts/ 프리픽스 삭제 사고로 기존 게시글 이미지가 전부 깨져, 커뮤니티 데이터 +
 * 관련 커뮤니티(COMMUNITY) 채팅방을 초기화하고 시드 데이터로 다시 채운다.
 * (스키마 변경 없음 — 기존 테이블/enum에 DELETE/INSERT만)
 *
 * 실행:
 *   npm run ssh            # 먼저 RDS SSH 터널(127.0.0.1:15432)을 띄운다
 *   npx ts-node scripts/seed-community-posts.ts
 *   또는: npm run community:seed
 *
 * 옵션(env):
 *   SEED_COMMUNITY_BOARD_COUNT=50      일반 게시판 글 수 (MOVING_TIP/QUESTION/REVIEW/ETC 합계)
 *   SEED_COMMUNITY_FURNITURE_COUNT=50  가구나눔(FURNITURE_SHARE) 글 수
 *   SEED_COMMUNITY_RESET=1             시작 시 커뮤니티 4테이블 + COMMUNITY 채팅 전체 삭제 (0=삭제 없이 append)
 *   SEED_COMMUNITY_SEED=20260827       유사난수(PRNG) 시작값 — 같으면 항상 동일 데이터
 *
 * 재실행: RESET=1이면 커뮤니티/COMMUNITY 채팅 데이터를 매번 싹 비우고 다시 만든다.
 *
 * ── Sprint 진행 상황 ──
 *   [x] Sprint 1  스크립트 뼈대 · 초기화 · 작성자 조회 · 게시글 생성
 *   [ ] Sprint 2  댓글 · 대댓글 · 좋아요 + 카운터 동기화
 *   [ ] Sprint 3  게시글 이미지 (picsum → S3 업로드)
 */
import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';

import { PostsCategory, Region } from '@prisma/client';

import { runWithManualAudit } from '../src/lib/audit-context';
import { prisma } from '../src/lib/prisma';
import { deleteS3KeysSafely } from '../src/services/orphan-s3-cleanup.service';

/* ────────────────────────────── 설정 ────────────────────────────── */

const parseCount = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw ?? fallback);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`0 이상의 정수가 필요합니다 (got ${raw})`);
  }
  return n;
};

const BOARD_COUNT = parseCount(process.env.SEED_COMMUNITY_BOARD_COUNT, 50);
const FURNITURE_COUNT = parseCount(
  process.env.SEED_COMMUNITY_FURNITURE_COUNT,
  50
);
const RESET = (process.env.SEED_COMMUNITY_RESET ?? '1') !== '0';
const PRNG_SEED =
  Number(process.env.SEED_COMMUNITY_SEED ?? 20260827) || 20260827;

/** 게시글 createdAt 을 흩뿌릴 최근 구간(일) */
const DAYS_BACK = 180;

/* ─────────────────────────── 유틸 / PRNG ─────────────────────────── */

const logStep = (message: string): void => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

/** days 일 전 Date (UTC 기준, 다른 시드 스크립트와 동일) */
const daysAgo = (days: number): Date => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Math.max(0, Math.round(days)));
  return date;
};

/**
 * 시드값 기반 결정적 유사난수 생성기(mulberry32).
 * 같은 seed → 항상 같은 난수열 → 항상 같은 시드 데이터.
 */
const makePrng = (seed: number) => {
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    /** [min, max] 정수 (양끝 포함) */
    int: (min: number, max: number): number =>
      min + Math.floor(next() * (max - min + 1)),
    /** 확률 p 로 true */
    chance: (p: number): boolean => next() < p,
    /** 배열에서 하나 */
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    /** 배열에서 중복 없이 n 개 */
    pickN: <T>(arr: readonly T[], n: number): T[] => {
      const rest = [...arr];
      const out: T[] = [];
      for (let i = 0; i < n && rest.length > 0; i += 1) {
        out.push(rest.splice(Math.floor(next() * rest.length), 1)[0]);
      }
      return out;
    },
    /** Fisher–Yates 셔플(원본 불변) */
    shuffle: <T>(arr: readonly T[]): T[] => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    /** 가중치 배열에서 하나 */
    weighted: <T>(entries: readonly (readonly [T, number])[]): T => {
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let r = next() * total;
      for (const [value, weight] of entries) {
        r -= weight;
        if (r < 0) {
          return value;
        }
      }
      return entries[entries.length - 1][0];
    },
  };
};

type Prng = ReturnType<typeof makePrng>;

/* ──────────────────────────── manifest ──────────────────────────── */

interface SeedManifest {
  createdAt: string;
  /** 이번(직전) 실행에서 만든 게시글 id — 디버깅/조회용 */
  postIds: number[];
  /** 시드가 업로드한 게시글 이미지 S3 key — 재실행 시 정리 대상 (Sprint 3) */
  s3Keys: string[];
}

const MANIFEST_PATH = path.join(__dirname, '.seed-community-manifest.json');

const loadManifest = (): SeedManifest => {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(MANIFEST_PATH, 'utf8')
    ) as Partial<SeedManifest>;
    return {
      createdAt: parsed.createdAt ?? '',
      postIds: Array.isArray(parsed.postIds) ? parsed.postIds : [],
      s3Keys: Array.isArray(parsed.s3Keys) ? parsed.s3Keys : [],
    };
  } catch {
    return { createdAt: '', postIds: [], s3Keys: [] };
  }
};

const saveManifest = (manifest: SeedManifest): void => {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
};

/* ───────────────────────── 지역 메타(가구나눔) ───────────────────── */

/** Region enum → 한글 라벨 + 대표 좌표 (가구나눔 위치 표시용) */
const REGION_META: Record<Region, { label: string; lat: number; lng: number }> =
  {
    SEOUL: { label: '서울', lat: 37.5665, lng: 126.978 },
    GYEONGGI: { label: '경기', lat: 37.4138, lng: 127.5183 },
    INCHEON: { label: '인천', lat: 37.4563, lng: 126.7052 },
    GANGWON: { label: '강원', lat: 37.8228, lng: 128.1555 },
    CHUNGBUK: { label: '충북', lat: 36.6357, lng: 127.4917 },
    CHUNGNAM: { label: '충남', lat: 36.6588, lng: 126.6728 },
    SEJONG: { label: '세종', lat: 36.4801, lng: 127.289 },
    DAEJEON: { label: '대전', lat: 36.3504, lng: 127.3845 },
    JEONBUK: { label: '전북', lat: 35.8242, lng: 127.148 },
    GWANGJU_JEONNAM: { label: '광주·전남', lat: 35.1595, lng: 126.8526 },
    GYEONGBUK: { label: '경북', lat: 36.4919, lng: 128.8889 },
    DAEGU: { label: '대구', lat: 35.8714, lng: 128.6014 },
    ULSAN: { label: '울산', lat: 35.5384, lng: 129.3114 },
    GYEONGNAM: { label: '경남', lat: 35.2383, lng: 128.6924 },
    BUSAN: { label: '부산', lat: 35.1796, lng: 129.0756 },
    JEJU: { label: '제주', lat: 33.4996, lng: 126.5312 },
  };

const REGION_KEYS = Object.keys(REGION_META) as Region[];

/* ───────────────────────── 콘텐츠 풀 (게시판) ───────────────────── */

interface BoardShowcase {
  category: Exclude<PostsCategory, 'FURNITURE_SHARE'>;
  title: string;
  content: string;
}

/** 손으로 쓴 현실적 게시판 글 (fe/scripts/seed-community-posts.mjs 기반 확장) */
const BOARD_SHOWCASE: BoardShowcase[] = [
  {
    category: 'MOVING_TIP',
    title: '원룸 이사 짐 싸는 순서 정리해봤어요',
    content:
      '큰 가구부터 분해하고, 의류는 옷장 행어 그대로 대형 비닐에 담으면 시간이 절반으로 줄더라고요.\n\n테이프와 네임펜은 최소 3개 이상 준비하고, 박스 옆면에 방 이름과 내용물을 크게 적어두면 짐 푸는 날 훨씬 편합니다.',
  },
  {
    category: 'MOVING_TIP',
    title: '이사 당일 필수 체크리스트 공유합니다',
    content:
      '열쇠 반납, 가스·전기 정산, 우편물 주소 이전 신청, 인터넷 해지/이전까지 전날 밤에 메모해두면 당일에 안 헷갈려요.\n\n귀중품과 서류는 따로 가방 하나에 모아서 직접 들고 이동하시는 걸 추천드립니다.',
  },
  {
    category: 'MOVING_TIP',
    title: '비 오는 날 이사할 때 이렇게 했어요',
    content:
      '비닐과 스트레치 랩을 넉넉히 챙기고, 현관부터 방까지 박스 골판지나 비닐 매트를 깔아두면 바닥 오염을 크게 줄일 수 있어요.\n\n전자제품은 에어캡으로 한 번 더 감싸고 마지막에 실어달라고 미리 말씀드리면 좋습니다.',
  },
  {
    category: 'MOVING_TIP',
    title: '냉장고·세탁기 이전 설치 예약 타이밍',
    content:
      '냉장고는 이사 전날 코드를 뽑아 성에를 녹여두고, 세탁기는 잔수 제거를 해두면 당일 작업이 빨라요.\n\n에어컨 이전 설치는 성수기에 예약이 밀리니 이사 날짜가 잡히면 바로 신청하세요.',
  },
  {
    category: 'QUESTION',
    title: '포장이사 vs 반포장이사 뭐가 나을까요?',
    content:
      '1인 가구인데 짐이 생각보다 많습니다. 직접 포장할 자신은 있는데 시간이 부족해서 고민이에요.\n\n비용 차이가 어느 정도인지, 반포장으로 하면 뭘 준비해야 하는지 경험담 부탁드려요.',
  },
  {
    category: 'QUESTION',
    title: '이사 견적 받을 때 꼭 확인해야 할 항목 있나요?',
    content:
      '엘리베이터 사용료, 사다리차, 주차비가 견적에 포함인지 헷갈립니다.\n\n계단 이용 층수나 장거리 할증도 미리 물어봐야 하는지 알려주시면 감사하겠습니다.',
  },
  {
    category: 'QUESTION',
    title: '보증금 돌려받기 전에 벽지·못자국 수리해야 할까요?',
    content:
      '벽지 오염이랑 못 자국이 몇 군데 있는데, 직접 수리하고 나가는 게 나을지 원상복구 비용을 제하는 게 나을지 궁금합니다.\n\n집주인과 실랑이 없이 마무리한 분들 팁 있으실까요?',
  },
  {
    category: 'QUESTION',
    title: '이사 후 인터넷 개통, 며칠 전에 신청하나요?',
    content:
      '다음 주 토요일 입주 예정인데 인터넷·IPTV 이전 신청 일정을 어떻게 잡는 게 좋을까요?\n\n기사님 방문이 하루 밀리면 재택근무에 지장이 커서 미리 잡아두고 싶습니다.',
  },
  {
    category: 'QUESTION',
    title: '엘리베이터 없는 3층, 사다리차 꼭 불러야 하나요?',
    content:
      '빌라 3층이고 계단이 좁은 편입니다. 짐은 냉장고·세탁기·침대 정도이고 나머지는 박스예요.\n\n사다리차 비용이 부담스러운데 인력으로만 해도 괜찮을지 경험 공유 부탁드립니다.',
  },
  {
    category: 'REVIEW',
    title: '주말 이사 무사히 끝났습니다 (만족 후기)',
    content:
      '시간 약속 정확했고 큰 가구도 흠집 없이 옮겨주셨어요. 포장 상태도 깔끔했습니다.\n\n작업자분들이 동선을 먼저 확인하고 움직여서 그런지 예상보다 한 시간 일찍 끝났습니다.',
  },
  {
    category: 'REVIEW',
    title: '첫 자취 이사 후기 — 생각보다 빨리 끝났어요',
    content:
      '혼자 하려다가 반포장으로 업체 도움을 받았는데 3시간 만에 마무리됐습니다.\n\n큰 짐만 맡기고 옷·책은 제가 미리 싸뒀더니 비용도 아끼고 시간도 절약했어요.',
  },
  {
    category: 'REVIEW',
    title: '가구 재조립까지 해준 업체 후기',
    content:
      '침대와 책상 재조립까지 포함이라 도착한 날 바로 생활할 수 있었습니다.\n\n나사나 부속을 지퍼백에 정리해서 라벨까지 붙여주셔서 꼼꼼하다는 인상을 받았어요.',
  },
  {
    category: 'REVIEW',
    title: '장거리 이사 후기 (경기 → 부산)',
    content:
      '장거리라 걱정했는데 중간에 짐 상태를 사진으로 공유해주고 도착 시간도 정확했습니다.\n\n고속도로 통행료와 유류 할증이 견적에 명시돼 있어서 추가 비용 실랑이가 없었어요.',
  },
  {
    category: 'REVIEW',
    title: '반포장으로 진행한 이사 후기',
    content:
      '주방과 깨지는 물건만 업체가 포장하고 나머지는 제가 준비했습니다.\n\n비용은 포장이사 대비 30% 정도 저렴했고, 대신 전날 밤까지 짐 싸느라 바빴다는 점은 감안하셔야 해요.',
  },
  {
    category: 'ETC',
    title: '이사하면서 버린(정리한) 물건 목록 공유',
    content:
      '오래된 서랍장, 안 쓰는 소형가전, 몇 년째 안 입은 옷을 큰맘 먹고 정리했습니다.\n\n버릴 때 대형폐기물 스티커 발급이 지자체마다 방식이 달라서 주민센터나 앱을 미리 확인하세요.',
  },
  {
    category: 'ETC',
    title: '이사 박스 나눔합니다 (사용 흔적 조금 있음)',
    content:
      '이사 끝나고 깨끗한 박스 10개 정도 남았습니다. 접어서 보관 중이에요.\n\n직접 수령 가능하신 분 댓글 주시면 위치 안내드릴게요. 테이프도 반 롤 정도 같이 드립니다.',
  },
];

const BOARD_TOPICS = [
  '원룸 이사',
  '포장이사',
  '이사 견적',
  '입주 청소',
  '장거리 이사',
  '사무실 이전',
  '이삿짐 정리',
  '냉장고 운반',
  '에어컨 이전 설치',
  '베란다 짐 정리',
  '이사 날짜 잡기',
  '관리비 정산',
  '전입신고',
  '인터넷 이전',
  '도시가스 개폐전',
  '엘리베이터 예약',
  '사다리차',
  '대형폐기물 처리',
  '이사 박스 구하기',
  '반려동물 이사',
] as const;

const BOARD_TITLE_TEMPLATES: Record<
  Exclude<PostsCategory, 'FURNITURE_SHARE'>,
  readonly string[]
> = {
  QUESTION: [
    '{topic} 어떻게 하는 게 좋을까요?',
    '{topic} 관련해서 조언 구합니다',
    '{topic}, 다들 어떻게 하시나요?',
    '{topic} 처음이라 막막해요',
  ],
  REVIEW: [
    '{topic} 후기 남깁니다',
    '{topic} 이용 후기 (전반적으로 만족)',
    '{topic} 진행하고 왔어요',
  ],
  MOVING_TIP: [
    '{topic} 팁 공유해요',
    '{topic} 이렇게 하니 편하더라고요',
    '{topic} 노하우 정리',
  ],
  ETC: ['{topic} 관련 잡담', '{topic} 이야기 나눠요', '{topic} 경험담 공유'],
};

const BOARD_BODY_SENTENCES = [
  '이번에 처음 겪는 일이라 검색해도 정보가 제각각이더라고요.',
  '미리 준비할수록 당일에 정신이 덜 없는 것 같아요.',
  '견적은 최소 세 군데는 받아보시는 걸 추천드립니다.',
  '짐을 미리 줄여두면 비용도 시간도 확 줄어듭니다.',
  '업체마다 포함 범위가 달라서 항목을 꼼꼼히 확인해야 해요.',
  '주말과 손 없는 날은 예약이 빨리 차니 서두르는 게 좋아요.',
  '작업 전후로 사진을 찍어두면 파손 분쟁이 있을 때 도움이 됩니다.',
  '관리사무소에 엘리베이터와 주차 협조를 미리 요청해두세요.',
  '포장재는 생각보다 많이 쓰이니 넉넉히 준비하는 게 마음 편합니다.',
  '비슷한 상황이신 분들 경험도 댓글로 나눠주시면 좋겠어요.',
] as const;

const BOARD_CATEGORY_WEIGHTS: readonly (readonly [
  Exclude<PostsCategory, 'FURNITURE_SHARE'>,
  number,
])[] = [
  ['QUESTION', 30],
  ['REVIEW', 30],
  ['MOVING_TIP', 25],
  ['ETC', 15],
];

/* ──────────────────────── 콘텐츠 풀 (가구나눔) ─────────────────────── */

interface FurnitureShowcase {
  region: Region;
  title: string;
  content: string;
}

const FURNITURE_SHOWCASE: FurnitureShowcase[] = [
  {
    region: 'SEOUL',
    title: '2인용 소파 나눔합니다 (직접 수거)',
    content:
      '이사하면서 교체해서 기존 소파를 나눔합니다. 사용감은 있지만 프레임은 튼튼해요.\n\n엘리베이터 있어서 반출은 수월합니다. 픽업만 가능하고 미리 연락 주시면 시간 맞춰볼게요.',
  },
  {
    region: 'GYEONGGI',
    title: '책상 + 의자 세트 드려요',
    content:
      '원룸용 책상과 의자 세트입니다. 상판에 생활 스크래치 조금 있어요.\n\n분해는 제가 해둘 테니 차만 가져오시면 됩니다. 이번 달 말까지 수거 가능해요.',
  },
  {
    region: 'INCHEON',
    title: '2단 수납장 나눔합니다',
    content:
      '깊이가 있어서 수납이 넉넉한 수납장이에요. 모서리에 약간 기스가 있습니다.\n\n1층이라 가지고 나가기 편하고, 선착순으로 나눔합니다.',
  },
  {
    region: 'BUSAN',
    title: '행거 + 전신거울 세트 나눔',
    content:
      '이사 후 공간이 안 맞아서 내놓습니다. 전신거울은 따로 분리해서 가져가셔도 돼요.\n\n주차 공간 있고 평일 저녁이나 주말에 픽업 가능합니다.',
  },
  {
    region: 'DAEGU',
    title: '접이식 테이블 + 의자 2개',
    content:
      '캠핑용으로 잠깐 쓰고 보관만 했던 가구입니다. 접으면 트렁크에 실릴 정도 크기예요.\n\n직접 수거만 가능하고 상태 궁금하시면 댓글 주세요.',
  },
  {
    region: 'JEJU',
    title: '협탁 2개 + 스탠드 조명',
    content:
      '원목 협탁 2개와 스탠드 조명을 나눔합니다. 함께 가져가셔도 되고 따로도 괜찮아요.\n\n전구는 새것으로 교체해뒀습니다. 미리 연락 주시면 됩니다.',
  },
  {
    region: 'DAEJEON',
    title: '4단 서랍장 나눔 (흠집 거의 없음)',
    content:
      '3년 정도 사용한 4단 서랍장입니다. 레일 상태 좋고 눈에 띄는 흠집은 없어요.\n\n엘리베이터 있어서 반출 수월합니다. 직접 수거 부탁드려요.',
  },
  {
    region: 'GWANGJU_JEONNAM',
    title: '원목 식탁 나눔합니다',
    content:
      '2인용 원목 식탁이에요. 상판에 물컵 자국 같은 생활 흔적이 조금 있습니다.\n\n다리 분해 가능하고, 주말에 픽업 가능하신 분 댓글 주세요.',
  },
  {
    region: 'GANGWON',
    title: '책장 2개 나눔 (필요하신 분)',
    content:
      '5단 책장 2개입니다. 무게가 있어서 성인 2분이 오시는 게 좋아요.\n\n1층 현관 앞까지는 빼드릴 수 있습니다. 선착순 나눔합니다.',
  },
  {
    region: 'SEJONG',
    title: 'TV 거실장 드립니다',
    content:
      '55인치까지 올라가는 거실장이에요. 상판 튼튼하고 하부 수납칸도 넉넉합니다.\n\n생활 스크래치 정도 있고, 직접 수거만 가능합니다.',
  },
  {
    region: 'ULSAN',
    title: '리클라이너 의자 나눔',
    content:
      '패브릭 리클라이너 의자입니다. 등받이 각도 조절 잘 되고 큰 하자는 없어요.\n\n부피가 있으니 차량 크기 확인하고 오세요. 미리 연락 주시면 됩니다.',
  },
  {
    region: 'CHUNGBUK',
    title: '옷장 나눔합니다 (분해 가능)',
    content:
      '조립식 옷장이라 분해해서 드릴 수 있어요. 문 경첩 상태 양호합니다.\n\n분해하면 승용차로도 실을 수 있는 정도예요. 주말 픽업 가능합니다.',
  },
  {
    region: 'CHUNGNAM',
    title: '화장대 + 거울 나눔',
    content:
      '서랍 3칸짜리 화장대와 거울 세트입니다. 거울은 깨끗하고 서랍 레일도 문제없어요.\n\n1층이라 반출 편하고, 선착순으로 나눔합니다.',
  },
  {
    region: 'JEONBUK',
    title: '사무용 의자 2개 드려요',
    content:
      '재택용으로 쓰던 사무용 의자 2개입니다. 바퀴와 높이 조절 레버 정상 작동해요.\n\n한 개만 가져가셔도 됩니다. 평일 저녁 픽업 가능합니다.',
  },
  {
    region: 'GYEONGNAM',
    title: '빨래건조대 + 수납 선반 나눔',
    content:
      '대형 빨래건조대와 3단 수납 선반을 함께 나눔합니다. 둘 다 접이식이에요.\n\n부담 없이 가져가실 분 댓글 남겨주세요. 직접 수거만 가능합니다.',
  },
];

const FURNITURE_ITEMS = [
  '2인용 소파',
  '3인용 패브릭 소파',
  '책상',
  '책상+의자 세트',
  '4단 서랍장',
  '옷장',
  '행거',
  '전신거울',
  '식탁',
  '식탁 의자 4개',
  '협탁',
  '스탠드 조명',
  '5단 책장',
  '2단 수납장',
  'TV 거실장',
  '화장대',
  '간이 옷장',
  '빨래건조대',
  '리클라이너 의자',
  '원목 벤치',
  '커피테이블',
  '수납 침대 프레임',
  '싱글 매트리스',
  '사무용 의자',
  '공기청정기',
] as const;

const FURNITURE_CONDITIONS = [
  '사용감은 있지만 튼튼합니다.',
  '구입 후 1년 정도 사용했어요.',
  '이사하면서 자리가 안 맞아 내놓습니다.',
  '눈에 띄는 흠집은 없습니다.',
  '모서리에 약간 기스가 있어요.',
  '생활 스크래치 정도 있습니다.',
  '거의 새것 상태입니다.',
  '분해해서 드릴 수 있어요.',
] as const;

const FURNITURE_PICKUPS = [
  '직접 수거만 가능합니다.',
  '엘리베이터 있어서 반출 수월해요.',
  '1층이라 가지고 나가기 편합니다.',
  '주차 공간 있습니다.',
  '평일 저녁이나 주말에 픽업 가능해요.',
  '미리 연락 주시면 시간 맞춰볼게요.',
  '선착순으로 나눔합니다.',
] as const;

const FURNITURE_TITLE_TEMPLATES = [
  '{item} 나눔합니다',
  '{item} 무료로 드려요',
  '{item} 필요하신 분 계신가요',
  '{region} {item} 나눔',
  '{item} 가져가실 분 구해요',
] as const;

/* ─────────────────────────── 게시글 스펙 ─────────────────────────── */

interface PostSpec {
  category: PostsCategory;
  region: Region | null;
  latitude: number | null;
  longitude: number | null;
  isCompleted: boolean | null;
  title: string;
  content: string;
}

/** 게시판 글 count 개 — showcase 우선, 부족분은 템플릿 조합으로 채움 */
const buildBoardSpecs = (count: number, prng: Prng): PostSpec[] => {
  const specs: PostSpec[] = [];

  for (const item of BOARD_SHOWCASE.slice(0, count)) {
    specs.push({
      category: item.category,
      region: null,
      latitude: null,
      longitude: null,
      isCompleted: null,
      title: item.title,
      content: item.content,
    });
  }

  while (specs.length < count) {
    const category = prng.weighted(BOARD_CATEGORY_WEIGHTS);
    const topic = prng.pick(BOARD_TOPICS);
    const title = prng
      .pick(BOARD_TITLE_TEMPLATES[category])
      .replace('{topic}', topic);
    const content = prng.pickN(BOARD_BODY_SENTENCES, prng.int(2, 4)).join(' ');

    specs.push({
      category,
      region: null,
      latitude: null,
      longitude: null,
      isCompleted: null,
      title,
      content,
    });
  }

  return specs;
};

/** 가구나눔 글 count 개 — showcase 우선, 부족분은 템플릿 조합. 지역은 16개 순환 분배 */
const buildFurnitureSpecs = (count: number, prng: Prng): PostSpec[] => {
  const specs: PostSpec[] = [];

  const toSpec = (region: Region, title: string, content: string): PostSpec => {
    const meta = REGION_META[region];
    return {
      category: 'FURNITURE_SHARE',
      region,
      latitude: meta.lat,
      longitude: meta.lng,
      isCompleted: prng.chance(0.3),
      title,
      content,
    };
  };

  for (const item of FURNITURE_SHOWCASE.slice(0, count)) {
    specs.push(toSpec(item.region, item.title, item.content));
  }

  while (specs.length < count) {
    const region = REGION_KEYS[specs.length % REGION_KEYS.length];
    const item = prng.pick(FURNITURE_ITEMS);
    const title = prng
      .pick(FURNITURE_TITLE_TEMPLATES)
      .replace('{item}', item)
      .replace('{region}', REGION_META[region].label);
    const content = `${prng.pick(FURNITURE_CONDITIONS)} ${prng.pick(
      FURNITURE_PICKUPS
    )}`;

    specs.push(toSpec(region, title, content));
  }

  return specs;
};

/* ─────────────────────────── 작성자 조회 ─────────────────────────── */

interface SeedAuthor {
  id: string;
  nickname: string;
}

/**
 * 시드 작성자 후보:
 * - 탈퇴 안 함(deletedAt null)
 * - 정지 상태 아님(user_statuses.status ≠ SUSPENDED, row 없으면 통과)
 * - 완성 프로필 보유(본인 타입 프로필의 service 배열이 1개 이상) — 실앱 requireCompletedProfile 과 동일
 */
const selectAuthors = async (prng: Prng): Promise<SeedAuthor[]> => {
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      NOT: { userStatus: { status: 'SUSPENDED' } },
      OR: [
        {
          userType: 'CUSTOMER',
          customerProfile: { service: { isEmpty: false } },
        },
        { userType: 'MOVER', moverProfile: { service: { isEmpty: false } } },
      ],
    },
    select: { id: true, nickname: true },
    orderBy: { createdAt: 'asc' },
  });

  return prng.shuffle(users).slice(0, 30);
};

/* ─────────────────────────── 초기화(RESET) ───────────────────────── */

interface ResetResult {
  chatRooms: number;
  chatMessages: number;
  chatAttachments: number;
  postLikes: number;
  comments: number;
  postImages: number;
  posts: number;
  /** best-effort S3 삭제 대상(채팅 첨부) key */
  chatAttachmentKeys: string[];
}

/**
 * 커뮤니티 + COMMUNITY 채팅 데이터를 FK 역순으로 전체 하드 삭제한다.
 * GENERAL/DESIGNATED(견적) 채팅방과 notifications 는 건드리지 않는다.
 * 호출부에서 runWithManualAudit 로 감싸 audit 트리거(histories 적재)를 끈다.
 */
const resetCommunityDb = async (): Promise<ResetResult> => {
  // 1) 삭제 대상 수집 (삭제 전에 첨부 S3 key 확보)
  const communityRooms = await prisma.chatRoom.findMany({
    where: { roomType: 'COMMUNITY' },
    select: { id: true },
  });
  const roomIds = communityRooms.map((room) => room.id);

  const messages = roomIds.length
    ? await prisma.chatMessage.findMany({
        where: { roomId: { in: roomIds } },
        select: { id: true },
      })
    : [];
  const messageIds = messages.map((message) => message.id);

  const attachments = messageIds.length
    ? await prisma.chatAttachment.findMany({
        where: { messageId: { in: messageIds } },
        select: { fileKey: true, thumbnailKey: true },
      })
    : [];
  const chatAttachmentKeys = attachments.flatMap((attachment) =>
    [attachment.fileKey, attachment.thumbnailKey].filter(
      (key): key is string => typeof key === 'string' && key.length > 0
    )
  );

  // 2) COMMUNITY 채팅 삭제 (자식 → 부모)
  let chatAttachmentCount = 0;
  let chatMessageCount = 0;

  if (roomIds.length > 0) {
    await prisma.chatReadStatus.deleteMany({
      where: { roomId: { in: roomIds } },
    });

    if (messageIds.length > 0) {
      chatAttachmentCount = (
        await prisma.chatAttachment.deleteMany({
          where: { messageId: { in: messageIds } },
        })
      ).count;
      await prisma.chatMessageRawLog.deleteMany({
        where: { messageId: { in: messageIds } },
      });
    }

    chatMessageCount = (
      await prisma.chatMessage.deleteMany({
        where: { roomId: { in: roomIds } },
      })
    ).count;
    await prisma.chatRoomParticipant.deleteMany({
      where: { roomId: { in: roomIds } },
    });
    await prisma.chatRoom.deleteMany({ where: { id: { in: roomIds } } });
  }

  // 3) 방어적: 남은 community_post_id 참조가 있으면 해제 (정상 스키마상 없어야 함)
  const dangling = await prisma.chatRoom.updateMany({
    where: { communityPostId: { not: null } },
    data: { communityPostId: null },
  });
  if (dangling.count > 0) {
    console.warn(
      `[reset] roomType≠COMMUNITY 인데 community_post_id 가 있던 ${dangling.count}건을 null 처리`
    );
  }

  // 4) 커뮤니티 게시글 삭제 (자식 → 부모)
  const postLikes = (await prisma.postLike.deleteMany({})).count;
  // comments 는 parent_id self-FK 지만 전체 삭제라 statement 종료 시점에 위배 없음
  const comments = (await prisma.comment.deleteMany({})).count;
  const postImages = (await prisma.postImage.deleteMany({})).count;
  const posts = (await prisma.post.deleteMany({})).count;

  return {
    chatRooms: roomIds.length,
    chatMessages: chatMessageCount,
    chatAttachments: chatAttachmentCount,
    postLikes,
    comments,
    postImages,
    posts,
    chatAttachmentKeys,
  };
};

/* ─────────────────────────── 게시글 생성 ─────────────────────────── */

/**
 * 스펙들에 createdAt/updatedAt 을 부여하고 오래된 순으로 INSERT 한다.
 * - createdAt: 최근 DAYS_BACK 일 구간에 흩뿌림(오래된 순으로 id 증가 → 커서 페이지네이션 현실적)
 * - updatedAt: 대부분 createdAt 과 동일, 일부만 이후(수정된 글처럼)
 */
const createPosts = async (
  specs: PostSpec[],
  authors: SeedAuthor[],
  prng: Prng
): Promise<number[]> => {
  const total = specs.length;
  const now = Date.now();

  const dated = prng.shuffle(specs).map((spec, index) => {
    const daySpan =
      Math.round((DAYS_BACK * (total - index)) / total) + prng.int(0, 2);
    const createdAt = daysAgo(daySpan);
    const updatedAt = prng.chance(0.15)
      ? new Date(
          Math.min(now, createdAt.getTime() + prng.int(1, 72) * 3_600_000)
        )
      : createdAt;
    return { spec, createdAt, updatedAt };
  });

  dated.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const postIds: number[] = [];
  for (const { spec, createdAt, updatedAt } of dated) {
    const author = prng.pick(authors);
    const created = await prisma.post.create({
      data: {
        userId: author.id,
        category: spec.category,
        region: spec.region,
        title: spec.title,
        content: spec.content,
        latitude: spec.latitude,
        longitude: spec.longitude,
        isCompleted: spec.isCompleted,
        // 카운터(viewCount/likeCount/commentCount)는 기본값 0 — Sprint 2 에서 동기화
        createdAt,
        updatedAt,
      },
      select: { id: true },
    });
    postIds.push(created.id);
  }

  return postIds;
};

/* ────────────────────────────── main ────────────────────────────── */

const main = async (): Promise<void> => {
  logStep('커뮤니티 시드 시작');
  logStep(
    `설정: board=${BOARD_COUNT}, furniture=${FURNITURE_COUNT}, reset=${RESET}, seed=${PRNG_SEED}`
  );

  logStep('DB 연결 확인 (SELECT 1) — 실패하면 SSH 터널(npm run ssh) 확인');
  await prisma.$queryRaw`SELECT 1`;

  const prng = makePrng(PRNG_SEED);

  const authors = await selectAuthors(prng);
  logStep(`작성자 후보 pool: ${authors.length}명`);
  if (authors.length < 3) {
    console.warn(
      '[warn] 완성 프로필 유저가 3명 미만입니다. 가능한 만큼만 진행합니다.'
    );
  }
  if (authors.length === 0) {
    throw new Error(
      '작성자로 쓸 유저가 없습니다. user 시드를 먼저 확인하세요.'
    );
  }

  const boardSpecs = buildBoardSpecs(BOARD_COUNT, prng);
  const furnitureSpecs = buildFurnitureSpecs(FURNITURE_COUNT, prng);
  const allSpecs = [...boardSpecs, ...furnitureSpecs];

  const prevManifest = loadManifest();

  // 삭제·삽입을 한 audit 스킵 스코프로 감싼다 (posts/comments/chat_* 트리거 억제)
  const { resetResult, postIds } = await runWithManualAudit(async () => {
    let reset: ResetResult | null = null;

    if (RESET) {
      logStep('RESET: 커뮤니티 + COMMUNITY 채팅 데이터 삭제 중...');
      reset = await resetCommunityDb();
      logStep(
        `RESET 완료: chatRooms=${reset.chatRooms}, chatMessages=${reset.chatMessages}, ` +
          `chatAttachments=${reset.chatAttachments}, posts=${reset.posts}, ` +
          `comments=${reset.comments}, postLikes=${reset.postLikes}, postImages=${reset.postImages}`
      );
    } else {
      logStep('RESET 생략 (SEED_COMMUNITY_RESET=0) — 기존 데이터 위에 append');
    }

    logStep(`게시글 ${allSpecs.length}건 생성 중...`);
    const ids = await createPosts(allSpecs, authors, prng);
    logStep(`게시글 ${ids.length}건 생성 완료`);

    return { resetResult: reset, postIds: ids };
  });

  // S3 best-effort 정리 (DB 무관 — audit 스코프 밖에서)
  if (RESET) {
    const keys = [
      ...(resetResult?.chatAttachmentKeys ?? []),
      ...prevManifest.s3Keys,
    ];
    if (keys.length > 0) {
      const { deletedCount, failedKeys } = await deleteS3KeysSafely(keys);
      logStep(
        `S3 best-effort 정리: 성공 ${deletedCount}, 실패 ${failedKeys.length} ` +
          `(채팅첨부 ${resetResult?.chatAttachmentKeys.length ?? 0} + 이전 시드 이미지 ${prevManifest.s3Keys.length})`
      );
    }
  }

  saveManifest({
    createdAt: new Date().toISOString(),
    postIds,
    s3Keys: [], // Sprint 3 에서 업로드한 이미지 key 채움
  });

  // 요약
  const byCategory = new Map<PostsCategory, number>();
  for (const spec of allSpecs) {
    byCategory.set(spec.category, (byCategory.get(spec.category) ?? 0) + 1);
  }
  logStep('── 요약 ──');
  console.log({
    authorsPool: authors.length,
    postsCreated: postIds.length,
    byCategory: Object.fromEntries(byCategory),
    board: boardSpecs.length,
    furniture: furnitureSpecs.length,
    reset: RESET ? resetResult : 'skipped',
    manifest: MANIFEST_PATH,
    note: '댓글·대댓글·좋아요·이미지는 Sprint 2~3에서 추가됩니다.',
  });
};

main()
  .catch((error: unknown) => {
    console.error('커뮤니티 시드 실패');
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
