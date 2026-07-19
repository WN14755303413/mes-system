-- AlterTable
ALTER TABLE "sys_integration_log" ADD COLUMN     "action" TEXT,
ADD COLUMN     "payload" JSONB;
