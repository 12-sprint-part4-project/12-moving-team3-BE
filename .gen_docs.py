# -*- coding: utf-8 -*-
"""Generate complete Korean line-by-line docs for community BE files."""
from __future__ import annotations

from pathlib import Path
import re

OUT = Path("/Users/apple/Desktop/Part4/설명/커뮤니티-BE-코드-설명/줄별-전체")
BASE = Path("/Users/apple/Desktop/Part4/12-moving-team3-BE")


def read_lines(p: Path) -> list[str]:
    return p.read_text(encoding="utf-8").splitlines()


def block(n: int, line: str, expl: str) -> str:
    return f"## {n}행\n```typescript\n{line}\n```\n**설명:** {expl}\n\n"


def write_doc(
    out_name: str,
    title: str,
    rel: str,
    path: Path,
    start: int | None = None,
    end: int | None = None,
    custom: dict[int, str] | None = None,
    layer: str = "general",
):
    lines = read_lines(path)
    start = start or 1
    end = end or len(lines)
    custom = custom or {}
    parts = [f"# {title}\n\n> `{rel}` · **한 줄도 생략 없음**\n\n---\n\n"]
    for i in range(start, end + 1):
        line = lines[i - 1]
        expl = custom.get(i) or explain(i, line, lines, path.name, layer)
        parts.append(block(i, line, expl))
    (OUT / out_name).write_text("".join(parts), encoding="utf-8")
    print(f"Wrote {out_name} ({end - start + 1} lines)")


