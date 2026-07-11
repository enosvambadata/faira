-- CreateEnum
CREATE TYPE "FulfilmentRole" AS ENUM ('SELLER', 'HUB_AGENT', 'HUB_SUPERVISOR', 'TRANSPORT_OPERATOR', 'CUSTOMER_SUPPORT', 'FINANCE_ADMIN', 'OPERATIONS_ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "ParcelSizeTier" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE');

-- CreateEnum
CREATE TYPE "FeePayer" AS ENUM ('SELLER', 'BUYER');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'AWAITING_PAYMENT', 'AWAITING_DROPOFF', 'DROPOFF_OVERDUE', 'RECEIVED_AT_ORIGIN', 'REJECTED_AT_ORIGIN', 'INSPECTED', 'SEALED', 'AWAITING_DISPATCH', 'ASSIGNED_TO_RUN', 'DISPATCHED', 'IN_TRANSIT', 'DELAYED', 'RECEIVED_AT_DESTINATION', 'READY_FOR_COLLECTION', 'COLLECTION_OVERDUE', 'COLLECTED', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURNING_TO_SELLER', 'RETURNED_TO_SELLER', 'CANCELLED', 'LOST', 'DAMAGED', 'DISPUTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ParcelCondition" AS ENUM ('GOOD', 'DAMAGED', 'SUSPICIOUS');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('PARCEL_PHOTO', 'SEAL_PHOTO', 'PROOF_OF_COLLECTION', 'DAMAGE_PHOTO', 'RETURN_PHOTO');

