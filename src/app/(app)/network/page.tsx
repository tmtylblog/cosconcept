import { Users, Mail, Handshake, Zap, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const UPCOMING_FEATURES = [
  {
    icon: Mail,
    title: "Scan your inbox",
    description:
      "Connect Gmail or Outlook and we'll read email headers — never the content — to surface firms you already have relationships with.",
  },
  {
    icon: Users,
    title: "Know who you know",
    description:
      "See every firm in your network ranked by relationship strength: how often you email, how recently, and whether it's genuinely two-way.",
  },
  {
    icon: Handshake,
    title: "Warm introductions",
    description:
      "When Ossy finds a great match, you'll know immediately whether you already have a relationship — turning cold outreach into a warm intro.",
  },
  {
    icon: Zap,
    title: "Invite your contacts",
    description:
      "Firms you know that aren't on Collective OS yet? Invite them directly with one click so the whole network gets smarter.",
  },
];

export default function NetworkPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10 p-6 py-12">
      {/* Header */}
      <div className="space-y-3">
        <span className="inline-flex items-center rounded-cos-full border border-cos-electric/30 bg-cos-electric/5 px-3 py-1 text-xs font-semibold text-cos-electric">
          Coming soon
        </span>
        <h2 className="font-heading text-2xl font-bold text-cos-midnight">
          Your Network
        </h2>
        <p className="text-base text-cos-slate leading-relaxed">
          Business development runs on relationships. Collective OS will map the
          network you've already built — so when we surface a perfect match, you
          know straight away whether you have a warm path in.
        </p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {UPCOMING_FEATURES.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-5 space-y-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-cos-lg bg-cos-electric/10">
              <Icon className="h-4.5 w-4.5 text-cos-electric" />
            </div>
            <div>
              <h3 className="font-heading text-sm font-semibold text-cos-midnight">
                {title}
              </h3>
              <p className="mt-1 text-xs text-cos-slate leading-relaxed">
                {description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="rounded-cos-2xl border border-cos-border bg-cos-surface p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-cos-midnight">
            Right now, start with Discovery
          </p>
          <p className="mt-0.5 text-xs text-cos-slate">
            Search 1.5M+ firms and let Ossy find the right partners for you.
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/discover">
            Go to Discovery
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
