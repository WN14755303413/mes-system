-- CreateTable
CREATE TABLE "mat_material" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "unit" TEXT NOT NULL DEFAULT '件',
    "category" TEXT,
    "is_standard" BOOLEAN NOT NULL DEFAULT true,
    "is_long_lead" BOOLEAN NOT NULL DEFAULT false,
    "lead_time_days" INTEGER,
    "sync_source" TEXT NOT NULL DEFAULT 'MANUAL',
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mat_material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_purchase_order" (
    "id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "supplier_name" TEXT,
    "order_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "sync_source" TEXT NOT NULL DEFAULT 'IMPORT',
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_purchase_order_item" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "material_code" TEXT NOT NULL,
    "material_name" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "arrived_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "expected_date" TIMESTAMP(3),
    "project_id" TEXT,
    "risk_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_purchase_order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_arrival" (
    "id" TEXT NOT NULL,
    "po_item_id" TEXT,
    "material_code" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ARRIVED',
    "arrived_at" TIMESTAMP(3) NOT NULL,
    "project_id" TEXT,
    "sync_source" TEXT NOT NULL DEFAULT 'IMPORT',
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_arrival_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_stock" (
    "id" TEXT NOT NULL,
    "material_code" TEXT NOT NULL,
    "project_id" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "available_quantity" DECIMAL(12,3) NOT NULL,
    "sync_source" TEXT NOT NULL DEFAULT 'IMPORT',
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supply_requisition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "material_code" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ISSUE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requested_by_id" TEXT,
    "confirmed_by_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supply_requisition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mat_material_code_key" ON "mat_material"("code");

-- CreateIndex
CREATE INDEX "mat_material_enabled_idx" ON "mat_material"("enabled");

-- CreateIndex
CREATE INDEX "mat_material_is_long_lead_idx" ON "mat_material"("is_long_lead");

-- CreateIndex
CREATE UNIQUE INDEX "supply_purchase_order_order_no_key" ON "supply_purchase_order"("order_no");

-- CreateIndex
CREATE INDEX "supply_purchase_order_status_idx" ON "supply_purchase_order"("status");

-- CreateIndex
CREATE INDEX "supply_purchase_order_item_order_id_idx" ON "supply_purchase_order_item"("order_id");

-- CreateIndex
CREATE INDEX "supply_purchase_order_item_material_code_idx" ON "supply_purchase_order_item"("material_code");

-- CreateIndex
CREATE INDEX "supply_purchase_order_item_project_id_idx" ON "supply_purchase_order_item"("project_id");

-- CreateIndex
CREATE INDEX "supply_arrival_material_code_idx" ON "supply_arrival"("material_code");

-- CreateIndex
CREATE INDEX "supply_arrival_project_id_idx" ON "supply_arrival"("project_id");

-- CreateIndex
CREATE INDEX "supply_arrival_type_idx" ON "supply_arrival"("type");

-- CreateIndex
CREATE INDEX "supply_stock_project_id_idx" ON "supply_stock"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "supply_stock_material_code_project_id_key" ON "supply_stock"("material_code", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "supply_requisition_code_key" ON "supply_requisition"("code");

-- CreateIndex
CREATE INDEX "supply_requisition_project_id_status_idx" ON "supply_requisition"("project_id", "status");

-- CreateIndex
CREATE INDEX "supply_requisition_material_code_idx" ON "supply_requisition"("material_code");

-- AddForeignKey
ALTER TABLE "supply_purchase_order_item" ADD CONSTRAINT "supply_purchase_order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "supply_purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_purchase_order_item" ADD CONSTRAINT "supply_purchase_order_item_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_arrival" ADD CONSTRAINT "supply_arrival_po_item_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "supply_purchase_order_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_arrival" ADD CONSTRAINT "supply_arrival_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_stock" ADD CONSTRAINT "supply_stock_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_requisition" ADD CONSTRAINT "supply_requisition_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_requisition" ADD CONSTRAINT "supply_requisition_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supply_requisition" ADD CONSTRAINT "supply_requisition_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "sys_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