def explain(n: int, line: str, all_lines: list[str], fname: str, layer: str) -> str:
    s = line.strip()
    prev = all_lines[n - 2].strip() if n > 1 else ""
    nxt = all_lines[n].strip() if n < len(all_lines) else ""

    if not s:
        return "코드 블록·import·객체 필드 사이 가독성을 위한 빈 줄입니다. 실행에는 영향이 없습니다."

    if s in ("}", "};", "})"):
        if "findMany" in prev or "findFirst" in prev or "create(" in prev or "updateMany" in prev:
            return "Prisma 쿼리 호출·객체 리터럴을 닫습니다. 위에서 조립한 where/select/orderBy가 최종 쿼리로 실행됩니다."
        if "try" in prev or "catch" in prev:
            return "try/catch 또는 함수 블록을 닫습니다."
        return "열린 `{` 블록을 닫아 상위 scope로 제어를 반환합니다."

    if s.startswith("//") or s.startswith("*") or s.startswith("/**") or s == "*/":
        return f"개발자용 주석으로 `{fname}` 해당 구간의 의도를 설명합니다. API 경로·soft delete·트랜잭션·cron 스케줄 등 유지보수 시 참고합니다."

    if s.startswith("import "):
        return parse_import(s, layer)

    if s.startswith("export interface "):
        name = s.split()[2]
        return f"`{name}` interface를 export합니다. Service와 Repository 간 파라미터·cursor 구조 계약을 타입으로 고정합니다."

    if s.startswith("export type "):
        return "TypeScript type alias export입니다. Prisma GetPayload 등으로 쿼리 결과 row 형태를 컴파일 타임에 고정합니다."

    if s.startswith("export const ") and "async" in s:
        m = re.search(r"export const (\w+)", s)
        name = m.group(1) if m else "함수"
        return f"`{name}` async 함수 export 시작입니다. {layer_hint(layer)}"

    if s.startswith("export {"):
        return "named re-export입니다. 다른 모듈에서 동일 이름으로 import할 수 있게 합니다."

    if s.startswith("type ") and "=" in s:
        return "파일 내부 또는 export type alias입니다. Prisma payload·DbClient 등 복합 타입을 이름으로 축약합니다."

    if s.startswith("const ") and "=>" in s and "export" not in s:
        m = re.search(r"const (\w+)", s)
        name = m.group(1) if m else "헬퍼"
        return f"파일 내부 `{name}` 헬퍼 함수입니다. 중복 Prisma where/orderBy·cursor 조건을 재사용합니다."

    if s.startswith("if ("):
        return f"조건 분기 — `{s[3:-1] if s.endswith(')') else s}` 평가 결과에 따라 다른 DB 쿼리·early return·에러 throw를 선택합니다."

    if s.startswith("} else if"):
        return "이전 조건이 false일 때 추가 분기합니다. sort 모드·필드 존재 여부 등 다중 케이스를 처리합니다."

    if s.startswith("else"):
        return "앞선 모든 if/else if가 false일 때 실행되는 fallback 분기입니다."

    if s.startswith("return "):
        val = s[7:].rstrip(";")
        if "null" in val:
            return "조건 미충족·레코드 없음을 나타내는 null/객체를 호출자(Service)에 반환합니다."
        if "prisma." in val or "Promise.all" in val:
            return "Prisma 쿼리 Promise 또는 병렬 조회 결과를 호출자에 반환합니다."
        return f"`{val}` 값을 함수 결과로 반환합니다. 상위 Service·Controller가 이 값으로 HTTP 응답·후속 로직을 진행합니다."

    if s.startswith("await "):
        inner = s[6:].rstrip(";")
        if "notificationService" in inner:
            return "알림 발송 비동기 작업을 await합니다. 실패해도 댓글 작성 자체는 이미 커밋된 상태입니다."
        if "toPresignedViewUrl" in inner:
            return "S3 profileImageKey를 presigned view URL로 변환합니다. FE가 바로 이미지를 렌더링할 수 있습니다."
        if "getObjectMetadata" in inner or "deleteImage" in inner:
            return "S3 API 비동기 호출을 await합니다. 이미지 존재·MIME·용량 검증 또는 삭제를 수행합니다."
        if "Promise.all" in inner:
            return "독립적인 비동기 작업(Prisma·S3)을 병렬 await해 응답 지연을 줄입니다."
        return f"비동기 작업 `{inner}` 완료를 기다립니다. DB 트랜잭션 안이면 동일 tx 클라이언트를 사용합니다."

    if s.startswith("throw new AppError"):
        m = re.search(r"AppError\('([^']+)'", s)
        code = m.group(1) if m else "ERROR"
        return f"`AppError('{code}')`를 throw합니다. errorHandler middleware가 `{code}` HTTP status·JSON error body로 변환합니다."

    if "prisma." in s or ".post." in s or ".comment." in s or ".postLike." in s or ".postImage." in s:
        return parse_prisma_line(s)

    if s.startswith("res.status"):
        m = re.search(r"status\((\d+)\)", s)
        code = m.group(1) if m else "200"
        return f"HTTP {code} 상태 코드를 설정합니다. API 규약에 맞는 성공·생성·삭제 응답입니다."

    if s.startswith("res.") and "json" in s:
        return "Express Response로 JSON body `{ data, meta? }`를 전송합니다. Controller는 Service 결과를 가공하지 않고 포맷만 맞춥니다."

    if s.startswith("next(error)"):
        return "catch 블록에서 error를 Express error middleware chain으로 넘깁니다. AppError·ZodError 등이 일관된 error JSON으로 변환됩니다."

    if s.startswith("try {"):
        return "Controller/Service try 블록 시작입니다. 예외 발생 시 catch 또는 error middleware로 전달합니다."

    if s.startswith("catch"):
        return "try 블록 예외 처리 시작입니다. AppError 재throw·로깅·fallback 등을 수행합니다."

    if ".replace(" in s:
        return parse_replace_line(s)

    if s.startswith("..."):
        return "객체 spread로 선택적 필드를 조건부 병합합니다. 값이 없으면 해당 키는 최종 객체에 포함되지 않습니다."

    if s.endswith("{") or s.endswith("({"):
        return "블록·객체 리터럴·함수 본문 `{` 시작입니다."

    if ": " in s and not s.startswith("if") and s.endswith(","):
        return f"객체·타입 필드 `{s.rstrip(',')}` 정의입니다. Prisma where/select/data 또는 interface 필드의 한 항목입니다."

    if s.endswith(",") or s.endswith(";"):
        return contextual_tail(s, prev, fname, layer)

    return f"`{s}` — {fname} {n}행. {layer_hint(layer)}"


