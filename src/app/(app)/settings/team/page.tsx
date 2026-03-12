"use client";

import { useState, useEffect, useRef } from "react";
import {
  Users, UserPlus, Crown, Shield, User, Loader2,
  ArrowUpRight, Mail, Check, Clock, Link2, Copy,
  ChevronDown, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession, useActiveOrganization } from "@/lib/auth-client";
import { usePlan } from "@/hooks/use-plan";
import { PLAN_LIMITS, PLAN_DISPLAY_NAMES, type PlanId } from "@/lib/billing/plan-limits";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────

interface TeamMember {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  userImage: string | null;
  userJobTitle: string | null;
  role: string;
  banned: boolean;
  createdAt: string;
}

interface Expert {
  id: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  photoUrl: string | null;
  linkedinUrl: string | null;
  userId: string | null;
  division: string;
  claimStatus: "claimed" | "invited" | "expired" | "unclaimed";
}

// ─── Helpers ──────────────────────────────────────────────

function Avatar({ name, image, size = 9 }: { name?: string | null; image?: string | null; size?: number }) {
  const letter = (name ?? "?").charAt(0).toUpperCase();
  if (image) {
    return <img src={image} alt="" className={`h-${size} w-${size} rounded-full object-cover`} />;
  }
  return (
    <div className={`flex h-${size} w-${size} shrink-0 items-center justify-center rounded-full bg-cos-electric/10 text-sm font-semibold text-cos-electric`}>
      {letter}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    owner: "bg-cos-warm/10 text-cos-warm",
    admin: "bg-cos-electric/10 text-cos-electric",
    member: "bg-cos-cloud text-cos-slate",
  };
  const icons: Record<string, React.ReactNode> = {
    owner: <Crown className="h-3 w-3" />,
    admin: <Shield className="h-3 w-3" />,
    member: <User className="h-3 w-3" />,
  };
  return (
    <span className={cn("flex items-center gap-1 rounded-cos-md px-2 py-0.5 text-xs font-medium", styles[role] ?? styles.member)}>
      {icons[role] ?? icons.member}
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
}

function ClaimBadge({ status }: { status: Expert["claimStatus"] }) {
  const config = {
    claimed:   { label: "Claimed",       cls: "bg-cos-signal/10 text-cos-signal",   icon: <Check className="h-3 w-3" /> },
    invited:   { label: "Invite sent",   cls: "bg-cos-electric/10 text-cos-electric", icon: <Mail className="h-3 w-3" /> },
    expired:   { label: "Invite expired",cls: "bg-cos-ember/10 text-cos-ember",     icon: <Clock className="h-3 w-3" /> },
    unclaimed: { label: "Not invited",   cls: "bg-cos-cloud text-cos-slate",         icon: <User className="h-3 w-3" /> },
  };
  const { label, cls, icon } = config[status];
  return (
    <span className={cn("flex items-center gap-1 rounded-cos-md px-2 py-0.5 text-xs font-medium", cls)}>
      {icon}{label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const { data: session } = useSession();
  const { data: activeOrg } = useActiveOrganization();
  const { plan, isLoading: planLoading } = usePlan();
  const limits = PLAN_LIMITS[plan as PlanId] ?? PLAN_LIMITS.free;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [callerRole, setCallerRole] = useState<string>("member");
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  // Invite form state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  // Expert actions
  const [expertActionLoading, setExpertActionLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const orgId = activeOrg?.id ?? "";
  const isOwnerOrAdmin = ["owner", "admin"].includes(callerRole);
  const seatCount = members.length;
  const seatLimit = limits.members;
  const atLimit = seatLimit !== Infinity && seatCount >= seatLimit;

  useEffect(() => {
    if (!orgId || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);

    fetch(`/api/settings/team?organizationId=${encodeURIComponent(orgId)}`)
      .then((r) => r.json())
      .then((data) => {
        setMembers(data.members ?? []);
        setExperts(data.experts ?? []);
        setCallerRole(data.callerRole ?? "member");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteResult(null);

    const res = await fetch("/api/settings/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId, email: inviteEmail.trim(), role: inviteRole }),
    });
    const data = await res.json();

    if (res.ok) {
      setInviteResult({ ok: true });
      setInviteEmail("");
      setShowInvite(false);
      // Refresh member list after a short delay
      setTimeout(() => {
        fetchedRef.current = false;
        fetch(`/api/settings/team?organizationId=${encodeURIComponent(orgId)}`)
          .then((r) => r.json())
          .then((d) => { setMembers(d.members ?? []); setExperts(d.experts ?? []); });
      }, 1000);
    } else {
      setInviteResult({ error: data.error === "seat_limit_reached"
        ? `Seat limit reached. ${data.additionalSeatPriceUsd > 0 ? `Add extra seats at $${data.additionalSeatPriceUsd}/mo each.` : "Upgrade to Pro to invite more people."}`
        : (data.error ?? "Failed to send invite") });
    }
    setInviting(false);
  }

  async function handleExpertInvite(expertId: string) {
    setExpertActionLoading(expertId);
    try {
      const res = await fetch(`/api/experts/${expertId}/invite`, { method: "POST" });
      if (res.ok) {
        setExperts((prev) => prev.map((e) => e.id === expertId ? { ...e, claimStatus: "invited" } : e));
      }
    } finally {
      setExpertActionLoading(null);
    }
  }

  async function handleCopyInviteLink(expertId: string) {
    setExpertActionLoading(`copy-${expertId}`);
    try {
      const res = await fetch(`/api/experts/${expertId}/invite-link`, { method: "POST" });
      const data = await res.json();
      if (data.claimUrl) {
        await navigator.clipboard.writeText(data.claimUrl);
        setCopiedId(expertId);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } finally {
      setExpertActionLoading(null);
    }
  }

  // Smart link suggestion: member whose email matches an unclaimed expert
  function getSuggestedExpert(member: TeamMember): Expert | null {
    if (!member.userEmail) return null;
    return experts.find(
      (e) => !e.userId && e.email?.toLowerCase() === member.userEmail?.toLowerCase()
    ) ?? null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold text-cos-midnight">Team</h2>
          <p className="mt-1 text-sm text-cos-slate">
            Manage members of {activeOrg?.name ?? "your organization"}.
          </p>
        </div>
        {isOwnerOrAdmin && (
          <Button size="sm" className="gap-1.5" onClick={() => setShowInvite((s) => !s)}>
            <UserPlus className="h-3.5 w-3.5" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="rounded-cos-xl border border-cos-electric/30 bg-cos-electric/5 p-4 space-y-3">
          <p className="text-sm font-medium text-cos-midnight">Invite someone to your team</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              placeholder="colleague@company.com"
              className="flex-1 rounded-cos-lg border border-cos-border bg-cos-surface px-3 py-1.5 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "member" | "admin")}
              className="rounded-cos-lg border border-cos-border bg-cos-surface px-2 py-1.5 text-sm text-cos-midnight focus:border-cos-electric focus:outline-none"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {inviteResult?.error && (
            <p className="flex items-center gap-1.5 text-xs text-cos-ember">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {inviteResult.error}
              {inviteResult.error.includes("$50") && (
                <a href="/settings/billing" className="ml-1 underline">Manage billing →</a>
              )}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Send Invite"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowInvite(false); setInviteResult(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {inviteResult?.ok && (
        <p className="flex items-center gap-1.5 text-sm text-cos-signal">
          <Check className="h-4 w-4" /> Invite sent successfully.
        </p>
      )}

      {/* Seat usage bar */}
      {!planLoading && (
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface-raised p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-cos-slate">Seats Used</span>
            <span className="font-medium text-cos-midnight">
              {seatCount} / {seatLimit === Infinity ? "Unlimited" : seatLimit}
            </span>
          </div>
          {seatLimit !== Infinity && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cos-cloud">
              <div
                className={cn("h-full rounded-full transition-all", atLimit ? "bg-cos-ember" : "bg-cos-electric")}
                style={{ width: `${Math.min(100, Math.round((seatCount / seatLimit) * 100))}%` }}
              />
            </div>
          )}
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-cos-slate-light">
              {PLAN_DISPLAY_NAMES[plan as PlanId]} plan
              {seatLimit !== Infinity && !atLimit && ` — ${seatLimit - seatCount} seat${seatLimit - seatCount === 1 ? "" : "s"} remaining`}
              {atLimit && limits.additionalSeatPriceUsd > 0 && ` — extra seats $${limits.additionalSeatPriceUsd}/mo each`}
              {atLimit && limits.additionalSeatPriceUsd === 0 && " — upgrade to add more"}
            </p>
            {seatLimit !== Infinity && (
              <a href="/settings/billing" className="flex items-center gap-1 text-xs font-medium text-cos-electric hover:text-cos-electric/80">
                {atLimit && limits.additionalSeatPriceUsd === 0 ? "Upgrade" : "Manage billing"}
                <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
        </div>
      ) : (
        <>
          {/* ── Platform Users ── */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-cos-slate" />
              <h3 className="text-sm font-semibold text-cos-midnight">Platform Users</h3>
              <span className="text-xs text-cos-slate-light">— login access to COS</span>
            </div>

            {members.map((m) => {
              const isMe = m.userId === session?.user?.id;
              const suggested = getSuggestedExpert(m);
              const linked = experts.find((e) => e.userId === m.userId);

              return (
                <div key={m.id} className="rounded-cos-xl border border-cos-border p-4 hover:border-cos-electric/20 transition-colors">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.userName ?? m.userEmail} image={m.userImage} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-cos-midnight">
                        {m.userName ?? "Unnamed"}
                        {isMe && <span className="ml-1.5 text-[10px] font-normal text-cos-slate">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-cos-slate">
                        {m.userEmail}
                        {m.userJobTitle && <span className="ml-2 text-cos-slate-light">· {m.userJobTitle}</span>}
                      </p>
                    </div>
                    <RoleBadge role={m.role} />
                  </div>

                  {/* Expert link state */}
                  {linked && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-cos-signal">
                      <Link2 className="h-3 w-3" />
                      Linked to expert: {linked.fullName}
                    </p>
                  )}
                  {!linked && suggested && (
                    <p className="mt-2 text-xs text-cos-slate">
                      <span className="text-cos-electric font-medium">Suggested:</span>{" "}
                      matches expert profile &ldquo;{suggested.fullName}&rdquo; — link them in the roster below
                    </p>
                  )}
                </div>
              );
            })}
          </section>

          {/* ── Expert Roster ── */}
          {experts.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-cos-slate" />
                  <h3 className="text-sm font-semibold text-cos-midnight">Expert Roster</h3>
                  <span className="text-xs text-cos-slate-light">— people on your team listed on COS</span>
                </div>
              </div>

              {experts.map((e) => {
                const displayName = e.fullName ?? (`${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || "Unnamed");
                const isCopied = copiedId === e.id;
                const isActing = expertActionLoading === e.id || expertActionLoading === `copy-${e.id}`;
                const canAct = isOwnerOrAdmin && !e.userId && e.email;

                return (
                  <div key={e.id} className="rounded-cos-xl border border-cos-border p-4 hover:border-cos-electric/20 transition-colors">
                    <div className="flex items-start gap-3">
                      <Avatar name={displayName} image={e.photoUrl} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-cos-midnight">{displayName}</p>
                          <ClaimBadge status={e.claimStatus} />
                        </div>
                        <p className="text-xs text-cos-slate mt-0.5">
                          {e.title && <span>{e.title}</span>}
                          {e.title && e.email && <span className="mx-1 text-cos-slate-light">·</span>}
                          {e.email && <span>{e.email}</span>}
                        </p>
                      </div>
                      {e.linkedinUrl && (
                        <a
                          href={e.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-cos-slate-light hover:text-cos-electric transition-colors"
                          title="LinkedIn"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </a>
                      )}
                    </div>

                    {canAct && (
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={isActing}
                          onClick={() => handleExpertInvite(e.id)}
                        >
                          {isActing && expertActionLoading === e.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Mail className="h-3 w-3" />}
                          {e.claimStatus === "invited" ? "Resend invite" : e.claimStatus === "expired" ? "Resend invite" : "Send invite"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1"
                          disabled={isActing}
                          onClick={() => handleCopyInviteLink(e.id)}
                        >
                          {isCopied
                            ? <><Check className="h-3 w-3 text-cos-signal" /> Copied</>
                            : <><Copy className="h-3 w-3" /> Copy link</>}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}
    </div>
  );
}
