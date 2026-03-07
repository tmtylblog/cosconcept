"use client";

import { Handshake, ArrowRight } from "lucide-react";

export default function PartnershipsPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Partnerships
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          Active and proposed partnership engagements.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-cos-lg bg-cos-cloud-dim p-1">
        {["Active", "Proposed", "Past"].map((tab, i) => (
          <button
            key={tab}
            className={`flex-1 rounded-cos-md px-3 py-1.5 text-xs font-medium transition-colors ${
              i === 0
                ? "bg-cos-surface text-cos-midnight shadow-sm"
                : "text-cos-slate hover:text-cos-midnight"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center rounded-cos-2xl border border-dashed border-cos-border py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-cos-full bg-cos-warm/10">
          <Handshake className="h-6 w-6 text-cos-warm" />
        </div>
        <h3 className="mt-4 font-heading text-sm font-semibold text-cos-midnight">
          No partnerships yet
        </h3>
        <p className="mt-1 max-w-xs text-xs text-cos-slate">
          When you engage with a matched firm, partnerships will appear here.
          Each partnership tracks shared opportunities, referrals, and revenue.
        </p>
        <button className="mt-4 flex items-center gap-1 text-xs font-medium text-cos-electric hover:underline">
          Learn how partnerships work
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
