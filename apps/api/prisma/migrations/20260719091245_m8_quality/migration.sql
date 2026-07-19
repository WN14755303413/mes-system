-- CreateTable
CREATE TABLE "qc_inspection" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "project_id" TEXT,
    "work_order_id" TEXT,
    "task_id" TEXT,
    "arrival_id" TEXT,
    "material_code" TEXT,
    "batch_no" TEXT,
    "supplier_name" TEXT,
    "title" TEXT NOT NULL,
    "inspector_id" TEXT,
    "judged_by_id" TEXT,
    "judged_at" TIMESTAMP(3),
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qc_inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_inspection_item" (
    "id" TEXT NOT NULL,
    "inspection_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "standard" TEXT,
    "actual" TEXT,
    "passed" BOOLEAN,
    "remark" TEXT,

    CONSTRAINT "qc_inspection_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_issue" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "inspection_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "project_id" TEXT,
    "work_order_id" TEXT,
    "task_id" TEXT,
    "material_code" TEXT,
    "batch_no" TEXT,
    "supplier_name" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "containment_action" TEXT,
    "root_cause" TEXT,
    "corrective_action" TEXT,
    "preventive_action" TEXT,
    "disposition" TEXT,
    "reporter_id" TEXT,
    "handler_id" TEXT,
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qc_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_issue_action" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "operator_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qc_issue_action_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qc_inspection_code_key" ON "qc_inspection"("code");

-- CreateIndex
CREATE INDEX "qc_inspection_type_status_idx" ON "qc_inspection"("type", "status");

-- CreateIndex
CREATE INDEX "qc_inspection_project_id_status_idx" ON "qc_inspection"("project_id", "status");

-- CreateIndex
CREATE INDEX "qc_inspection_work_order_id_idx" ON "qc_inspection"("work_order_id");

-- CreateIndex
CREATE INDEX "qc_inspection_material_code_idx" ON "qc_inspection"("material_code");

-- CreateIndex
CREATE INDEX "qc_inspection_item_inspection_id_idx" ON "qc_inspection_item"("inspection_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_issue_code_key" ON "qc_issue"("code");

-- CreateIndex
CREATE INDEX "qc_issue_status_severity_idx" ON "qc_issue"("status", "severity");

-- CreateIndex
CREATE INDEX "qc_issue_project_id_status_idx" ON "qc_issue"("project_id", "status");

-- CreateIndex
CREATE INDEX "qc_issue_handler_id_status_idx" ON "qc_issue"("handler_id", "status");

-- CreateIndex
CREATE INDEX "qc_issue_reporter_id_idx" ON "qc_issue"("reporter_id");

-- CreateIndex
CREATE INDEX "qc_issue_inspection_id_idx" ON "qc_issue"("inspection_id");

-- CreateIndex
CREATE INDEX "qc_issue_action_issue_id_created_at_idx" ON "qc_issue_action"("issue_id", "created_at");

-- AddForeignKey
ALTER TABLE "qc_inspection" ADD CONSTRAINT "qc_inspection_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspection" ADD CONSTRAINT "qc_inspection_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "prod_work_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspection" ADD CONSTRAINT "qc_inspection_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "prod_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspection" ADD CONSTRAINT "qc_inspection_arrival_id_fkey" FOREIGN KEY ("arrival_id") REFERENCES "supply_arrival"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspection" ADD CONSTRAINT "qc_inspection_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspection" ADD CONSTRAINT "qc_inspection_judged_by_id_fkey" FOREIGN KEY ("judged_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspection_item" ADD CONSTRAINT "qc_inspection_item_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "qc_inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_issue" ADD CONSTRAINT "qc_issue_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "qc_inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_issue" ADD CONSTRAINT "qc_issue_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_issue" ADD CONSTRAINT "qc_issue_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "prod_work_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_issue" ADD CONSTRAINT "qc_issue_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "prod_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_issue" ADD CONSTRAINT "qc_issue_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_issue" ADD CONSTRAINT "qc_issue_handler_id_fkey" FOREIGN KEY ("handler_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_issue" ADD CONSTRAINT "qc_issue_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_issue_action" ADD CONSTRAINT "qc_issue_action_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "qc_issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_issue_action" ADD CONSTRAINT "qc_issue_action_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