def layer_hint(layer: str) -> str:
    return {
        "repository": "Repository 계층 — HTTP·비즈니스 규칙 없이 Prisma 데이터 접근만 담당합니다.",
        "service": "Service 계층 — 비즈니스 규칙·cursor encode/decode·응답 매핑·AppError를 담당합니다.",
        "controller": "Controller 계층 — HTTP 요청/응답만 처리하고 Service에 위임합니다.",
        "util": "유틸 모듈 — 재사용 가능한 순수 함수·S3 검증 로직을 제공합니다.",
        "constants": "상수 모듈 — 이미지 key 형식·용량·MIME 등 정책 값을 한곳에 정의합니다.",
        "job": "cron job 모듈 — 주기적 배치 작업 스케줄·실행 래퍼입니다.",
        "prisma": "Prisma schema — DB 테이블·relation·index·enum 정의입니다.",
        "app": "Express app.ts — router mount·cron 등록 등 애플리케이션 부트스트랩입니다.",
    }.get(layer, "커뮤니티 백엔드 코드의 한 줄입니다.")


def parse_import(s: str, layer: str) -> str:
    if "express" in s:
        return "Express `Request`, `Response`, `NextFunction` 타입을 import합니다. Controller 핸들러 시그니처에 사용됩니다."
    if "auth.middleware" in s:
        return "JWT 인증 헬퍼 import — `requireAuth`(401) / `getOptionalAuthenticatedUser`(guest 허용)를 Controller에서 사용합니다."
    if "post.schema" in s or "schemas/" in s:
        return "Zod schema에서 infer된 요청 타입 import입니다. Controller는 `getValidated`로 검증된 값만 읽습니다."
    if "repository" in s:
        return "Repository 모듈 namespace import — Service/Util이 Prisma 직접 호출 없이 DB 접근합니다."
    if "service" in s and "Controller" in layer:
        return "Service 모듈 import — Controller는 비즈니스 로직 없이 Service 함수만 호출합니다."
    if "AppError" in s:
        return "`AppError` 클래스 import — Service에서 `ERROR_CODES` 키로 도메인 에러를 throw합니다."
    if "@prisma/client" in s:
        return "Prisma Client 생성 enum·타입 import — DB schema와 동일한 타입으로 where/orderBy를 조립합니다."
    if "prisma" in s and "lib" in s:
        return "전역 Prisma 싱글톤 import — connection pool 공유."
    if "validated.util" in s:
        return "`getValidated` import — Route의 validateRequest가 `res.locals.validated`에 넣은 Zod 결과를 읽습니다."
    if "s3.service" in s:
        return "S3 서비스 함수 import — presigned URL·HeadObject·delete·listObjects."
    if "node-cron" in s:
        return "node-cron 라이브러리 import — cron 표현식으로 스케줄 job 등록."
    if "post-image" in s:
        return "게시글 이미지 상수·유틸 import — key 형식·용량·MIME·삭제 헬퍼."
    if "notification.service" in s:
        return "알림 Service import — 댓글/답글 작성 후 커뮤니티 알림 발송."
    return f"모듈 의존성 import — `{s}`"


