"use client";

import { useEffect, useState, use } from "react";
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
} from "lucide-react";

interface Stage { id: string; label: string; displayOrder: number; color: string; isClosedWon: boolean; isClosedLost: boolean; }
interface Deal { id: string; name: string; stageId: string | null; stageLabel: string; dealValue: string | null; status: string; source: string; sourceChannel: string | null; sourceCampaignName: string | null; notes: string | null; priority: string; lastActivityAt: string | null; sentimentScore: number | null; hubspotDealId: string | null; closedAt: string | null; createdAt: string; updatedAt: string; }
interface Contact { id: string; email: string; firstName: string; lastName: string; linkedinUrl: string | null; companyId: string | null; }
interface Company { id: string; name: string; domain: string | null; industry: string | null; sizeEstimate: string | null; }
interface Activity { id: string; activityType: string; description: string | null; metadata: Record<string, unknown> | null; createdAt: string; }
interface Touchpoint { id: string; channel: string; sourceName: string | null; touchpointAt: string; interactionType: string; }

function activityIcon(type: string) {
  switch (type) {
    case "stage_change": return <ChevronDown className="h-3.5 w-3.5 text-blue-500" />;
    case "note_added": return <MessageSquare className="h-3.5 w-3.5 text-purple-500" />;
    case "email_replied": return <Mail className="h-3.5 w-3.5 text-orange-500" />;
    case "linkedin_message": return <Linkedin className="h-3.5 w-3.5 text-blue-600" />;
    case "auto_created": return <Globe className="h-3.5 w-3.5 text-emerald-500" />;
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
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Inline editable fields
  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editPriority, setEditPriority] = useState("normal");
  const [savingField, setSavingField] = useState<string | null>(null);

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
      setStages(data.stages ?? []);
      setActivities(data.activities ?? []);
      setTouchpoints(data.touchpoints ?? []);
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

  const currentStage = stages.find((s) => s.id === deal.stageId);
  const timeline = [
    ...activities.map((a) => ({ type: "activity" as const, date: a.createdAt, data: a })),
    ...touchpoints.map((t) => ({ type: "touchpoint" as const, date: t.touchpointAt, data: t })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: currentStage.color + "1a", color: currentStage.color }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: currentStage.color }} />
                {currentStage.label}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Left Column ─── */}
        <div className="lg:col-span-1 space-y-4">
          {/* Stage selector */}
          <div className="rounded-cos-xl border border-cos-border bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3">Stage</h3>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((stage) => (
                <button
                  key={stage.id}
                  onClick={() => changeStage(stage.id)}
                  disabled={stage.id === deal.stageId}
                  className={`rounded-cos-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${stage.id === deal.stageId ? "ring-2 ring-offset-1" : "hover:opacity-80"}`}
                  style={{
                    backgroundColor: stage.id === deal.stageId ? stage.color + "20" : stage.color + "10",
                    color: stage.color,
                    ...(stage.id === deal.stageId ? { ringColor: stage.color } : {}),
                  }}
                >
                  {stage.label}
                </button>
              ))}
            </div>
          </div>

          {/* Inline deal fields */}
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

          {/* Contact card */}
          {contact && (
            <div className="rounded-cos-xl border border-cos-border bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Contact
              </h3>
              <p className="text-sm font-medium text-cos-midnight">{contact.firstName} {contact.lastName}</p>
              {contact.email && !contact.email.includes("@placeholder.local") && (
                <p className="text-xs text-cos-slate flex items-center gap-1.5 mt-1">
                  <Mail className="h-3 w-3" /> {contact.email}
                </p>
              )}
              {contact.linkedinUrl && (
                <a href={contact.linkedinUrl.startsWith("http") ? contact.linkedinUrl : `https://${contact.linkedinUrl}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 flex items-center gap-1.5 mt-1 hover:underline">
                  <Linkedin className="h-3 w-3" /> LinkedIn Profile
                </a>
              )}
              <Link href={`/admin/growth-ops/crm/people/ac_${contact.id}`} className="text-xs text-cos-electric flex items-center gap-1 mt-2 hover:underline">
                View in CRM &rarr;
              </Link>
            </div>
          )}

          {/* Company card */}
          {company && (
            <div className="rounded-cos-xl border border-cos-border bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-cos-slate-dim mb-3 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Company
              </h3>
              <p className="text-sm font-medium text-cos-midnight">{company.name}</p>
              {company.domain && <p className="text-xs text-cos-slate mt-0.5">{company.domain}</p>}
              {company.industry && <p className="text-xs text-cos-slate mt-0.5">{company.industry}</p>}
              {company.sizeEstimate && <p className="text-xs text-cos-slate mt-0.5">{company.sizeEstimate} employees</p>}
              <Link href={`/admin/growth-ops/crm/companies/acq_${company.id}`} className="text-xs text-cos-electric flex items-center gap-1 mt-2 hover:underline">
                View in CRM &rarr;
              </Link>
            </div>
          )}
        </div>

        {/* ─── Right Column ─── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Notes — inline */}
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
      </div>
    </div>
  );
}
