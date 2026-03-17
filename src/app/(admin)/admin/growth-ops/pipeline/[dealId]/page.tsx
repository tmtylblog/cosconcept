"use client";

import { useEffect, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  DollarSign,
  Mail,
  Linkedin,
  Globe,
  Building2,
  User,
  Clock,
  MessageSquare,
  ChevronDown,
  Save,
  Trash2,
  Search,
  X,
  Plus,
  FileText,
} from "lucide-react";

interface Stage { id: string; label: string; displayOrder: number; color: string; isClosedWon: boolean; isClosedLost: boolean; parentStageId: string | null; }
interface Deal { id: string; name: string; stageId: string | null; stageLabel: string; dealValue: string | null; status: string; source: string; sourceChannel: string | null; sourceCampaignName: string | null; sourceMessageId: string | null; notes: string | null; priority: string; lastActivityAt: string | null; sentimentScore: number | null; hubspotDealId: string | null; closedAt: string | null; createdAt: string; updatedAt: string; }
interface Contact { id: string; email: string; firstName: string; lastName: string; linkedinUrl: string | null; companyId: string | null; }
interface DealContact { id: string; email: string; firstName: string; lastName: string; linkedinUrl: string | null; companyId: string | null; role: string | null; }
interface Company { id: string; name: string; domain: string | null; industry: string | null; sizeEstimate: string | null; }
interface Activity { id: string; activityType: string; description: string | null; metadata: Record<string, unknown> | null; createdAt: string; }
interface Touchpoint { id: string; channel: string; sourceName: string | null; touchpointAt: string; interactionType: string; }
interface SearchResult { id: string; name?: string; domain?: string; industry?: string; firstName?: string; lastName?: string; email?: string; linkedinUrl?: string; }

function activityIcon(type: string) {
  switch (type) {
    case "stage_change": return <ChevronDown className="h-3.5 w-3.5 text-blue-500" />;
    case "note_added": return <MessageSquare className="h-3.5 w-3.5 text-purple-500" />;
    case "email_replied": return <Mail className="h-3.5 w-3.5 text-orange-500" />;
    case "linkedin_message": return <Linkedin className="h-3.5 w-3.5 text-blue-600" />;
    case "auto_created": return <Globe className="h-3.5 w-3.5 text-emerald-500" />;
    case "company_linked": return <Building2 className="h-3.5 w-3.5 text-indigo-500" />;
    default: return <Clock className="h-3.5 w-3.5 text-cos-slate" />;
  }
}

const PRIORITIES = ["low", "normal", "high", "urgent"];

