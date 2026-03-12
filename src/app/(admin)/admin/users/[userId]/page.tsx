"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, BarChart3, Mail, MessageSquare, Activity,
  Loader2, User, Building2, CreditCard, Globe, Linkedin,
  Phone, Briefcase, Clock, Cpu, FileText, ExternalLink,
  Search, Shield, Eye, EyeOff, Ban, Sparkles, Monitor,
  ChevronRight, Brain, Trash2, AlertTriangle, X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types ────────────────────────────────────────────────────── */

interface UserDetailData {
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    jobTitle: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    role: string;
    banned: boolean;
    banReason: string | null;
    createdAt: string;
    updatedAt: string;
  };
  membership: {
    memberId: string;
    memberRole: string;
    memberSince: string;
    orgId: string;
    orgName: string;
    orgSlug: string;
  } | null;
  firm: {
    id: string;
    name: string;
    website: string | null;
    firmType: string | null;
    sizeBand: string | null;
    enrichmentStatus: string | null;
    profileCompleteness: number | null;
    isCosCustomer: boolean;
    createdAt: string;
  } | null;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
  } | null;
  expertProfile: {
    id: string;
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    division: string | null;
    photoUrl: string | null;
    linkedinUrl: string | null;
    profileCompleteness: number | null;
    pdlEnrichedAt: string | null;
    specialistProfileCount: number;
  } | null;
  stats: {
    conversationCount: number;
    messageCount: number;
    aiCostTotal: number;
    aiCallCount: number;
    memoryCount: number;
    lastConversationAt: string | null;
    lastAiCallAt: string | null;
  };
  recentSessions: {
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
    expiresAt: string;
  }[];
}

interface ConversationItem {
  id: string;
  title: string | null;
  mode: string;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface ActivityEvent {
  type: string;
  timestamp: string;
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
}

interface CioMessage {
  id: string;
  recipient: string;
  subject: string;
  type: string;
  campaign_id: number | null;
  created: number;
  metrics: Record<string, number | undefined>;
  failure_message: string | null;
}

type TabId = "overview" | "emails" | "conversations" | "activity";

/* ── Constants ────────────────────────────────────────────────── */

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview",      label: "Overview",      icon: <BarChart3 className="h-4 w-4" /> },
  { id: "emails",        label: "Emails",        icon: <Mail className="h-4 w-4" /> },
  { id: "conversations", label: "Conversations", icon: <MessageSquare className="h-4 w-4" /> },
  { id: "activity",      label: "Activity",      icon: <Activity className="h-4 w-4" /> },
];

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-cos-ember/10 text-cos-ember",
  admin: "bg-cos-electric/10 text-cos-electric",
  user: "bg-cos-cloud text-cos-slate",
  member: "bg-cos-cloud text-cos-slate",
  owner: "bg-cos-warm/10 text-cos-warm",
};

const PLAN_COLORS: Record<string, string> = {
  free: "bg-cos-cloud text-cos-slate",
  pro: "bg-cos-electric/10 text-cos-electric",
  enterprise: "bg-cos-warm/10 text-cos-warm",
};

const SUB_STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  trialing: "bg-blue-100 text-blue-700",
  past_due: "bg-cos-ember/10 text-cos-ember",
  canceled: "bg-cos-slate-light/10 text-cos-slate",
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  conversation: <MessageSquare className="h-3.5 w-3.5 text-cos-electric" />,
  ai_usage:     <Cpu className="h-3.5 w-3.5 text-purple-500" />,
  onboarding:   <FileText className="h-3.5 w-3.5 text-emerald-500" />,
};

/* ── Helpers ──────────────────────────────────────────────────── */

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function timeAgo(d: string) {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(d);
}

function parseUA(ua: string | null) {
  if (!ua) return "Unknown device";
  if (/iPhone|iPad|Android/i.test(ua)) return "Mobile";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Safari/i.test(ua)) return "Safari";
  return "Browser";
}