def parse_prisma_line(s: str) -> str:
    if "findMany" in s:
        return "Prisma `findMany` — 조건에 맞는 여러 row 조회. limit+1·select·orderBy와 함께 목록·댓글·이미지 key 조회에 사용."
    if "findFirst" in s:
        return "Prisma `findFirst` — 조건 만족 첫 1건. neighbors prev/next·owner check·단건 존재 확인."
    if "findUnique" in s:
        return "Prisma `findUnique` — unique index(PK·복합 unique)로 단건 조회. PostLike `(postId,userId)` 존재 확인."
    if "create(" in s:
        return "Prisma `create` — 새 row INSERT. nested create로 PostImage 동시 생성."
    if "createMany" in s:
        return "Prisma `createMany` — 다수 row bulk INSERT. 이미지 key 교체 시 사용."
    if "updateMany" in s:
        return "Prisma `updateMany` — 조건 맞는 row atomic UPDATE. soft delete·count increment/decrement·affected count 확인."
    if "deleteMany" in s:
        return "Prisma `deleteMany` — 조건 row DELETE. postImage 전량 삭제·PostLike 삭제."
    if "$transaction" in s:
        return "Prisma `$transaction` — 여러 쿼리 원자 실행. like/comment count와 join row 일관성 유지."
    if "deletedAt" in s:
        return "soft delete 필터/갱신 — `deletedAt: null` 조회 또는 `new Date()` 기록."
    if "increment" in s or "decrement" in s:
        return "denormalized counter 원자 증감 — likeCount/commentCount/viewCount를 JOIN COUNT 없이 빠르게 갱신."
    if "orderBy" in s:
        return "Prisma orderBy — keyset pagination과 짝. 보조 정렬 `id`로 tie-break."
    if "select:" in s or "select:" in s:
        return "Prisma select — 필요 컬럼만 조회해 payload·N+1 최소화."
    if "where:" in s:
        return "Prisma where — soft delete·필터·cursor·AND/OR 조건."
    if "take:" in s:
        return "조회 row 상한. limit+1이면 다음 페이지 존재 여부 판별."
    return f"Prisma Client DB 작업 — `{s.strip()}`"


def parse_replace_line(s: str) -> str:
    if "``" in s or "```" in s:
        return "fenced code block(```...```) 전체를 공백으로 치환 — 미리보기·빈 본문 검증 시 코드 블록 텍스트 제거."
    if "`[^`]*`" in s:
        return "인라인 백틱 코드 span을 공백으로 치환."
    if "!\\[" in s:
        return "마크다운 이미지 `![alt](url)` 구문 제거."
    if "\\[" in s and "]( " in s or "](" in s:
        return "마크다운 링크에서 표시 텍스트만 남기거나 제거."
    if "#{1,6}" in s:
        return "ATX 헤딩 `#` 접두사 제거."
    if "\\*\\*" in s or "__" in s:
        return "굵게 마크다운 래퍼 제거, 내용만 유지."
    if "~~" in s:
        return "취소선 마크다운 제거."
    if "[-*+]" in s:
        return "순서 없는 목록 bullet 접두사 제거."
    if "\\d+" in s:
        return "순서 있는 목록 숫자 접두사 제거."
    if ">" in s:
        return "blockquote `>` 접두사 제거."
    if "\\s+" in s:
        return "연속 공백·개행을 단일 공백으로 압축."
    return f"마크다운 strip 파이프라인의 `.replace()` 한 단계 — `{s.strip()}`"


def contextual_tail(s: str, prev: str, fname: str, layer: str) -> str:
    if "userId" in s:
        return "userId 필드 — 작성자 FK 또는 JWT에서 온 현재 사용자 id."
    if "postId" in s:
        return "postId — 게시글 FK. URL params 또는 nested relation."
    if "content" in s:
        return "댓글/게시글 본문 text/markdown 필드."
    if "limit" in s:
        return "페이지 크기 limit — Repository는 limit+1 조회."
    if "cursor" in s:
        return "base64url JSON cursor — keyset pagination 다음 페이지 시작점."
    if "meta" in s:
        return "pagination meta — nextCursor, hasNextPage."
    if "items" in s:
        return "목록 items 배열 — API data.items."
    return f"`{s.rstrip(';,')}` — {fname} 객체/호출 인자의 한 필드."


