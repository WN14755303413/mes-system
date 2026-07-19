-- CreateTable
CREATE TABLE "debug_record" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "project_id" TEXT NOT NULL,
    "equipment_no" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "executor_id" TEXT,
    "debug_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_by_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debug_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debug_param" (
    "id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "standard" TEXT,
    "actual" TEXT,
    "unit" TEXT,
    "passed" BOOLEAN,
    "remark" TEXT,

    CONSTRAINT "debug_param_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debug_issue" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "stage" TEXT NOT NULL DEFAULT 'DEBUG',
    "project_id" TEXT NOT NULL,
    "record_id" TEXT,
    "equipment_no" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "solution" TEXT,
    "reporter_id" TEXT,
    "handler_id" TEXT,
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debug_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debug_issue_action" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "operator_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debug_issue_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debug_acceptance" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "project_id" TEXT NOT NULL,
    "equipment_no" TEXT,
    "title" TEXT NOT NULL,
    "planned_at" TIMESTAMP(3),
    "location" TEXT,
    "customer_rep" TEXT,
    "conclusion" TEXT,
    "created_by_id" TEXT,
    "concluded_by_id" TEXT,
    "concluded_at" TIMESTAMP(3),
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debug_acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debug_acceptance_item" (
    "id" TEXT NOT NULL,
    "acceptance_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "standard" TEXT,
    "actual" TEXT,
    "passed" BOOLEAN,
    "remark" TEXT,

    CONSTRAINT "debug_acceptance_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "debug_record_code_key" ON "debug_record"("code");

-- CreateIndex
CREATE INDEX "debug_record_project_id_status_idx" ON "debug_record"("project_id", "status");

-- CreateIndex
CREATE INDEX "debug_record_type_status_idx" ON "debug_record"("type", "status");

-- CreateIndex
CREATE INDEX "debug_record_executor_id_idx" ON "debug_record"("executor_id");

-- CreateIndex
CREATE INDEX "debug_param_record_id_idx" ON "debug_param"("record_id");

-- CreateIndex
CREATE UNIQUE INDEX "debug_issue_code_key" ON "debug_issue"("code");

-- CreateIndex
CREATE INDEX "debug_issue_project_id_status_idx" ON "debug_issue"("project_id", "status");

-- CreateIndex
CREATE INDEX "debug_issue_record_id_idx" ON "debug_issue"("record_id");

-- CreateIndex
CREATE INDEX "debug_issue_stage_status_idx" ON "debug_issue"("stage", "status");

-- CreateIndex
CREATE INDEX "debug_issue_handler_id_status_idx" ON "debug_issue"("handler_id", "status");

-- CreateIndex
CREATE INDEX "debug_issue_reporter_id_idx" ON "debug_issue"("reporter_id");

-- CreateIndex
CREATE INDEX "debug_issue_action_issue_id_created_at_idx" ON "debug_issue_action"("issue_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "debug_acceptance_code_key" ON "debug_acceptance"("code");

-- CreateIndex
CREATE INDEX "debug_acceptance_project_id_status_idx" ON "debug_acceptance"("project_id", "status");

-- CreateIndex
CREATE INDEX "debug_acceptance_type_status_idx" ON "debug_acceptance"("type", "status");

-- CreateIndex
CREATE INDEX "debug_acceptance_item_acceptance_id_idx" ON "debug_acceptance_item"("acceptance_id");

-- AddForeignKey
ALTER TABLE "debug_record" ADD CONSTRAINT "debug_record_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_record" ADD CONSTRAINT "debug_record_executor_id_fkey" FOREIGN KEY ("executor_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_record" ADD CONSTRAINT "debug_record_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_param" ADD CONSTRAINT "debug_param_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "debug_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_issue" ADD CONSTRAINT "debug_issue_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_issue" ADD CONSTRAINT "debug_issue_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "debug_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_issue" ADD CONSTRAINT "debug_issue_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_issue" ADD CONSTRAINT "debug_issue_handler_id_fkey" FOREIGN KEY ("handler_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_issue" ADD CONSTRAINT "debug_issue_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_issue_action" ADD CONSTRAINT "debug_issue_action_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "debug_issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_issue_action" ADD CONSTRAINT "debug_issue_action_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_acceptance" ADD CONSTRAINT "debug_acceptance_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_acceptance" ADD CONSTRAINT "debug_acceptance_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_acceptance" ADD CONSTRAINT "debug_acceptance_concluded_by_id_fkey" FOREIGN KEY ("concluded_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debug_acceptance_item" ADD CONSTRAINT "debug_acceptance_item_acceptance_id_fkey" FOREIGN KEY ("acceptance_id") REFERENCES "debug_acceptance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
