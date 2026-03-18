CREATE TABLE IF NOT EXISTS "conversation_threads" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organization_id" text REFERENCES "organizations"("id") ON DELETE CASCADE,
  "title" text,
  "topic" text NOT NULL DEFAULT 'general',
  "status" text NOT NULL DEFAULT 'active',
  "message_count" integer NOT NULL DEFAULT 0,
  "last_message_at" timestamp DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "thread_id" text REFERENCES "conversation_threads"("id") ON DELETE SET NULL;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "is_pivot" boolean NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "pivot_confidence" real;

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "active_thread_id" text;

CREATE INDEX IF NOT EXISTS "idx_conv_threads_conv" ON "conversation_threads"("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_conv_threads_user" ON "conversation_threads"("user_id");
CREATE INDEX IF NOT EXISTS "idx_messages_thread" ON "messages"("thread_id");
