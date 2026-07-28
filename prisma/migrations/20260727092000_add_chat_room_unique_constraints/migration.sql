-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_quote_id_key" ON "chat_rooms"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_designated_mover_id_key" ON "chat_rooms"("designated_mover_id");
