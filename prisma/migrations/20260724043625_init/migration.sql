-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('CUSTOMER', 'MOVER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('SEOUL', 'GYEONGGI', 'INCHEON', 'GANGWON', 'CHUNGBUK', 'CHUNGNAM', 'SEJONG', 'DAEJEON', 'JEONBUK', 'GWANGJU_JEONNAM', 'GYEONGBUK', 'DAEGU', 'ULSAN', 'GYEONGNAM', 'BUSAN', 'JEJU');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE', 'NAVER', 'KAKAO');

-- CreateEnum
CREATE TYPE "MoveType" AS ENUM ('SMALL', 'HOME', 'OFFICE');

-- CreateEnum
CREATE TYPE "EstimateRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_QUOTE_REQUEST_ARRIVED', 'NEW_DESIGNATED_QUOTE_REQUEST_ARRIVED', 'NEW_QUOTE_OFFER_ARRIVED', 'NEW_DESIGNATED_QUOTE_OFFER_ARRIVED', 'QUOTE_CONFIRMED', 'DESIGNATED_QUOTE_REJECTED', 'CUSTOMER_MOVE_DAY_REMINDER', 'MOVER_MOVE_DAY_REMINDER', 'REVIEW_REQUESTED', 'REVIEW_WRITTEN', 'COMMUNITY_COMMENT', 'SANCTION_NOTIFIED');

-- CreateEnum
CREATE TYPE "HistoryAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "ChatRoomType" AS ENUM ('GENERAL', 'DESIGNATED', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE');

-- CreateEnum
CREATE TYPE "UserReportCategory" AS ENUM ('INAPPROPRIATE_PROFILE', 'ABUSIVE_LANGUAGE');

-- CreateEnum
CREATE TYPE "UserReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UserReportTarget" AS ENUM ('USER', 'REVIEW', 'CHAT_ROOM', 'MESSAGE', 'ARTICLE', 'COMMENT');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET');

