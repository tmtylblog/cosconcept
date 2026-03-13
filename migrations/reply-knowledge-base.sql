-- Reply Knowledge Base: stores context entries that feed the AI reply generator
CREATE TABLE IF NOT EXISTS reply_knowledge_base (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- product_info | objection_handling | pricing | tone_guide | company_info | custom
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed some starter entries
INSERT INTO reply_knowledge_base (id, category, title, content, is_active, display_order) VALUES
  ('rkb_tone', 'tone_guide', 'Conversation Tone', 'Be friendly, conversational, and concise. Use first names. Avoid corporate jargon. Sound like a real person having a genuine conversation, not a sales robot. Match the energy and formality level of the person you are replying to.', true, 0),
  ('rkb_cos_what', 'company_info', 'What is Collective OS?', 'Collective OS is a growth platform for professional services firms — agencies, consultancies, and fractional leaders. We help firms grow through partnerships instead of cold outreach. Think of it as an operating system for partnership-led growth.', true, 1),
  ('rkb_cos_how', 'product_info', 'How it works', 'COS uses a massive knowledge graph and AI matching to find the right partnership opportunities between firms. When two firms are a good mutual fit, we facilitate warm introductions and help structure the partnership.', true, 2),
  ('rkb_pricing', 'pricing', 'Pricing overview', 'We have a free tier that lets firms explore the platform. Paid plans start at a reasonable price point — direct them to book a call to discuss specifics rather than quoting exact numbers in messages.', true, 3),
  ('rkb_objection_busy', 'objection_handling', 'Too busy / bad timing', 'Acknowledge their time constraints. Offer a very short call (15 min) or suggest they check out the platform at their own pace. No pressure — plant the seed and leave the door open.', true, 4),
  ('rkb_objection_notfit', 'objection_handling', 'Not a fit / already have something', 'Ask what they are currently using or doing for partnerships. Often they have not tried partnership-led growth specifically. Differentiate from referral networks or BNI-style groups.', true, 5)
ON CONFLICT (id) DO NOTHING;
