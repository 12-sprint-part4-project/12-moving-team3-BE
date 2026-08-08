-- UserReportTarget에서 CHAT_ROOM 제거.
-- PostgreSQL은 enum 값을 직접 DROP 할 수 없어 타입을 재생성한다.
-- notifications.user_report_id → user_reports(id) 는 ON DELETE SET NULL
-- (20260724050403_update_notification_relations_and_review) 이므로
-- CHAT_ROOM 신고 행 삭제 시 연결 알림은 user_report_id만 NULL로 남는다.

-- 1) 레거시 CHAT_ROOM 신고 데이터 삭제 (다른 target으로 변환하지 않음)
DELETE FROM "user_reports"
WHERE "target" = 'CHAT_ROOM';

-- 2) 기존 enum 이름 변경
ALTER TYPE "UserReportTarget" RENAME TO "UserReportTarget_old";

-- 3) CHAT_ROOM 없는 새 enum 생성
CREATE TYPE "UserReportTarget" AS ENUM (
  'USER',
  'REVIEW',
  'MESSAGE',
  'ARTICLE',
  'COMMENT'
);

-- 4) user_reports.target 컬럼을 새 enum으로 변환
-- UserReportTarget을 쓰는 다른 컬럼은 schema/migration 기준 없음
ALTER TABLE "user_reports"
ALTER COLUMN "target" TYPE "UserReportTarget"
USING "target"::text::"UserReportTarget";

-- 5) 기존 enum 삭제
DROP TYPE "UserReportTarget_old";