-- CreateEnum
CREATE TYPE "TransportRunStatus" AS ENUM ('SCHEDULED', 'DEPARTED', 'ARRIVED', 'DELAYED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ManifestStatus" AS ENUM ('OPEN', 'FINALIZED', 'DEPARTED', 'ARRIVED', 'RECONCILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FulfilmentPaymentMethod" AS ENUM ('ECOCASH', 'ONEMONEY', 'ZIMSWITCH', 'CASH_ON_COLLECTION', 'CARD');

-- CreateEnum
CREATE TYPE "FulfilmentPaymentStatus" AS ENUM ('PENDING', 'AUTHORISED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'SETTLED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'RETURNING', 'RETURNED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FulfilmentDisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "fulfilment_user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "FulfilmentRole" NOT NULL,
    "hub_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_hubs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "opening_hours" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfilment_hubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_shipments" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "seller_id" UUID NOT NULL,
    "buyer_name" TEXT NOT NULL,
    "buyer_contact" TEXT NOT NULL,
    "origin_hub_id" UUID NOT NULL,
    "destination_hub_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "declared_value" DECIMAL(10,2) NOT NULL,
    "size_tier" "ParcelSizeTier" NOT NULL,
    "fee_payer" "FeePayer" NOT NULL,
    "delivery_fee" DECIMAL(10,2) NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "dropoff_deadline" TIMESTAMP(3),
    "collection_window_ends_at" TIMESTAMP(3),
    "weight_kg" DECIMAL(6,2),
    "dimensions" TEXT,
    "condition" "ParcelCondition",
    "qr_code_url" TEXT,
    "source_order_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfilment_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_tracking_events" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "from_status" "ShipmentStatus",
    "to_status" "ShipmentStatus" NOT NULL,
    "actor_user_id" UUID,
    "hub_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_parcel_evidence" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "image_url" TEXT NOT NULL,
    "captured_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_parcel_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_parcel_seals" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "seal_number" TEXT NOT NULL,
    "applied_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_parcel_seals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_transport_providers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_transport_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_transport_routes" (
    "id" UUID NOT NULL,
    "origin_hub_id" UUID NOT NULL,
    "destination_hub_id" UUID NOT NULL,
    "provider_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_transport_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_transport_runs" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "provider_id" UUID,
    "operator_user_id" UUID,
    "vehicle_reference" TEXT,
    "scheduled_departure" TIMESTAMP(3) NOT NULL,
    "scheduled_arrival" TIMESTAMP(3) NOT NULL,
    "actual_departure" TIMESTAMP(3),
    "actual_arrival" TIMESTAMP(3),
    "status" "TransportRunStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_transport_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_transport_manifests" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "status" "ManifestStatus" NOT NULL DEFAULT 'OPEN',
    "finalized_at" TIMESTAMP(3),
    "finalized_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_transport_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_manifest_parcels" (
    "id" UUID NOT NULL,
    "manifest_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "scanned_out_at" TIMESTAMP(3),
    "scanned_in_at" TIMESTAMP(3),
    "short_shipped" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_manifest_parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_payments" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "method" "FulfilmentPaymentMethod" NOT NULL,
    "status" "FulfilmentPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "provider_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "fulfilment_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_seller_settlements" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "gross_amount" DECIMAL(10,2) NOT NULL,
    "commission" DECIMAL(10,2) NOT NULL,
    "net_amount" DECIMAL(10,2) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),

    CONSTRAINT "fulfilment_seller_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_pricing_rules" (
    "id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "size_tier" "ParcelSizeTier" NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfilment_pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_collection_codes" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_collection_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_collection_events" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "verified_by_id" UUID NOT NULL,
    "id_check_performed" BOOLEAN NOT NULL DEFAULT false,
    "proof_image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_collection_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_return_requests" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "fulfilment_return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_return_events" (
    "id" UUID NOT NULL,
    "return_request_id" UUID NOT NULL,
    "status" "ReturnStatus" NOT NULL,
    "actor_user_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_return_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_disputes" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "raised_by_id" UUID,
    "reason" TEXT NOT NULL,
    "status" "FulfilmentDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "fulfilment_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_notification_templates" (
    "id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfilment_notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_notifications" (
    "id" UUID NOT NULL,
    "shipment_id" UUID,
    "template_id" UUID,
    "recipient" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilment_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_support_tickets" (
    "id" UUID NOT NULL,
    "shipment_id" UUID,
    "raised_by_id" UUID,
    "contact_info" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "fulfilment_support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfilment_system_configuration" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfilment_system_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fulfilment_user_roles_user_id_idx" ON "fulfilment_user_roles"("user_id");

-- CreateIndex
CREATE INDEX "fulfilment_user_roles_hub_id_idx" ON "fulfilment_user_roles"("hub_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_user_roles_user_id_role_hub_id_key" ON "fulfilment_user_roles"("user_id", "role", "hub_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_hubs_name_key" ON "fulfilment_hubs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_shipments_reference_key" ON "fulfilment_shipments"("reference");

-- CreateIndex
CREATE INDEX "fulfilment_shipments_seller_id_idx" ON "fulfilment_shipments"("seller_id");

-- CreateIndex
CREATE INDEX "fulfilment_shipments_status_idx" ON "fulfilment_shipments"("status");

-- CreateIndex
CREATE INDEX "fulfilment_shipments_origin_hub_id_idx" ON "fulfilment_shipments"("origin_hub_id");

-- CreateIndex
CREATE INDEX "fulfilment_shipments_destination_hub_id_idx" ON "fulfilment_shipments"("destination_hub_id");

-- CreateIndex
CREATE INDEX "fulfilment_tracking_events_shipment_id_idx" ON "fulfilment_tracking_events"("shipment_id");

-- CreateIndex
CREATE INDEX "fulfilment_tracking_events_to_status_idx" ON "fulfilment_tracking_events"("to_status");

-- CreateIndex
CREATE INDEX "fulfilment_parcel_evidence_shipment_id_idx" ON "fulfilment_parcel_evidence"("shipment_id");

-- CreateIndex
CREATE INDEX "fulfilment_parcel_seals_shipment_id_idx" ON "fulfilment_parcel_seals"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_transport_routes_origin_hub_id_destination_hub_i_key" ON "fulfilment_transport_routes"("origin_hub_id", "destination_hub_id");

-- CreateIndex
CREATE INDEX "fulfilment_transport_runs_route_id_idx" ON "fulfilment_transport_runs"("route_id");

-- CreateIndex
CREATE INDEX "fulfilment_transport_runs_status_idx" ON "fulfilment_transport_runs"("status");

-- CreateIndex
CREATE INDEX "fulfilment_transport_manifests_run_id_idx" ON "fulfilment_transport_manifests"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_manifest_parcels_shipment_id_key" ON "fulfilment_manifest_parcels"("shipment_id");

-- CreateIndex
CREATE INDEX "fulfilment_manifest_parcels_manifest_id_idx" ON "fulfilment_manifest_parcels"("manifest_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_payments_shipment_id_key" ON "fulfilment_payments"("shipment_id");

-- CreateIndex
CREATE INDEX "fulfilment_payments_status_idx" ON "fulfilment_payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_seller_settlements_shipment_id_key" ON "fulfilment_seller_settlements"("shipment_id");

-- CreateIndex
CREATE INDEX "fulfilment_seller_settlements_seller_id_idx" ON "fulfilment_seller_settlements"("seller_id");

-- CreateIndex
CREATE INDEX "fulfilment_seller_settlements_status_idx" ON "fulfilment_seller_settlements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_pricing_rules_route_id_size_tier_key" ON "fulfilment_pricing_rules"("route_id", "size_tier");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_collection_codes_shipment_id_key" ON "fulfilment_collection_codes"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_collection_events_shipment_id_key" ON "fulfilment_collection_events"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_return_requests_shipment_id_key" ON "fulfilment_return_requests"("shipment_id");

-- CreateIndex
CREATE INDEX "fulfilment_return_events_return_request_id_idx" ON "fulfilment_return_events"("return_request_id");

-- CreateIndex
CREATE INDEX "fulfilment_disputes_shipment_id_idx" ON "fulfilment_disputes"("shipment_id");

-- CreateIndex
CREATE INDEX "fulfilment_disputes_status_idx" ON "fulfilment_disputes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_notification_templates_event_channel_key" ON "fulfilment_notification_templates"("event", "channel");

-- CreateIndex
CREATE INDEX "fulfilment_notifications_shipment_id_idx" ON "fulfilment_notifications"("shipment_id");

-- CreateIndex
CREATE INDEX "fulfilment_notifications_status_idx" ON "fulfilment_notifications"("status");

-- CreateIndex
CREATE INDEX "fulfilment_support_tickets_status_idx" ON "fulfilment_support_tickets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_system_configuration_key_key" ON "fulfilment_system_configuration"("key");

-- AddForeignKey
ALTER TABLE "fulfilment_user_roles" ADD CONSTRAINT "fulfilment_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_user_roles" ADD CONSTRAINT "fulfilment_user_roles_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "fulfilment_hubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_shipments" ADD CONSTRAINT "fulfilment_shipments_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_shipments" ADD CONSTRAINT "fulfilment_shipments_origin_hub_id_fkey" FOREIGN KEY ("origin_hub_id") REFERENCES "fulfilment_hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_shipments" ADD CONSTRAINT "fulfilment_shipments_destination_hub_id_fkey" FOREIGN KEY ("destination_hub_id") REFERENCES "fulfilment_hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_tracking_events" ADD CONSTRAINT "fulfilment_tracking_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "fulfilment_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_tracking_events" ADD CONSTRAINT "fulfilment_tracking_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_tracking_events" ADD CONSTRAINT "fulfilment_tracking_events_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "fulfilment_hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_parcel_evidence" ADD CONSTRAINT "fulfilment_parcel_evidence_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "fulfilment_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_parcel_evidence" ADD CONSTRAINT "fulfilment_parcel_evidence_captured_by_id_fkey" FOREIGN KEY ("captured_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_parcel_seals" ADD CONSTRAINT "fulfilment_parcel_seals_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "fulfilment_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_parcel_seals" ADD CONSTRAINT "fulfilment_parcel_seals_applied_by_id_fkey" FOREIGN KEY ("applied_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_transport_routes" ADD CONSTRAINT "fulfilment_transport_routes_origin_hub_id_fkey" FOREIGN KEY ("origin_hub_id") REFERENCES "fulfilment_hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_transport_routes" ADD CONSTRAINT "fulfilment_transport_routes_destination_hub_id_fkey" FOREIGN KEY ("destination_hub_id") REFERENCES "fulfilment_hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_transport_routes" ADD CONSTRAINT "fulfilment_transport_routes_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "fulfilment_transport_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_transport_runs" ADD CONSTRAINT "fulfilment_transport_runs_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "fulfilment_transport_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_transport_runs" ADD CONSTRAINT "fulfilment_transport_runs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "fulfilment_transport_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_transport_runs" ADD CONSTRAINT "fulfilment_transport_runs_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_transport_manifests" ADD CONSTRAINT "fulfilment_transport_manifests_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "fulfilment_transport_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_transport_manifests" ADD CONSTRAINT "fulfilment_transport_manifests_finalized_by_id_fkey" FOREIGN KEY ("finalized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_manifest_parcels" ADD CONSTRAINT "fulfilment_manifest_parcels_manifest_id_fkey" FOREIGN KEY ("manifest_id") REFERENCES "fulfilment_transport_manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_manifest_parcels" ADD CONSTRAINT "fulfilment_manifest_parcels_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "fulfilment_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_payments" ADD CONSTRAINT "fulfilment_payments_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "fulfilment_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_seller_settlements" ADD CONSTRAINT "fulfilment_seller_settlements_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "fulfilment_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_seller_settlements" ADD CONSTRAINT "fulfilment_seller_settlements_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_pricing_rules" ADD CONSTRAINT "fulfilment_pricing_rules_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "fulfilment_transport_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_collection_codes" ADD CONSTRAINT "fulfilment_collection_codes_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "fulfilment_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_collection_events" ADD CONSTRAINT "fulfilment_collection_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "fulfilment_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_collection_events" ADD CONSTRAINT "fulfilment_collection_events_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_return_requests" ADD CONSTRAINT "fulfilment_return_requests_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "fulfilment_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_return_requests" ADD CONSTRAINT "fulfilment_return_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_return_events" ADD CONSTRAINT "fulfilment_return_events_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "fulfilment_return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_return_events" ADD CONSTRAINT "fulfilment_return_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_disputes" ADD CONSTRAINT "fulfilment_disputes_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "fulfilment_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_disputes" ADD CONSTRAINT "fulfilment_disputes_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_notifications" ADD CONSTRAINT "fulfilment_notifications_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "fulfilment_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_notifications" ADD CONSTRAINT "fulfilment_notifications_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "fulfilment_notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_support_tickets" ADD CONSTRAINT "fulfilment_support_tickets_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "fulfilment_shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfilment_support_tickets" ADD CONSTRAINT "fulfilment_support_tickets_raised_by_id_fkey" FOREIGN KEY ("raised_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

