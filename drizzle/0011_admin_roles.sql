CREATE TABLE IF NOT EXISTS "admin_roles" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "icon" text,
  "color" text,
  "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_built_in" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Seed built-in roles
INSERT INTO "admin_roles" ("id", "slug", "name", "description", "icon", "color", "permissions", "is_built_in")
VALUES
  ('role_superadmin', 'superadmin', 'Super Admin', 'Full platform access — all admin sections', 'Crown', 'cos-ember', '["overview","knowledge_graph","platform","operations","matching","growth_ops","customer_success","tools"]', true),
  ('role_admin', 'admin', 'Admin', 'Platform and operations management', 'Shield', 'cos-electric', '["overview","platform","operations","matching"]', true),
  ('role_growth_ops', 'growth_ops', 'Growth Ops', 'LinkedIn inbox, campaigns, target lists, attribution', 'TrendingUp', 'cos-signal', '["overview","growth_ops"]', true),
  ('role_customer_success', 'customer_success', 'Customer Success', 'CIO dashboard and customer health tracking', 'HeartHandshake', 'cos-warm', '["overview","customer_success"]', true)
ON CONFLICT ("slug") DO NOTHING;
