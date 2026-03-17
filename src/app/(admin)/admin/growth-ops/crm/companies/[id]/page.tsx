"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
              <Button variant="outline" size="sm" onClick={() => window.open(data.linkedinUrl, "_blank")}>
                <Linkedin className="h-4 w-4 mr-1" /> LinkedIn
              </Button>
            )}
          </div>
        </div>
      </div>

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

      {/* Tab Content */}
      <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-6 min-h-[300px]">
        {/* ─── Overview ─── */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {data.description && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Description</h3>
                <p className="text-sm text-cos-midnight">{data.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Enrichment Status</h3>
                <p className="text-sm text-cos-midnight">{data.enrichmentStatus || "Not enriched"}</p>
              </div>
              {data.firmType && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Firm Type</h3>
                  <p className="text-sm text-cos-midnight">{data.firmType}</p>
                </div>
              )}
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
              {data.graphNodeId && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Knowledge Graph</h3>
                  <p className="text-sm text-green-600">Connected</p>
                </div>
              )}
            </div>
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
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); window.open(p.linkedinUrl, "_blank"); }}>
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
    </div>
  );
}
