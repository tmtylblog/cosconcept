"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Users,
  Globe,
  CreditCard,
  Sparkles,
  MessageSquare,
  Activity,
  Handshake,
  Shield,
  Loader2,
  Eye,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  FileText,
  Lightbulb,
  Search,
  ExternalLink,
  Ban,
  UserCheck,
  BarChart3,
  Bot,
  User,
  Share2,
  UserPlus,
  Link2,
  Mail,
  Copy,
  Check,
  Linkedin,
  Download,
  Zap,
  AlertCircle,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  ExpertProfileCard,
  type ExpertProfileData,
  type SpecialistProfileData,
} from "@/components/experts/expert-profile-card";

/* ── Types ────────────────────────────────────────────────────────── */

interface CustomerData {
  org: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    metadata: string | Record<string, unknown> | null;
    createdAt: string;
  };
  firm: {
    id: string;
    name: string;
    website: string | null;
    description: string | null;
    firmType: string | null;
    sizeBand: string | null;
    profileCompleteness: number | null;
    enrichmentData: Record<string, unknown> | null;
    enrichmentStatus: string | null;
    graphNodeId: string | null;
    isCosCustomer: boolean;
    entityType: string | null;
    createdAt: string;
  } | null;
  subscription: {
    id: string;
    plan: string;
    status: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialStart: string | null;
    trialEnd: string | null;
    giftExpiresAt: string | null;
    giftReturnPlan: string | null;
    createdAt: string;
  } | null;
  members: {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    userImage: string | null;
    banned: boolean;
    role: string;
    createdAt: string;
  }[];
  legacyUsers: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    title: string | null;
    legacyRoles: string[];
    createdAt: string;
  }[];
  stats: {
    enrichmentCost: number;
    aiCost: number;
    messageCount: number;
    conversationCount: number;
    caseStudyCount: number;
    opportunityCount: number;
    partnershipCount: number;
  };
  enrichment: {
    totalEntries: number;
    totalCost: number;
    phases: string[];
    lastEnriched: string | null;
  };
}

interface ConversationListItem {
  id: string;
  title: string | null;
  mode: string;
  userName: string;
  userEmail: string;
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
  userName: string | null;
  metadata: Record<string, unknown>;
}

interface PartnershipRow {
  id: string;
  partnerFirmName: string;
  partnerFirmWebsite: string | null;
  status: string;
  type: string;
  matchScore: number | null;
  matchExplanation: string | null;
  createdAt: string;
  acceptedAt: string | null;
}

interface OpportunityRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  estimatedValue: string | null;
  signalType: string;
  clientName: string | null;
  createdAt: string;
}

interface LeadRow {
  id: string;
  title: string;
  status: string;
  estimatedValue: string | null;
  clientName: string | null;
  qualityScore: number;
  createdAt: string;
}

interface BillingData {
  subscription: CustomerData["subscription"];
  usage: {
    aiCost: number;
    aiCalls: number;
    aiInputTokens: number;
    aiOutputTokens: number;
    enrichmentCost: number;
  };
  billingEvents: {
    id: string;
    eventType: string;
    data: unknown;
    createdAt: string;
  }[];
}

interface AdminExpert {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  title: string | null;
  linkedinUrl: string | null;
  photoUrl: string | null;
  division: string | null;
  userId: string | null;
  claimStatus: "claimed" | "invited" | "expired" | "unclaimed";
  inviteSentAt: string | null;
  profileCount: number;
  strongProfiles: number;
  partialProfiles: number;
  profileCompleteness: number | null;
  createdAt: string;
  updatedAt: string | null;
  enrichmentStatus: string | null;
  // Team import fields
  expertTier: "expert" | "potential_expert" | "not_expert" | null;
  isFullyEnriched: boolean;
  pdlEnrichedAt: string | null;
}

interface TeamImportEstimate {
  employeeCount: number;
  estimates: {
    searchCredits: number;
    enrichCreditsFree: number;
    enrichCreditsPro: number;
    totalFree: number;
    totalPro: number;
  } | null;
}

interface TeamImportStatus {
  phase: string;
  jobId?: string;
  jobStatus?: string;
  jobError?: string;
  jobResult?: Record<string, unknown>;
  startedAt?: string | null;
  completedAt?: string | null;
  searchResults: {
    total: number;
    experts: number;
    potentialExperts: number;
    notExperts: number;
    unclassified: number;
  } | null;
  enrichProgress: {
    total: number;
    completed: number;
    running: number;
    failed: number;
  } | null;
}

type TabId =
  | "overview"
  | "users"
  | "firm-profile"
  | "activity"
  | "billing"
  | "partnerships"
  | "admin";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "users", label: "Users & Team", icon: <Users className="h-4 w-4" /> },
  { id: "firm-profile", label: "Firm Profile", icon: <Building2 className="h-4 w-4" /> },
  { id: "activity", label: "Activity", icon: <Activity className="h-4 w-4" /> },
  { id: "billing", label: "Billing", icon: <CreditCard className="h-4 w-4" /> },
  { id: "partnerships", label: "Partnerships", icon: <Handshake className="h-4 w-4" /> },
  { id: "admin", label: "Admin", icon: <Shield className="h-4 w-4" /> },
];

const PLAN_COLORS: Record<string, string> = {
  free: "bg-cos-cloud text-cos-slate",
  pro: "bg-cos-electric/10 text-cos-electric",
  enterprise: "bg-cos-warm/10 text-cos-warm",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-cos-signal/8 text-cos-signal",
  trialing: "bg-cos-electric/8 text-cos-electric",
  past_due: "bg-cos-ember/10 text-cos-ember",
  canceled: "bg-cos-slate-light/10 text-cos-slate",
  unpaid: "bg-cos-ember/8 text-cos-ember",
};

const PHASE_COLORS: Record<string, string> = {
  jina: "bg-cos-electric/10 text-cos-electric",
  classifier: "bg-cos-signal/10 text-cos-signal",
  pdl: "bg-cos-electric/8 text-cos-electric",
  linkedin: "bg-cos-electric/8 text-cos-electric",
  case_study: "bg-cos-warm/10 text-cos-warm",
  onboarding: "bg-cos-signal/8 text-cos-signal",
  memory: "bg-cos-warm/8 text-cos-warm",
  deep_crawl: "bg-cos-warm/8 text-cos-warm",
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  conversation: <MessageSquare className="h-3.5 w-3.5 text-cos-electric" />,
  ai_usage: <Cpu className="h-3.5 w-3.5 text-cos-electric" />,
  enrichment: <Sparkles className="h-3.5 w-3.5 text-cos-warm" />,
  onboarding: <FileText className="h-3.5 w-3.5 text-cos-signal" />,
  email: <Mail className="h-3.5 w-3.5 text-cos-signal" />,
};

/* ── Helpers ──────────────────────────────────────────────────────── */

function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

