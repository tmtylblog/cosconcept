"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  ArrowLeft,
  Globe,
  Linkedin,
  Loader2,
  Users,
  TrendingUp,
  FileText,
  MessageSquare,
  ExternalLink,
  Pencil,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import CrmAnnotationsPanel from "@/components/admin/crm-annotations-panel";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ENTITY_BADGE: Record<string, { label: string; className: string }> = {
  customer: { label: "Customer", className: "bg-green-100 text-green-700" },
  prospect: { label: "Prospect", className: "bg-blue-100 text-blue-700" },
  knowledge_graph: { label: "Knowledge Graph", className: "bg-purple-100 text-purple-700" },
  client_of_customer: { label: "Client of Customer", className: "bg-amber-100 text-amber-700" },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600",
  high: "text-orange-600",
  normal: "text-cos-midnight",
  low: "text-cos-slate-light",
};

type Tab = "overview" | "people" | "deals" | "comms" | "research";

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/growth-ops/crm/companies/${encodeURIComponent(id as string)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-cos-slate">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading company...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-24">
        <p className="text-cos-slate mb-4">Company not found.</p>
        <Button variant="outline" onClick={() => router.push("/admin/growth-ops/crm/companies")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Companies
        </Button>
      </div>
    );
  }

  const badge = ENTITY_BADGE[data.entityClass] || ENTITY_BADGE.knowledge_graph;
  const people: any[] = data.people || [];
  const deals: any[] = data.deals || [];
  const conversations: any[] = data.conversations || [];
  const research: any = data.research;

  const services: any[] = data.services || [];
  const caseStudies: any[] = data.caseStudies || [];
  const categories: string[] = data.categories || [];
  const skills: string[] = data.skills || [];
  const industries: string[] = data.industries || [];
  const markets: string[] = data.markets || [];
  const clients: any[] = data.clients || [];
  const abstraction: any = data.abstraction;
  const preferences: any = data.preferences;

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { key: "overview", label: "Overview", icon: Building2 },
    { key: "people", label: "People", icon: Users, count: people.length },
    { key: "deals", label: "Deals", icon: TrendingUp, count: deals.length },
    { key: "comms", label: "Communications", icon: MessageSquare, count: conversations.length },
    { key: "research", label: "Research", icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/admin/growth-ops/crm/companies")}
        className="flex items-center gap-1 text-sm text-cos-slate hover:text-cos-electric transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Companies
      </button>

      {/* Company Header */}
      <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {data.logoUrl ? (
              <img src={data.logoUrl} alt="" className="h-12 w-12 rounded-cos-md object-contain" />
            ) : (
              <div className="h-12 w-12 rounded-cos-md bg-cos-electric/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-cos-electric" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-heading font-bold text-cos-midnight">{data.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-cos-slate">
                {data.domain && <span>{data.domain}</span>}
                {data.industry && <span>&middot; {data.industry}</span>}
                {data.sizeEstimate && <span>&middot; {data.sizeEstimate}</span>}
                {data.foundedYear && <span>&middot; Founded {data.foundedYear}</span>}
              </div>
              {data.location && <div className="text-xs text-cos-slate-light mt-0.5">{data.location}</div>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
            {data.website && (
              <Button variant="outline" size="sm" onClick={() => window.open(data.website, "_blank")}>
                <Globe className="h-4 w-4 mr-1" /> Website
              </Button>
            )}
            {data.linkedinUrl && (
              <Button variant="outline" size="sm" onClick={() => {
                const url = data.linkedinUrl.startsWith("http") ? data.linkedinUrl : `https://${data.linkedinUrl}`;
                window.open(url, "_blank");
              }}>
                <Linkedin className="h-4 w-4 mr-1" /> LinkedIn
              </Button>
            )}
            {data.entityClass === "prospect" && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
            )}
            <Link href={`/admin/growth-ops/pipeline/new?companyId=${data.rawId ?? ""}&companyName=${encodeURIComponent(data.name ?? "")}`}>
              <Button variant="outline" size="sm">
                <Plus className="h-3.5 w-3.5 mr-1" /> New Deal
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Inline Edit */}
      {editing && data.entityClass === "prospect" && (
        <div className="rounded-cos-lg border border-cos-electric/30 bg-cos-electric/5 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-cos-midnight">Edit Company</h3>
          <form onSubmit={async (e) => {
            e.preventDefault();
            setEditSaving(true);
            const form = e.target as HTMLFormElement;
            const fd = new FormData(form);
            const updates: Record<string, string> = {};
            for (const [k, v] of fd.entries()) updates[k] = v as string;
            try {
              const res = await fetch(`/api/admin/growth-ops/crm/companies/${encodeURIComponent(id as string)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
              });
              if (res.ok) {
                setEditing(false);
                const r = await fetch(`/api/admin/growth-ops/crm/companies/${encodeURIComponent(id as string)}`);
                if (r.ok) setData(await r.json());
              }
            } catch { /* ignore */ }
            finally { setEditSaving(false); }
          }} className="grid grid-cols-2 gap-3 text-sm">
            <input name="name" defaultValue={data.name ?? ""} placeholder="Company Name" className="rounded-cos-md border border-cos-border px-3 py-2 focus:border-cos-electric focus:outline-none" />
            <input name="domain" defaultValue={data.domain ?? ""} placeholder="Domain" className="rounded-cos-md border border-cos-border px-3 py-2 focus:border-cos-electric focus:outline-none" />
            <input name="website" defaultValue={data.website ?? ""} placeholder="Website URL" className="rounded-cos-md border border-cos-border px-3 py-2 focus:border-cos-electric focus:outline-none" />
            <input name="industry" defaultValue={data.industry ?? ""} placeholder="Industry" className="rounded-cos-md border border-cos-border px-3 py-2 focus:border-cos-electric focus:outline-none" />
            <input name="sizeEstimate" defaultValue={data.sizeEstimate ?? ""} placeholder="Size (e.g. 51-200)" className="rounded-cos-md border border-cos-border px-3 py-2 focus:border-cos-electric focus:outline-none" />
            <input name="location" defaultValue={data.location ?? ""} placeholder="Location" className="rounded-cos-md border border-cos-border px-3 py-2 focus:border-cos-electric focus:outline-none" />
            <input name="linkedinUrl" defaultValue={data.linkedinUrl ?? ""} placeholder="LinkedIn URL" className="col-span-2 rounded-cos-md border border-cos-border px-3 py-2 focus:border-cos-electric focus:outline-none" />
            <textarea name="description" defaultValue={data.description ?? ""} placeholder="Description" rows={2} className="col-span-2 rounded-cos-md border border-cos-border px-3 py-2 focus:border-cos-electric focus:outline-none resize-none" />
            <textarea name="notes" defaultValue={data.notes ?? ""} placeholder="Notes" rows={2} className="col-span-2 rounded-cos-md border border-cos-border px-3 py-2 focus:border-cos-electric focus:outline-none resize-none" />
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="rounded-cos-md border border-cos-border px-3 py-1.5 text-xs text-cos-slate hover:text-cos-midnight">Cancel</button>
              <button type="submit" disabled={editSaving} className="rounded-cos-md bg-cos-electric px-3 py-1.5 text-xs font-medium text-white hover:bg-cos-electric-hover disabled:opacity-50">
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-cos-border overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.key
                  ? "border-cos-electric text-cos-electric"
                  : "border-transparent text-cos-slate hover:text-cos-midnight"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className="ml-1 text-xs bg-cos-cloud rounded-full px-1.5 py-0.5">{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content + Annotations Sidebar */}
      <div className="flex gap-6">
      <div className="flex-1 rounded-cos-lg border border-cos-border bg-cos-surface p-6 min-h-[300px]">
        {/* ─── Overview ─── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* AI Narrative */}
            {abstraction?.hiddenNarrative && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-1">AI Summary</h3>
                <p className="text-sm text-cos-midnight leading-relaxed">{abstraction.hiddenNarrative}</p>
              </div>
            )}

            {data.description && !abstraction?.hiddenNarrative && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Description</h3>
                <p className="text-sm text-cos-midnight">{data.description}</p>
              </div>
            )}

            {/* Firmographics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {data.firmType && <InfoCell label="Firm Type" value={data.firmType.replace(/_/g, " ")} />}
              {data.employeeCount && <InfoCell label="Employees" value={String(data.employeeCount)} />}
              {data.sizeEstimate && !data.employeeCount && <InfoCell label="Size" value={data.sizeEstimate.replace(/_/g, " ")} />}
              {data.foundedYear && <InfoCell label="Founded" value={String(data.foundedYear)} />}
              {data.location && <InfoCell label="Location" value={data.location} />}
              <InfoCell label="Enrichment" value={data.enrichmentStatus || "Not enriched"} />
              {data.classificationConfidence != null && <InfoCell label="Confidence" value={`${Math.round(data.classificationConfidence * 100)}%`} />}
              {data.graphNodeId && <InfoCell label="Knowledge Graph" value="Connected" className="text-green-600" />}
            </div>

            {data.profileCompleteness != null && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Profile Completeness</h3>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-cos-cloud">
                    <div className="h-2 rounded-full bg-cos-electric" style={{ width: `${Math.round(data.profileCompleteness * 100)}%` }} />
                  </div>
                  <span className="text-xs text-cos-slate">{Math.round(data.profileCompleteness * 100)}%</span>
                </div>
              </div>
            )}

            {/* Taxonomy Tags */}
            {categories.length > 0 && (
              <TagSection label="Categories" tags={categories} color="bg-cos-electric/10 text-cos-electric" />
            )}
            {skills.length > 0 && (
              <TagSection label="Skills" tags={skills} color="bg-blue-100 text-blue-700" />
            )}
            {industries.length > 0 && (
              <TagSection label="Industries" tags={industries} color="bg-purple-100 text-purple-700" />
            )}
            {markets.length > 0 && (
              <TagSection label="Markets" tags={markets} color="bg-amber-100 text-amber-700" />
            )}

            {/* Extracted Clients */}
            {clients.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-2">Known Clients</h3>
                <div className="flex flex-wrap gap-1.5">
                  {clients.map((c: any, i: number) => (
                    <span key={i} className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-1">
                      {typeof c === "string" ? c : c.name}
                      {c.confidence != null && <span className="text-green-400 ml-1">{Math.round(c.confidence * 100)}%</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Services */}
            {services.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-2">Services ({services.length})</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {services.slice(0, 10).map((s: any) => (
                    <div key={s.id} className="p-2.5 rounded-cos-md bg-cos-cloud/50 border border-cos-border/50">
                      <div className="text-sm font-medium text-cos-midnight">{s.name}</div>
                      {s.description && <div className="text-xs text-cos-slate mt-0.5 line-clamp-2">{s.description}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Case Studies */}
            {caseStudies.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-2">Case Studies ({caseStudies.length})</h3>
                <div className="space-y-2">
                  {caseStudies.slice(0, 8).map((cs: any) => (
                    <div key={cs.id} className="p-2.5 rounded-cos-md bg-cos-cloud/50 border border-cos-border/50">
                      <div className="text-sm font-medium text-cos-midnight">{cs.title || "Untitled"}</div>
                      {cs.summary && <div className="text-xs text-cos-slate mt-0.5 line-clamp-2">{cs.summary}</div>}
                      {cs.autoTags && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(cs.autoTags.skills || []).slice(0, 3).map((t: string) => (
                            <span key={t} className="text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">{t}</span>
                          ))}
                          {cs.autoTags.clientName && (
                            <span className="text-[10px] bg-green-50 text-green-600 rounded px-1.5 py-0.5">{cs.autoTags.clientName}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Partner Preferences */}
            {preferences && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-2">Partner Preferences</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {preferences.growthGoals && (
                    <div className="col-span-2">
                      <span className="font-medium text-cos-slate">Growth Goals:</span>{" "}
                      <span className="text-cos-midnight">{preferences.growthGoals}</span>
                    </div>
                  )}
                  {preferences.preferredFirmTypes?.length > 0 && (
                    <div><span className="font-medium text-cos-slate">Preferred Types:</span> <span className="text-cos-midnight">{preferences.preferredFirmTypes.join(", ")}</span></div>
                  )}
                  {preferences.partnershipModels?.length > 0 && (
                    <div><span className="font-medium text-cos-slate">Models:</span> <span className="text-cos-midnight">{preferences.partnershipModels.join(", ")}</span></div>
                  )}
                  {preferences.dealBreakers?.length > 0 && (
                    <div className="col-span-2"><span className="font-medium text-red-500">Deal Breakers:</span> <span className="text-cos-midnight">{preferences.dealBreakers.join(", ")}</span></div>
                  )}
                </div>
              </div>
            )}

            {/* Quick stats */}
            <div className="flex gap-6 pt-4 border-t border-cos-border/50">
              <div className="text-center">
                <div className="text-lg font-bold text-cos-midnight">{people.length}</div>
                <div className="text-xs text-cos-slate">People</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-cos-midnight">{deals.length}</div>
                <div className="text-xs text-cos-slate">Deals</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-cos-midnight">{conversations.length}</div>
                <div className="text-xs text-cos-slate">Conversations</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-cos-midnight">{services.length}</div>
                <div className="text-xs text-cos-slate">Services</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-cos-midnight">{caseStudies.length}</div>
                <div className="text-xs text-cos-slate">Case Studies</div>
              </div>
            </div>
          </div>
        )}

        {/* ─── People ─── */}
        {activeTab === "people" && (
          people.length === 0 ? (
            <div className="text-center py-12 text-cos-slate-light text-sm">No people associated with this company.</div>
          ) : (
            <div className="space-y-2">
              {people.map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3 rounded-cos-md hover:bg-cos-electric/5 cursor-pointer"
                  onClick={() => router.push(`/admin/growth-ops/crm/people/${encodeURIComponent(p.crmId)}`)}
                >
                  <div className="flex items-center gap-3">
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-cos-electric/10 flex items-center justify-center text-xs font-bold text-cos-electric">
                        {(p.fullName || p.firstName || "?").charAt(0)}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-cos-midnight">{p.fullName || [p.firstName, p.lastName].filter(Boolean).join(" ")}</div>
                      <div className="text-xs text-cos-slate-light">{p.title || p.headline || p.email || ""}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.source === "expert" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {p.source === "expert" ? "Expert" : "Prospect"}
                    </span>
                    {p.linkedinUrl && (
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); const url = p.linkedinUrl.startsWith("http") ? p.linkedinUrl : `https://${p.linkedinUrl}`; window.open(url, "_blank"); }}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ─── Deals ─── */}
        {activeTab === "deals" && (
          deals.length === 0 ? (
            <div className="text-center py-12 text-cos-slate-light text-sm">No deals for this company.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cos-border text-left">
                    <th className="pb-2 font-medium text-cos-slate-dim">Deal</th>
                    <th className="pb-2 font-medium text-cos-slate-dim">Stage</th>
                    <th className="pb-2 font-medium text-cos-slate-dim">Value</th>
                    <th className="pb-2 font-medium text-cos-slate-dim">Priority</th>
                    <th className="pb-2 font-medium text-cos-slate-dim">Status</th>
                    <th className="pb-2 font-medium text-cos-slate-dim">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((d: any) => (
                    <tr key={d.id} className="border-b border-cos-border/50">
                      <td className="py-2 font-medium text-cos-midnight">{d.name}</td>
                      <td className="py-2 text-cos-slate">{d.stageLabel || "-"}</td>
                      <td className="py-2 text-cos-slate">{d.dealValue || "-"}</td>
                      <td className={`py-2 font-medium ${PRIORITY_COLORS[d.priority] || ""}`}>{d.priority}</td>
                      <td className="py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          d.status === "won" ? "bg-green-100 text-green-700"
                            : d.status === "lost" ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>{d.status}</span>
                      </td>
                      <td className="py-2 text-cos-slate text-xs">{d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ─── Communications ─── */}
        {activeTab === "comms" && (
          conversations.length === 0 ? (
            <div className="text-center py-12 text-cos-slate-light text-sm">No LinkedIn conversations found for this company domain.</div>
          ) : (
            <div className="space-y-2">
              {conversations.map((c: any) => (
                <div key={c.id} className="p-3 rounded-cos-md border border-cos-border/50 hover:bg-cos-electric/5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-cos-midnight">{c.participantName}</span>
                    <span className="text-xs text-cos-slate-light">
                      {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleDateString() : ""}
                    </span>
                  </div>
                  {c.participantHeadline && (
                    <div className="text-xs text-cos-slate mb-1">{c.participantHeadline}</div>
                  )}
                  {c.lastMessagePreview && (
                    <div className="text-xs text-cos-slate-light line-clamp-2">{c.lastMessagePreview}</div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* ─── Research ─── */}
        {activeTab === "research" && (
          !research ? (
            <div className="text-center py-12 text-cos-slate-light text-sm">No research data available for this company.</div>
          ) : (
            <div className="space-y-4">
              {research.executiveSummary && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Executive Summary</h3>
                  <p className="text-sm text-cos-midnight">{research.executiveSummary}</p>
                </div>
              )}
              {research.offeringSummary && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Offering</h3>
                  <p className="text-sm text-cos-midnight">{research.offeringSummary}</p>
                </div>
              )}
              {research.industryInsight && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Industry Insight</h3>
                  <p className="text-sm text-cos-midnight">{research.industryInsight}</p>
                </div>
              )}
              {research.growthChallenges && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Growth Challenges</h3>
                  <p className="text-sm text-cos-midnight">{research.growthChallenges}</p>
                </div>
              )}
              {research.buyingIntentInsight && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Buying Intent</h3>
                  <p className="text-sm text-cos-midnight">{research.buyingIntentInsight}</p>
                </div>
              )}
              {research.competitorsInsight && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Competitors</h3>
                  <p className="text-sm text-cos-midnight">{research.competitorsInsight}</p>
                </div>
              )}
              {research.interestingHighlights?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-2">Highlights</h3>
                  <div className="space-y-2">
                    {research.interestingHighlights.map((h: any, i: number) => (
                      <div key={i} className="p-3 rounded-cos-md bg-cos-cloud/50">
                        <div className="text-sm font-medium text-cos-midnight">{h.title}</div>
                        <div className="text-xs text-cos-slate mt-0.5">{h.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Annotations Sidebar */}
      <div className="w-72 shrink-0 hidden lg:block">
        <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-4 sticky top-4">
          <h3 className="text-sm font-heading font-semibold text-cos-midnight mb-3">Sales Notes</h3>
          <CrmAnnotationsPanel entityType="company" entityId={data.id} />
        </div>
      </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value, className = "text-cos-midnight" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-cos-slate-light uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-medium ${className}`}>{value}</div>
    </div>
  );
}

function TagSection({ label, tags, color }: { label: string; tags: string[]; color: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-cos-slate-dim mb-2">{label}</h3>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t: string) => (
          <span key={t} className={`text-xs rounded-full px-2.5 py-1 ${color}`}>{t}</span>
        ))}
      </div>
    </div>
  );
}
