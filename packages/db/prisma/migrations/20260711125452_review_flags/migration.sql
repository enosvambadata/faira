-- CreateEnum
CREATE TYPE "ReviewFlagStatus" AS ENUM ('PENDING', 'DISMISSED', 'REMOVED');

-- CreateTable
CREATE TABLE "review_flags" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "flagged_by_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReviewFlagStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "review_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_flags_review_id_key" ON "review_flags"("review_id");

-- CreateIndex
CREATE INDEX "review_flags_status_idx" ON "review_flags"("status");

-- AddForeignKey
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_flagged_by_id_fkey" FOREIGN KEY ("flagged_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