function Section({
  title,
  icon,
  children,
  action,
  className = "",
}: {
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
          <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
            {title}
          </h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatPill({
  label,
  value,
  color = "text-cos-electric",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-cos-lg bg-white border border-cos-border px-4 py-2.5 text-center min-w-[100px]">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-cos-slate">
        {label}
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────── */

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const [data, setData] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Tab-specific state
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [convsLoading, setConvsLoading] = useState(false);
  const [convsLoaded, setConvsLoaded] = useState(false);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [convMessages, setConvMessages] = useState<ConversationMessage[]>([]);
  const [convMsgsLoading, setConvMsgsLoading] = useState(false);
  const [convSearch, setConvSearch] = useState("");

  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [activityFilter, setActivityFilter] = useState("all");
  const [activityView, setActivityView] = useState<"timeline" | "conversations">("timeline");

  const [partnershipData, setPartnershipData] = useState<{
    partnerships: PartnershipRow[];
    opportunities: OpportunityRow[];
    leads: LeadRow[];
  } | null>(null);
  const [partnershipsLoading, setPartnershipsLoading] = useState(false);
  const [partnershipsLoaded, setPartnershipsLoaded] = useState(false);

  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [billingAction, setBillingAction] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [giftMonths, setGiftMonths] = useState(1);
  const [giftPlan, setGiftPlan] = useState<"pro" | "enterprise">("pro");
  const [giftReturnPlan, setGiftReturnPlan] = useState<"free" | "pro">("free");

  // Communications (Customer.io) state
  const [commsData, setCommsData] = useState<{
    messages: Array<{
      id: string;
      recipient: string;
      subject: string;
      type: string;
      campaign_id: number | null;
      created: number;
      metrics: Record<string, number | undefined>;
      failure_message: string | null;
      userEmail: string;
      userName: string;
    }>;
    configured: boolean;
    found: number;
    total: number;
  } | null>(null);
  const [commsLoading, setCommsLoading] = useState(false);
  const [commsLoaded, setCommsLoaded] = useState(false);

  const [impersonating, setImpersonating] = useState<string | null>(null);

  // Delete org modal
  const [showDeleteOrgModal, setShowDeleteOrgModal] = useState(false);
  const [deleteOrgConfirmText, setDeleteOrgConfirmText] = useState("");
  const [deleteOrgChecked, setDeleteOrgChecked] = useState(false);
  const [deletingOrg, setDeletingOrg] = useState(false);
  const [deleteOrgError, setDeleteOrgError] = useState<string | null>(null);

  // Expert roster state
  const [experts, setExperts] = useState<AdminExpert[]>([]);
  const [expertsLoading, setExpertsLoading] = useState(false);
  const [expertsLoaded, setExpertsLoaded] = useState(false);
  const [expertsPage, setExpertsPage] = useState(1);
  const [expertsTotalPages, setExpertsTotalPages] = useState(1);
  const [expertsTotalCount, setExpertsTotalCount] = useState(0);
  const [showAddExpert, setShowAddExpert] = useState(false);
  const [addExpertForm, setAddExpertForm] = useState({ firstName: "", lastName: "", email: "", title: "", linkedinUrl: "" });
  const [addingExpert, setAddingExpert] = useState(false);
  const [invitingExpert, setInvitingExpert] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Expert profile drawer
  const [drawerExpertId, setDrawerExpertId] = useState<string | null>(null);
  const [drawerExpert, setDrawerExpert] = useState<ExpertProfileData | null>(null);
  const [drawerSPs, setDrawerSPs] = useState<SpecialistProfileData[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [linkingUser, setLinkingUser] = useState<string | null>(null);

  // Team import state
  const [importEstimate, setImportEstimate] = useState<TeamImportEstimate | null>(null);
  const [importEstimateLoading, setImportEstimateLoading] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState<"free" | "pro" | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<TeamImportStatus | null>(null);
  const [importPolling, setImportPolling] = useState(false);
  const [enrichingExpert, setEnrichingExpert] = useState<string | null>(null);
  const [enrichingAll, setEnrichingAll] = useState(false);
  const [enrichAllResult, setEnrichAllResult] = useState<{ queued: number; skipped: number } | null>(null);

  // Primary data load
  useEffect(() => {
    fetch(`/api/admin/customers/${orgId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [orgId]);

  // Lazy load conversations (loaded alongside activity tab)
  useEffect(() => {
    if (activeTab !== "activity" || convsLoaded) return;
    setConvsLoading(true);
    fetch(`/api/admin/customers/${orgId}/conversations`)
      .then((r) => r.json())
      .then((d) => {
        setConversations(d.conversations ?? []);
        setConvsLoaded(true);
      })
      .catch(console.error)
      .finally(() => setConvsLoading(false));
  }, [activeTab, convsLoaded, orgId]);

  // Lazy load activity
  useEffect(() => {
    if (activeTab !== "activity" || activityLoaded) return;
    setActivityLoading(true);
    fetch(`/api/admin/customers/${orgId}/activity?type=${activityFilter}`)
      .then((r) => r.json())
      .then((d) => {
        setActivityEvents(d.events ?? []);
        setActivityLoaded(true);
      })
      .catch(console.error)
      .finally(() => setActivityLoading(false));
  }, [activeTab, activityLoaded, orgId, activityFilter]);

  // Lazy load partnerships
  useEffect(() => {
    if (activeTab !== "partnerships" || partnershipsLoaded) return;
    setPartnershipsLoading(true);
    fetch(`/api/admin/customers/${orgId}/partnerships`)
      .then((r) => r.json())
      .then((d) => {
        setPartnershipData(d);
        setPartnershipsLoaded(true);
      })
      .catch(console.error)
      .finally(() => setPartnershipsLoading(false));
  }, [activeTab, partnershipsLoaded, orgId]);

  // Billing fetch (reusable for lazy load + reload after changes)
  const fetchBilling = useCallback(() => {
    setBillingLoading(true);
    fetch(`/api/admin/customers/${orgId}/billing`)
      .then((r) => {
        if (!r.ok) throw new Error(`Billing API ${r.status}`);
        return r.json();
      })
      .then((d) => {
        // Ensure shape is valid (not an error response)
        if (d && !d.error) {
          setBillingData(d);
        } else {
          // API returned OK but with error field, or empty — treat as empty billing
          setBillingData({
            subscription: null,
            usage: { aiCost: 0, aiCalls: 0, aiInputTokens: 0, aiOutputTokens: 0, enrichmentCost: 0 },
            billingEvents: [],
          });
        }
        setBillingLoaded(true);
      })
      .catch((err) => {
        console.error("[Billing fetch]", err);
        // Still set billing data so UI doesn't show "Unable to load" forever
        setBillingData({
          subscription: null,
          usage: { aiCost: 0, aiCalls: 0, aiInputTokens: 0, aiOutputTokens: 0, enrichmentCost: 0 },
          billingEvents: [],
        });
        setBillingLoaded(true);
      })
      .finally(() => setBillingLoading(false));
  }, [orgId]);

  // Lazy load billing
  useEffect(() => {
    if (activeTab !== "billing" || billingLoaded) return;
    fetchBilling();
  }, [activeTab, billingLoaded, fetchBilling]);

  // Admin billing actions
  async function handleBillingAction(body: Record<string, unknown>) {
    setBillingAction(true);
    setBillingError(null);
    try {
      const res = await fetch(`/api/admin/customers/${orgId}/billing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        setBillingError(err.error ?? "Failed to update billing");
        return;
      }
      // Reload billing data
      fetchBilling();
    } catch {
      setBillingError("Network error — please try again");
    } finally {
      setBillingAction(false);
    }
  }

  // Lazy load communications (Customer.io) — loads alongside activity tab
  useEffect(() => {
    if (activeTab !== "activity" || commsLoaded) return;
    fetch(`/api/admin/customers/${orgId}/communications`)
      .then((r) => r.json())
      .then((d) => {
        setCommsData(d);
        setCommsLoaded(true);
      })
      .catch(console.error);
  }, [activeTab, commsLoaded, orgId]);

  // Lazy load experts when Users & Team tab is active
  const loadExperts = useCallback((page = 1) => {
    setExpertsLoading(true);
    fetch(`/api/admin/customers/${orgId}/experts?page=${page}&limit=50`)
      .then((r) => r.json())
      .then((d) => {
        setExperts(d.experts ?? []);
        setExpertsTotalPages(d.totalPages ?? 1);
        setExpertsTotalCount(d.total ?? 0);
        setExpertsPage(page);
        setExpertsLoaded(true);
      })
      .catch(console.error)
      .finally(() => setExpertsLoading(false));
  }, [orgId]);

  useEffect(() => {
    if (activeTab !== "users" || expertsLoaded) return;
    loadExperts();
  }, [activeTab, expertsLoaded, loadExperts]);

  // Auto-check import status when Users tab loads (picks up in-progress imports)
  useEffect(() => {
    if (activeTab !== "users" || importPolling || importStatus) return;
    fetch(`/api/admin/customers/${orgId}/team-import/status`)
      .then((r) => r.json())
      .then((status: TeamImportStatus) => {
        if (status.phase && status.phase !== "idle") {
          setImportStatus(status);
          // Resume polling if still in progress
          if (status.phase === "queued" || status.phase === "searching" || status.phase === "enriching") {
            setImportPolling(true);
            pollImportStatus();
          }
        }
      })
      .catch(() => {}); // Silently fail — not critical
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, orgId]);

  // Add expert handler
  async function handleAddExpert() {
    if (!addExpertForm.firstName && !addExpertForm.lastName) return;
    setAddingExpert(true);
    try {
      const res = await fetch(`/api/admin/customers/${orgId}/experts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addExpertForm),
      });
      if (res.ok) {
        setShowAddExpert(false);
        setAddExpertForm({ firstName: "", lastName: "", email: "", title: "", linkedinUrl: "" });
        setExpertsLoaded(false); // trigger reload
      }
    } catch (err) {
      console.error("Failed to add expert:", err);
    } finally {
      setAddingExpert(false);
    }
  }

  // Send invite email
  async function handleSendInvite(expertId: string) {
    setInvitingExpert(expertId);
    try {
      const res = await fetch(`/api/experts/${expertId}/invite`, { method: "POST" });
      if (res.ok) {
        setExpertsLoaded(false); // trigger reload
      }
    } catch (err) {
      console.error("Failed to send invite:", err);
    } finally {
      setInvitingExpert(null);
    }
  }

  // Copy claim link
  async function handleCopyLink(expertId: string) {
    try {
      const res = await fetch(`/api/experts/${expertId}/invite-link`, { method: "POST" });
      if (res.ok) {
        const { claimUrl } = await res.json();
        await navigator.clipboard.writeText(claimUrl);
        setCopiedLink(expertId);
        setTimeout(() => setCopiedLink(null), 2000);
      }
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  }

  // Link existing user to expert
  async function handleLinkUser(expertId: string, userId: string) {
    setLinkingUser(expertId);
    try {
      await fetch(`/api/experts/${expertId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      setExpertsLoaded(false); // trigger reload
    } catch (err) {
      console.error("Failed to link user:", err);
    } finally {
      setLinkingUser(null);
    }
  }

  // Team import handlers
  async function handleImportEstimate(tier: "free" | "pro") {
    setImportEstimateLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${orgId}/team-import/estimate`);
      const est = await res.json();
      setImportEstimate(est);
      setShowImportConfirm(tier);
    } catch (err) {
      console.error("Failed to get import estimate:", err);
    } finally {
      setImportEstimateLoading(false);
    }
  }

  async function handleTeamImport(tier: "free" | "pro", force = false) {
    setImportLoading(true);
    setShowImportConfirm(null);
    try {
      const res = await fetch(`/api/admin/customers/${orgId}/team-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, force }),
      });
      if (res.ok) {
        // Start polling for status
        setImportStatus(null); // Reset previous status
        setImportPolling(true);
        pollImportStatus();
      }
    } catch (err) {
      console.error("Failed to trigger import:", err);
    } finally {
      setImportLoading(false);
    }
  }

  async function pollImportStatus() {
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/customers/${orgId}/team-import/status`);
        const status = await res.json();
        setImportStatus(status);

        if (status.phase === "done" || status.phase === "error") {
          setImportPolling(false);
          // Reload experts
          setExpertsLoaded(false);
          loadExperts();
          return;
        }

        // Continue polling
        setTimeout(poll, 3000);
      } catch (err) {
        console.error("Failed to poll status:", err);
        setImportPolling(false);
      }
    };
    poll();
  }

  async function handleManualEnrich(expertId: string) {
    setEnrichingExpert(expertId);
    try {
      await fetch(`/api/admin/customers/${orgId}/experts/${expertId}/enrich`, {
        method: "POST",
      });
      // Poll until enrichment completes (check every 5s, max 2 min)
      let attempts = 0;
      const pollEnrich = async () => {
        attempts++;
        if (attempts > 24) { setEnrichingExpert(null); return; }
        try {
          const res = await fetch(`/api/admin/customers/${orgId}/experts?ids=${expertId}`);
          if (res.ok) {
            const data = await res.json();
            const expert = data.experts?.[0] ?? data;
            if (expert?.enrichmentStatus === "enriched" || expert?.isFullyEnriched) {
              setEnrichingExpert(null);
              setExpertsLoaded(false);
              loadExperts();
              return;
            }
          }
        } catch { /* continue polling */ }
        setTimeout(pollEnrich, 5000);
      };
      setTimeout(pollEnrich, 5000);
    } catch (err) {
      console.error("Failed to enrich expert:", err);
      setEnrichingExpert(null);
    }
  }

  // Enrich all experts handler
  async function handleEnrichAll() {
    setEnrichingAll(true);
    setEnrichAllResult(null);
    try {
      const res = await fetch(`/api/admin/customers/${orgId}/experts/enrich-all`, {
        method: "POST",
      });
      if (res.ok) {
        const result = await res.json();
        setEnrichAllResult({ queued: result.queued, skipped: result.skipped });
        // Reload experts after a delay to pick up queued state
        if (result.queued > 0) {
          setTimeout(() => {
            setExpertsLoaded(false);
            loadExperts();
          }, 5000);
        }
      }
    } catch (err) {
      console.error("Failed to enrich all experts:", err);
    } finally {
      setEnrichingAll(false);
    }
  }

  // Fetch expert profile for drawer
  useEffect(() => {
    if (!drawerExpertId) {
      setDrawerExpert(null);
      setDrawerSPs([]);
      return;
    }
    setDrawerLoading(true);
    fetch(`/api/experts/${drawerExpertId}`)
      .then((r) => r.json())
      .then((data) => {
        setDrawerExpert(data.expert ?? null);
        setDrawerSPs(data.specialistProfiles ?? []);
      })
      .catch(console.error)
      .finally(() => setDrawerLoading(false));
  }, [drawerExpertId]);

  // Load conversation thread
  const loadThread = useCallback(
    async (convId: string) => {
      setSelectedConv(convId);
      setConvMsgsLoading(true);
      try {
        const res = await fetch(
          `/api/admin/customers/${orgId}/conversations?mode=thread&conversationId=${convId}`
        );
        const d = await res.json();
        setConvMessages(d.messages ?? []);
      } catch (err) {
        console.error("Failed to load thread:", err);
      } finally {
        setConvMsgsLoading(false);
      }
    },
    [orgId]
  );

  // Reload activity when filter changes
  useEffect(() => {
    if (activeTab !== "activity" || !activityLoaded) return;
    setActivityLoading(true);
    fetch(`/api/admin/customers/${orgId}/activity?type=${activityFilter}`)
      .then((r) => r.json())
      .then((d) => setActivityEvents(d.events ?? []))
      .catch(console.error)
      .finally(() => setActivityLoading(false));
  }, [activityFilter, activeTab, activityLoaded, orgId]);

  // Search conversations
  const searchConversations = useCallback(async () => {
    if (!convSearch.trim()) {
      setConvsLoaded(false); // trigger re-fetch
      return;
    }
    setConvsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/customers/${orgId}/conversations?search=${encodeURIComponent(convSearch)}`
      );
      const d = await res.json();
      setConversations(d.conversations ?? []);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setConvsLoading(false);
    }
  }, [convSearch, orgId]);

  // Impersonate user — opens simulation in a new tab.
  // Better Auth's impersonateUser replaces the current session cookie, so we:
  // 1. Call impersonateUser to set the cookie
  // 2. Open new tab pointing to /dashboard (it picks up the impersonated session)
  // 3. Immediately call stopImpersonating to restore admin session in this tab
  // The new tab keeps its impersonated cookie until the user clicks "Stop Simulating" there.
  async function handleImpersonate(userId: string) {
    setImpersonating(userId);
    try {
      await authClient.admin.impersonateUser({ userId });
      // Open simulation in new tab — it will pick up the impersonated session cookie
      window.open("/dashboard", "_blank");
      // Brief delay to let the new tab start loading with the impersonated cookie
      await new Promise(r => setTimeout(r, 500));
      // Restore admin session in this tab
      await authClient.admin.stopImpersonating();
    } catch (err) {
      console.error("Impersonation failed:", err);
      // Try to restore admin session if something went wrong
      try { await authClient.admin.stopImpersonating(); } catch {}
    } finally {
      setImpersonating(null);
    }
  }

  async function handleDeleteOrg() {
    setDeletingOrg(true);
    setDeleteOrgError(null);
    try {
      const res = await fetch(`/api/admin/customers/${orgId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      router.push("/admin/customers");
    } catch (err) {
      setDeleteOrgError(err instanceof Error ? err.message : "Delete failed");
      setDeletingOrg(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-cos-electric" />
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/admin/customers")}
          className="flex items-center gap-2 text-sm text-cos-slate hover:text-cos-electric transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Customers
        </button>
        <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-16">
          <Building2 className="h-10 w-10 text-cos-slate-light" />
          <p className="mt-3 text-sm font-medium text-cos-midnight">Customer not found</p>
          <p className="mt-1 text-xs text-cos-slate">{error ?? "Unable to load customer data"}</p>
        </div>
      </div>
    );
  }

  const { org, firm, subscription, members, legacyUsers, stats, enrichment } = data;
  const allUsers = [
    ...members.map((m) => ({
      id: m.id,
      name: m.userName ?? "Unnamed",
      email: m.userEmail,
      role: m.role,
      title: null as string | null,
      banned: m.banned,
      userId: m.userId,
      source: "registered" as const,
      createdAt: m.createdAt,
    })),
    ...(legacyUsers ?? []).map((lu) => ({
      id: lu.id,
      name: [lu.firstName, lu.lastName].filter(Boolean).join(" ") || "Unnamed",
      email: lu.email ?? "",
      role: (lu.legacyRoles?.[0] ?? "member").toLowerCase(),
      title: lu.title,
      banned: false,
      userId: null as string | null,
      source: "imported" as const,
      createdAt: lu.createdAt,
    })),
  ];

  return (
    <>
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push("/admin/customers")}
        className="flex items-center gap-2 text-sm text-cos-slate hover:text-cos-electric transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Customers
      </button>

      {/* Hero Header */}
      <div className="rounded-cos-xl border border-cos-border bg-white overflow-hidden">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-cos-lg bg-gradient-to-br from-cos-electric/20 to-cos-signal/20 text-xl font-bold text-cos-electric">
                {org.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="font-heading text-xl font-bold tracking-tight text-cos-midnight">
                  {firm?.name ?? org.name}
                </h1>
                <div className="mt-1 flex items-center gap-3 text-sm text-cos-slate">
                  {firm?.website && (
                    <a
                      href={firm.website.startsWith("http") ? firm.website : `https://${firm.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-cos-electric hover:underline"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      {firm.website}
                    </a>
                  )}
                  {subscription && (
                    <span
                      className={`rounded-cos-pill px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        PLAN_COLORS[subscription.plan] ?? PLAN_COLORS.free
                      }`}
                    >
                      {subscription.plan}
                    </span>
                  )}
                  {subscription && (
                    <span
                      className={`rounded-cos-pill px-2 py-0.5 text-[10px] font-medium ${
                        STATUS_COLORS[subscription.status] ?? "bg-cos-cloud text-cos-slate"
                      }`}
                    >
                      {subscription.status}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-cos-slate-light">
                    <Clock className="h-3 w-3" />
                    Joined {formatDate(org.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* KPI stat pills */}
          <div className="mt-5 flex flex-wrap gap-3">
            <StatPill
              label="Profile"
              value={firm?.profileCompleteness ? `${Math.round(firm.profileCompleteness)}%` : "0%"}
              color="text-cos-electric"
            />
            <StatPill
              label="Enrichment"
              value={formatCurrency(stats.enrichmentCost)}
              color="text-cos-warm"
            />
            <StatPill
              label="AI Cost"
              value={formatCurrency(stats.aiCost)}
              color="text-cos-electric"
            />
            <StatPill
              label="Messages"
              value={stats.messageCount}
              color="text-cos-signal"
            />
            <StatPill label="Case Studies" value={stats.caseStudyCount} color="text-cos-warm" />
            <StatPill label="Members" value={members.length} color="text-cos-electric" />
            <StatPill label="Partnerships" value={stats.partnershipCount} color="text-cos-signal" />
          </div>
        </div>

        {/* Tab navigation */}
        <div className="border-t border-cos-border bg-cos-cloud/30 px-6">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? "border-cos-electric text-cos-electric"
                    : "border-transparent text-cos-slate hover:text-cos-midnight"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              {/* Members preview */}
              <Section title={`Team Members (${allUsers.length})`} icon={<Users className="h-4 w-4 text-cos-electric" />}>
                {allUsers.length === 0 ? (
                  <p className="text-xs text-cos-slate-light">No members</p>
                ) : (
                  <div className="space-y-2">
                    {allUsers.slice(0, 5).map((u) => (
                      <div key={u.id} className="flex items-center gap-3 rounded-cos bg-cos-cloud/50 px-3 py-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cos-electric/10 text-xs font-bold text-cos-electric">
                          {(u.name ?? u.email ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-cos-midnight">
                            {u.name}
                            {u.title && <span className="ml-1.5 text-xs font-normal text-cos-slate">· {u.title}</span>}
                          </p>
                          <p className="truncate text-xs text-cos-slate">{u.email}</p>
                        </div>
                        <span
                          className={`rounded-cos-pill px-2 py-0.5 text-[10px] font-medium ${
                            u.role === "owner"
                              ? "bg-cos-warm/10 text-cos-warm"
                              : u.role === "admin"
                              ? "bg-cos-electric/10 text-cos-electric"
                              : "bg-cos-cloud text-cos-slate"
                          }`}
                        >
                          {u.role}
                        </span>
                        {u.userId && (
                          <button
                            onClick={() => router.push(`/admin/users/${u.userId}`)}
                            className="text-[10px] text-cos-electric hover:underline shrink-0"
                          >
                            View →
                          </button>
                        )}
                      </div>
                    ))}
                    {allUsers.length > 5 && (
                      <button
                        onClick={() => setActiveTab("users")}
                        className="text-xs text-cos-electric hover:underline"
                      >
                        View all {allUsers.length} members →
                      </button>
                    )}
                  </div>
                )}
              </Section>

              {/* Subscription */}
              <Section title="Subscription" icon={<CreditCard className="h-4 w-4 text-cos-signal" />}>
                {subscription ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`rounded-cos-pill px-3 py-1 text-xs font-bold uppercase ${
                          PLAN_COLORS[subscription.plan] ?? PLAN_COLORS.free
                        }`}
                      >
                        {subscription.plan}
                      </span>
                      <span
                        className={`rounded-cos-pill px-2.5 py-0.5 text-xs font-medium ${
                          STATUS_COLORS[subscription.status] ?? "bg-cos-cloud text-cos-slate"
                        }`}
                      >
                        {subscription.status}
                      </span>
                      {subscription.cancelAtPeriodEnd && (
                        <span className="text-xs text-cos-ember font-medium">
                          Cancels at period end
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs text-cos-slate">
                      <div>
                        <p className="font-medium text-cos-midnight">Current Period</p>
                        <p>{formatDate(subscription.currentPeriodStart)} — {formatDate(subscription.currentPeriodEnd)}</p>
                      </div>
                      {subscription.trialEnd && (
                        <div>
                          <p className="font-medium text-cos-midnight">Trial Ends</p>
                          <p>{formatDate(subscription.trialEnd)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-cos-slate-light">No subscription found</p>
                )}
              </Section>
            </div>

            <div className="space-y-5">
              {/* Firm Snapshot */}
              <Section title="Firm Snapshot" icon={<Building2 className="h-4 w-4 text-cos-signal" />}>
                {firm ? (
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-cos-slate">Type</span>
                      <span className="font-medium text-cos-midnight">
                        {firm.firmType?.replace(/_/g, " ") ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cos-slate">Size Band</span>
                      <span className="font-medium text-cos-midnight">
                        {firm.sizeBand?.replace(/_/g, " ") ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cos-slate">Entity Type</span>
                      <span className="font-medium text-cos-midnight">
                        {firm.entityType ?? "service_firm"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cos-slate">COS Customer</span>
                      <span className={`font-medium ${firm.isCosCustomer ? "text-emerald-600" : "text-cos-slate-light"}`}>
                        {firm.isCosCustomer ? "Yes" : "No"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cos-slate">Enrichment</span>
                      <span className="font-medium text-cos-midnight">
                        {firm.enrichmentStatus ?? "pending"}
                      </span>
                    </div>
                    {firm.graphNodeId && (
                      <a
                        href={`/admin/knowledge-graph`}
                        className="flex items-center gap-1 text-cos-electric hover:underline mt-2"
                      >
                        <Share2 className="h-3 w-3" />
                        View in Knowledge Graph
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-cos-slate-light">No firm linked</p>
                )}
              </Section>

              {/* Enrichment Summary */}
              <Section title="Enrichment" icon={<Sparkles className="h-4 w-4 text-cos-warm" />}>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-cos-slate">Total Cost</span>
                    <span className="font-bold text-cos-warm">{formatCurrency(enrichment.totalCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cos-slate">Steps Run</span>
                    <span className="font-medium text-cos-midnight">{enrichment.totalEntries}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cos-slate">Last Enriched</span>
                    <span className="font-medium text-cos-midnight">{formatDate(enrichment.lastEnriched)}</span>
                  </div>
                  {enrichment.phases.length > 0 && (
                    <div>
                      <p className="text-cos-slate mb-1.5">Phases</p>
                      <div className="flex flex-wrap gap-1">
                        {enrichment.phases.map((phase) => (
                          <span
                            key={phase}
                            className={`rounded-cos-pill px-2 py-0.5 text-[9px] font-medium ${
                              PHASE_COLORS[phase] ?? "bg-cos-cloud text-cos-slate"
                            }`}
                          >
                            {phase}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* Quick Actions */}
              <Section title="Quick Actions" icon={<Lightbulb className="h-4 w-4 text-cos-electric" />}>
                <div className="space-y-2">
                  <button
                    onClick={() => setActiveTab("billing")}
                    className="flex w-full items-center gap-2 rounded-cos px-3 py-2 text-xs font-medium text-cos-slate hover:bg-cos-electric/5 hover:text-cos-electric transition-colors"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Manage Subscription
                  </button>
                  <button
                    onClick={() => { setActiveTab("activity"); setActivityView("conversations"); }}
                    className="flex w-full items-center gap-2 rounded-cos px-3 py-2 text-xs font-medium text-cos-slate hover:bg-cos-electric/5 hover:text-cos-electric transition-colors"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    View Conversations
                  </button>
                  <button
                    onClick={() => setActiveTab("firm-profile")}
                    className="flex w-full items-center gap-2 rounded-cos px-3 py-2 text-xs font-medium text-cos-slate hover:bg-cos-electric/5 hover:text-cos-electric transition-colors"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    View Firm Profile
                  </button>
                </div>
              </Section>
            </div>
          </div>
        )}

        {/* ── USERS & TEAM TAB ── */}
        {activeTab === "users" && (
          <div className="space-y-6">
            {/* ── SECTION 1: Platform Users ── */}
            <Section title={`Platform Users (${members.length})`} icon={<User className="h-4 w-4 text-cos-electric" />}>
              {members.length === 0 ? (
                <p className="text-xs text-cos-slate-light">No platform users in this organization</p>
              ) : (
                <div className="overflow-hidden rounded-cos-lg border border-cos-border">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-cos-border bg-cos-cloud/50">
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">User</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Email</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Role</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Expert Link</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Status</th>
                        <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-cos-slate">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cos-border/60">
                      {members.map((m) => {
                        // Check if this user is linked to any expert
                        const linkedExpert = experts.find((e) => e.userId === m.userId);
                        // Unlinked experts this user could be linked to (match by email)
                        const suggestedExpert = !linkedExpert
                          ? experts.find((e) => !e.userId && e.email && m.userEmail && e.email.toLowerCase() === m.userEmail.toLowerCase())
                          : null;

                        return (
                          <tr
                            key={m.id}
                            className="cursor-pointer transition-colors hover:bg-cos-electric/5"
                            onClick={() => router.push(`/admin/users/${m.userId}`)}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cos-electric/20 to-cos-signal/20 text-xs font-semibold text-cos-electric">
                                  {(m.userName ?? "?").charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium text-cos-midnight group-hover:text-cos-electric">{m.userName ?? "Unnamed"}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-cos-slate">{m.userEmail}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-cos-pill px-2.5 py-0.5 text-[10px] font-medium ${
                                m.role === "owner"
                                  ? "bg-cos-warm/10 text-cos-warm"
                                  : m.role === "admin"
                                  ? "bg-cos-electric/10 text-cos-electric"
                                  : "bg-cos-cloud text-cos-slate"
                              }`}>
                                {m.role}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {linkedExpert ? (
                                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                                  <Link2 className="h-3 w-3" />
                                  Linked
                                </span>
                              ) : suggestedExpert ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleLinkUser(suggestedExpert.id, m.userId); }}
                                  disabled={linkingUser === suggestedExpert.id}
                                  className="inline-flex items-center gap-1.5 rounded-cos-pill bg-cos-electric/5 px-2.5 py-0.5 text-[10px] font-medium text-cos-electric hover:bg-cos-electric/10 transition-colors"
                                >
                                  {linkingUser === suggestedExpert.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Link2 className="h-3 w-3" />
                                  )}
                                  Link to {suggestedExpert.fullName ?? suggestedExpert.firstName}
                                </button>
                              ) : (
                                <span className="text-[10px] text-cos-slate-light">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {m.banned ? (
                                <span className="inline-flex items-center gap-1.5 rounded-cos-pill bg-cos-ember/8 px-2.5 py-0.5 text-xs font-medium text-cos-ember">
                                  <span className="h-1.5 w-1.5 rounded-full bg-cos-ember" />
                                  Banned
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-cos-pill bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  Active
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); router.push(`/admin/users/${m.userId}`); }}
                                  title="View user detail"
                                  className="h-8 gap-1.5 px-2.5 text-xs text-cos-slate hover:text-cos-electric hover:bg-cos-electric/5"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  View
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); handleImpersonate(m.userId); }}
                                  disabled={impersonating === m.userId}
                                  title="Simulate as this user"
                                  className="h-8 gap-1.5 px-2.5 text-xs text-cos-slate hover:text-cos-electric hover:bg-cos-electric/5"
                                >
                                  {impersonating === m.userId ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Eye className="h-3.5 w-3.5" />
                                  )}
                                  Simulate
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* ── SECTION 2: Expert Roster ── */}
            <Section
              title={`Expert Roster (${experts.length})`}
              icon={<Users className="h-4 w-4 text-cos-signal" />}
              action={
                <div className="flex items-center gap-2">
                  {data?.firm?.website && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleImportEstimate("free")}
                        disabled={importLoading || importPolling || importEstimateLoading}
                        className="h-7 gap-1.5 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >
                        {importEstimateLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        Import Team (Free)
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleImportEstimate("pro")}
                        disabled={importLoading || importPolling || importEstimateLoading}
                        className="h-7 gap-1.5 text-xs border-cos-electric/30 text-cos-electric hover:bg-cos-electric/5"
                      >
                        {importEstimateLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5" />
                        )}
                        Import Team (Pro)
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddExpert(true)}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Add Expert
                  </Button>
                </div>
              }
            >
              {/* Add Expert Dialog */}
              {showAddExpert && (
                <div className="mb-4 rounded-cos-lg border border-cos-electric/20 bg-cos-electric/[0.02] p-4">
                  <h4 className="mb-3 text-sm font-semibold text-cos-midnight">Add Expert</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="First name"
                      value={addExpertForm.firstName}
                      onChange={(e) => setAddExpertForm((f) => ({ ...f, firstName: e.target.value }))}
                      className="rounded-cos border border-cos-border bg-white px-3 py-2 text-sm outline-none focus:border-cos-electric"
                    />
                    <input
                      placeholder="Last name"
                      value={addExpertForm.lastName}
                      onChange={(e) => setAddExpertForm((f) => ({ ...f, lastName: e.target.value }))}
                      className="rounded-cos border border-cos-border bg-white px-3 py-2 text-sm outline-none focus:border-cos-electric"
                    />
                    <input
                      placeholder="Email"
                      type="email"
                      value={addExpertForm.email}
                      onChange={(e) => setAddExpertForm((f) => ({ ...f, email: e.target.value }))}
                      className="rounded-cos border border-cos-border bg-white px-3 py-2 text-sm outline-none focus:border-cos-electric"
                    />
                    <input
                      placeholder="Title / Role"
                      value={addExpertForm.title}
                      onChange={(e) => setAddExpertForm((f) => ({ ...f, title: e.target.value }))}
                      className="rounded-cos border border-cos-border bg-white px-3 py-2 text-sm outline-none focus:border-cos-electric"
                    />
                    <input
                      placeholder="LinkedIn URL"
                      value={addExpertForm.linkedinUrl}
                      onChange={(e) => setAddExpertForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
                      className="col-span-2 rounded-cos border border-cos-border bg-white px-3 py-2 text-sm outline-none focus:border-cos-electric"
                    />
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowAddExpert(false)} className="h-8 text-xs">
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddExpert}
                      disabled={addingExpert || (!addExpertForm.firstName && !addExpertForm.lastName)}
                      className="h-8 gap-1.5 text-xs bg-cos-electric text-white hover:bg-cos-electric/90"
                    >
                      {addingExpert ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                      Add Expert
                    </Button>
                  </div>
                </div>
              )}

              {/* Import Confirmation Dialog */}
              {showImportConfirm && (
                <div className="mb-4 rounded-cos-lg border border-cos-electric/20 bg-cos-electric/[0.02] p-4">
                  <h4 className="mb-2 text-sm font-semibold text-cos-midnight">
                    Import Team ({showImportConfirm === "pro" ? "Pro" : "Free"})
                  </h4>
                  {importEstimate?.estimates ? (
                    <>
                      <p className="text-xs text-cos-slate mb-3">
                        PDL shows ~{importEstimate.employeeCount} employees at this company.
                      </p>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="rounded-cos bg-white border border-cos-border p-2 text-center">
                          <div className="text-sm font-bold text-cos-midnight">
                            {importEstimate.estimates.searchCredits}
                          </div>
                          <div className="text-[10px] text-cos-slate">Search credits</div>
                        </div>
                        <div className="rounded-cos bg-white border border-cos-border p-2 text-center">
                          <div className="text-sm font-bold text-cos-electric">
                            {showImportConfirm === "pro" ? importEstimate.estimates.enrichCreditsPro : importEstimate.estimates.enrichCreditsFree}
                          </div>
                          <div className="text-[10px] text-cos-slate">Enrich credits</div>
                        </div>
                        <div className="rounded-cos bg-white border border-cos-border p-2 text-center">
                          <div className="text-sm font-bold text-cos-warm">
                            {showImportConfirm === "pro" ? importEstimate.estimates.totalPro : importEstimate.estimates.totalFree}
                          </div>
                          <div className="text-[10px] text-cos-slate">Total credits</div>
                        </div>
                      </div>
                      <p className="text-[10px] text-cos-slate-light mb-3">
                        {showImportConfirm === "free"
                          ? "Free tier: Searches all employees, classifies them, and auto-enriches the first 5 experts."
                          : "Pro tier: Searches all employees, classifies them, and auto-enriches ALL experts with work history."}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-cos-slate mb-3">
                      Employee count unknown. Costs depend on company size (1 credit per person found).
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowImportConfirm(null)} className="h-8 text-xs">
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleTeamImport(showImportConfirm)}
                      disabled={importLoading}
                      className="h-8 gap-1.5 text-xs bg-cos-electric text-white hover:bg-cos-electric/90"
                    >
                      {importLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Confirm Import
                    </Button>
                  </div>
                </div>
              )}

              {/* Import Progress Panel */}
              {(importPolling || importStatus) && importStatus?.phase !== "idle" && (
                <div className="mb-4 rounded-cos-lg border border-cos-border bg-cos-cloud/30 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
                      Import Progress
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-cos-pill px-2.5 py-0.5 text-[10px] font-medium ${
                        importStatus?.phase === "done" && importStatus?.searchResults?.total === 0
                          ? "bg-amber-50 text-amber-600"
                          : importStatus?.phase === "done" ? "bg-emerald-50 text-emerald-600"
                          : importStatus?.phase === "error" ? "bg-cos-ember/10 text-cos-ember"
                          : importStatus?.phase === "discovered" ? "bg-purple-50 text-purple-600"
                          : "bg-cos-electric/10 text-cos-electric"
                      }`}>
                        {importPolling && <Loader2 className="h-3 w-3 animate-spin" />}
                        {importStatus?.phase === "done"
                          ? (importStatus?.searchResults?.total === 0 ? "No Results" :
                             (importStatus.jobResult as Record<string, unknown> | null)?.skipped ? "Skipped" : "Complete")
                          : importStatus?.phase === "error" ? "Error"
                          : importStatus?.phase === "discovered" ? "Team Discovered via PDL"
                          : importStatus?.phase === "enriching" ? "Enriching..."
                          : importStatus?.phase === "searching" ? "Searching PDL..."
                          : importStatus?.phase === "queued" ? "Queued in Inngest..."
                          : importStatus?.phase}
                      </span>
                      {/* Retry button for stuck/failed jobs */}
                      {(importStatus?.phase === "error" || importStatus?.phase === "queued") && !importLoading && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() => handleTeamImport("free", true)}
                        >
                          <Zap className="h-3 w-3 mr-1" />
                          Retry
                        </Button>
                      )}
                      {/* Enrich All Experts button for discovered phase */}
                      {importStatus?.phase === "discovered" && !enrichingAll && !enrichAllResult && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[10px] px-2 border-purple-200 text-purple-600 hover:bg-purple-50"
                          onClick={handleEnrichAll}
                        >
                          <Sparkles className="h-3 w-3 mr-1" />
                          Enrich All Experts
                        </Button>
                      )}
                      {enrichingAll && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] text-purple-500">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Queuing enrichment jobs...
                        </span>
                      )}
                      {enrichAllResult && (
                        <span className="text-[10px] text-emerald-600">
                          ✓ Queued {enrichAllResult.queued} enrichments ({enrichAllResult.skipped} skipped)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Queued state */}
                  {importStatus?.phase === "queued" && (
                    <div className="mb-2 flex items-start gap-2 rounded bg-amber-50 p-2">
                      <Clock className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-[10px] text-amber-700">
                        <p>Job is queued in Inngest &mdash; should start within seconds.</p>
                        {importStatus.startedAt && (
                          <p className="text-amber-600/70 mt-0.5">
                            Waiting since {new Date(importStatus.startedAt).toLocaleTimeString()}
                          </p>
                        )}
                        {importStatus.jobError && (
                          <p className="text-cos-ember mt-0.5">Last error: {importStatus.jobError}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Done with 0 results — PDL had no data for this domain */}
                  {importStatus?.phase === "done" && importStatus?.searchResults && importStatus.searchResults.total === 0 && (
                    <div className="mb-2 flex items-start gap-2 rounded bg-amber-50 p-2">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-[10px] text-amber-700">
                        <p className="font-medium">No employees found for this domain.</p>
                        <p className="mt-0.5 text-amber-600/70">
                          PDL returned 0 results. This usually means the domain isn&apos;t in PDL&apos;s database,
                          or employees are indexed under a different domain (e.g. a parent company or domain alias).
                        </p>
                        {importStatus.jobResult && (importStatus.jobResult as Record<string, unknown>).domain && (
                          <p className="mt-0.5 font-mono text-amber-600/70">
                            Searched: {String((importStatus.jobResult as Record<string, unknown>).domain)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Done but was skipped (recently ingested) */}
                  {importStatus?.phase === "done" && importStatus.jobResult && (importStatus.jobResult as Record<string, unknown>).skipped === true && (
                    <div className="mb-2 flex items-start gap-2 rounded bg-blue-50 p-2">
                      <Clock className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                      <div className="text-[10px] text-blue-700">
                        <p className="font-medium">Import skipped &mdash; already ingested within the last 30 days.</p>
                        <p className="mt-0.5 text-blue-500">Use &quot;Force&quot; to re-import if needed.</p>
                      </div>
                    </div>
                  )}

                  {importStatus?.searchResults && importStatus.searchResults.total > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className="rounded-cos-pill bg-white border border-cos-border px-2.5 py-1 text-[10px]">
                        <span className="font-semibold text-cos-midnight">{importStatus.searchResults.total}</span>{" "}
                        <span className="text-cos-slate">Found</span>
                      </span>
                      <span className="rounded-cos-pill bg-emerald-50 px-2.5 py-1 text-[10px]">
                        <span className="font-semibold text-emerald-600">{importStatus.searchResults.experts}</span>{" "}
                        <span className="text-emerald-600/70">Expert</span>
                      </span>
                      <span className="rounded-cos-pill bg-amber-50 px-2.5 py-1 text-[10px]">
                        <span className="font-semibold text-amber-600">{importStatus.searchResults.potentialExperts}</span>{" "}
                        <span className="text-amber-600/70">Potential</span>
                      </span>
                      <span className="rounded-cos-pill bg-cos-cloud px-2.5 py-1 text-[10px]">
                        <span className="font-semibold text-cos-slate">{importStatus.searchResults.notExperts}</span>{" "}
                        <span className="text-cos-slate/70">Not Expert</span>
                      </span>
                    </div>
                  )}

                  {importStatus?.enrichProgress && importStatus.enrichProgress.total > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-cos-slate mb-1">
                        <span>Enriching experts...</span>
                        <span>{importStatus.enrichProgress.completed}/{importStatus.enrichProgress.total}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-cos-cloud">
                        <div
                          className="h-full rounded-full bg-cos-electric transition-all"
                          style={{ width: `${Math.round((importStatus.enrichProgress.completed / importStatus.enrichProgress.total) * 100)}%` }}
                        />
                      </div>
                      {importStatus.enrichProgress.failed > 0 && (
                        <p className="mt-1 text-[10px] text-cos-ember">
                          {importStatus.enrichProgress.failed} enrichment(s) failed
                        </p>
                      )}
                    </div>
                  )}

                  {importStatus?.phase === "error" && importStatus.jobError && (
                    <div className="mt-2 flex items-start gap-2 rounded bg-cos-ember/5 p-2">
                      <AlertCircle className="h-3.5 w-3.5 text-cos-ember mt-0.5 shrink-0" />
                      <p className="text-[10px] text-cos-ember">{importStatus.jobError}</p>
                    </div>
                  )}

                  {/* Job ID for debugging */}
                  {importStatus?.jobId && (
                    <p className="mt-2 text-[9px] text-cos-slate/50 font-mono">
                      Job: {importStatus.jobId}
                    </p>
                  )}
                </div>
              )}

              {expertsLoading && !expertsLoaded ? (
                <div className="flex items-center gap-2 py-8 justify-center text-cos-slate">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Loading experts...</span>
                </div>
              ) : experts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8">
                  <Users className="h-8 w-8 text-cos-slate-light" />
                  <p className="text-xs text-cos-slate-light">No experts in the roster yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddExpert(true)}
                    className="mt-1 h-7 gap-1.5 text-xs"
                  >
                    <UserPlus className="h-3 w-3" />
                    Add First Expert
                  </Button>
                </div>
              ) : (() => {
                // Group experts by tier
                const tierExperts = experts.filter((ep) => ep.expertTier === "expert");
                const tierPotential = experts.filter((ep) => ep.expertTier === "potential_expert");
                const tierNotExpert = experts.filter((ep) => ep.expertTier === "not_expert");
                const tierOther = experts.filter((ep) => !ep.expertTier || !["expert", "potential_expert", "not_expert"].includes(ep.expertTier));

                const renderExpertRow = (ep: AdminExpert, showEnrich: boolean) => (
                  <div key={ep.id} onClick={() => setDrawerExpertId(ep.id)} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-cos-electric/[0.02] cursor-pointer">
                    {/* Avatar */}
                    {ep.photoUrl ? (
                      <img src={ep.photoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cos-signal/20 to-cos-electric/20 text-xs font-semibold text-cos-signal">
                        {(ep.fullName ?? ep.firstName ?? "?").charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* Name + Title + Updated */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-cos-midnight">
                          {ep.fullName ?? [ep.firstName, ep.lastName].filter(Boolean).join(" ") ?? "Unnamed"}
                        </span>
                        {ep.isFullyEnriched && (
                          <Sparkles className="h-3 w-3 shrink-0 text-cos-electric" title="Enriched" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xs text-cos-slate">{ep.title ?? "—"}</p>
                        {ep.updatedAt && (
                          <span className="shrink-0 text-[9px] text-cos-slate/50">
                            {new Date(ep.updatedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1">
                      {ep.linkedinUrl && (
                        <a
                          href={ep.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-7 w-7 items-center justify-center rounded text-cos-slate hover:text-cos-electric hover:bg-cos-electric/5 transition-colors"
                          title="View LinkedIn"
                        >
                          <Linkedin className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {showEnrich && (ep.linkedinUrl || ep.fullName) && (
                        enrichingExpert === ep.id ? (
                          <span className="inline-flex items-center gap-1 px-2 text-[10px] text-cos-electric">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Processing...
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleManualEnrich(ep.id); }}
                            title={ep.isFullyEnriched ? "Re-enrich with fresh PDL data (1 credit)" : "Enrich with PDL (1 credit)"}
                            className={`h-7 gap-1 px-2 text-[10px] ${
                              ep.isFullyEnriched
                                ? "text-cos-slate hover:text-cos-electric hover:bg-cos-electric/5"
                                : "text-cos-warm hover:text-cos-warm hover:bg-cos-warm/5"
                            }`}
                          >
                            <Sparkles className="h-3 w-3" />
                            {ep.isFullyEnriched ? "Update" : "Enrich"}
                          </Button>
                        )
                      )}
                      {!ep.userId && ep.email && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSendInvite(ep.id)}
                          disabled={invitingExpert === ep.id}
                          title="Send invite email"
                          className="h-7 gap-1 px-2 text-[10px] text-cos-slate hover:text-cos-electric hover:bg-cos-electric/5"
                        >
                          {invitingExpert === ep.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Mail className="h-3 w-3" />
                          )}
                          Invite
                        </Button>
                      )}
                    </div>
                  </div>
                );

                return (
                  <div className="space-y-4">
                    {/* ── Experts Section ── */}
                    {tierExperts.length > 0 && (
                      <div className="overflow-hidden rounded-cos-lg border border-cos-signal/20">
                        <div className="flex items-center justify-between bg-cos-signal/8 px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-cos-signal">Experts</span>
                            <span className="rounded-cos-pill bg-cos-signal/15 px-2 py-0.5 text-[10px] font-bold text-cos-signal">{tierExperts.length}</span>
                          </div>
                          <span className="text-[10px] text-cos-signal/70">Client-facing roles — enrichable</span>
                        </div>
                        <div className="divide-y divide-cos-signal/10">
                          {tierExperts.map((ep) => renderExpertRow(ep, true))}
                        </div>
                      </div>
                    )}

                    {/* ── Potential Experts Section ── */}
                    {tierPotential.length > 0 && (
                      <div className="overflow-hidden rounded-cos-lg border border-cos-warm/20">
                        <div className="flex items-center justify-between bg-cos-warm/8 px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-cos-warm">Potential Experts</span>
                            <span className="rounded-cos-pill bg-cos-warm/15 px-2 py-0.5 text-[10px] font-bold text-cos-warm">{tierPotential.length}</span>
                          </div>
                          <span className="text-[10px] text-cos-warm/70">Ambiguous roles — may be client-facing</span>
                        </div>
                        <div className="divide-y divide-cos-warm/10">
                          {tierPotential.map((ep) => renderExpertRow(ep, true))}
                        </div>
                      </div>
                    )}

                    {/* ── Not Experts Section ── */}
                    {tierNotExpert.length > 0 && (
                      <div className="overflow-hidden rounded-cos-lg border border-cos-border/60">
                        <div className="flex items-center justify-between bg-cos-cloud/50 px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-cos-slate">Not Experts</span>
                            <span className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] font-bold text-cos-slate">{tierNotExpert.length}</span>
                          </div>
                          <span className="text-[10px] text-cos-slate/70">Internal ops — HR, admin, sales, etc.</span>
                        </div>
                        <div className="divide-y divide-cos-border/30">
                          {tierNotExpert.map((ep) => renderExpertRow(ep, false))}
                        </div>
                      </div>
                    )}

                    {/* ── Unclassified (legacy imports without PDL data) ── */}
                    {tierOther.length > 0 && (
                      <div className="overflow-hidden rounded-cos-lg border border-cos-border/60">
                        <div className="flex items-center justify-between bg-cos-cloud/30 px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-cos-slate">Unclassified</span>
                            <span className="rounded-cos-pill bg-cos-cloud px-2 py-0.5 text-[10px] font-bold text-cos-slate">{tierOther.length}</span>
                          </div>
                          <span className="text-[10px] text-cos-slate/70">Not yet classified by PDL</span>
                        </div>
                        <div className="divide-y divide-cos-border/30">
                          {tierOther.map((ep) => renderExpertRow(ep, true))}
                        </div>
                      </div>
                    )}

                    {/* Pagination */}
                    {expertsTotalPages > 1 && (
                      <div className="flex items-center justify-between pt-4">
                        <span className="text-xs text-cos-slate">
                          Showing {(expertsPage - 1) * 50 + 1}–{Math.min(expertsPage * 50, expertsTotalCount)} of {expertsTotalCount}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={expertsPage <= 1 || expertsLoading}
                            onClick={() => loadExperts(expertsPage - 1)}
                          >
                            Previous
                          </Button>
                          <span className="px-2 text-xs text-cos-slate">
                            {expertsPage} / {expertsTotalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={expertsPage >= expertsTotalPages || expertsLoading}
                            onClick={() => loadExperts(expertsPage + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </Section>
          </div>
        )}

        {/* ── FIRM PROFILE TAB ── */}
        {activeTab === "firm-profile" && (
          <div className="space-y-5">
            {firm ? (
              <>
                {/* About */}
                {firm.description && (
                  <Section title="About" icon={<Building2 className="h-4 w-4 text-cos-signal" />}>
                    <p className="text-sm text-cos-midnight leading-relaxed">{firm.description}</p>
                  </Section>
                )}

                {/* Enrichment Data */}
                {firm.enrichmentData && (
                  <>
                    {/* Services */}
                    {(firm.enrichmentData as Record<string, unknown>)?.services && (
                      <Section title="Services" icon={<Sparkles className="h-4 w-4 text-cos-electric" />}>
                        <div className="space-y-2">
                          {(
                            (firm.enrichmentData as Record<string, unknown>)
                              .services as { name: string; description?: string }[]
                          )?.map((svc, i) => (
                            <div key={i} className="rounded-cos bg-cos-cloud/50 px-3 py-2">
                              <p className="text-sm font-medium text-cos-midnight">{svc.name}</p>
                              {svc.description && (
                                <p className="mt-0.5 text-xs text-cos-slate">{svc.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}

                    {/* Taxonomy (skills, industries, markets) */}
                    {(() => {
                      const ed = firm.enrichmentData as Record<string, unknown>;
                      const skills = ed?.skills as string[] | undefined;
                      const industries = ed?.industries as string[] | undefined;
                      const markets = ed?.markets as string[] | undefined;
                      const categories = ed?.categories as string[] | undefined;

                      const hasTaxonomy =
                        (skills?.length ?? 0) > 0 ||
                        (industries?.length ?? 0) > 0 ||
                        (markets?.length ?? 0) > 0 ||
                        (categories?.length ?? 0) > 0;

                      if (!hasTaxonomy) return null;

                      return (
                        <Section title="Taxonomy" icon={<Share2 className="h-4 w-4 text-cos-signal" />}>
                          <div className="space-y-4">
                            {categories && categories.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-cos-warm mb-1.5">Categories</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {categories.map((c) => (
                                    <span key={c} className="rounded-cos-pill bg-cos-warm/10 px-2.5 py-0.5 text-xs text-cos-warm">
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {skills && skills.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-cos-signal mb-1.5">Skills</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {skills.slice(0, 30).map((s) => (
                                    <span key={s} className="rounded-cos-pill bg-cos-signal/10 px-2.5 py-0.5 text-xs text-cos-signal">
                                      {s}
                                    </span>
                                  ))}
                                  {skills.length > 30 && (
                                    <span className="text-xs text-cos-slate-light">
                                      +{skills.length - 30} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                            {industries && industries.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-cos-ember mb-1.5">Industries</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {industries.map((ind) => (
                                    <span key={ind} className="rounded-cos-pill bg-cos-ember/10 px-2.5 py-0.5 text-xs text-cos-ember">
                                      {ind}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {markets && markets.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-cos-warm mb-1.5">Markets</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {markets.map((mkt) => (
                                    <span key={mkt} className="rounded-cos-pill bg-cos-warm/10 px-2.5 py-0.5 text-xs text-cos-warm">
                                      {mkt}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </Section>
                      );
                    })()}

                    {/* Case Studies */}
                    {(firm.enrichmentData as Record<string, unknown>)?.caseStudies && (
                      <Section title="Case Studies" icon={<FileText className="h-4 w-4 text-cos-warm" />}>
                        <div className="space-y-3">
                          {(
                            (firm.enrichmentData as Record<string, unknown>)
                              .caseStudies as { title: string; client?: string; outcome?: string }[]
                          )?.map((cs, i) => (
                            <div key={i} className="rounded-cos bg-cos-cloud/50 p-3">
                              <p className="text-sm font-medium text-cos-midnight">{cs.title}</p>
                              {cs.client && (
                                <p className="mt-0.5 text-xs text-cos-slate">Client: {cs.client}</p>
                              )}
                              {cs.outcome && (
                                <p className="mt-1 text-xs text-cos-slate">{cs.outcome}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </Section>
                    )}
                  </>
                )}

                {/* Raw enrichment data (collapsed) */}
                <details className="rounded-cos-lg border border-cos-border bg-white">
                  <summary className="cursor-pointer px-5 py-3 text-xs font-semibold uppercase tracking-wider text-cos-slate hover:text-cos-midnight">
                    Raw Enrichment Data
                  </summary>
                  <div className="border-t border-cos-border px-5 py-4">
                    <pre className="max-h-96 overflow-auto rounded-cos bg-cos-cloud/50 p-4 text-[11px] text-cos-midnight font-mono leading-relaxed">
                      {JSON.stringify(firm.enrichmentData, null, 2)}
                    </pre>
                  </div>
                </details>
              </>
            ) : (
              <Section title="Firm Profile" icon={<Building2 className="h-4 w-4 text-cos-signal" />}>
                <p className="text-xs text-cos-slate-light">No firm linked to this organization</p>
              </Section>
            )}
          </div>
        )}

        {/* ── ACTIVITY TAB (includes conversations) ── */}
        {activeTab === "activity" && (
          <div className="space-y-4">
            {/* View toggle: Timeline vs Conversations */}
            <div className="flex items-center gap-3">
              <div className="flex rounded-cos-lg border border-cos-border bg-cos-cloud/30 p-0.5">
                <button
                  onClick={() => setActivityView("timeline")}
                  className={`flex items-center gap-1.5 rounded-cos px-3 py-1.5 text-xs font-medium transition-colors ${
                    activityView === "timeline"
                      ? "bg-white text-cos-midnight shadow-sm"
                      : "text-cos-slate hover:text-cos-midnight"
                  }`}
                >
                  <Activity className="h-3.5 w-3.5" />
                  Timeline
                </button>
                <button
                  onClick={() => setActivityView("conversations")}
                  className={`flex items-center gap-1.5 rounded-cos px-3 py-1.5 text-xs font-medium transition-colors ${
                    activityView === "conversations"
                      ? "bg-white text-cos-midnight shadow-sm"
                      : "text-cos-slate hover:text-cos-midnight"
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Conversations
                  {conversations.length > 0 && (
                    <span className="rounded-cos-full bg-cos-electric/10 px-1.5 py-0.5 text-[9px] font-semibold text-cos-electric">
                      {conversations.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* ── Timeline view ── */}
            {activityView === "timeline" && (() => {
              // Convert CIO messages to ActivityEvent shape
              const cioEvents: ActivityEvent[] = (commsData?.messages ?? []).map((msg) => {
                const m = msg.metrics as Record<string, number | undefined>;
                const failed = !!msg.failure_message || m.bounced || m.failed;
                const opened = m.human_opened || m.opened;
                const delivered = m["secondary:delivered"] || m.delivered;
                const status = failed ? "failed" : opened ? "opened" : delivered ? "delivered" : m.sent ? "sent" : "queued";
                return {
                  type: "email",
                  timestamp: new Date(msg.created * 1000).toISOString(),
                  title: msg.subject || "(no subject)",
                  detail: `${status} · ${msg.recipient}${msg.campaign_id ? ` · campaign #${msg.campaign_id}` : ""}`,
                  userName: msg.userName,
                  metadata: { status, campaignId: msg.campaign_id },
                };
              });

              // Merge + sort for "all", filter to just CIO for "email"
              const displayEvents: ActivityEvent[] =
                activityFilter === "email"
                  ? cioEvents
                  : activityFilter === "all"
                  ? [...activityEvents, ...cioEvents].sort(
                      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                    )
                  : activityEvents;

              return (
                <>
                  {/* Filters */}
                  <div className="flex flex-wrap gap-2">
                    {["all", "conversation", "ai_usage", "enrichment", "onboarding", "email"].map((type) => (
                      <button
                        key={type}
                        onClick={() => {
                          setActivityFilter(type);
                          if (type !== "email") setActivityLoaded(false);
                        }}
                        className={`rounded-cos-pill px-3 py-1.5 text-xs font-medium transition-colors ${
                          activityFilter === type
                            ? "bg-cos-electric text-white"
                            : "bg-cos-cloud text-cos-slate hover:bg-cos-cloud-dim"
                        }`}
                      >
                        {type === "all" ? "All" : type === "email" ? `Email${cioEvents.length > 0 ? ` (${cioEvents.length})` : ""}` : type.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>

                  {activityLoading && activityFilter !== "email" ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
                    </div>
                  ) : displayEvents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-12">
                      <Activity className="h-8 w-8 text-cos-slate-light" />
                      <p className="mt-2 text-sm text-cos-slate">
                        {activityFilter === "email" && !commsData?.configured
                          ? "Customer.io not configured"
                          : "No activity found"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {displayEvents.map((evt, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 rounded-cos-lg border border-cos-border bg-white px-4 py-3"
                        >
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
                            {evt.userName && (
                              <p className="mt-0.5 text-[10px] text-cos-slate-light">by {evt.userName}</p>
                            )}
                          </div>
                          <span className="shrink-0 text-[10px] text-cos-slate-light">
                            {formatDateTime(evt.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            {/* ── Conversations view ── */}
            {activityView === "conversations" && (
              <>
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
                  <Button
                    onClick={searchConversations}
                    variant="outline"
                    size="sm"
                    className="h-[38px] px-4 text-xs"
                  >
                    Search
                  </Button>
                </div>

                {convsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-5">
                    {/* Conversation list */}
                    <div className="space-y-1 lg:col-span-2 max-h-[600px] overflow-y-auto">
                      {conversations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-12">
                          <MessageSquare className="h-8 w-8 text-cos-slate-light" />
                          <p className="mt-2 text-sm text-cos-slate">No conversations found</p>
                        </div>
                      ) : (
                        conversations.map((conv) => (
                          <button
                            key={conv.id}
                            onClick={() => loadThread(conv.id)}
                            className={`w-full text-left rounded-cos-lg border px-4 py-3 transition-colors ${
                              selectedConv === conv.id
                                ? "border-cos-electric bg-cos-electric/5"
                                : "border-cos-border bg-white hover:border-cos-electric/30"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <p className="truncate text-sm font-medium text-cos-midnight">
                                {conv.title ?? "Untitled"}
                              </p>
                              <span className={`rounded-cos-pill px-2 py-0.5 text-[9px] font-medium ${
                                conv.mode === "onboarding"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-cos-cloud text-cos-slate"
                              }`}>
                                {conv.mode}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-[10px] text-cos-slate">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {conv.userName}
                              </span>
                              <span>{conv.messageCount} msgs</span>
                              <span>{formatDate(conv.lastMessageAt ?? conv.createdAt)}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    {/* Message thread */}
                    <div className="lg:col-span-3">
                      {selectedConv ? (
                        <div className="rounded-cos-lg border border-cos-border bg-white overflow-hidden">
                          <div className="border-b border-cos-border bg-cos-cloud/30 px-4 py-3">
                            <p className="text-sm font-semibold text-cos-midnight">
                              {conversations.find((c) => c.id === selectedConv)?.title ?? "Conversation"}
                            </p>
                            <p className="text-xs text-cos-slate">
                              {convMessages.length} messages
                            </p>
                          </div>
                          <div className="max-h-[500px] overflow-y-auto p-4 space-y-3">
                            {convMsgsLoading ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-cos-electric" />
                              </div>
                            ) : (
                              convMessages.map((msg) => (
                                <div
                                  key={msg.id}
                                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                >
                                  <div
                                    className={`max-w-[80%] rounded-cos-lg px-4 py-2.5 ${
                                      msg.role === "user"
                                        ? "bg-cos-electric text-white"
                                        : "bg-cos-cloud text-cos-midnight"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      {msg.role === "assistant" ? (
                                        <Bot className="h-3 w-3 text-cos-electric" />
                                      ) : (
                                        <User className="h-3 w-3" />
                                      )}
                                      <span className="text-[10px] font-medium opacity-70">
                                        {msg.role === "assistant" ? "Ossy" : "User"} · {formatDateTime(msg.createdAt)}
                                      </span>
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                                      {msg.content}
                                    </p>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-24">
                          <MessageSquare className="h-10 w-10 text-cos-slate-light" />
                          <p className="mt-3 text-sm text-cos-slate">
                            Select a conversation to view messages
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── BILLING TAB ── */}
        {activeTab === "billing" && (
          <div className="space-y-5">
            {billingLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
              </div>
            ) : billingData ? (
              <>
                {/* Billing error banner */}
                {billingError && (
                  <div className="flex items-center gap-2 rounded-cos-lg border border-cos-ember/30 bg-cos-ember/5 px-4 py-3 text-sm text-cos-ember">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {billingError}
                    <button onClick={() => setBillingError(null)} className="ml-auto"><X className="h-3.5 w-3.5" /></button>
                  </div>
                )}
                {/* Current Plan */}
                <Section title="Current Plan" icon={<CreditCard className="h-4 w-4 text-cos-electric" />}>
                  {billingData.subscription ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <span className={`rounded-cos-pill px-4 py-1.5 text-sm font-bold uppercase ${
                          PLAN_COLORS[billingData.subscription.plan] ?? PLAN_COLORS.free
                        }`}>
                          {billingData.subscription.plan}
                        </span>
                        <span className={`rounded-cos-pill px-3 py-1 text-xs font-medium ${
                          STATUS_COLORS[billingData.subscription.status] ?? "bg-cos-cloud text-cos-slate"
                        }`}>
                          {billingData.subscription.status}
                        </span>
                        {billingData.subscription.cancelAtPeriodEnd && (
                          <span className="text-xs font-medium text-cos-ember">
                            Cancels at period end
                          </span>
                        )}
                        {billingData.subscription.giftExpiresAt && (
                          <span className="rounded-cos-pill bg-cos-electric/8 px-3 py-1 text-xs font-medium text-cos-electric">
                            Gift expires {formatDate(billingData.subscription.giftExpiresAt)}
                            {billingData.subscription.giftReturnPlan && (
                              <> &rarr; {billingData.subscription.giftReturnPlan}</>
                            )}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-6 text-sm">
                        <div>
                          <p className="text-xs text-cos-slate">Current Period</p>
                          <p className="font-medium text-cos-midnight">
                            {formatDate(billingData.subscription.currentPeriodStart)} — {formatDate(billingData.subscription.currentPeriodEnd)}
                          </p>
                        </div>
                        {billingData.subscription.trialEnd && (
                          <div>
                            <p className="text-xs text-cos-slate">Trial Ends</p>
                            <p className="font-medium text-cos-midnight">{formatDate(billingData.subscription.trialEnd)}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-cos-slate">Stripe Customer ID</p>
                          <p className="font-mono text-xs text-cos-slate">{billingData.subscription.stripeCustomerId}</p>
                        </div>
                        {billingData.subscription.stripeSubscriptionId && (
                          <div>
                            <p className="text-xs text-cos-slate">Stripe Subscription ID</p>
                            <p className="font-mono text-xs text-cos-slate">{billingData.subscription.stripeSubscriptionId}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-cos-slate-light">No subscription found</p>
                  )}
                </Section>

                {/* Admin: Change Plan (always visible — creates subscription if needed) */}
                <Section title="Change Plan" icon={<Zap className="h-4 w-4 text-cos-warm" />}>
                  <div className="flex flex-wrap items-center gap-2">
                    {(["free", "pro", "enterprise"] as const).map((p) => (
                      <Button
                        key={p}
                        size="sm"
                        variant={billingData.subscription?.plan === p ? "secondary" : "outline"}
                        disabled={billingData.subscription?.plan === p || billingAction}
                        onClick={() => handleBillingAction({ action: "change_plan", plan: p })}
                        className="min-w-[90px]"
                      >
                        {billingAction ? <Loader2 className="h-3 w-3 animate-spin" /> : p.charAt(0).toUpperCase() + p.slice(1)}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-cos-slate">
                    {billingData.subscription
                      ? "Directly sets the plan in the database. Does not create a Stripe subscription."
                      : "No subscription record exists — selecting a plan will create one."}
                  </p>
                </Section>

                {/* Admin: Gift Subscription (always visible) */}
                <Section title="Gift Subscription" icon={<Sparkles className="h-4 w-4 text-cos-electric" />}>
                    {billingData.subscription?.giftExpiresAt ? (
                      <div className="space-y-3">
                        <div className="rounded-cos border border-cos-electric/20 bg-cos-electric/5 p-3 text-sm">
                          <p className="font-medium text-cos-electric">
                            Active gift: {billingData.subscription.plan} until {formatDate(billingData.subscription.giftExpiresAt)}
                          </p>
                          <p className="text-xs text-cos-electric/70">
                            Returns to: {billingData.subscription.giftReturnPlan ?? "free"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-cos-ember hover:bg-cos-ember/5"
                          disabled={billingAction}
                          onClick={() => handleBillingAction({ action: "revoke_gift" })}
                        >
                          {billingAction ? <Loader2 className="h-3 w-3 animate-spin" /> : "Revoke Gift"}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <label className="mb-1 block text-[10px] font-medium uppercase text-cos-slate">Plan</label>
                            <select
                              value={giftPlan}
                              onChange={(e) => setGiftPlan(e.target.value as "pro" | "enterprise")}
                              className="rounded-cos border border-cos-border bg-white px-3 py-1.5 text-sm"
                            >
                              <option value="pro">Pro</option>
                              <option value="enterprise">Enterprise</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-medium uppercase text-cos-slate">Months</label>
                            <select
                              value={giftMonths}
                              onChange={(e) => setGiftMonths(Number(e.target.value))}
                              className="rounded-cos border border-cos-border bg-white px-3 py-1.5 text-sm"
                            >
                              {[1, 2, 3, 6, 12].map((m) => (
                                <option key={m} value={m}>
                                  {m} {m === 1 ? "month" : "months"}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] font-medium uppercase text-cos-slate">After Gift</label>
                            <select
                              value={giftReturnPlan}
                              onChange={(e) => setGiftReturnPlan(e.target.value as "free" | "pro")}
                              className="rounded-cos border border-cos-border bg-white px-3 py-1.5 text-sm"
                            >
                              <option value="free">Return to Free</option>
                              <option value="pro">Return to Paid (Pro)</option>
                            </select>
                          </div>
                          <Button
                            size="sm"
                            disabled={billingAction}
                            onClick={() =>
                              handleBillingAction({
                                action: "gift",
                                plan: giftPlan,
                                months: giftMonths,
                                returnPlan: giftReturnPlan,
                              })
                            }
                          >
                            {billingAction ? <Loader2 className="h-3 w-3 animate-spin" /> : "Grant Gift"}
                          </Button>
                        </div>
                        <p className="text-[10px] text-cos-slate">
                          Grants complimentary access. After expiry, reverts to the selected plan.
                        </p>
                      </div>
                    )}
                </Section>

                {/* Usage */}
                {billingData.usage && (
                <Section title="Usage Metrics" icon={<BarChart3 className="h-4 w-4 text-cos-electric" />}>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="rounded-cos bg-cos-cloud/50 p-3 text-center">
                      <div className="text-lg font-bold text-cos-electric">{formatCurrency(billingData.usage.aiCost ?? 0)}</div>
                      <div className="text-[10px] font-medium uppercase text-cos-slate">AI Cost</div>
                    </div>
                    <div className="rounded-cos bg-cos-cloud/50 p-3 text-center">
                      <div className="text-lg font-bold text-cos-electric">{(billingData.usage.aiCalls ?? 0).toLocaleString()}</div>
                      <div className="text-[10px] font-medium uppercase text-cos-slate">AI Calls</div>
                    </div>
                    <div className="rounded-cos bg-cos-cloud/50 p-3 text-center">
                      <div className="text-lg font-bold text-cos-signal">
                        {((billingData.usage.aiInputTokens ?? 0) + (billingData.usage.aiOutputTokens ?? 0)).toLocaleString()}
                      </div>
                      <div className="text-[10px] font-medium uppercase text-cos-slate">Total Tokens</div>
                    </div>
                    <div className="rounded-cos bg-cos-cloud/50 p-3 text-center">
                      <div className="text-lg font-bold text-cos-warm">{formatCurrency(billingData.usage.enrichmentCost ?? 0)}</div>
                      <div className="text-[10px] font-medium uppercase text-cos-slate">Enrichment</div>
                    </div>
                  </div>
                </Section>
                )}

                {/* Billing Events */}
                {(billingData.billingEvents?.length ?? 0) > 0 && (
                  <Section title="Billing History" icon={<Clock className="h-4 w-4 text-cos-slate" />}>
                    <div className="space-y-2">
                      {billingData.billingEvents.map((evt) => (
                        <div
                          key={evt.id}
                          className="flex items-center gap-3 rounded-cos bg-cos-cloud/50 px-4 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-cos-midnight">
                              {evt.eventType.replace(/_/g, " ").replace(/\./g, " → ")}
                            </p>
                          </div>
                          <span className="text-xs text-cos-slate">{formatDate(evt.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-12">
                <CreditCard className="h-8 w-8 text-cos-slate-light" />
                <p className="mt-2 text-sm text-cos-slate">Unable to load billing data</p>
              </div>
            )}
          </div>
        )}

        {/* ── PARTNERSHIPS TAB ── */}
        {activeTab === "partnerships" && (
          <div className="space-y-5">
            {partnershipsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
              </div>
            ) : partnershipData ? (
              <>
                {/* Partnerships */}
                <Section title={`Partnerships (${partnershipData.partnerships.length})`} icon={<Handshake className="h-4 w-4 text-cos-signal" />}>
                  {partnershipData.partnerships.length === 0 ? (
                    <p className="text-xs text-cos-slate-light">No partnerships yet</p>
                  ) : (
                    <div className="space-y-2">
                      {partnershipData.partnerships.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 rounded-cos bg-cos-cloud/50 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-cos-midnight">{p.partnerFirmName}</p>
                            {p.partnerFirmWebsite && (
                              <p className="text-xs text-cos-slate">{p.partnerFirmWebsite}</p>
                            )}
                          </div>
                          <span className={`rounded-cos-pill px-2.5 py-0.5 text-[10px] font-medium ${
                            p.status === "accepted"
                              ? "bg-cos-signal/8 text-cos-signal"
                              : p.status === "requested"
                              ? "bg-cos-electric/8 text-cos-electric"
                              : p.status === "suggested"
                              ? "bg-cos-warm/10 text-cos-warm"
                              : "bg-cos-cloud text-cos-slate"
                          }`}>
                            {p.status}
                          </span>
                          {p.matchScore !== null && (
                            <span className="text-xs font-medium text-cos-electric">
                              {Math.round(p.matchScore * 100)}%
                            </span>
                          )}
                          <span className="text-xs text-cos-slate-light">{formatDate(p.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Opportunities */}
                <Section title={`Opportunities (${partnershipData.opportunities.length})`} icon={<Lightbulb className="h-4 w-4 text-cos-warm" />}>
                  {partnershipData.opportunities.length === 0 ? (
                    <p className="text-xs text-cos-slate-light">No opportunities yet</p>
                  ) : (
                    <div className="space-y-2">
                      {partnershipData.opportunities.map((opp) => (
                        <a
                          key={opp.id}
                          href={`/admin/opportunities/${opp.id}`}
                          className="flex items-center gap-3 rounded-cos bg-cos-cloud/50 px-4 py-3 hover:bg-cos-electric/5 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-cos-midnight">{opp.title}</p>
                            {opp.clientName && (
                              <p className="text-xs text-cos-slate">Client: {opp.clientName}</p>
                            )}
                          </div>
                          <span className={`rounded-cos-pill px-2.5 py-0.5 text-[10px] font-medium ${
                            opp.priority === "high"
                              ? "bg-cos-ember/8 text-cos-ember"
                              : opp.priority === "medium"
                              ? "bg-cos-warm/8 text-cos-warm"
                              : "bg-cos-cloud text-cos-slate"
                          }`}>
                            {opp.priority}
                          </span>
                          <span className={`rounded-cos-pill px-2 py-0.5 text-[10px] font-medium ${
                            opp.status === "new"
                              ? "bg-cos-electric/8 text-cos-electric"
                              : opp.status === "actioned"
                              ? "bg-cos-signal/8 text-cos-signal"
                              : "bg-cos-cloud text-cos-slate"
                          }`}>
                            {opp.status}
                          </span>
                          {opp.estimatedValue && (
                            <span className="text-xs text-cos-slate">{opp.estimatedValue}</span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Leads */}
                <Section title={`Leads (${partnershipData.leads.length})`} icon={<FileText className="h-4 w-4 text-cos-signal" />}>
                  {partnershipData.leads.length === 0 ? (
                    <p className="text-xs text-cos-slate-light">No leads yet</p>
                  ) : (
                    <div className="space-y-2">
                      {partnershipData.leads.map((lead) => (
                        <div key={lead.id} className="flex items-center gap-3 rounded-cos bg-cos-cloud/50 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-cos-midnight">{lead.title}</p>
                            {lead.clientName && (
                              <p className="text-xs text-cos-slate">Client: {lead.clientName}</p>
                            )}
                          </div>
                          <span className={`rounded-cos-pill px-2 py-0.5 text-[10px] font-medium ${
                            lead.status === "open"
                              ? "bg-cos-signal/8 text-cos-signal"
                              : lead.status === "claimed"
                              ? "bg-cos-electric/8 text-cos-electric"
                              : "bg-cos-cloud text-cos-slate"
                          }`}>
                            {lead.status}
                          </span>
                          <span className="text-xs text-cos-slate-light">{formatDate(lead.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-cos-lg border border-cos-border bg-white py-12">
                <Handshake className="h-8 w-8 text-cos-slate-light" />
                <p className="mt-2 text-sm text-cos-slate">Unable to load partnership data</p>
              </div>
            )}
          </div>
        )}

        {/* ── ADMIN TAB ── */}
        {activeTab === "admin" && (
          <div className="space-y-5">
            {/* Account Info */}
            <Section title="Account Information" icon={<Shield className="h-4 w-4 text-cos-slate" />}>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-cos-slate">Organization ID</span>
                  <span className="font-mono text-xs text-cos-midnight">{org.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cos-slate">Slug</span>
                  <span className="font-mono text-xs text-cos-midnight">/{org.slug}</span>
                </div>
                {firm && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-cos-slate">Firm ID</span>
                      <span className="font-mono text-xs text-cos-midnight">{firm.id}</span>
                    </div>
                    {firm.graphNodeId && (
                      <div className="flex justify-between">
                        <span className="text-cos-slate">Neo4j Node ID</span>
                        <span className="font-mono text-xs text-cos-midnight">{firm.graphNodeId}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Section>

            {/* Raw Data */}
            {firm?.enrichmentData && (
              <details className="rounded-cos-lg border border-cos-border bg-white">
                <summary className="cursor-pointer px-5 py-3 text-xs font-semibold uppercase tracking-wider text-cos-slate hover:text-cos-midnight">
                  Raw Enrichment Data (JSON)
                </summary>
                <div className="border-t border-cos-border px-5 py-4">
                  <pre className="max-h-96 overflow-auto rounded-cos bg-cos-cloud/50 p-4 text-[11px] text-cos-midnight font-mono leading-relaxed">
                    {JSON.stringify(firm.enrichmentData, null, 2)}
                  </pre>
                </div>
              </details>
            )}

            {org.metadata && (
              <details className="rounded-cos-lg border border-cos-border bg-white">
                <summary className="cursor-pointer px-5 py-3 text-xs font-semibold uppercase tracking-wider text-cos-slate hover:text-cos-midnight">
                  Organization Metadata (JSON)
                </summary>
                <div className="border-t border-cos-border px-5 py-4">
                  <pre className="max-h-96 overflow-auto rounded-cos bg-cos-cloud/50 p-4 text-[11px] text-cos-midnight font-mono leading-relaxed">
                    {typeof org.metadata === "string"
                      ? JSON.stringify(JSON.parse(org.metadata), null, 2)
                      : JSON.stringify(org.metadata, null, 2)}
                  </pre>
                </div>
              </details>
            )}

            {/* Danger Zone */}
            <div className="rounded-cos-lg border-2 border-cos-ember/30 bg-white p-5">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cos-ember">
                <AlertTriangle className="h-3.5 w-3.5" /> Danger Zone
              </h3>
              <p className="text-xs text-cos-slate mb-4">
                These actions are irreversible. Use with extreme caution.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  disabled
                  className="rounded-cos border border-cos-ember/30 px-4 py-2 text-xs font-medium text-cos-ember/50 cursor-not-allowed transition-colors"
                  title="Coming soon"
                >
                  Reset Enrichment <span className="ml-1 text-[9px] opacity-60">(coming soon)</span>
                </button>
                <button
                  disabled
                  className="rounded-cos border border-cos-ember/30 px-4 py-2 text-xs font-medium text-cos-ember/50 cursor-not-allowed transition-colors"
                  title="Coming soon"
                >
                  Force Neo4j Re-sync <span className="ml-1 text-[9px] opacity-60">(coming soon)</span>
                </button>
                <button
                  className="flex items-center gap-2 rounded-cos border border-cos-ember/40 bg-cos-ember/5 px-4 py-2 text-xs font-medium text-cos-ember hover:bg-cos-ember/10 transition-colors"
                  onClick={() => { setShowDeleteOrgModal(true); setDeleteOrgConfirmText(""); setDeleteOrgChecked(false); setDeleteOrgError(null); }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Organisation
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>

    {/* ── Delete Organisation Modal ──────────────────────────── */}
    {showDeleteOrgModal && data && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
        <div className="relative w-full max-w-md rounded-cos-xl border-2 border-cos-ember/30 bg-white p-6 shadow-xl">
          <button
            onClick={() => setShowDeleteOrgModal(false)}
            className="absolute right-4 top-4 rounded p-1 text-cos-slate hover:bg-cos-cloud transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cos-ember/10">
              <AlertTriangle className="h-5 w-5 text-cos-ember" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-cos-midnight">Delete organisation</h2>
              <p className="text-xs text-cos-slate">This is permanent and cannot be undone.</p>
            </div>
          </div>

          <div className="mb-4 rounded-cos bg-cos-ember/5 border border-cos-ember/20 p-3 text-xs text-cos-ember space-y-1">
            <p><strong>This will permanently delete:</strong></p>
            <ul className="ml-3 list-disc space-y-0.5 text-cos-ember/80">
              <li>The organisation and all memberships</li>
              <li>All invitations and subscription records</li>
              <li>User accounts are NOT deleted (only removed from org)</li>
              <li>The firm profile record remains for historical data</li>
            </ul>
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-cos-midnight">
              Type <span className="font-mono font-bold">{data.org.name}</span> to confirm
            </label>
            <input
              type="text"
              value={deleteOrgConfirmText}
              onChange={(e) => setDeleteOrgConfirmText(e.target.value)}
              placeholder={data.org.name}
              className="w-full rounded-cos-lg border border-cos-border bg-cos-cloud/30 px-3 py-2 text-sm font-mono text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-ember focus:outline-none focus:ring-1 focus:ring-cos-ember/30"
            />
          </div>

          <label className="mb-5 flex cursor-pointer items-start gap-2.5 text-xs text-cos-slate">
            <input
              type="checkbox"
              checked={deleteOrgChecked}
              onChange={(e) => setDeleteOrgChecked(e.target.checked)}
              className="mt-0.5 shrink-0 accent-cos-ember"
            />
            I understand this action is permanent and cannot be reversed.
          </label>

          {deleteOrgError && (
            <p className="mb-3 rounded-cos bg-cos-ember/5 px-3 py-2 text-xs text-cos-ember border border-cos-ember/20">{deleteOrgError}</p>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setShowDeleteOrgModal(false)}
              disabled={deletingOrg}
            >
              Cancel
            </Button>
            <button
              onClick={handleDeleteOrg}
              disabled={deleteOrgConfirmText !== data.org.name || !deleteOrgChecked || deletingOrg}
              className="flex flex-1 items-center justify-center gap-2 rounded-cos-lg bg-cos-ember px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cos-ember/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deletingOrg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deletingOrg ? "Deleting…" : "Delete Permanently"}
            </button>
          </div>
        </div>
      </div>
    )}
    {/* ── Expert Profile Drawer ── */}
    {drawerExpertId && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
          onClick={() => setDrawerExpertId(null)}
        />
        {/* Drawer */}
        <div className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-cos-border bg-cos-surface shadow-xl">
          <div className="p-6">
            {drawerLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
              </div>
            ) : drawerExpert ? (
              <ExpertProfileCard
                expert={drawerExpert}
                specialistProfiles={drawerSPs}
                isAdmin
                onClose={() => setDrawerExpertId(null)}
              />
            ) : (
              <div className="flex h-64 items-center justify-center">
                <p className="text-sm text-cos-slate-dim">Expert not found</p>
              </div>
            )}
          </div>
        </div>
      </>
    )}
    </>
  );
}
