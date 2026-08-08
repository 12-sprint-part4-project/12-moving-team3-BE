-- 이 파일은 schema.prisma로 표현 불가능한 트리거/함수를 다루므로,
-- 이후 prisma migrate dev가 재실행되어도 임의로 수정·삭제하지 말 것.
-- prisma db push는 절대 사용하지 말 것(drift로 인식해 트리거를 제거할 수 있음).
-- 대상 테이블 중 하나를 DROP&RECREATE하는 마이그레이션이 생기면
-- 그 마이그레이션에 트리거 재생성 구문을 반드시 포함할 것.

-- 감사 로그 공통 트리거 함수
-- 세션 변수: app.current_user_id, app.current_admin_id, app.skip_audit
CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  pk_column text := TG_ARGV[0];
  operation_type "HistoryAction";
  row_id text;
  before_json jsonb;
  after_json jsonb;
  actor_user_id uuid;
  actor_admin_id integer;
  skip_flag text;
BEGIN
  -- 관리자 Service가 createHistory를 직접 남길 때 트리거 중복 방지
  skip_flag := NULLIF(current_setting('app.skip_audit', true), '');
  IF skip_flag IS NOT NULL AND lower(skip_flag) IN ('true', '1', 'on', 'yes') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    operation_type := 'CREATE';
    before_json := NULL;
    after_json := to_jsonb(NEW);
    row_id := to_jsonb(NEW) ->> pk_column;
  ELSIF TG_OP = 'UPDATE' THEN
    operation_type := 'UPDATE';
    before_json := to_jsonb(OLD);
    after_json := to_jsonb(NEW);
    row_id := to_jsonb(NEW) ->> pk_column;

    -- soft delete(deleted_at NULL → NOT NULL)는 HistoryAction.DELETE로 기록
    IF (before_json ? 'deleted_at')
       AND (before_json ->> 'deleted_at') IS NULL
       AND (after_json ->> 'deleted_at') IS NOT NULL THEN
      operation_type := 'DELETE';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    operation_type := 'DELETE';
    before_json := to_jsonb(OLD);
    after_json := NULL;
    row_id := to_jsonb(OLD) ->> pk_column;
  END IF;

  BEGIN
    actor_user_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      actor_user_id := NULL;
  END;

  BEGIN
    actor_admin_id := NULLIF(current_setting('app.current_admin_id', true), '')::integer;
  EXCEPTION
    WHEN invalid_text_representation THEN
      actor_admin_id := NULL;
  END;

  INSERT INTO "histories" (
    "user_id",
    "admin_user_id",
    "table_name",
    "table_row_id",
    "operation_type",
    "before_data",
    "after_data",
    "created_at"
  ) VALUES (
    actor_user_id,
    actor_admin_id,
    TG_TABLE_NAME,
    row_id,
    operation_type,
    before_json,
    after_json,
    CURRENT_TIMESTAMP
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- pk_column = 'id' (11개)
CREATE TRIGGER trg_audit_users
  AFTER INSERT OR UPDATE OR DELETE ON "users"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log('id');

CREATE TRIGGER trg_audit_customer_profiles
  AFTER INSERT OR UPDATE OR DELETE ON "customer_profiles"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log('id');

CREATE TRIGGER trg_audit_mover_profiles
  AFTER INSERT OR UPDATE OR DELETE ON "mover_profiles"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log('id');

CREATE TRIGGER trg_audit_mover_service_regions
  AFTER INSERT OR UPDATE OR DELETE ON "mover_service_regions"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log('id');

CREATE TRIGGER trg_audit_estimate_requests
  AFTER INSERT OR UPDATE OR DELETE ON "estimate_requests"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log('id');

CREATE TRIGGER trg_audit_quotes
  AFTER INSERT OR UPDATE OR DELETE ON "quotes"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log('id');

CREATE TRIGGER trg_audit_reviews
  AFTER INSERT OR UPDATE OR DELETE ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log('id');

CREATE TRIGGER trg_audit_user_reports
  AFTER INSERT OR UPDATE OR DELETE ON "user_reports"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log('id');

CREATE TRIGGER trg_audit_posts
  AFTER INSERT OR UPDATE OR DELETE ON "posts"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log('id');

CREATE TRIGGER trg_audit_comments
  AFTER INSERT OR UPDATE OR DELETE ON "comments"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log('id');

CREATE TRIGGER trg_audit_admin_users
  AFTER INSERT OR UPDATE OR DELETE ON "admin_users"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log('id');

-- pk_column = 'user_id' (예외 1개)
CREATE TRIGGER trg_audit_user_statuses
  AFTER INSERT OR UPDATE OR DELETE ON "user_statuses"
  FOR EACH ROW EXECUTE FUNCTION fn_audit_log('user_id');
