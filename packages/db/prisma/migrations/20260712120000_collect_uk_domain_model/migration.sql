-- CreateEnum
CREATE TYPE "CollectUkCompanyRoleType" AS ENUM ('COMPANY_ADMIN', 'DISPATCHER');

-- CreateEnum
CREATE TYPE "CollectUkDriverStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CollectUkParcelSizeTier" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE');

-- CreateEnum
CREATE TYPE "CollectUkBookingStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'DRIVER_ASSIGNED', 'EN_ROUTE', 'COLLECTED', 'UNABLE_TO_COLLECT', 'AT_WAREHOUSE', 'HANDED_OVER', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CollectUkRouteStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CollectUkStopStatus" AS ENUM ('PENDING', 'COLLECTED', 'UNABLE_TO_COLLECT');

-- CreateEnum
CREATE TYPE "CollectUkSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "collect_uk_companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "countries_served" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collect_uk_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collect_uk_company_warehouses" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "opening_hours" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collect_uk_company_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collect_uk_company_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "role" "CollectUkCompanyRoleType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collect_uk_company_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collect_uk_drivers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vehicle_reference" TEXT,
    "capacity_parcels" INTEGER NOT NULL DEFAULT 20,
    "status" "CollectUkDriverStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collect_uk_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collect_uk_collection_bookings" (
    "id" UUID NOT NULL,
    "reference" TEXT,
    "company_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "customer_user_id" UUID,
    "customer_name" TEXT NOT NULL,
    "customer_contact" TEXT NOT NULL,
    "collection_address" TEXT NOT NULL,
    "collection_postcode" TEXT NOT NULL,
    "preferred_date" TIMESTAMP(3) NOT NULL,
    "parcel_size_tier" "CollectUkParcelSizeTier" NOT NULL,
    "parcel_weight_kg" DECIMAL(6,2),
    "special_instructions" TEXT,
    "status" "CollectUkBookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collect_uk_collection_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collect_uk_collection_routes" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "route_date" DATE NOT NULL,
    "status" "CollectUkRouteStatus" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collect_uk_collection_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collect_uk_collection_stops" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "sequence_order" INTEGER NOT NULL,
    "status" "CollectUkStopStatus" NOT NULL DEFAULT 'PENDING',
    "proof_photo_url" TEXT,
    "signature_url" TEXT,
    "failure_reason" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collect_uk_collection_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collect_uk_subscriptions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "status" "CollectUkSubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "plan_name" TEXT NOT NULL,
    "provider_reference" TEXT,
    "current_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collect_uk_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collect_uk_companies_slug_key" ON "collect_uk_companies"("slug");

-- CreateIndex
CREATE INDEX "collect_uk_company_warehouses_company_id_idx" ON "collect_uk_company_warehouses"("company_id");

-- CreateIndex
CREATE INDEX "collect_uk_company_roles_user_id_idx" ON "collect_uk_company_roles"("user_id");

-- CreateIndex
CREATE INDEX "collect_uk_company_roles_company_id_idx" ON "collect_uk_company_roles"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "collect_uk_company_roles_user_id_company_id_role_key" ON "collect_uk_company_roles"("user_id", "company_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "collect_uk_drivers_user_id_key" ON "collect_uk_drivers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "collect_uk_collection_bookings_reference_key" ON "collect_uk_collection_bookings"("reference");

-- CreateIndex
CREATE INDEX "collect_uk_collection_bookings_company_id_idx" ON "collect_uk_collection_bookings"("company_id");

-- CreateIndex
CREATE INDEX "collect_uk_collection_bookings_status_idx" ON "collect_uk_collection_bookings"("status");

-- CreateIndex
CREATE INDEX "collect_uk_collection_routes_driver_id_idx" ON "collect_uk_collection_routes"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "collect_uk_collection_stops_booking_id_key" ON "collect_uk_collection_stops"("booking_id");

-- CreateIndex
CREATE INDEX "collect_uk_collection_stops_route_id_idx" ON "collect_uk_collection_stops"("route_id");

-- CreateIndex
CREATE UNIQUE INDEX "collect_uk_subscriptions_company_id_key" ON "collect_uk_subscriptions"("company_id");

-- AddForeignKey
ALTER TABLE "collect_uk_company_warehouses" ADD CONSTRAINT "collect_uk_company_warehouses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "collect_uk_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_company_roles" ADD CONSTRAINT "collect_uk_company_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_company_roles" ADD CONSTRAINT "collect_uk_company_roles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "collect_uk_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_drivers" ADD CONSTRAINT "collect_uk_drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_collection_bookings" ADD CONSTRAINT "collect_uk_collection_bookings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "collect_uk_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_collection_bookings" ADD CONSTRAINT "collect_uk_collection_bookings_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "collect_uk_company_warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_collection_bookings" ADD CONSTRAINT "collect_uk_collection_bookings_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_collection_routes" ADD CONSTRAINT "collect_uk_collection_routes_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "collect_uk_drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_collection_stops" ADD CONSTRAINT "collect_uk_collection_stops_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "collect_uk_collection_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_collection_stops" ADD CONSTRAINT "collect_uk_collection_stops_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "collect_uk_collection_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_collection_stops" ADD CONSTRAINT "collect_uk_collection_stops_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "collect_uk_drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collect_uk_subscriptions" ADD CONSTRAINT "collect_uk_subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "collect_uk_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

