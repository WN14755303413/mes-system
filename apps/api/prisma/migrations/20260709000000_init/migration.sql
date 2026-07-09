-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "mes";

-- CreateTable
CREATE TABLE "sys_dept" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parent_id" TEXT,
    "path" TEXT NOT NULL DEFAULT '/',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_dept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_user" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMP(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" TEXT,
    "dingtalk_userid" TEXT,
    "dept_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sys_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "remark" TEXT,
    "data_scope" TEXT NOT NULL DEFAULT 'SELF_ONLY',
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_user_role" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "sys_user_role_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "sys_role_permission" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "sys_role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "sys_refresh_token" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_password_reset_request" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ip" TEXT,
    "user_agent" TEXT,
    "handled_by" TEXT,
    "handled_at" TIMESTAMP(3),
    "handle_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_password_reset_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_login_attempt" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_login_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_audit_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "changes" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_msg" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_integration_log" (
    "id" TEXT NOT NULL,
    "interface_name" TEXT NOT NULL,
    "source_system" TEXT NOT NULL,
    "target_system" TEXT NOT NULL,
    "request_summary" JSONB,
    "response_summary" JSONB,
    "success" BOOLEAN NOT NULL,
    "error_msg" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "needs_attention" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "triggered_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sys_integration_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_code_sequence" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_code_sequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sys_dept_code_key" ON "sys_dept"("code");

-- CreateIndex
CREATE INDEX "sys_dept_parent_id_idx" ON "sys_dept"("parent_id");

-- CreateIndex
CREATE INDEX "sys_dept_path_idx" ON "sys_dept"("path");

-- CreateIndex
CREATE UNIQUE INDEX "sys_user_username_key" ON "sys_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sys_user_email_key" ON "sys_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sys_user_dingtalk_userid_key" ON "sys_user"("dingtalk_userid");

-- CreateIndex
CREATE INDEX "sys_user_dept_id_idx" ON "sys_user"("dept_id");

-- CreateIndex
CREATE INDEX "sys_user_status_idx" ON "sys_user"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sys_role_code_key" ON "sys_role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sys_permission_code_key" ON "sys_permission"("code");

-- CreateIndex
CREATE INDEX "sys_permission_module_idx" ON "sys_permission"("module");

-- CreateIndex
CREATE UNIQUE INDEX "sys_refresh_token_token_hash_key" ON "sys_refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "sys_refresh_token_user_id_idx" ON "sys_refresh_token"("user_id");

-- CreateIndex
CREATE INDEX "sys_refresh_token_family_id_idx" ON "sys_refresh_token"("family_id");

-- CreateIndex
CREATE INDEX "sys_refresh_token_expires_at_idx" ON "sys_refresh_token"("expires_at");

-- CreateIndex
CREATE INDEX "sys_password_reset_request_status_created_at_idx" ON "sys_password_reset_request"("status", "created_at");

-- CreateIndex
CREATE INDEX "sys_password_reset_request_username_idx" ON "sys_password_reset_request"("username");

-- CreateIndex
CREATE INDEX "sys_login_attempt_username_created_at_idx" ON "sys_login_attempt"("username", "created_at");

-- CreateIndex
CREATE INDEX "sys_login_attempt_ip_created_at_idx" ON "sys_login_attempt"("ip", "created_at");

-- CreateIndex
CREATE INDEX "sys_audit_log_user_id_created_at_idx" ON "sys_audit_log"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "sys_audit_log_action_created_at_idx" ON "sys_audit_log"("action", "created_at");

-- CreateIndex
CREATE INDEX "sys_audit_log_target_type_target_id_idx" ON "sys_audit_log"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "sys_integration_log_interface_name_created_at_idx" ON "sys_integration_log"("interface_name", "created_at");

-- CreateIndex
CREATE INDEX "sys_integration_log_success_needs_attention_idx" ON "sys_integration_log"("success", "needs_attention");

-- CreateIndex
CREATE UNIQUE INDEX "sys_code_sequence_scope_key" ON "sys_code_sequence"("scope");

-- AddForeignKey
ALTER TABLE "sys_dept" ADD CONSTRAINT "sys_dept_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "sys_dept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_user" ADD CONSTRAINT "sys_user_dept_id_fkey" FOREIGN KEY ("dept_id") REFERENCES "sys_dept"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_user_role" ADD CONSTRAINT "sys_user_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_user_role" ADD CONSTRAINT "sys_user_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "sys_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_role_permission" ADD CONSTRAINT "sys_role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "sys_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_role_permission" ADD CONSTRAINT "sys_role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "sys_permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_refresh_token" ADD CONSTRAINT "sys_refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sys_audit_log" ADD CONSTRAINT "sys_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

