-- 유저당 DRAFT 견적요청 1건만 허용 (동시 생성 race condition 차단)
CREATE UNIQUE INDEX "estimate_requests_one_draft_per_user"
ON "estimate_requests"("user_id")
WHERE "status" = 'DRAFT';