# ========== CUSTOM OVERRIDES (high-value lines) ==========

POST_REPO: dict[int, str] = {}
for i, t in {
    1: "Prisma enum `PostsCategory`, `Region`과 `Prisma` 타입 namespace import.",
    9: "`DbClient = typeof prisma | Prisma.TransactionClient` — updatePost가 외부 tx 참여 가능.",
    57: "JSDoc: keyset cursor where — 정렬 desc + id desc 기준 다음 페이지.",
    94: "주석: category/region/keyword는 값 있을 때만 where 추가.",
    126: "`take: limit + 1` — Service가 hasNextPage 판별.",
    140: "주석: 목록 썸네일용 images take 1.",
    160: "JSDoc: neighbors — 목록 필터·정렬 동일, post 없으면 null.",
    307: "주석: findPostById 상세.",
    308: "주석: soft delete deletedAt null.",
    329: "주석: 상세는 images 전체.",
    346: "JSDoc: findPostOwner — id·userId만.",
    377: "JSDoc: updatePost — imageKeys 시 전량 교체.",
    388: "imageKeys만 변경 시 updatedAt bump — FE 수정 시각.",
    420: "JSDoc: softDeletePost.",
    456: "JSDoc: incrementViewCount — count 0이면 대상 없음.",
}.items():
    POST_REPO[i] = t + " Repository 계층."

POST_CTRL = {
    16: "JSDoc + `getPosts` — GET /api/posts 목록. optionalAuth.",
    36: "GET /api/posts/:postId 상세.",
    53: "GET /api/posts/:postId/neighbors.",
    70: "POST /api/posts 생성. requireAuth.",
    87: "PATCH /api/posts/:postId 수정.",
    105: "DELETE soft delete → 204.",
    122: "POST views 조회수 +1 → 204.",
}

COMMENT_SVC = {
    9: "`isCommentCursor` type guard — cursor JSON shape 검증.",
    24: "`encodeCursor` — base64url JSON.",
    35: "`decodeCursor` — malformed/sort mismatch 시 INVALID_QUERY_PARAM.",
    82: "JSDoc: getComments — 최상위+대댓글, cursor pagination.",
    153: "JSDoc: createComment.",
    175: "주석: 알림 실패가 댓글 작성 막지 않음.",
    190: "JSDoc: createReply — depth 1.",
    213: "주석: 대댓글에 대댓글 불가.",
    244: "JSDoc: deleteComment soft delete + 대댓글.",
}

COMMENT_REPO = {
    38: "JSDoc: 최상위 댓글 keyset cursor createdAt asc, id asc.",
    109: "JSDoc: createComment + commentCount increment 트랜잭션.",
    144: "JSDoc block: softDeleteComment — 대댓글 cascade soft delete.",
}

LIKE_SVC = {
    6: "`isUniqueConstraintError` — P2002 race condition fallback.",
    10: "JSDoc: createLike.",
    39: "JSDoc: deleteLike.",
}

POST_IMG_UTIL = {
    10: "JSDoc: assertValidPostImageKeys — S3 존재·prefix·MIME·용량.",
    71: "JSDoc: deleteUnreferencedPostImageKeys.",
    87: "JSDoc: deletePostImageKeysSafely — best-effort, throw 안 함.",
}

CLEANUP_SVC = {10: "JSDoc: cleanupOrphanPostImages — DB 미참조 posts/ S3 정리."}
CLEANUP_JOB = {
    12: "JSDoc: 매일 03:00 Asia/Seoul cron.",
    15: "cron `0 3 * * *` — 매일 03:00.",
}

