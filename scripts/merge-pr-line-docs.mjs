#!/usr/bin/env node
/**
 * 줄별-전체/*.md → PR별/PR-XX-전체.md (PR당 문서 1개)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(__dirname, '..', '..', '설명', '커뮤니티-BE-코드-설명');
const LINE_DIR = path.join(BASE, '줄별-전체');
const PR_DIR = path.join(BASE, 'PR별');

const SOURCE_FILES = {
  'post.schema.ts': [
    '01-post.schema.ts-전체줄설명.md',
  ],
  'post.service.ts': [
    '02-post.service.ts-전체줄설명-1-125.md',
    '02-post.service.ts-전체줄설명-126-250.md',
    '02-post.service.ts-전체줄설명-251-375.md',
  ],
  'post.repository.ts': [
    '03-post.repository.ts-전체줄설명-1-232.md',
    '03-post.repository.ts-전체줄설명-233-464.md',
  ],
  'post.controller.ts': ['04-post.controller.ts-전체줄설명.md'],
  'comment.service.ts': ['05-comment.service.ts-전체줄설명.md'],
  'comment.controller.ts': ['06-comment.controller.ts-전체줄설명.md'],
  'comment.repository.ts': ['07-comment.repository.ts-전체줄설명.md'],
  'like.service.ts': ['08-like.service.ts-전체줄설명.md'],
  'like.controller.ts': ['09-like.controller.ts-전체줄설명.md'],
  'like.repository.ts': ['10-like.repository.ts-전체줄설명.md'],
  'post-content.util.ts': ['11-post-content.util.ts-전체줄설명.md'],
  'post-image.util.ts': ['12-post-image.util.ts-전체줄설명.md'],
  'post-image.constants.ts': ['13-post-image.constants.ts-전체줄설명.md'],
  'post-image-cleanup.service.ts': ['14-post-image-cleanup.service.ts-전체줄설명.md'],
  'cleanup-orphan-post-images.job.ts': ['15-cleanup-orphan-post-images.job.ts-전체줄설명.md'],
  'community.route.ts': [
    '16-community.route.ts-전체줄설명-1-320.md',
    '16-community.route.ts-전체줄설명-321-640.md',
    '16-community.route.ts-전체줄설명-641-949.md',
  ],
  'prisma-community': ['17-prisma-커뮤니티-전체줄설명.md'],
  'app-community': ['18-app-커뮤니티-등록-줄설명.md'],
};

function parseLineSections(content) {
  const sections = new Map();
  const re = /## (\d+)행\n([\s\S]*?)(?=\n## \d+행|\n*$)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    sections.set(Number(m[1]), m[0].trimEnd());
  }
  return sections;
}

function loadAllLines() {
  const byFile = {};
  for (const [key, files] of Object.entries(SOURCE_FILES)) {
    byFile[key] = new Map();
    for (const f of files) {
      const p = path.join(LINE_DIR, f);
      if (!fs.existsSync(p)) {
        console.warn('missing', f);
        continue;
      }
      const sections = parseLineSections(fs.readFileSync(p, 'utf8'));
      for (const [line, block] of sections) {
        byFile[key].set(line, block);
      }
    }
  }
  return byFile;
}

function extractLines(byFile, fileKey, lineNums) {
  const map = byFile[fileKey];
  if (!map) return '';
  const blocks = [];
  for (const n of lineNums) {
    const b = map.get(n);
    if (b) blocks.push(b);
    else blocks.push(`## ${n}행\n\n**설명:** (줄별 원본 없음 — 소스 확인)\n`);
  }
  return blocks.join('\n\n');
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function sectionHeader(title, srcPath) {
  return `\n\n---\n\n# 📄 ${title}\n\n> \`${srcPath}\`\n\n`;
}

const PR_CONFIG = {
  14: {
    title: 'PR #14 (Issue #13) — 스캐폴드',
    intro: `# PR #14 — 스캐폴드 (4계층 뼈대)

## 이 PR 한 줄
Route → Controller → Service → Repository 폴더·파일 생성, \`app.use('/api/posts')\` 등록.

## 아래부터 = 이 PR에 들어간 코드 **전 줄** 설명
`,
    parts: [
      () => sectionHeader('app.ts — 커뮤니티 라우터 등록', 'src/app.ts') + extractLines(load, 'app-community', [23, 86]),
      () => sectionHeader('community.route.ts — Router 생성', 'src/routes/community.route.ts') + extractLines(load, 'community.route.ts', range(1, 18)),
      () => sectionHeader('Prisma — Post / PostImage 모델', 'prisma/schema.prisma') + extractLines(load, 'prisma-community', range(422, 455)),
    ],
  },
  36: {
    title: 'PR #36 (Issue #22) — 목록·상세',
    intro: `# PR #36 — 게시글 목록·상세 조회

## 이 PR 한 줄
GET /api/posts (keyset pagination), GET /api/posts/:postId, optionalAuth isLiked, presigned URL, FURNITURE_SHARE 제외.

## 아래부터 = 이 PR에 들어간 코드 **전 줄** 설명
`,
    parts: [
      () => sectionHeader('post.schema.ts', 'src/schemas/post.schema.ts') + extractLines(load, 'post.schema.ts', [...range(5, 59)]),
      () => sectionHeader('post.service.ts — 커서·목록·상세', 'src/services/post.service.ts') + extractLines(load, 'post.service.ts', [...range(1, 187), ...range(211, 245)]),
      () => sectionHeader('post.repository.ts — findPosts / findPostById', 'src/repositories/post.repository.ts') + extractLines(load, 'post.repository.ts', [...range(1, 156), ...range(307, 344)]),
      () => sectionHeader('post.controller.ts — getPosts / getPostById', 'src/controllers/post.controller.ts') + extractLines(load, 'post.controller.ts', range(16, 51)),
      () => sectionHeader('community.route.ts — GET 목록·상세', 'src/routes/community.route.ts') + extractLines(load, 'community.route.ts', [...range(20, 158), ...range(250, 351)]),
    ],
  },
  47: {
    title: 'PR #47 (Issue #46) — posts 인덱스',
    intro: `# PR #47 — posts 복합 인덱스

## 이 PR 한 줄
목록 keyset 쿼리 성능용 \`@@index\` 추가 (#36 findPosts WHERE/ORDER BY 와 맞춤).

## 아래부터 = 이 PR에 들어간 코드 **전 줄** 설명
`,
    parts: [
      () => sectionHeader('Prisma — Post @@index', 'prisma/schema.prisma') + extractLines(load, 'prisma-community', [443, 444, 445]),
    ],
  },
  49: {
    title: 'PR #49 (Issue #37) — CRUD',
    intro: `# PR #49 — 게시글 작성·수정·삭제

## 이 PR 한 줄
POST/PATCH/DELETE, requireAuth, assertPostOwner, soft delete, imageKeys nested create.

## 아래부터 = 이 PR에 들어간 코드 **전 줄** 설명
`,
    parts: [
      () => sectionHeader('post.schema.ts — create/update', 'src/schemas/post.schema.ts') + extractLines(load, 'post.schema.ts', [...range(61, 94)]),
      () => sectionHeader('post.service.ts — create/update/delete', 'src/services/post.service.ts') + extractLines(load, 'post.service.ts', [...range(247, 366)]),
      () => sectionHeader('post.repository.ts — create/update/softDelete', 'src/repositories/post.repository.ts') + extractLines(load, 'post.repository.ts', [...range(346, 426)]),
      () => sectionHeader('post.controller.ts — create/update/delete', 'src/controllers/post.controller.ts') + extractLines(load, 'post.controller.ts', range(70, 120)),
      () => sectionHeader('community.route.ts — POST/PATCH/DELETE', 'src/routes/community.route.ts') + extractLines(load, 'community.route.ts', [...range(352, 536)]),
    ],
  },
  56: {
    title: 'PR #56 (Issue #51) — 좋아요·댓글·이미지',
    intro: `# PR #56 — 좋아요·댓글·imageKeys

## 이 PR 한 줄
like/comment API, likeCount·commentCount denormalization, 트랜잭션, depth 1 대댓글, imageKeys E2E.

## 아래부터 = 이 PR에 들어간 코드 **전 줄** 설명
`,
    parts: [
      () => sectionHeader('post.schema.ts — imageKeys·comment', 'src/schemas/post.schema.ts') + extractLines(load, 'post.schema.ts', [...range(63, 79), ...range(96, 115)]),
      () => sectionHeader('post.repository.ts — images·referenced keys', 'src/repositories/post.repository.ts') + extractLines(load, 'post.repository.ts', [...range(360, 375), ...range(377, 418), ...range(428, 454)]),
      () => sectionHeader('comment.service.ts', 'src/services/comment.service.ts') + extractLines(load, 'comment.service.ts', range(1, 269)),
      () => sectionHeader('comment.controller.ts', 'src/controllers/comment.controller.ts') + extractLines(load, 'comment.controller.ts', range(1, 95)),
      () => sectionHeader('comment.repository.ts', 'src/repositories/comment.repository.ts') + extractLines(load, 'comment.repository.ts', range(1, 170)),
      () => sectionHeader('like.service.ts', 'src/services/like.service.ts') + extractLines(load, 'like.service.ts', range(1, 58)),
      () => sectionHeader('like.controller.ts', 'src/controllers/like.controller.ts') + extractLines(load, 'like.controller.ts', range(1, 41)),
      () => sectionHeader('like.repository.ts', 'src/repositories/like.repository.ts') + extractLines(load, 'like.repository.ts', range(1, 48)),
      () => sectionHeader('Prisma — PostLike / Comment', 'prisma/schema.prisma') + extractLines(load, 'prisma-community', [...range(457, 484)]),
      () => sectionHeader('community.route.ts — likes·comments', 'src/routes/community.route.ts') + extractLines(load, 'community.route.ts', [...range(538, 611), ...range(650, 949)]),
    ],
  },
  167: {
    title: 'PR #167 (Issue #166) — 키워드 검색',
    intro: `# PR #167 — keyword 검색

## 이 PR 한 줄
title/content contains 검색, trim 후 빈 keyword 무시.

## 아래부터 = 이 PR에 들어간 코드 **전 줄** 설명
`,
    parts: [
      () => sectionHeader('post.schema.ts — keyword', 'src/schemas/post.schema.ts') + extractLines(load, 'post.schema.ts', [...range(19, 32), 37]),
      () => sectionHeader('post.service.ts — listFilter keyword', 'src/services/post.service.ts') + extractLines(load, 'post.service.ts', range(145, 155)),
      () => sectionHeader('post.repository.ts — keyword WHERE', 'src/repositories/post.repository.ts') + extractLines(load, 'post.repository.ts', range(49, 54)),
      () => sectionHeader('community.route.ts — swagger keyword', 'src/routes/community.route.ts') + extractLines(load, 'community.route.ts', range(49, 55)),
    ],
  },
  173: {
    title: 'PR #173 (Issue #170) — 조회수',
    intro: `# PR #173 — viewCount API

## 이 PR 한 줄
POST /api/posts/:postId/views, viewCount increment.

## 아래부터 = 이 PR에 들어간 코드 **전 줄** 설명
`,
    parts: [
      () => sectionHeader('post.repository.ts — incrementViewCount', 'src/repositories/post.repository.ts') + extractLines(load, 'post.repository.ts', range(456, 464)),
      () => sectionHeader('post.service.ts — incrementViewCount', 'src/services/post.service.ts') + extractLines(load, 'post.service.ts', range(368, 375)),
      () => sectionHeader('post.controller.ts — incrementViewCount', 'src/controllers/post.controller.ts') + extractLines(load, 'post.controller.ts', range(122, 136)),
      () => sectionHeader('community.route.ts — POST /views', 'src/routes/community.route.ts') + extractLines(load, 'community.route.ts', range(613, 648)),
      () => sectionHeader('Prisma — viewCount', 'prisma/schema.prisma') + extractLines(load, 'prisma-community', [429]),
    ],
  },
  174: {
    title: 'PR #174 (Issue #172) — 이전·다음',
    intro: `# PR #174 — prev/next neighbors

## 이 PR 한 줄
GET /api/posts/:postId/neighbors — 목록과 동일 필터·sort 기준 prev/next.

## 아래부터 = 이 PR에 들어간 코드 **전 줄** 설명
`,
    parts: [
      () => sectionHeader('post.schema.ts — neighbors query', 'src/schemas/post.schema.ts') + extractLines(load, 'post.schema.ts', range(45, 53)),
      () => sectionHeader('post.service.ts — getPostNeighbors', 'src/services/post.service.ts') + extractLines(load, 'post.service.ts', [...range(145, 155), ...range(189, 209)]),
      () => sectionHeader('post.repository.ts — findPostNeighbors', 'src/repositories/post.repository.ts') + extractLines(load, 'post.repository.ts', range(158, 305)),
      () => sectionHeader('post.controller.ts — getPostNeighbors', 'src/controllers/post.controller.ts') + extractLines(load, 'post.controller.ts', range(53, 68)),
      () => sectionHeader('community.route.ts — GET neighbors', 'src/routes/community.route.ts') + extractLines(load, 'community.route.ts', range(160, 248)),
    ],
  },
  203: {
    title: 'PR #203 (Issue #194) — markdown·S3·cron',
    intro: `# PR #203 — markdown 저장·imageKeys S3 검증·orphan cron

## 이 PR 한 줄
stripPostMarkdown, S3 HeadObject, rollback, 매일 03:00 orphan 정리.

## 아래부터 = 이 PR에 들어간 코드 **전 줄** 설명
`,
    parts: [
      () => sectionHeader('post-content.util.ts', 'src/utils/post-content.util.ts') + extractLines(load, 'post-content.util.ts', range(1, 22)),
      () => sectionHeader('post-image.constants.ts', 'src/constants/post-image.constants.ts') + extractLines(load, 'post-image.constants.ts', range(1, 22)),
      () => sectionHeader('post-image.util.ts', 'src/utils/post-image.util.ts') + extractLines(load, 'post-image.util.ts', range(1, 104)),
      () => sectionHeader('post-image-cleanup.service.ts', 'src/services/post-image-cleanup.service.ts') + extractLines(load, 'post-image-cleanup.service.ts', range(1, 54)),
      () => sectionHeader('cleanup-orphan-post-images.job.ts', 'src/jobs/cleanup-orphan-post-images.job.ts') + extractLines(load, 'cleanup-orphan-post-images.job.ts', range(1, 23)),
      () => sectionHeader('post.schema.ts — imageKey regex', 'src/schemas/post.schema.ts') + extractLines(load, 'post.schema.ts', [...range(1, 3), ...range(63, 70)]),
      () => sectionHeader('post.service.ts — content·image 검증', 'src/services/post.service.ts') + extractLines(load, 'post.service.ts', [...range(16, 24), ...range(111, 117), ...range(127, 130), ...range(249, 279), ...range(301, 354)]),
      () => sectionHeader('app.ts — orphan cron 등록', 'src/app.ts') + extractLines(load, 'app-community', [9, 121, 122]),
    ],
  },
  211: {
    title: 'PR #211 (Issue #210) — 상세 imageKey',
    intro: `# PR #211 — 상세 images[] imageKey 필드

## 이 PR 한 줄
getPostById 응답 images에 imageKey + imageUrl 둘 다 반환.

## 아래부터 = 이 PR에 들어간 코드 **전 줄** 설명
`,
    parts: [
      () => sectionHeader('post.service.ts — getPostById images', 'src/services/post.service.ts') + extractLines(load, 'post.service.ts', range(225, 229)),
    ],
  },
};

const OUTPUT_SUFFIX = {
  14: '스캐폴드-4계층',
  36: '목록-상세-조회',
  47: 'DB-인덱스',
  49: 'CRUD',
  56: '좋아요-댓글-이미지',
  167: '키워드-검색',
  173: '조회수',
  174: '이전-다음',
  203: '마크다운-S3-cron',
  211: '상세-imageKey',
};

let load;
load = loadAllLines();

for (const [num, cfg] of Object.entries(PR_CONFIG)) {
  let md = cfg.intro;
  for (const partFn of cfg.parts) {
    md += partFn();
  }
  const out = path.join(PR_DIR, `PR-${num}-${OUTPUT_SUFFIX[num]}-전체.md`);
  fs.writeFileSync(out, md, 'utf8');
  const lineCount = (md.match(/^## \d+행/gm) || []).length;
  console.log(`PR-${num}-전체.md  sections=${lineCount}`);
}

// 목차
const toc = `# PR별 문서 — **PR당 1개 파일** (흐름 + 코드 전 줄)

> **규칙:** PR 하나 = \`PR-XX-전체.md\` **한 파일** 안에  
> ① PR 설명 ② 그 PR에 들어간 코드 **전 줄** 설명.

## 읽는 순서

1. [00-비전공자-용어-정리.md](./00-비전공자-용어-정리.md)
2. **PR 번호 순** — 아래 \`PR-XX-전체.md\` 만 보면 됨 (상세보충·파일별 문서 따로 안 가도 됨)

| PR | 문서 | 핵심 |
|----|------|------|
| #14 | [PR-14-전체.md](./PR-14-전체.md) | 4계층 스캐폴드 |
| #36 | [PR-36-전체.md](./PR-36-전체.md) | 목록·상세·커서 |
| #47 | [PR-47-전체.md](./PR-47-전체.md) | DB index |
| #49 | [PR-49-전체.md](./PR-49-전체.md) | CRUD |
| #56 | [PR-56-전체.md](./PR-56-전체.md) | 좋아요·댓글·imageKeys |
| #167 | [PR-167-전체.md](./PR-167-전체.md) | keyword |
| #173 | [PR-173-전체.md](./PR-173-전체.md) | viewCount |
| #174 | [PR-174-전체.md](./PR-174-전체.md) | prev/next |
| #203 | [PR-203-전체.md](./PR-203-전체.md) | markdown·S3·cron |
| #211 | [PR-211-전체.md](./PR-211-전체.md) | imageKey |
| — | [PR-면접-꼬리질문-통합.md](./PR-면접-꼬리질문-통합.md) | 꼬리질문 |

## 예전에 쪼개져 있던 문서

- \`PR-36-목록-상세.md\`, \`PR-36-…-상세보충.md\`, \`줄별-전체/\` → 내용은 **PR-XX-전체.md** 로 합침.
- 파일별 \`줄별-전체/\` 는 원본 백업용. **공부는 PR-XX-전체.md 만.**

`;
fs.writeFileSync(path.join(PR_DIR, '00-PR-목차.md'), toc, 'utf8');
console.log('updated 00-PR-목차.md');
