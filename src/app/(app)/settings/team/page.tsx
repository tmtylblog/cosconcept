"use client";

import { Users, UserPlus, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveOrganization } from "@/lib/auth-client";
import { usePlan } from "@/hooks/use-plan";
import { PLAN_LIMITS, PLAN_DISPLAY_NAMES } from "@/lib/billing/plan-limits";

export default function TeamSettingsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const { plan } = usePlan();
  const memberLimit = PLAN_LIMITS[plan].members;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">
            Team
          </h2>
          <p className="mt-1 text-sm text-cos-slate">
            Manage members of {activeOrg?.name ?? "your organization"}.
          </p>
        </div>
        <Button size="sm">
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          Invite
        </Button>
      </div>

      {/* Seat usage */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-cos-slate">Seats Used</span>
          <span className="font-medium text-cos-midnight">
            1 / {memberLimit === Infinity ? "Unlimited" : memberLimit}
          </span>
        </div>
        <p className="mt-1 text-xs text-cos-slate-light">
          {PLAN_DISPLAY_NAMES[plan]} plan
          {memberLimit !== Infinity &&
            ` \u2014 upgrade for more seats`}
        </p>
      </div>

      {/* Current member placeholder */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-cos-xl border border-cos-border p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-cos-full bg-cos-electric/10">
            <Users className="h-4 w-4 text-cos-electric" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-cos-midnight">You</p>
            <p className="text-xs text-cos-slate">Owner</p>
          </div>
          <div className="flex items-center gap-1 rounded-cos-md bg-cos-warm/10 px-2 py-0.5 text-xs font-medium text-cos-warm">
            <Crown className="h-3 w-3" />
            Owner
          </div>
        </div>
      </div>
    </div>
  );
}
