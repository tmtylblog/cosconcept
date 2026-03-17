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
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompanyDetail {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  sizeEstimate: string | null;
  location: string | null;
  website: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  description: string | null;
  foundedYear: number | null;
  entityClass: string;
  enrichmentStatus: string | null;
  profileCompleteness: number | null;
  serviceFirmId: string | null;
  graphNodeId: string | null;
}

const ENTITY_BADGE: Record<string, { label: string; className: string }> = {
  customer: { label: "Customer", className: "bg-green-100 text-green-700" },
  prospect: { label: "Prospect", className: "bg-blue-100 text-blue-700" },
  knowledge_graph: { label: "Knowledge Graph", className: "bg-purple-100 text-purple-700" },
  client_of_customer: { label: "Client of Customer", className: "bg-amber-100 text-amber-700" },
};

type Tab = "overview" | "people" | "deals" | "comms" | "research";

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/growth-ops/crm/companies/${encodeURIComponent(id as string)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setCompany)
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

  if (!company) {
    return (
      <div className="text-center py-24">
        <p className="text-cos-slate mb-4">Company not found.</p>
        <Button variant="outline" onClick={() => router.push("/admin/growth-ops/crm/companies")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Companies
        </Button>
      </div>
    );
  }

  const badge = ENTITY_BADGE[company.entityClass] || ENTITY_BADGE.knowledge_graph;

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "overview", label: "Overview", icon: Building2 },
    { key: "people", label: "People", icon: Users },
    { key: "deals", label: "Deals", icon: TrendingUp },
    { key: "comms", label: "Communications", icon: MessageSquare },
    { key: "research", label: "Research", icon: FileText },
  ];

  return (
    <div className="space-y-6">
      {/* Back button */}
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
            {company.logoUrl ? (
              <img src={company.logoUrl} alt="" className="h-12 w-12 rounded-cos-md object-contain" />
            ) : (
              <div className="h-12 w-12 rounded-cos-md bg-cos-electric/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-cos-electric" />
              </div>
            )}
            <div>
              <h1 className="text-xl font-heading font-bold text-cos-midnight">{company.name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-cos-slate">
                {company.domain && <span>{company.domain}</span>}
                {company.industry && <span>&middot; {company.industry}</span>}
                {company.sizeEstimate && <span>&middot; {company.sizeEstimate}</span>}
                {company.foundedYear && <span>&middot; Founded {company.foundedYear}</span>}
              </div>
              {company.location && (
                <div className="text-xs text-cos-slate-light mt-0.5">{company.location}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
            {company.website && (
              <Button variant="outline" size="sm" onClick={() => window.open(company.website!, "_blank")}>
                <Globe className="h-4 w-4 mr-1" /> Website
              </Button>
            )}
            {company.linkedinUrl && (
              <Button variant="outline" size="sm" onClick={() => window.open(company.linkedinUrl!, "_blank")}>
                <Linkedin className="h-4 w-4 mr-1" /> LinkedIn
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-cos-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-cos-electric text-cos-electric"
                  : "border-transparent text-cos-slate hover:text-cos-midnight"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-6 min-h-[300px]">
        {activeTab === "overview" && (
          <div className="space-y-4">
            {company.description && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Description</h3>
                <p className="text-sm text-cos-midnight">{company.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Enrichment Status</h3>
                <p className="text-sm text-cos-midnight">{company.enrichmentStatus || "Not enriched"}</p>
              </div>
              {company.profileCompleteness != null && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Profile Completeness</h3>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-cos-cloud">
                      <div
                        className="h-2 rounded-full bg-cos-electric"
                        style={{ width: `${Math.round(company.profileCompleteness * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-cos-slate">{Math.round(company.profileCompleteness * 100)}%</span>
                  </div>
                </div>
              )}
              {company.graphNodeId && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Knowledge Graph</h3>
                  <p className="text-sm text-green-600">Connected (Node: {company.graphNodeId.slice(0, 12)}...)</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "people" && (
          <div className="text-center py-12 text-cos-slate-light text-sm">
            People tab — coming in Phase 2. Will show all people associated with this company.
          </div>
        )}

        {activeTab === "deals" && (
          <div className="text-center py-12 text-cos-slate-light text-sm">
            Deals tab — coming in Phase 2. Will show pipeline deals for this company.
          </div>
        )}

        {activeTab === "comms" && (
          <div className="text-center py-12 text-cos-slate-light text-sm">
            Communications tab — coming in Phase 2. Will show LinkedIn conversations and emails.
          </div>
        )}

        {activeTab === "research" && (
          <div className="text-center py-12 text-cos-slate-light text-sm">
            Research tab — coming in Phase 2. Will show company research and intelligence data.
          </div>
        )}
      </div>
    </div>
  );
}
