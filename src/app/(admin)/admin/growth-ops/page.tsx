"use client";

import { TrendingUp, Linkedin, Mail, BarChart3, Share2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { label: "LinkedIn", href: "/admin/growth-ops/linkedin", icon: Linkedin, description: "Unified inbox + invite campaigns" },
  { label: "Instantly", href: "/admin/growth-ops/instantly", icon: Mail, description: "Email campaign performance" },
  { label: "HubSpot", href: "/admin/growth-ops/hubspot", icon: Share2, description: "Pipeline Kanban board" },
  { label: "Attribution", href: "/admin/growth-ops/attribution", icon: BarChart3, description: "Cross-channel attribution" },
];

export default function GrowthOpsPage() {
  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-cos-lg bg-cos-electric/10">
            <TrendingUp className="h-5 w-5 text-cos-electric" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-cos-midnight">Growth Operations</h1>
        </div>
        <p className="text-sm text-cos-slate">Outbound campaigns, LinkedIn automation, pipeline management, and attribution.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex items-start gap-4 rounded-cos-xl border border-cos-border bg-white p-6 shadow-sm transition-all hover:border-cos-electric/30 hover:shadow-md"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-cos-lg bg-cos-electric/10 text-cos-electric group-hover:bg-cos-electric group-hover:text-white transition-colors">
              <s.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-heading text-sm font-semibold text-cos-midnight">{s.label}</p>
              <p className="mt-0.5 text-xs text-cos-slate">{s.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
