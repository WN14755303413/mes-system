-- CreateTable
CREATE TABLE "sys_feedback" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MINOR',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "page_path" TEXT,
    "page_title" TEXT,
    "client_info" TEXT,
    "submitter_id" TEXT NOT NULL,
    "handler_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_feedback_action" (
    "id" TEXT NOT NULL,
    "feedback_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "operator_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_feedback_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sys_feedback_code_key" ON "sys_feedback"("code");

-- CreateIndex
CREATE INDEX "sys_feedback_status_created_at_idx" ON "sys_feedback"("status", "created_at");

-- CreateIndex
CREATE INDEX "sys_feedback_submitter_id_status_idx" ON "sys_feedback"("submitter_id", "status");

-- CreateIndex
CREATE INDEX "sys_feedback_handler_id_idx" ON "sys_feedback"("handler_id");

-- CreateIndex
CREATE INDEX "sys_feedback_action_feedback_id_created_at_idx" ON "sys_feedback_action"("feedback_id", "created_at");

-- CreateIndex
CREATE INDEX "sys_notification_user_id_read_at_idx" ON "sys_notification"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "sys_notification_user_id_created_at_idx" ON "sys_notification"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "sys_feedback" ADD CONSTRAINT "sys_feedback_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "sys_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_feedback" ADD CONSTRAINT "sys_feedback_handler_id_fkey" FOREIGN KEY ("handler_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_feedback_action" ADD CONSTRAINT "sys_feedback_action_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "sys_feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_feedback_action" ADD CONSTRAINT "sys_feedback_action_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_notification" ADD CONSTRAINT "sys_notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