function Section({ title, icon, children, action, className = "" }: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-cos-lg border border-cos-border bg-white p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatPill({ label, value, color = "text-cos-electric" }: {
  label: string; value: string | number; color?: string;
}) {
  return (
    <div className="rounded-cos-lg bg-white border border-cos-border px-4 py-2.5 text-center min-w-[90px]">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-cos-slate">{label}</div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [data, setData] = useState<UserDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Conversations
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);
  const [convsLoaded, setConvsLoaded] = useState(false);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [convMessages, setConvMessages] = useState<ConversationMessage[]>([]);
  const [convMsgsLoading, setConvMsgsLoading] = useState(false);
  const [convSearch, setConvSearch] = useState("");

  // Activity
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [activityFilter, setActivityFilter] = useState("all");

  // Emails (CIO)
  const [commsData, setCommsData] = useState<{
    messages: CioMessage[];
    configured: boolean;
    found: boolean;
    cioAttributes: Record<string, unknown> | null;
  } | null>(null);
  const [commsLoading, setCommsLoading] = useState(false);
  const [commsLoaded, setCommsLoaded] = useState(false);

  // Actions
  const [impersonating, setImpersonating] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Primary load
  useEffect(() => {
    fetch(`/api/admin/users/${userId}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [userId]);

  // Lazy: conversations
  useEffect(() => {
    if (activeTab !== "conversations" || convsLoaded) return;
    setConvsLoading(true);
    fetch(`/api/admin/users/${userId}/conversations`)
      .then((r) => r.json())
      .then((d) => { setConversations(d.conversations ?? []); setConvsLoaded(true); })
      .catch(console.error)
      .finally(() => setConvsLoading(false));
  }, [activeTab, convsLoaded, userId]);

  // Lazy: activity
  useEffect(() => {
    if (activeTab !== "activity" || activityLoaded) return;
    setActivityLoading(true);
    fetch(`/api/admin/users/${userId}/activity?type=${activityFilter}`)
      .then((r) => r.json())
      .then((d) => { setActivityEvents(d.events ?? []); setActivityLoaded(true); })
      .catch(console.error)
      .finally(() => setActivityLoading(false));
  }, [activeTab, activityLoaded, userId, activityFilter]);

  // Reload activity on filter change
  useEffect(() => {
    if (activeTab !== "activity" || !activityLoaded) return;
    setActivityLoading(true);
    fetch(`/api/admin/users/${userId}/activity?type=${activityFilter}`)
      .then((r) => r.json())
      .then((d) => setActivityEvents(d.events ?? []))
      .catch(console.error)
      .finally(() => setActivityLoading(false));
  }, [activityFilter, activeTab, activityLoaded, userId]);

  // Lazy: emails
  useEffect(() => {
    if (activeTab !== "emails" || commsLoaded) return;
    setCommsLoading(true);
    fetch(`/api/admin/users/${userId}/communications`)
      .then((r) => r.json())
      .then((d) => { setCommsData(d); setCommsLoaded(true); })
      .catch(console.error)
      .finally(() => setCommsLoading(false));
  }, [activeTab, commsLoaded, userId]);

  const loadThread = useCallback(async (convId: string) => {
    setSelectedConv(convId);
    setConvMsgsLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/conversations?mode=thread&conversationId=${convId}`);
      const d = await res.json();
      setConvMessages(d.messages ?? []);
    } catch (err) {
      console.error("Failed to load thread:", err);
    } finally {
      setConvMsgsLoading(false);
    }
  }, [userId]);

  const searchConversations = useCallback(async () => {
    if (!convSearch.trim()) { setConvsLoaded(false); return; }
    setConvsLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/conversations?search=${encodeURIComponent(convSearch)}`);
      const d = await res.json();
      setConversations(d.conversations ?? []);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setConvsLoading(false);
    }
  }, [convSearch, userId]);

  async function handleImpersonate() {
    if (!data) return;
    setImpersonating(true);
    try {
      await authClient.admin.impersonateUser({ userId: data.user.id });
      window.open("/dashboard", "_blank");
      await new Promise((r) => setTimeout(r, 500));
      await authClient.admin.stopImpersonating();
    } catch (err) {
      console.error("Impersonation failed:", err);
      try { await authClient.admin.stopImpersonating(); } catch {}
    } finally {
      setImpersonating(false);
    }
  }

  async function handleDeleteUser() {
    if (!data) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      router.push(data.membership ? `/admin/customers/${data.membership.orgId}` : "/admin/customers");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  // ── Loading / error states ──────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-8 w-8 animate-spin text-cos-electric" />
    </div>
  );

  if (error || !data) return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-cos-slate hover:text-cos-electric transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-16">
        <User className="h-10 w-10 text-cos-slate-light" />
        <p className="mt-3 text-sm font-medium text-cos-midnight">User not found</p>
        <p className="mt-1 text-xs text-cos-slate">{error ?? "Unable to load user data"}</p>
      </div>
    </div>
  );

  const { user, membership, firm, subscription, expertProfile, stats, recentSessions } = data;
  const displayName = user.name || user.email;
  const lastSeen = stats.lastAiCallAt || stats.lastConversationAt;

  return (
    <>
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => membership ? router.push(`/admin/customers/${membership.orgId}`) : router.push("/admin/customers")}
        className="flex items-center gap-2 text-sm text-cos-slate hover:text-cos-electric transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {membership ? `Back to ${membership.orgName}` : "Back to Customers"}
      </button>

      {/* Hero card */}
      <div className="rounded-cos-xl border border-cos-border bg-white overflow-hidden">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            {/* Avatar + identity */}
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                {user.image ? (
                  <img src={user.image} alt={displayName} className="h-14 w-14 rounded-cos-lg object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-cos-lg bg-gradient-to-br from-cos-electric/20 to-cos-signal/20 text-xl font-bold text-cos-electric">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                {user.banned && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-cos-ember text-white">
                    <Ban className="h-3 w-3" />
                  </span>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-heading text-xl font-bold tracking-tight text-cos-midnight">{displayName}</h1>
                  <span className={cn("rounded-cos-pill px-2.5 py-0.5 text-[10px] font-bold uppercase", ROLE_COLORS[user.role] ?? ROLE_COLORS.user)}>
                    {user.role}
                  </span>
                  {user.banned && (
                    <span className="rounded-cos-pill bg-cos-ember/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-cos-ember">
                      banned{user.banReason ? ` · ${user.banReason}` : ""}
                    </span>
                  )}
                  {!user.emailVerified && (
                    <span className="rounded-cos-pill bg-cos-cloud px-2.5 py-0.5 text-[10px] font-medium text-cos-slate">
                      email unverified
                    </span>
                  )}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-cos-slate">
                  <span>{user.email}</span>
                  {user.jobTitle && <span className="text-cos-slate-light">·</span>}
                  {user.jobTitle && <span>{user.jobTitle}</span>}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-cos-slate">
                  {membership && (
                    <button
                      onClick={() => router.push(`/admin/customers/${membership.orgId}`)}
                      className="flex items-center gap-1 rounded-cos-pill bg-cos-electric/10 px-2.5 py-1 font-medium text-cos-electric hover:bg-cos-electric/20 transition-colors"
                    >
                      <Building2 className="h-3 w-3" />
                      {membership.orgName}
                      <span className="text-[10px] text-cos-electric/70">· {membership.memberRole}</span>
                    </button>
                  )}
                  {subscription && (
                    <>
                      <span className={cn("rounded-cos-pill px-2.5 py-0.5 text-[10px] font-bold uppercase", PLAN_COLORS[subscription.plan] ?? PLAN_COLORS.free)}>
                        {subscription.plan}
                      </span>
                      <span className={cn("rounded-cos-pill px-2 py-0.5 text-[10px] font-medium", SUB_STATUS_COLORS[subscription.status] ?? "bg-cos-cloud text-cos-slate")}>
                        {subscription.status}
                      </span>
                    </>
                  )}
                  {user.phone && (
                    <span className="flex items-center gap-1 text-cos-slate"><Phone className="h-3 w-3" />{user.phone}</span>
                  )}
                  {user.linkedinUrl && (
                    <a href={user.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-cos-electric hover:underline">
                      <Linkedin className="h-3 w-3" />LinkedIn
                    </a>
                  )}
                  {firm?.website && (
                    <a href={firm.website.startsWith("http") ? firm.website : `https://${firm.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-cos-electric hover:underline">
                      <Globe className="h-3 w-3" />{firm.website}
                    </a>
                  )}
                  <span className="flex items-center gap-1 text-cos-slate-light">
                    <Clock className="h-3 w-3" />Joined {formatDate(user.createdAt)}
                  </span>
                  {lastSeen && (
                    <span className="flex items-center gap-1 text-cos-slate-light">
                      <Eye className="h-3 w-3" />Active {timeAgo(lastSeen)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleImpersonate}
                disabled={impersonating}
                className="h-8 gap-1.5 px-3 text-xs"
              >
                {impersonating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                Simulate
              </Button>
              {membership && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/admin/customers/${membership.orgId}`)}
                  className="h-8 gap-1.5 px-3 text-xs"
                >
                  <Building2 className="h-3.5 w-3.5" />View Org
                </Button>
              )}
            </div>
          </div>

          {/* Stat pills */}
          <div className="mt-5 flex flex-wrap gap-3">
            <StatPill label="Conversations" value={stats.conversationCount} color="text-cos-electric" />
            <StatPill label="Messages" value={stats.messageCount} color="text-cos-signal" />
            <StatPill label="AI Cost" value={`$${Number(stats.aiCostTotal).toFixed(3)}`} color="text-purple-600" />
            <StatPill label="AI Calls" value={stats.aiCallCount} color="text-purple-400" />
            <StatPill label="Memories" value={stats.memoryCount} color="text-cos-warm" />
            {expertProfile && (
              <StatPill label="Profiles" value={expertProfile.specialistProfileCount} color="text-cos-signal" />
            )}
          </div>
        </div>

        {/* Tab nav */}
        <div className="border-t border-cos-border bg-cos-cloud/30 px-6">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                  activeTab === tab.id
                    ? "border-cos-electric text-cos-electric"
                    : "border-transparent text-cos-slate hover:text-cos-midnight"
                )}
              >
                {tab.icon}
                {tab.label}
                {tab.id === "emails" && commsData?.messages.length
                  ? <span className="rounded-full bg-cos-electric/10 px-1.5 py-0.5 text-[9px] font-semibold text-cos-electric">{commsData.messages.length}</span>
                  : null}
                {tab.id === "conversations" && conversations.length > 0
                  ? <span className="rounded-full bg-cos-electric/10 px-1.5 py-0.5 text-[9px] font-semibold text-cos-electric">{conversations.length}</span>
                  : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">

              {/* Profile details */}
              <Section title="Profile" icon={<User className="h-4 w-4 text-cos-electric" />}>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {[
                    { label: "Full name", value: user.name },
                    { label: "Email", value: user.email },
                    { label: "Job title", value: user.jobTitle },
                    { label: "Phone", value: user.phone },
                    { label: "Role", value: user.role },
                    { label: "Org role", value: membership?.memberRole },
                    { label: "Email verified", value: user.emailVerified ? "Yes" : "No" },
                    { label: "Member since", value: formatDate(membership?.memberSince ?? user.createdAt) },
                    { label: "Last active", value: lastSeen ? timeAgo(lastSeen) : "Never" },
                    { label: "Profile updated", value: formatDate(user.updatedAt) },
                  ].filter((r) => r.value).map((row) => (
                    <div key={row.label}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate mb-0.5">{row.label}</dt>
                      <dd className="text-cos-midnight truncate">{row.value}</dd>
                    </div>
                  ))}
                  {user.linkedinUrl && (
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate mb-0.5">LinkedIn</dt>
                      <dd>
                        <a href={user.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-cos-electric hover:underline text-sm">
                          View profile <ExternalLink className="h-3 w-3" />
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </Section>

              {/* Expert profile */}
              {expertProfile && (
                <Section title="Expert Profile" icon={<Sparkles className="h-4 w-4 text-cos-warm" />}
                  action={
                    membership && (
                      <button
                        onClick={() => router.push(`/admin/customers/${membership.orgId}?tab=users`)}
                        className="text-xs text-cos-electric hover:underline flex items-center gap-1"
                      >
                        View in org <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    )
                  }
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      {expertProfile.photoUrl ? (
                        <img src={expertProfile.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cos-warm/10 text-sm font-bold text-cos-warm">
                          {(expertProfile.fullName ?? expertProfile.firstName ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-cos-midnight text-sm">{expertProfile.fullName ?? [expertProfile.firstName, expertProfile.lastName].filter(Boolean).join(" ")}</p>
                        <p className="text-xs text-cos-slate">{expertProfile.title}{expertProfile.division ? ` · ${expertProfile.division}` : ""}</p>
                      </div>
                      {expertProfile.profileCompleteness != null && (
                        <span className="ml-auto rounded-cos-pill bg-cos-signal/10 px-2.5 py-0.5 text-xs font-semibold text-cos-signal">
                          {Math.round(expertProfile.profileCompleteness)}% complete
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-cos-slate">
                      <span>{expertProfile.specialistProfileCount} specialist profile{expertProfile.specialistProfileCount !== 1 ? "s" : ""}</span>
                      {expertProfile.pdlEnrichedAt && <span>PDL enriched {formatDate(expertProfile.pdlEnrichedAt)}</span>}
                      {expertProfile.linkedinUrl && (
                        <a href={expertProfile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-cos-electric hover:underline">
                          <Linkedin className="h-3 w-3" /> LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                </Section>
              )}

              {/* Recent sessions */}
              {recentSessions.length > 0 && (
                <Section title="Recent Sessions" icon={<Monitor className="h-4 w-4 text-cos-slate" />}>
                  <div className="space-y-2">
                    {recentSessions.map((s, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-cos bg-cos-cloud/40 px-3 py-2 text-xs">
                        <Monitor className="h-3.5 w-3.5 shrink-0 text-cos-slate-light" />
                        <span className="flex-1 truncate text-cos-midnight">{parseUA(s.userAgent)}</span>
                        {s.ipAddress && <span className="font-mono text-cos-slate">{s.ipAddress}</span>}
                        <span className="shrink-0 text-cos-slate-light">{timeAgo(s.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-5">

              {/* Org & subscription */}
              {membership && (
                <Section title="Organisation" icon={<Building2 className="h-4 w-4 text-cos-signal" />}>
                  <div className="space-y-3">
                    <button
                      onClick={() => router.push(`/admin/customers/${membership.orgId}`)}
                      className="flex w-full items-center justify-between rounded-cos bg-cos-cloud/50 px-3 py-2 text-left hover:bg-cos-electric/5 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-cos-midnight">{membership.orgName}</p>
                        <p className="text-xs text-cos-slate capitalize">{membership.memberRole} · Joined {formatDate(membership.memberSince)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-cos-slate-light" />
                    </button>
                    {subscription && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("rounded-cos-pill px-2.5 py-0.5 text-[10px] font-bold uppercase", PLAN_COLORS[subscription.plan] ?? PLAN_COLORS.free)}>
                          {subscription.plan}
                        </span>
                        <span className={cn("rounded-cos-pill px-2 py-0.5 text-[10px] font-medium", SUB_STATUS_COLORS[subscription.status] ?? "bg-cos-cloud text-cos-slate")}>
                          {subscription.status}
                        </span>
                        {subscription.cancelAtPeriodEnd && (
                          <span className="text-[10px] text-cos-ember font-medium">Cancels {formatDate(subscription.currentPeriodEnd)}</span>
                        )}
                        {subscription.trialEnd && (
                          <span className="text-[10px] text-blue-600 font-medium">Trial ends {formatDate(subscription.trialEnd)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Firm */}
              {firm && (
                <Section title="Firm" icon={<Briefcase className="h-4 w-4 text-cos-warm" />}>
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-cos-midnight">{firm.name}</p>
                    {firm.firmType && <p className="text-xs text-cos-slate capitalize">{firm.firmType.replace(/_/g, " ")}</p>}
                    {firm.sizeBand && <p className="text-xs text-cos-slate">{firm.sizeBand}</p>}
                    {firm.profileCompleteness != null && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-full bg-cos-cloud h-1.5">
                          <div className="h-1.5 rounded-full bg-cos-electric" style={{ width: `${firm.profileCompleteness}%` }} />
                        </div>
                        <span className="text-[10px] text-cos-slate shrink-0">{Math.round(firm.profileCompleteness)}%</span>
                      </div>
                    )}
                    {firm.website && (
                      <a href={firm.website.startsWith("http") ? firm.website : `https://${firm.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-cos-electric hover:underline">
                        <Globe className="h-3 w-3" />{firm.website}
                      </a>
                    )}
                  </div>
                </Section>
              )}

              {/* Usage summary */}
              <Section title="Ossy Usage" icon={<Brain className="h-4 w-4 text-purple-500" />}
                action={
                  <button onClick={() => setActiveTab("activity")} className="text-xs text-cos-electric hover:underline">
                    View all →
                  </button>
                }
              >
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-xs">
                    <span className="text-cos-slate">Total AI cost</span>
                    <span className="font-mono font-medium text-cos-midnight">${Number(stats.aiCostTotal).toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-cos-slate">API calls</span>
                    <span className="font-medium text-cos-midnight">{stats.aiCallCount}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-cos-slate">Conversations</span>
                    <span className="font-medium text-cos-midnight">{stats.conversationCount}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-cos-slate">Memories stored</span>
                    <span className="font-medium text-cos-midnight">{stats.memoryCount}</span>
                  </div>
                  {stats.lastConversationAt && (
                    <div className="flex justify-between text-xs">
                      <span className="text-cos-slate">Last conversation</span>
                      <span className="text-cos-slate-light">{timeAgo(stats.lastConversationAt)}</span>
                    </div>
                  )}
                </div>
              </Section>

            </div>
          </div>

          {/* Danger Zone */}
          <div className="mt-5 rounded-cos-lg border-2 border-cos-ember/30 bg-white p-5">
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cos-ember">
              <AlertTriangle className="h-3.5 w-3.5" /> Danger Zone
            </h3>
            <p className="mb-4 text-xs text-cos-slate">Permanently delete this user account and all associated data. This cannot be undone.</p>
            <button
              onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(""); setDeleteChecked(false); setDeleteError(null); }}
              className="flex items-center gap-2 rounded-cos border border-cos-ember/40 bg-cos-ember/5 px-4 py-2 text-xs font-medium text-cos-ember hover:bg-cos-ember/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete User Account
            </button>
          </div>
          </>
        )}

        {/* EMAILS */}
        {activeTab === "emails" && (
          <div className="space-y-4">
            {commsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
              </div>
            ) : !commsData?.configured ? (
              <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-16">
                <Mail className="h-8 w-8 text-cos-slate-light" />
                <p className="mt-3 text-sm font-medium text-cos-midnight">Customer.io not configured</p>
                <p className="mt-1 text-xs text-cos-slate">Set CUSTOMERIO_APP_API_KEY to see email history.</p>
              </div>
            ) : !commsData.found ? (
              <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-16">
                <Mail className="h-8 w-8 text-cos-slate-light" />
                <p className="mt-3 text-sm font-medium text-cos-midnight">No Customer.io record</p>
                <p className="mt-1 text-xs text-cos-slate">{user.email} has not received any emails via CIO yet.</p>
              </div>
            ) : commsData.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-16">
                <Mail className="h-8 w-8 text-cos-slate-light" />
                <p className="mt-3 text-sm font-medium text-cos-midnight">No emails sent yet</p>
              </div>
            ) : (
              <>
                {/* CIO attributes — notification prefs */}
                {commsData.cioAttributes && Object.keys(commsData.cioAttributes).some(k => k.startsWith("pref_")) && (
                  <div className="flex flex-wrap items-center gap-2 rounded-cos-lg border border-cos-border bg-white px-4 py-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate mr-2">Notification prefs:</span>
                    {[
                      ["pref_new_matches", "New matches"],
                      ["pref_partnership_updates", "Partnership updates"],
                      ["pref_weekly_digest", "Weekly digest"],
                      ["pref_product_updates", "Product updates"],
                    ].map(([key, label]) => (
                      <span key={key} className={cn(
                        "rounded-cos-pill px-2.5 py-0.5 text-[10px] font-medium",
                        commsData.cioAttributes![key] !== false
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-cos-cloud text-cos-slate line-through"
                      )}>
                        {label}
                      </span>
                    ))}
                  </div>
                )}

                <div className="rounded-cos-lg border border-cos-border bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-cos-border bg-cos-cloud/40">
                        <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cos-slate">Subject</th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cos-slate">Status</th>
                        <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-cos-slate">Sent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cos-border">
                      {commsData.messages.map((msg) => {
                        const m = msg.metrics;
                        const failed = !!msg.failure_message || m.bounced || m.failed;
                        const opened = m.human_opened || m.opened;
                        const delivered = m["secondary:delivered"] || m.delivered;
                        const status = failed ? "failed" : opened ? "opened" : delivered ? "delivered" : m.sent ? "sent" : "queued";
                        const statusStyles: Record<string, string> = {
                          opened: "bg-emerald-100 text-emerald-700",
                          delivered: "bg-cos-electric/10 text-cos-electric",
                          sent: "bg-cos-cloud text-cos-slate",
                          queued: "bg-cos-cloud text-cos-slate-light",
                          failed: "bg-cos-ember/10 text-cos-ember",
                        };
                        return (
                          <tr key={msg.id} className="hover:bg-cos-cloud/30 transition-colors">
                            <td className="px-4 py-3">
                              <p className="max-w-lg truncate font-medium text-cos-midnight">{msg.subject || <span className="italic text-cos-slate-light">No subject</span>}</p>
                              {msg.campaign_id && <p className="mt-0.5 text-[10px] text-cos-slate">Campaign #{msg.campaign_id}</p>}
                              {msg.failure_message && <p className="mt-0.5 text-[10px] text-cos-ember">{msg.failure_message}</p>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn("inline-block rounded-cos-pill px-2 py-0.5 text-[10px] font-semibold uppercase", statusStyles[status])}>
                                {status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-cos-slate whitespace-nowrap">
                              {formatDateTime(new Date(msg.created * 1000).toISOString())}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* CONVERSATIONS */}
        {activeTab === "conversations" && (
          <div className="space-y-4">
            {/* Search */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cos-slate-light" />
                <input
                  type="text"
                  placeholder="Search within conversations..."
                  value={convSearch}
                  onChange={(e) => setConvSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchConversations()}
                  className="w-full rounded-cos-lg border border-cos-border bg-white py-2 pl-9 pr-4 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric/30"
                />
              </div>
              <Button onClick={searchConversations} variant="outline" size="sm" className="h-[38px] px-4 text-xs">Search</Button>
            </div>

            {convsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-5">
                {/* List */}
                <div className="space-y-1 lg:col-span-2 max-h-[600px] overflow-y-auto">
                  {conversations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-12">
                      <MessageSquare className="h-8 w-8 text-cos-slate-light" />
                      <p className="mt-2 text-sm text-cos-slate">No conversations found</p>
                    </div>
                  ) : conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => loadThread(conv.id)}
                      className={cn(
                        "w-full text-left rounded-cos-lg border px-4 py-3 transition-colors",
                        selectedConv === conv.id
                          ? "border-cos-electric bg-cos-electric/5"
                          : "border-cos-border bg-white hover:border-cos-electric/30"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-cos-midnight">{conv.title ?? "Untitled"}</p>
                        <span className="shrink-0 rounded-cos-pill bg-cos-cloud px-1.5 py-0.5 text-[9px] font-medium text-cos-slate uppercase">{conv.mode}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-cos-slate-light">
                        <span>{conv.messageCount} messages</span>
                        <span>{conv.lastMessageAt ? timeAgo(conv.lastMessageAt) : formatDate(conv.createdAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Thread */}
                <div className="lg:col-span-3 rounded-cos-lg border border-cos-border bg-white overflow-hidden">
                  {!selectedConv ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <MessageSquare className="h-8 w-8 text-cos-slate-light" />
                      <p className="mt-2 text-sm text-cos-slate">Select a conversation</p>
                    </div>
                  ) : convMsgsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
                    </div>
                  ) : (
                    <div className="flex flex-col h-[600px]">
                      <div className="border-b border-cos-border px-4 py-3">
                        <p className="text-sm font-medium text-cos-midnight">
                          {conversations.find((c) => c.id === selectedConv)?.title ?? "Conversation"}
                        </p>
                      </div>
                      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                        {convMessages.map((msg) => (
                          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                            <div className={cn(
                              "max-w-[80%] rounded-cos-lg px-3 py-2 text-sm",
                              msg.role === "user"
                                ? "bg-cos-electric text-white"
                                : "bg-cos-cloud text-cos-midnight"
                            )}>
                              <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                              <p className={cn("mt-1 text-[10px]", msg.role === "user" ? "text-white/60" : "text-cos-slate-light")}>
                                {timeAgo(msg.createdAt)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ACTIVITY */}
        {activeTab === "activity" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {["all", "conversation", "ai_usage", "onboarding"].map((type) => (
                <button
                  key={type}
                  onClick={() => { setActivityFilter(type); setActivityLoaded(false); }}
                  className={cn(
                    "rounded-cos-pill px-3 py-1.5 text-xs font-medium transition-colors",
                    activityFilter === type
                      ? "bg-cos-electric text-white"
                      : "bg-cos-cloud text-cos-slate hover:bg-cos-cloud-dim"
                  )}
                >
                  {type === "all" ? "All" : type.replace(/_/g, " ")}
                </button>
              ))}
            </div>

            {activityLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
              </div>
            ) : activityEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-12">
                <Activity className="h-8 w-8 text-cos-slate-light" />
                <p className="mt-2 text-sm text-cos-slate">No activity found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activityEvents.map((evt, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-cos-lg border border-cos-border bg-white px-4 py-3">
                    <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-cos-cloud">
                      {EVENT_ICONS[evt.type] ?? <Activity className="h-3.5 w-3.5 text-cos-slate" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-cos-midnight">{evt.title}</span>
                        <span className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[9px] font-medium text-cos-slate uppercase">
                          {evt.type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-cos-slate">{evt.detail}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-cos-slate-light">{formatDateTime(evt.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>

    {/* ── Delete User Modal ──────────────────────────────────── */}
    {showDeleteModal && data && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
        <div className="relative w-full max-w-md rounded-cos-xl border-2 border-cos-ember/30 bg-white p-6 shadow-xl">
          <button
            onClick={() => setShowDeleteModal(false)}
            className="absolute right-4 top-4 rounded p-1 text-cos-slate hover:bg-cos-cloud transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cos-ember/10">
              <AlertTriangle className="h-5 w-5 text-cos-ember" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-cos-midnight">Delete user account</h2>
              <p className="text-xs text-cos-slate">This is permanent and cannot be undone.</p>
            </div>
          </div>

          <div className="mb-4 rounded-cos bg-cos-ember/5 border border-cos-ember/20 p-3 text-xs text-cos-ember space-y-1">
            <p><strong>This will permanently delete:</strong></p>
            <ul className="ml-3 list-disc space-y-0.5 text-cos-ember/80">
              <li>All conversations and messages</li>
              <li>All memory entries</li>
              <li>All AI usage logs</li>
              <li>All sessions and login records</li>
              <li>Org membership (org itself is not deleted)</li>
            </ul>
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-cos-midnight">
              Type <span className="font-mono font-bold">{data.user.email}</span> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={data.user.email}
              className="w-full rounded-cos-lg border border-cos-border bg-cos-cloud/30 px-3 py-2 text-sm font-mono text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-ember focus:outline-none focus:ring-1 focus:ring-cos-ember/30"
            />
          </div>

          <label className="mb-5 flex cursor-pointer items-start gap-2.5 text-xs text-cos-slate">
            <input
              type="checkbox"
              checked={deleteChecked}
              onChange={(e) => setDeleteChecked(e.target.checked)}
              className="mt-0.5 shrink-0 accent-cos-ember"
            />
            I understand this action is permanent and cannot be reversed.
          </label>

          {deleteError && (
            <p className="mb-3 rounded-cos bg-cos-ember/5 px-3 py-2 text-xs text-cos-ember border border-cos-ember/20">{deleteError}</p>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <button
              onClick={handleDeleteUser}
              disabled={deleteConfirmText !== data.user.email || !deleteChecked || deleting}
              className="flex flex-1 items-center justify-center gap-2 rounded-cos-lg bg-cos-ember px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cos-ember/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? "Deleting…" : "Delete Permanently"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
