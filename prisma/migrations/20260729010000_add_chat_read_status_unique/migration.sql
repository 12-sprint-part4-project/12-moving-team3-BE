-- CreateIndex
CREATE UNIQUE INDEX "chat_read_statuses_message_id_reader_id_key" ON "chat_read_statuses"("message_id", "reader_id");
