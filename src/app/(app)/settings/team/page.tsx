"use client";

import { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  Crown,
  Shield,
  Loader2,
  ArrowUpRight,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession, useActiveOrganization } from "@/lib/auth-client";
import { usePlan } from "@/hooks/use-plan";
import { PLAN_LIMITS, PLAN_DISPLAY_NAMES, type PlanId } from "@/lib/billing/plan-limits";

interface TeamMember {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userImage: string | null;
  role: string;
  banned: boolean;
  createdAt: string;
}

export default function TeamSettingsPage() {
  const { data: session } = useSession();
  const { data: activeOrg } = useActiveOrganization();
  const { plan, isLoading: planLoading } = usePlan();
  const memberLimit = PLAN_LIMITS[plan as PlanId]?.members ?? 1;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeOrg?.id) return;

    fetch(`/api/settings/team?organizationId=${encodeURIComponent(activeOrg.id)}`)
      .then((r) => r.json())
      .then((data) => setMembers(data.members ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeOrg?.id]);

  const seatCount = members.length;
  const seatsRemaining = memberLimit === Infinity ? Infinity : Math.max(0, memberLimit - seatCount);
  const atLimit = memberLimit !== Infinity && seatCount >= memberLimit;

  function getRoleIcon(role: string) {
    if (role === "owner") return <Crown className="h-3 w-3" />;
    if (role === "admin") return <Shield className="h-3 w-3" />;
    return <User className="h-3 w-3" />;
  }

  function getRoleColor(role: string) {
    if (role === "owner") return "bg-cos-warm/10 text-cos-warm";
    if (role === "admin") return "bg-cos-electric/10 text-cos-electric";
    return "bg-cos-cloud text-cos-slate";
  }

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
        <Button
          size="sm"
          disabled={atLimit}
          title={atLimit ? "Seat limit reached — upgrade for more" : "Invite a team member"}
          className="gap-1.5"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Invite
        </Button>
      </div>

      {/* Seat usage */}
      {!planLoading && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-cos-slate">Seats Used</span>
            <span className="font-medium text-cos-midnight">
              {seatCount} / {memberLimit === Infinity ? "Unlimited" : memberLimit}
            </span>
          </div>
          {memberLimit !== Infinity && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-cos-cloud">
                <div
                  className={`h-full rounded-full transition-all ${
                    atLimit ? "bg-cos-ember" : "bg-cos-electric"
                  }`}
                  style={{ width: `${Math.min(100, Math.round((seatCount / memberLimit) * 100))}%` }}
                />
              </div>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-cos-slate-light">
              {PLAN_DISPLAY_NAMES[plan]} plan
              {seatsRemaining === Infinity
                ? ""
                : seatsRemaining > 0
                  ? ` — ${seatsRemaining} seat${seatsRemaining === 1 ? "" : "s"} remaining`
                  : " — no seats remaining"}
            </p>
            {memberLimit !== Infinity && (
              <a
                href="/settings/billing"
                className="flex items-center gap-1 text-xs font-medium text-cos-electric transition-colors hover:text-cos-electric/80"
              >
                Upgrade
                <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Members list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => {
            const isCurrentUser = m.userId === session?.user?.id;

            return (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-cos-xl border border-cos-border p-4 transition-colors hover:border-cos-electric/20"
              >
                {m.userImage ? (
                  <img
                    src={m.userImage}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-cos-full bg-cos-electric/10 text-sm font-semibold text-cos-electric">
                    {(m.userName ?? m.userEmail ?? "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-cos-midnight">
                    {m.userName ?? "Unnamed"}
                    {isCurrentUser && (
                      <span className="ml-1.5 text-[10px] font-normal text-cos-slate">(you)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-cos-slate">{m.userEmail}</p>
                </div>
                <div
                  className={`flex items-center gap-1 rounded-cos-md px-2 py-0.5 text-xs font-medium ${getRoleColor(m.role)}`}
                >
                  {getRoleIcon(m.role)}
                  {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