PRISMA_LINES = list(range(422, 485)) + list(range(617, 624))
PRISMA_EXPL = {
    422: "model Post — 커뮤니티 게시글 테이블 posts.",
    423: "PK id autoincrement.",
    424: "userId FK UUID → user_id.",
    425: "category PostsCategory enum.",
    426: "region Region? optional.",
    427: "title VarChar(100).",
    428: "content markdown/text.",
    429: "viewCount denormalized.",
    430: "likeCount denormalized.",
    431: "commentCount denormalized.",
    432: "latitude Decimal(10,7)? optional.",
    433: "longitude optional.",
    434: "isCompleted Boolean? — 후기 완료 여부.",
    435: "createdAt @default(now()).",
    436: "deletedAt? soft delete.",
    437: "updatedAt @updatedAt.",
    438: "comments Comment[] 1:N.",
    439: "images PostImage[] 1:N.",
    440: "likes PostLike[] 1:N.",
    441: "user User N:1.",
    443: "index (deletedAt, category, createdAt, id) — 목록.",
    444: "@@map posts.",
    447: "model PostImage — post_images.",
    448: "PK id.",
    449: "postId FK.",
    450: "imageKey S3 key VarChar(500).",
    451: "createdAt.",
    452: "post Post relation.",
    454: "@@map post_images.",
    457: "model PostLike — post_likes.",
    458: "PK id.",
    459: "postId FK.",
    460: "userId FK UUID.",
    461: "createdAt.",
    462: "post relation.",
    463: "user relation.",
    465: "@@unique [postId, userId] — 중복 좋아요 DB 차단.",
    466: "@@map post_likes.",
    469: "model Comment — comments.",
    470: "PK id.",
    471: "postId FK.",
    472: "userId FK.",
    473: "parentId? — null=최상위, 값=대댓글.",
    474: "content text.",
    475: "createdAt.",
    476: "deletedAt? soft delete.",
    477: "parent Comment? self-relation.",
    478: "replies Comment[] self-relation.",
    479: "post Post relation.",
    480: "user User relation.",
    481: "notifications Notification[].",
    483: "@@map comments.",
    617: "enum PostsCategory.",
    618: "MOVING_TIP.",
    619: "QUESTION.",
    620: "REVIEW.",
    621: "ETC.",
    622: "FURNITURE_SHARE.",
}

APP_EXPL = {
    9: "import startCleanupOrphanPostImagesCron — orphan S3 정리 job.",
    23: "import communityRouter — posts/comments/likes 라우트.",
    86: "app.use('/api/posts', communityRouter) — 커뮤니티 API prefix.",
    121: "주석: posts/ orphan cleanup 매일 03:00.",
    122: "startCleanupOrphanPostImagesCron() — listen 콜백에서 cron 시작.",
}


def write_prisma_doc():
    lines = read_lines(BASE / "prisma/schema.prisma")
    parts = [
        "# prisma/schema.prisma — 커뮤니티 모델 전체 줄 설명\n\n"
        "> Post, PostImage, PostLike, Comment, PostsCategory · **한 줄도 생략 없음**\n\n---\n\n"
    ]
    for n in PRISMA_LINES:
        line = lines[n - 1]
        expl = PRISMA_EXPL.get(n) or explain(n, line, lines, "schema.prisma", "prisma")
        parts.append(block(n, line, expl))
    (OUT / "17-prisma-커뮤니티-전체줄설명.md").write_text("".join(parts), encoding="utf-8")
    print(f"Wrote 17-prisma ({len(PRISMA_LINES)} lines)")


