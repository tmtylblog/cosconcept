import { Handshake, Share2, TrendingUp, ShieldCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const UPCOMING_FEATURES = [
  {
    icon: Handshake,
    title: "Formalise partnerships",
    description:
      "Turn a great Discovery match into an official partnership. Both firms agree on the relationship type — referral, co-delivery, subcontracting, or white-label.",
  },
  {
    icon: Share2,
    title: "Share opportunities",
    description:
      "When a client need falls outside your sweet spot, pass it to the right partner. Track it from first share to closed deal.",
  },
  {
    icon: TrendingUp,
    title: "Track referral revenue",
    description:
      "See exactly how much pipeline your partnerships generate — in both directions — so you can invest in the relationships that actually pay off.",
  },
  {
    icon: ShieldCheck,
    title: "Trusted inner circle",
    description:
      "Only your confirmed partners see the opportunities you share. No spam, no cold approaches — a closed loop built on mutual trust.",
  },
];

export default function PartnershipsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10 p-6 py-12">
      {/* Header */}
      <div className="space-y-3">
        <span className="inline-flex items-center rounded-cos-full border border-cos-electric/30 bg-cos-electric/5 px-3 py-1 text-xs font-semibold text-cos-electric">
          Coming soon
        </span>
        <h2 className="font-heading text-2xl font-bold text-cos-midnight">
          Partnerships
        </h2>
        <p className="text-base text-cos-slate leading-relaxed">
          Discovery finds the right firms. Partnerships is where those
          relationships become a real growth engine — shared opportunities,
          tracked referrals, and revenue you can measure.
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
            Find the firms worth partnering with first
          </p>
          <p className="mt-0.5 text-xs text-cos-slate">
            Use Discovery to search 1.5M+ firms and identify your best-fit
            partners — the partnership tools will be ready when you are.
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
