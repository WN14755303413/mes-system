-- CreateTable
CREATE TABLE "bom" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "remark" TEXT,
    "change_reason" TEXT,
    "source_bom_id" TEXT,
    "released_at" TIMESTAMP(3),
    "released_by_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_item" (
    "id" TEXT NOT NULL,
    "bom_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "material_code" TEXT NOT NULL,
    "material_name" TEXT NOT NULL,
    "spec" TEXT,
    "unit" TEXT NOT NULL DEFAULT '件',
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "is_standard" BOOLEAN NOT NULL DEFAULT true,
    "remark" TEXT,
    "drawing_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bom_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drawing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bom_project_id_status_idx" ON "bom"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bom_project_id_version_key" ON "bom"("project_id", "version");

-- CreateIndex
CREATE INDEX "bom_item_bom_id_idx" ON "bom_item"("bom_id");

-- CreateIndex
CREATE INDEX "drawing_project_id_status_idx" ON "drawing"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "drawing_project_id_code_version_key" ON "drawing"("project_id", "code", "version");

-- AddForeignKey
ALTER TABLE "bom" ADD CONSTRAINT "bom_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom" ADD CONSTRAINT "bom_source_bom_id_fkey" FOREIGN KEY ("source_bom_id") REFERENCES "bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom" ADD CONSTRAINT "bom_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom" ADD CONSTRAINT "bom_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_item" ADD CONSTRAINT "bom_item_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_item" ADD CONSTRAINT "bom_item_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "drawing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing" ADD CONSTRAINT "drawing_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
