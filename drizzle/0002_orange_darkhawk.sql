CREATE TABLE "acq_deal_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"role" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text,
	"title" text,
	"topic" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"metadata" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "acq_companies" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "acq_companies" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "acq_companies" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "acq_companies" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "acq_companies" ADD COLUMN "employee_count" integer;--> statement-breakpoint
ALTER TABLE "acq_companies" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "acq_companies" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "acq_contacts" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "acq_contacts" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "acq_contacts" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "acq_contacts" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "acq_contacts" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "acq_pipeline_stages" ADD COLUMN "parent_stage_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "active_thread_id" text;--> statement-breakpoint
ALTER TABLE "growth_ops_linkedin_accounts" ADD COLUMN "premium_contract_id" text;--> statement-breakpoint
ALTER TABLE "growth_ops_linkedin_accounts" ADD COLUMN "premium_features" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "thread_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "is_pivot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "pivot_confidence" real;--> statement-breakpoint
ALTER TABLE "acq_deal_contacts" ADD CONSTRAINT "acq_deal_contacts_deal_id_acq_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."acq_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acq_deal_contacts" ADD CONSTRAINT "acq_deal_contacts_contact_id_acq_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."acq_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_threads" ADD CONSTRAINT "conversation_threads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acq_pipeline_stages" ADD CONSTRAINT "acq_pipeline_stages_parent_stage_id_acq_pipeline_stages_id_fk" FOREIGN KEY ("parent_stage_id") REFERENCES "public"."acq_pipeline_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_conversation_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."conversation_threads"("id") ON DELETE set null ON UPDATE no action;