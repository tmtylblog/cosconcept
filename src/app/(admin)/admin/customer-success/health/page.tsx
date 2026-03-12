"use client";

import { HeartPulse, Construction } from "lucide-react";

export default function CustomerHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
          Customer Health
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          Track health scores, engagement, and churn risk across your customer base.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-cos-xl border border-cos-border bg-cos-surface py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-cos-xl bg-cos-electric/10 mb-4">
          <HeartPulse className="h-8 w-8 text-cos-electric" />
        </div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Customer Health Dashboard
        </h2>
        <p className="mt-2 max-w-sm text-sm text-cos-slate">
          This page is coming soon. It will show health scores, NPS data, engagement
          trends, and churn risk signals for every customer organisation.
        </p>
        <div className="mt-6 flex items-center gap-2 rounded-cos-lg border border-cos-warm/30 bg-cos-warm/5 px-4 py-2.5">
          <Construction className="h-4 w-4 text-cos-warm" />
          <span className="text-xs font-medium text-cos-warm">In development</span>
        </div>
      </div>

      {/* Planned features preview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Health Score", desc: "Composite score based on login frequency, AI usage, and feature adoption" },
          { label: "Engagement Trends", desc: "Weekly active users, session depth, and Ossy conversation volume" },
          { label: "Churn Risk", desc: "ML-powered flags for accounts showing disengagement patterns" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-cos-lg border border-cos-border bg-cos-surface p-4 opacity-60"
          >
            <p className="text-sm font-semibold text-cos-midnight">{item.label}</p>
            <p className="mt-1 text-xs text-cos-slate">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
