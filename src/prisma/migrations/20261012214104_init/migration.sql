-- CreateTable
CREATE TABLE "brands" (
    "brand_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("brand_id")
);

-- CreateTable
CREATE TABLE "purchase_events" (
    "event_id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "customer_type" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "order_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "purchase_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "customer_cohorts" (
    "brand_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "first_order_date" DATE NOT NULL,
    "acquisition_cohort" DATE NOT NULL,

    CONSTRAINT "customer_cohorts_pkey" PRIMARY KEY ("brand_id","user_id")
);

-- CreateTable
CREATE TABLE "customer_monthly_revenue" (
    "brand_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "transaction_month" DATE NOT NULL,
    "total_revenue" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "customer_monthly_revenue_pkey" PRIMARY KEY ("brand_id","user_id","transaction_month")
);

-- CreateTable
CREATE TABLE "cohort_ltv" (
    "brand_id" TEXT NOT NULL,
    "acquisition_cohort" DATE NOT NULL,
    "month_gap" INTEGER NOT NULL,
    "total_revenue" DECIMAL(16,2) NOT NULL,

    CONSTRAINT "cohort_ltv_pkey" PRIMARY KEY ("brand_id","acquisition_cohort","month_gap")
);

-- CreateIndex
CREATE INDEX "purchase_events_brand_id_user_id_idx" ON "purchase_events"("brand_id", "user_id");

-- CreateIndex
CREATE INDEX "customer_cohorts_brand_id_acquisition_cohort_idx" ON "customer_cohorts"("brand_id", "acquisition_cohort");
