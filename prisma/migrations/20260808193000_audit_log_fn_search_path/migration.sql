-- fn_audit_log 가 호출자 search_path에 의존하지 않도록 고정
-- (본문·민감 컬럼 제외 로직은 20260808190000 과 동일)

CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO pg_catalog, public
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
  i integer;
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

  -- 트리거 인자로 넘긴 민감 키를 histories JSON에서 제거 (없는 키는 no-op)
  IF TG_NARGS > 1 THEN
    FOR i IN 1 .. (TG_NARGS - 1) LOOP
      IF before_json IS NOT NULL THEN
        before_json := before_json - TG_ARGV[i];
      END IF;
      IF after_json IS NOT NULL THEN
        after_json := after_json - TG_ARGV[i];
      END IF;
    END LOOP;
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