-- CreateEnum
CREATE TYPE "PostsCategory" AS ENUM ('MOVING_TIP', 'QUESTION', 'REVIEW', 'ETC', 'FURNITURE_SHARE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" VARCHAR(50) NOT NULL,
    "email" TEXT NOT NULL,
    "phone_number" VARCHAR(20),
    "profile_image_key" VARCHAR(500),
    "user_type" "UserType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_statuses" (
    "user_id" UUID NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspended_until" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),

    CONSTRAINT "user_statuses_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_account_id" TEXT,
    "password_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device" "DeviceType" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "region" "Region",
    "service" "MoveType"[] DEFAULT ARRAY[]::"MoveType"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mover_profiles" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "service" "MoveType"[] DEFAULT ARRAY[]::"MoveType"[],
    "career" INTEGER,
    "description" TEXT,
    "short_description" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mover_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mover_service_regions" (
    "id" SERIAL NOT NULL,
    "mover_profile_id" INTEGER NOT NULL,
    "region" "Region" NOT NULL,

    CONSTRAINT "mover_service_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_requests" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "move_type" "MoveType",
    "move_date" DATE,
    "departure_zip_code" TEXT,
    "departure_address" TEXT,
    "departure_detail_address" TEXT,
    "arrival_zip_code" TEXT,
    "arrival_address" TEXT,
    "arrival_detail_address" TEXT,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "total_steps" INTEGER NOT NULL DEFAULT 4,
    "status" "EstimateRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmed_quote_id" INTEGER,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimate_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_designated_movers" (
    "id" SERIAL NOT NULL,
    "estimate_id" INTEGER NOT NULL,
    "mover_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_designated_movers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" SERIAL NOT NULL,
    "estimate_request_id" INTEGER NOT NULL,
    "mover_id" UUID,
    "price" INTEGER,
    "comment" TEXT,
    "reject_reason" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "is_designated" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" SERIAL NOT NULL,
    "user_id" UUID,
    "mover_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" SERIAL NOT NULL,
    "user_id" UUID,
    "quote_id" INTEGER,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "receiver_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "histories" (
    "id" SERIAL NOT NULL,
    "user_id" UUID,
    "admin_user_id" INTEGER,
    "table_name" TEXT NOT NULL,
    "table_row_id" TEXT NOT NULL,
    "operation_type" "HistoryAction" NOT NULL,
    "before_data" JSONB,
    "after_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_rooms" (
    "id" SERIAL NOT NULL,
    "estimate_request_id" INTEGER,
    "quote_id" INTEGER,
    "designated_mover_id" INTEGER,
    "room_type" "ChatRoomType" NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_room_participants" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "participant_id" UUID NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "chat_room_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "message_type" "MessageType" NOT NULL,
    "is_filtered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_attachments" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "file_key" TEXT NOT NULL,
    "thumbnail_key" TEXT,
    "file_size" INTEGER NOT NULL,

    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_read_statuses" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "reader_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_read_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message_raw_logs" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "raw_content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_raw_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_refresh_tokens" (
    "id" SERIAL NOT NULL,
    "admin_id" INTEGER,
    "token_hash" TEXT,
    "device" "DeviceType" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reports" (
    "id" SERIAL NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target" "UserReportTarget" NOT NULL,
    "target_id" INTEGER NOT NULL,
    "category" "UserReportCategory" NOT NULL,
    "status" "UserReportStatus" NOT NULL DEFAULT 'PENDING',
    "admin_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "PostsCategory" NOT NULL,
    "region" "Region",
    "title" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "is_completed" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_images" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "image_key" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" INTEGER,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_nickname_key" ON "users"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_provider_account_id_key" ON "auth_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_user_id_provider_key" ON "auth_accounts"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_user_id_key" ON "customer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mover_profiles_user_id_key" ON "mover_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_requests_confirmed_quote_id_key" ON "estimate_requests"("confirmed_quote_id");

-- CreateIndex
CREATE INDEX "estimate_requests_user_id_status_idx" ON "estimate_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "estimate_requests_status_move_date_idx" ON "estimate_requests"("status", "move_date");

-- CreateIndex
CREATE INDEX "estimate_designated_movers_mover_id_idx" ON "estimate_designated_movers"("mover_id");

-- CreateIndex
CREATE UNIQUE INDEX "estimate_designated_movers_estimate_id_mover_id_key" ON "estimate_designated_movers"("estimate_id", "mover_id");

-- CreateIndex
CREATE INDEX "quotes_estimate_request_id_idx" ON "quotes"("estimate_request_id");

-- CreateIndex
CREATE INDEX "quotes_mover_id_status_idx" ON "quotes"("mover_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_estimate_request_id_mover_id_key" ON "quotes"("estimate_request_id", "mover_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_mover_id_key" ON "favorites"("user_id", "mover_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_user_id_quote_id_key" ON "reviews"("user_id", "quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_message_raw_logs_message_id_key" ON "chat_message_raw_logs"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_refresh_tokens_token_hash_key" ON "admin_refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "post_likes_post_id_user_id_key" ON "post_likes"("post_id", "user_id");

-- AddForeignKey
ALTER TABLE "user_statuses" ADD CONSTRAINT "user_statuses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mover_profiles" ADD CONSTRAINT "mover_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mover_service_regions" ADD CONSTRAINT "mover_service_regions_mover_profile_id_fkey" FOREIGN KEY ("mover_profile_id") REFERENCES "mover_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_requests" ADD CONSTRAINT "estimate_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_requests" ADD CONSTRAINT "estimate_requests_confirmed_quote_id_fkey" FOREIGN KEY ("confirmed_quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_designated_movers" ADD CONSTRAINT "estimate_designated_movers_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimate_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_designated_movers" ADD CONSTRAINT "estimate_designated_movers_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_estimate_request_id_fkey" FOREIGN KEY ("estimate_request_id") REFERENCES "estimate_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_mover_id_fkey" FOREIGN KEY ("mover_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "histories" ADD CONSTRAINT "histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "histories" ADD CONSTRAINT "histories_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_estimate_request_id_fkey" FOREIGN KEY ("estimate_request_id") REFERENCES "estimate_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_designated_mover_id_fkey" FOREIGN KEY ("designated_mover_id") REFERENCES "estimate_designated_movers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_room_participants" ADD CONSTRAINT "chat_room_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_room_participants" ADD CONSTRAINT "chat_room_participants_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_read_statuses" ADD CONSTRAINT "chat_read_statuses_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_read_statuses" ADD CONSTRAINT "chat_read_statuses_reader_id_fkey" FOREIGN KEY ("reader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_raw_logs" ADD CONSTRAINT "chat_message_raw_logs_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_refresh_tokens" ADD CONSTRAINT "admin_refresh_tokens_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