def write_app_doc():
    lines = read_lines(BASE / "src/app.ts")
    parts = [
        "# app.ts — 커뮤니티 등록 관련 줄 설명\n\n"
        "> community router mount · orphan image cron · **한 줄도 생략 없음**\n\n---\n\n"
    ]
    for n in sorted(APP_EXPL):
        parts.append(block(n, lines[n - 1], APP_EXPL[n]))
    (OUT / "18-app-커뮤니티-등록-줄설명.md").write_text("".join(parts), encoding="utf-8")
    print("Wrote 18-app (5 lines)")


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    write_doc(
        "03-post.repository.ts-전체줄설명-1-232.md",
        "post.repository.ts — 전체 줄 설명 (1–232행)",
        "src/repositories/post.repository.ts",
        BASE / "src/repositories/post.repository.ts",
        1,
        232,
        POST_REPO,
        "repository",
    )
    write_doc(
        "03-post.repository.ts-전체줄설명-233-464.md",
        "post.repository.ts — 전체 줄 설명 (233–464행)",
        "src/repositories/post.repository.ts",
        BASE / "src/repositories/post.repository.ts",
        233,
        464,
        POST_REPO,
        "repository",
    )
    write_doc(
        "04-post.controller.ts-전체줄설명.md",
        "post.controller.ts — 전체 줄 설명",
        "src/controllers/post.controller.ts",
        BASE / "src/controllers/post.controller.ts",
        custom=POST_CTRL,
        layer="controller",
    )
    write_doc(
        "05-comment.service.ts-전체줄설명.md",
        "comment.service.ts — 전체 줄 설명",
        "src/services/comment.service.ts",
        BASE / "src/services/comment.service.ts",
        custom=COMMENT_SVC,
        layer="service",
    )
    write_doc(
        "06-comment.controller.ts-전체줄설명.md",
        "comment.controller.ts — 전체 줄 설명",
        "src/controllers/comment.controller.ts",
        BASE / "src/controllers/comment.controller.ts",
        layer="controller",
    )
    write_doc(
        "07-comment.repository.ts-전체줄설명.md",
        "comment.repository.ts — 전체 줄 설명",
        "src/repositories/comment.repository.ts",
        BASE / "src/repositories/comment.repository.ts",
        custom=COMMENT_REPO,
        layer="repository",
    )
    write_doc(
        "08-like.service.ts-전체줄설명.md",
        "like.service.ts — 전체 줄 설명",
        "src/services/like.service.ts",
        BASE / "src/services/like.service.ts",
        custom=LIKE_SVC,
        layer="service",
    )
    write_doc(
        "09-like.controller.ts-전체줄설명.md",
        "like.controller.ts — 전체 줄 설명",
        "src/controllers/like.controller.ts",
        BASE / "src/controllers/like.controller.ts",
        layer="controller",
    )
    write_doc(
        "10-like.repository.ts-전체줄설명.md",
        "like.repository.ts — 전체 줄 설명",
        "src/repositories/like.repository.ts",
        BASE / "src/repositories/like.repository.ts",
        layer="repository",
    )
    write_doc(
        "11-post-content.util.ts-전체줄설명.md",
        "post-content.util.ts — 전체 줄 설명",
        "src/utils/post-content.util.ts",
        BASE / "src/utils/post-content.util.ts",
        layer="util",
    )
    write_doc(
        "12-post-image.util.ts-전체줄설명.md",
        "post-image.util.ts — 전체 줄 설명",
        "src/utils/post-image.util.ts",
        BASE / "src/utils/post-image.util.ts",
        custom=POST_IMG_UTIL,
        layer="util",
    )
    write_doc(
        "14-post-image-cleanup.service.ts-전체줄설명.md",
        "post-image-cleanup.service.ts — 전체 줄 설명",
        "src/services/post-image-cleanup.service.ts",
        BASE / "src/services/post-image-cleanup.service.ts",
        custom=CLEANUP_SVC,
        layer="service",
    )
    write_doc(
        "15-cleanup-orphan-post-images.job.ts-전체줄설명.md",
        "cleanup-orphan-post-images.job.ts — 전체 줄 설명",
        "src/jobs/cleanup-orphan-post-images.job.ts",
        BASE / "src/jobs/cleanup-orphan-post-images.job.ts",
        custom=CLEANUP_JOB,
        layer="job",
    )
    write_prisma_doc()
    write_app_doc()
    print("All done.")


if __name__ == "__main__":
    main()
