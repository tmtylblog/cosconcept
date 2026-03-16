-- Migration 0017: Add offering type, skills, and industries to firm_services
-- Services = broad categories (Brand, Marketing)
-- Solutions = specific named offerings (Market Readiness Scan, Performance Audit)

--> statement-breakpoint
ALTER TABLE "firm_services" ADD COLUMN IF NOT EXISTS "offering_type" text DEFAULT 'service';
--> statement-breakpoint
ALTER TABLE "firm_services" ADD COLUMN IF NOT EXISTS "skills" jsonb DEFAULT '[]';
--> statement-breakpoint
ALTER TABLE "firm_services" ADD COLUMN IF NOT EXISTS "industries" jsonb DEFAULT '[]';
