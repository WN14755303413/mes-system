-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customer_name" TEXT,
    "contract_no" TEXT,
    "project_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "risk_level" TEXT NOT NULL DEFAULT 'LOW',
    "equipment_count" INTEGER NOT NULL DEFAULT 1,
    "manager_id" TEXT,
    "plan_start_at" TIMESTAMP(3),
    "plan_end_at" TIMESTAMP(3),
    "actual_end_at" TIMESTAMP(3),
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_milestone" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan_date" TIMESTAMP(3),
    "actual_date" TIMESTAMP(3),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_task" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "path" TEXT NOT NULL DEFAULT '/',
    "name" TEXT NOT NULL,
    "owner_id" TEXT,
    "plan_start_at" TIMESTAMP(3),
    "plan_end_at" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_risk" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'MEDIUM',
    "mitigation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "owner_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_issue" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "owner_id" TEXT,
    "due_date" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_member" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_in_project" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_member_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_code_key" ON "project"("code");

-- CreateIndex
CREATE INDEX "project_status_idx" ON "project"("status");

-- CreateIndex
CREATE INDEX "project_manager_id_idx" ON "project"("manager_id");

-- CreateIndex
CREATE INDEX "project_milestone_project_id_idx" ON "project_milestone"("project_id");

-- CreateIndex
CREATE INDEX "project_task_project_id_idx" ON "project_task"("project_id");

-- CreateIndex
CREATE INDEX "project_task_parent_id_idx" ON "project_task"("parent_id");

-- CreateIndex
CREATE INDEX "project_task_path_idx" ON "project_task"("path");

-- CreateIndex
CREATE INDEX "project_risk_project_id_idx" ON "project_risk"("project_id");

-- CreateIndex
CREATE INDEX "project_risk_status_idx" ON "project_risk"("status");

-- CreateIndex
CREATE INDEX "project_issue_project_id_idx" ON "project_issue"("project_id");

-- CreateIndex
CREATE INDEX "project_issue_status_idx" ON "project_issue"("status");

-- CreateIndex
CREATE INDEX "project_member_user_id_idx" ON "project_member"("user_id");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "project_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_task" ADD CONSTRAINT "project_task_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_risk" ADD CONSTRAINT "project_risk_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_risk" ADD CONSTRAINT "project_risk_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_issue" ADD CONSTRAINT "project_issue_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_issue" ADD CONSTRAINT "project_issue_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
