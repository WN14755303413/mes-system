-- CreateTable
CREATE TABLE "prod_work_order" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "craft" TEXT NOT NULL DEFAULT 'MECH',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "plan_start_at" TIMESTAMP(3),
    "plan_end_at" TIMESTAMP(3),
    "actual_start_at" TIMESTAMP(3),
    "actual_end_at" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "wbs_task_id" TEXT,
    "created_by_id" TEXT,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prod_work_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prod_task" (
    "id" TEXT NOT NULL,
    "work_order_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "assignee_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "plan_start_at" TIMESTAMP(3),
    "plan_end_at" TIMESTAMP(3),
    "actual_start_at" TIMESTAMP(3),
    "actual_end_at" TIMESTAMP(3),
    "standard_hours" DECIMAL(7,1),
    "actual_hours" DECIMAL(8,1) NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "drawing_id" TEXT,
    "requirement" TEXT,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prod_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prod_work_report" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "hours" DECIMAL(6,1) NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL,
    "note" TEXT,
    "reporter_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prod_work_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prod_exception" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "work_order_id" TEXT,
    "task_id" TEXT,
    "material_code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reporter_id" TEXT,
    "handler_id" TEXT,
    "handle_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prod_exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_attachment" (
    "id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prod_work_order_code_key" ON "prod_work_order"("code");

-- CreateIndex
CREATE INDEX "prod_work_order_project_id_status_idx" ON "prod_work_order"("project_id", "status");

-- CreateIndex
CREATE INDEX "prod_work_order_status_idx" ON "prod_work_order"("status");

-- CreateIndex
CREATE INDEX "prod_task_work_order_id_idx" ON "prod_task"("work_order_id");

-- CreateIndex
CREATE INDEX "prod_task_assignee_id_status_idx" ON "prod_task"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "prod_work_report_task_id_created_at_idx" ON "prod_work_report"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "prod_work_report_reporter_id_created_at_idx" ON "prod_work_report"("reporter_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "prod_exception_code_key" ON "prod_exception"("code");

-- CreateIndex
CREATE INDEX "prod_exception_project_id_status_idx" ON "prod_exception"("project_id", "status");

-- CreateIndex
CREATE INDEX "prod_exception_handler_id_status_idx" ON "prod_exception"("handler_id", "status");

-- CreateIndex
CREATE INDEX "prod_exception_reporter_id_idx" ON "prod_exception"("reporter_id");

-- CreateIndex
CREATE INDEX "sys_attachment_target_type_target_id_idx" ON "sys_attachment"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "prod_work_order" ADD CONSTRAINT "prod_work_order_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_work_order" ADD CONSTRAINT "prod_work_order_wbs_task_id_fkey" FOREIGN KEY ("wbs_task_id") REFERENCES "project_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_work_order" ADD CONSTRAINT "prod_work_order_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_task" ADD CONSTRAINT "prod_task_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "prod_work_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_task" ADD CONSTRAINT "prod_task_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_task" ADD CONSTRAINT "prod_task_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "drawing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_work_report" ADD CONSTRAINT "prod_work_report_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "prod_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_work_report" ADD CONSTRAINT "prod_work_report_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_exception" ADD CONSTRAINT "prod_exception_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_exception" ADD CONSTRAINT "prod_exception_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "prod_work_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_exception" ADD CONSTRAINT "prod_exception_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "prod_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_exception" ADD CONSTRAINT "prod_exception_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_exception" ADD CONSTRAINT "prod_exception_handler_id_fkey" FOREIGN KEY ("handler_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prod_exception" ADD CONSTRAINT "prod_exception_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_attachment" ADD CONSTRAINT "sys_attachment_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
