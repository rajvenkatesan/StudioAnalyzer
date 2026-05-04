-- AlterTable PricingPlan: add planCategory, commitmentMonths, isPartial
ALTER TABLE "PricingPlan" ADD COLUMN "planCategory" TEXT;
ALTER TABLE "PricingPlan" ADD COLUMN "commitmentMonths" INTEGER;
ALTER TABLE "PricingPlan" ADD COLUMN "isPartial" BOOLEAN NOT NULL DEFAULT 0;