export default function DealDetailPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = use(params);
  const router = useRouter();
  const [fromInbox, setFromInbox] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [touchpoints, setTouchpoints] = useState<Touchpoint[]>([]);
  const [dealContacts, setDealContacts] = useState<DealContact[]>([]);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Inline editable fields
  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editPriority, setEditPriority] = useState("normal");
  const [, setSavingField] = useState<string | null>(null);

  // Search states
  const [companySearch, setCompanySearch] = useState("");
  const [companyResults, setCompanyResults] = useState<SearchResult[]>([]);
  const [searchingCompany, setSearchingCompany] = useState(false);
  const [showCompanySearch, setShowCompanySearch] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactResults, setContactResults] = useState<SearchResult[]>([]);
  const [searchingContact, setSearchingContact] = useState(false);
  const [showContactSearch, setShowContactSearch] = useState(false);

  const companySearchTimer = useRef<ReturnType<typeof setTimeout>>();
  const contactSearchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      setFromInbox(p.get("from") === "inbox");
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/growth-ops/pipeline/${dealId}`);
        const data = await res.json();
        if (data.error) { setError(data.error); return; }
        setDeal(data.deal);
        setContact(data.contact);
        setCompany(data.company);
        setStages(data.stages ?? []);
        setActivities(data.activities ?? []);
        setTouchpoints(data.touchpoints ?? []);
        setDealContacts(data.dealContacts ?? []);
        setQueueMessage(data.queueMessage ?? null);
        setNotes(data.deal?.notes ?? "");
        setEditName(data.deal?.name ?? "");
        setEditValue(data.deal?.dealValue ?? "");
        setEditPriority(data.deal?.priority ?? "normal");
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dealId]);

  async function reload() {
    const res = await fetch(`/api/admin/growth-ops/pipeline/${dealId}`);
    const data = await res.json();
    if (!data.error) {
      setDeal(data.deal);
      setContact(data.contact);
      setCompany(data.company);
      setStages(data.stages ?? []);
      setActivities(data.activities ?? []);
      setTouchpoints(data.touchpoints ?? []);
      setDealContacts(data.dealContacts ?? []);
      setQueueMessage(data.queueMessage ?? null);
    }
  }

  async function changeStage(stageId: string) {
    if (!deal) return;
    await fetch("/api/admin/growth-ops/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "moveDeal", dealId: deal.id, stageId }),
    });
    const stage = stages.find((s) => s.id === stageId);
    setDeal((d) => d ? { ...d, stageId, stageLabel: stage?.label ?? "" } : d);
    await reload();
  }

  async function saveField(field: string, value: unknown) {
    if (!deal) return;
    setSavingField(field);
    await fetch("/api/admin/growth-ops/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateDeal", dealId: deal.id, [field]: value }),
    });
    await reload();
    setSavingField(null);
  }

  async function saveNotes() {
    if (!deal) return;
    setSavingNotes(true);
    await fetch("/api/admin/growth-ops/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateDeal", dealId: deal.id, notes }),
    });
    setSavingNotes(false);
  }

  async function handleDelete() {
    if (!deal) return;
    if (!confirm(`Delete "${deal.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/growth-ops/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteDeal", dealId: deal.id }),
      });
      if (!res.ok) { setError("Failed to delete deal"); setDeleting(false); return; }
      router.push(fromInbox ? "/admin/growth-ops" : "/admin/growth-ops/pipeline");
    } catch (e) {
      setError(String(e));
      setDeleting(false);
    }
  }

  // Company search
  function handleCompanySearch(q: string) {
    setCompanySearch(q);
    clearTimeout(companySearchTimer.current);
    if (q.length < 2) { setCompanyResults([]); return; }
    companySearchTimer.current = setTimeout(async () => {
      setSearchingCompany(true);
      try {
        const res = await fetch("/api/admin/growth-ops/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "searchCompanies", query: q }),
        });
        const data = await res.json();
        setCompanyResults(data.results ?? []);
      } catch { /* silent */ }
      setSearchingCompany(false);
    }, 300);
  }

  async function linkCompany(companyId: string) {
    if (!deal) return;
    await fetch("/api/admin/growth-ops/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "linkCompany", dealId: deal.id, companyId }),
    });
    setShowCompanySearch(false);
    setCompanySearch("");
    setCompanyResults([]);
    await reload();
  }

  // Contact search
  function handleContactSearch(q: string) {
    setContactSearch(q);
    clearTimeout(contactSearchTimer.current);
    if (q.length < 2) { setContactResults([]); return; }
    contactSearchTimer.current = setTimeout(async () => {
      setSearchingContact(true);
      try {
        const res = await fetch("/api/admin/growth-ops/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "searchContacts", query: q }),
        });
        const data = await res.json();
        setContactResults(data.results ?? []);
      } catch { /* silent */ }
      setSearchingContact(false);
    }, 300);
  }

  async function linkContact(contactId: string) {
    if (!deal) return;
    await fetch("/api/admin/growth-ops/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "linkContact", dealId: deal.id, contactId }),
    });
    setShowContactSearch(false);
    setContactSearch("");
    setContactResults([]);
    await reload();
  }

  async function unlinkContact(contactId: string) {
    if (!deal) return;
    await fetch("/api/admin/growth-ops/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlinkContact", dealId: deal.id, contactId }),
    });
    await reload();
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
        <p className="text-sm text-cos-slate">Loading deal&hellip;</p>
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="rounded-cos-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error || "Deal not found"}</p>
        <Link href={fromInbox ? "/admin/growth-ops" : "/admin/growth-ops/pipeline"} className="text-xs text-cos-electric mt-2 inline-block hover:underline">
          &larr; {fromInbox ? "Back to Inbox" : "Back to pipeline"}
        </Link>
      </div>
    );
  }

  // Separate parent stages vs substages
  const parentStages = stages.filter((s) => !s.parentStageId);
  const substagesMap: Record<string, Stage[]> = {};
  stages.filter((s) => s.parentStageId).forEach((s) => {
    if (!substagesMap[s.parentStageId!]) substagesMap[s.parentStageId!] = [];
    substagesMap[s.parentStageId!].push(s);
  });

  // Current stage and its parent (if substage)
  const currentStage = stages.find((s) => s.id === deal.stageId);
  const currentParentStage = currentStage?.parentStageId
    ? stages.find((s) => s.id === currentStage.parentStageId)
    : currentStage;
  const currentSubstages = currentParentStage ? substagesMap[currentParentStage.id] ?? [] : [];

  const timeline = [
    ...activities.map((a) => ({ type: "activity" as const, date: a.createdAt, data: a })),
    ...touchpoints.map((t) => ({ type: "touchpoint" as const, date: t.touchpointAt, data: t })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // All contacts: from junction + primary (deduplicated)
  const allContacts: DealContact[] = [...dealContacts];
  if (contact && !allContacts.some((c) => c.id === contact.id)) {
    allContacts.unshift({ ...contact, role: "primary" });
  }

  return (
    <div>
      {/* Back link */}
      <Link href={fromInbox ? "/admin/growth-ops" : "/admin/growth-ops/pipeline"} className="text-xs text-cos-electric hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3 w-3" /> {fromInbox ? "Back to LinkedIn Inbox" : "Back to Pipeline"}
      </Link>

      {/* Header: Name + Status + Value */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => { if (editName.trim() && editName !== deal.name) saveField("name", editName.trim()); }}
            className="font-heading text-2xl font-bold text-cos-midnight bg-transparent border-b border-transparent hover:border-cos-border focus:border-cos-electric focus:outline-none w-full pb-0.5 transition-colors"
          />
          <div className="flex items-center gap-3 mt-1.5">
            {currentStage && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: (currentParentStage?.color ?? currentStage.color) + "1a", color: currentParentStage?.color ?? currentStage.color }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: currentParentStage?.color ?? currentStage.color }} />
                {currentParentStage && currentStage.parentStageId ? `${currentParentStage.label} / ${currentStage.label}` : currentStage.label}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${deal.status === "won" ? "bg-emerald-100 text-emerald-700" : deal.status === "lost" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
              {deal.status}
            </span>
            {deal.sentimentScore != null && (
              <span className="text-[10px] text-cos-slate-dim">Sentiment: {Math.round(deal.sentimentScore * 100)}%</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1">
            <DollarSign className="h-4 w-4 text-cos-slate" />
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => { if (editValue !== (deal.dealValue ?? "")) saveField("dealValue", editValue || null); }}
              placeholder="Value"
              className="w-28 text-xl font-bold text-cos-signal bg-transparent border-b border-transparent hover:border-cos-border focus:border-cos-electric focus:outline-none text-right transition-colors"
            />
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1 rounded-cos-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 transition-colors"
          >
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ─── Left Column — Associations ─── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Company card */}
          <div className="rounded-cos-xl border border-cos-border bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Company
            </h3>
            {company ? (
              <>
                <p className="text-sm font-medium text-cos-midnight">{company.name}</p>
                {company.domain && <p className="text-xs text-cos-slate mt-0.5">{company.domain}</p>}
                {company.industry && <p className="text-xs text-cos-slate mt-0.5">{company.industry}</p>}
                {company.sizeEstimate && <p className="text-xs text-cos-slate mt-0.5">{company.sizeEstimate} employees</p>}
                <Link href={`/admin/growth-ops/crm/companies/acq_${company.id}`} className="text-xs text-cos-electric flex items-center gap-1 mt-2 hover:underline">
                  View in CRM &rarr;
                </Link>
              </>
            ) : (
              <>
                {!showCompanySearch ? (
                  <button onClick={() => setShowCompanySearch(true)} className="flex items-center gap-1.5 text-xs text-cos-electric hover:underline">
                    <Search className="h-3 w-3" /> Link Company
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={companySearch}
                        onChange={(e) => handleCompanySearch(e.target.value)}
                        placeholder="Search by name or domain..."
                        className="w-full rounded-cos-lg border border-cos-border px-3 py-1.5 text-xs focus:border-cos-electric focus:outline-none pr-7"
                        autoFocus
                      />
                      <button onClick={() => { setShowCompanySearch(false); setCompanySearch(""); setCompanyResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-cos-slate-dim hover:text-cos-midnight">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    {searchingCompany && <Loader2 className="h-3 w-3 animate-spin text-cos-electric mx-auto" />}
                    {companyResults.length > 0 && (
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {companyResults.map((r) => (
                          <button key={r.id} onClick={() => linkCompany(r.id)} className="w-full text-left rounded-cos-md px-2 py-1.5 text-xs hover:bg-cos-cloud transition-colors">
                            <p className="font-medium text-cos-midnight">{r.name}</p>
                            {r.domain && <p className="text-[10px] text-cos-slate">{r.domain}</p>}
                          </button>
                        ))}
                      </div>
                    )}
                    {companySearch.length >= 2 && !searchingCompany && companyResults.length === 0 && (
                      <p className="text-[10px] text-cos-slate-dim text-center py-1">No companies found</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Contacts card */}
          <div className="rounded-cos-xl border border-cos-border bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Contacts ({allContacts.length})
            </h3>
            {allContacts.length > 0 ? (
              <div className="space-y-3">
                {allContacts.map((c) => (
                  <div key={c.id} className="group">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-cos-midnight">
                          {c.firstName} {c.lastName}
                          {c.role === "primary" && <span className="ml-1.5 text-[9px] rounded-full bg-cos-electric/10 text-cos-electric px-1.5 py-0.5">Primary</span>}
                        </p>
                        {c.email && !c.email.includes("@placeholder.local") && (
                          <p className="text-xs text-cos-slate flex items-center gap-1 mt-0.5">
                            <Mail className="h-2.5 w-2.5" /> {c.email}
                          </p>
                        )}
                        {c.linkedinUrl && (
                          <a href={c.linkedinUrl.startsWith("http") ? c.linkedinUrl : `https://${c.linkedinUrl}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 flex items-center gap-1 mt-0.5 hover:underline">
                            <Linkedin className="h-2.5 w-2.5" /> LinkedIn
                          </a>
                        )}
                        <Link href={`/admin/growth-ops/crm/people/ac_${c.id}`} className="text-[10px] text-cos-electric hover:underline mt-0.5 inline-block">
                          View in CRM &rarr;
                        </Link>
                      </div>
                      <button onClick={() => unlinkContact(c.id)} className="opacity-0 group-hover:opacity-100 text-cos-slate-dim hover:text-red-500 transition-all" title="Unlink contact">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-cos-slate-dim">No contacts linked</p>
            )}

            {/* Add contact */}
            <div className="mt-3 pt-3 border-t border-cos-border/50">
              {!showContactSearch ? (
                <button onClick={() => setShowContactSearch(true)} className="flex items-center gap-1.5 text-xs text-cos-electric hover:underline">
                  <Plus className="h-3 w-3" /> Add Contact
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      value={contactSearch}
                      onChange={(e) => handleContactSearch(e.target.value)}
                      placeholder="Search by name or email..."
                      className="w-full rounded-cos-lg border border-cos-border px-3 py-1.5 text-xs focus:border-cos-electric focus:outline-none pr-7"
                      autoFocus
                    />
                    <button onClick={() => { setShowContactSearch(false); setContactSearch(""); setContactResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-cos-slate-dim hover:text-cos-midnight">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {searchingContact && <Loader2 className="h-3 w-3 animate-spin text-cos-electric mx-auto" />}
                  {contactResults.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {contactResults.map((r) => (
                        <button key={r.id} onClick={() => linkContact(r.id)} className="w-full text-left rounded-cos-md px-2 py-1.5 text-xs hover:bg-cos-cloud transition-colors">
                          <p className="font-medium text-cos-midnight">{r.firstName} {r.lastName}</p>
                          {r.email && <p className="text-[10px] text-cos-slate">{r.email}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                  {contactSearch.length >= 2 && !searchingContact && contactResults.length === 0 && (
                    <p className="text-[10px] text-cos-slate-dim text-center py-1">No contacts found</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Deal metadata */}
          <div className="rounded-cos-xl border border-cos-border bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3">Deal Details</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-medium text-cos-slate-light uppercase tracking-wide">Priority</label>
                <select
                  value={editPriority}
                  onChange={(e) => { setEditPriority(e.target.value); saveField("priority", e.target.value); }}
                  className="w-full mt-0.5 rounded-cos-md border border-cos-border px-2.5 py-1.5 text-sm text-cos-midnight focus:border-cos-electric focus:outline-none"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-cos-slate">Source</span>
                <span className="font-medium text-cos-midnight">{deal.source.replace(/_/g, " ")}</span>
              </div>
              {deal.sourceCampaignName && (
                <div className="flex justify-between text-xs">
                  <span className="text-cos-slate">Campaign</span>
                  <span className="font-medium text-cos-midnight truncate ml-4">{deal.sourceCampaignName}</span>
                </div>
              )}
              {deal.sourceChannel && (
                <div className="flex justify-between text-xs">
                  <span className="text-cos-slate">Channel</span>
                  <span className="font-medium text-cos-midnight capitalize">{deal.sourceChannel}</span>
                </div>
              )}
              {deal.hubspotDealId && (
                <div className="flex justify-between text-xs">
                  <span className="text-cos-slate">HubSpot</span>
                  <span className="font-mono text-cos-slate-dim text-[10px]">{deal.hubspotDealId}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-cos-slate">Created</span>
                <span className="text-cos-midnight">{new Date(deal.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
              {deal.closedAt && (
                <div className="flex justify-between text-xs">
                  <span className="text-cos-slate">Closed</span>
                  <span className="text-cos-midnight">{new Date(deal.closedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Center Column — Activity & Notes ─── */}
        <div className="lg:col-span-6 space-y-4">
          {/* Notes */}
          <div className="rounded-cos-xl border border-cos-border bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3">Notes</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Add notes about this deal..."
              className="w-full rounded-cos-lg border border-cos-border bg-cos-cloud/50 px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-dim focus:border-cos-electric focus:outline-none resize-none"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover disabled:opacity-50 transition-colors"
              >
                {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save Notes
              </button>
            </div>
          </div>

          {/* Original Message */}
          {queueMessage && (
            <div className="rounded-cos-xl border border-cos-border bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Original Message
              </h3>
              <div className="rounded-cos-lg bg-cos-cloud/50 border border-cos-border/50 px-3 py-2">
                <p className="text-sm text-cos-midnight whitespace-pre-wrap">{queueMessage}</p>
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          <div className="rounded-cos-xl border border-cos-border bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3">Activity Timeline</h3>
            {timeline.length === 0 ? (
              <p className="text-sm text-cos-slate text-center py-4">No activity yet.</p>
            ) : (
              <div className="space-y-0">
                {timeline.map((item, i) => (
                  <div key={item.data.id} className="flex gap-3 py-2.5">
                    <div className="flex flex-col items-center">
                      <div className="rounded-full bg-cos-cloud p-1.5">
                        {item.type === "activity" ? activityIcon(item.data.activityType) : <Globe className="h-3.5 w-3.5 text-cos-slate" />}
                      </div>
                      {i < timeline.length - 1 && <div className="w-px flex-1 bg-cos-border mt-1" />}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      {item.type === "activity" ? (
                        <>
                          <p className="text-xs font-medium text-cos-midnight">{item.data.description || item.data.activityType.replace(/_/g, " ")}</p>
                          <p className="text-[10px] text-cos-slate-dim mt-0.5">
                            {new Date(item.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-medium text-cos-midnight">
                            {item.data.channel.replace(/_/g, " ")} &mdash; {item.data.interactionType}
                          </p>
                          {item.data.sourceName && <p className="text-[10px] text-cos-slate mt-0.5">{item.data.sourceName}</p>}
                          <p className="text-[10px] text-cos-slate-dim mt-0.5">
                            {new Date(item.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── Right Column — Stage Management ─── */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-cos-xl border border-cos-border bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3">Stage Pipeline</h3>
            <div className="space-y-1">
              {parentStages.sort((a, b) => a.displayOrder - b.displayOrder).map((stage) => {
                const isCurrentParent = currentParentStage?.id === stage.id;
                const subs = substagesMap[stage.id] ?? [];
                const isCurrentStage = deal.stageId === stage.id;
                return (
                  <div key={stage.id}>
                    <button
                      onClick={() => changeStage(stage.id)}
                      disabled={isCurrentStage}
                      className={`w-full text-left rounded-cos-lg px-3 py-2 text-xs font-medium transition-colors flex items-center gap-2 ${
                        isCurrentParent
                          ? "ring-2 ring-offset-1"
                          : "hover:opacity-80"
                      }`}
                      style={{
                        backgroundColor: isCurrentParent ? stage.color + "20" : stage.color + "08",
                        color: stage.color,
                        ...(isCurrentParent ? { ringColor: stage.color } : {}),
                      }}
                    >
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                      {stage.label}
                      {stage.isClosedWon && <span className="ml-auto text-[9px] opacity-60">Won</span>}
                      {stage.isClosedLost && <span className="ml-auto text-[9px] opacity-60">Lost</span>}
                    </button>

                    {/* Show substages if this is current parent or always show them */}
                    {subs.length > 0 && isCurrentParent && (
                      <div className="ml-4 mt-1 mb-1 space-y-0.5">
                        {subs.sort((a, b) => a.displayOrder - b.displayOrder).map((sub) => {
                          const isCurrentSub = deal.stageId === sub.id;
                          return (
                            <button
                              key={sub.id}
                              onClick={() => changeStage(sub.id)}
                              disabled={isCurrentSub}
                              className={`w-full text-left rounded-cos-md px-2.5 py-1.5 text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                                isCurrentSub
                                  ? "bg-cos-electric/10 text-cos-electric ring-1 ring-cos-electric/30"
                                  : "text-cos-slate hover:bg-cos-cloud hover:text-cos-midnight"
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${isCurrentSub ? "bg-cos-electric" : "bg-cos-slate-dim"}`} />
                              {sub.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Substage quick-select pills (if current parent has substages) */}
          {currentSubstages.length > 0 && (
            <div className="rounded-cos-xl border border-cos-border bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3">
                {currentParentStage?.label} Substage
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {currentSubstages.sort((a, b) => a.displayOrder - b.displayOrder).map((sub) => {
                  const isActive = deal.stageId === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => changeStage(sub.id)}
                      className={`rounded-cos-pill px-3 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-cos-electric text-white"
                          : "bg-cos-cloud text-cos-slate hover:bg-cos-electric/10 hover:text-cos-electric"
                      }`}
                    >
                      {sub.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
