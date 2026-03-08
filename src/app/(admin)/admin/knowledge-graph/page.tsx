"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Puzzle,
  UserCheck,
  Briefcase,
  FileText,
  Tag,
  Loader2,
} from "lucide-react";
import ServiceProvidersTab from "@/components/admin/tabs/service-providers-tab";
import ExpertsTab from "@/components/admin/tabs/experts-tab";
import ClientsTab from "@/components/admin/tabs/clients-tab";
import CaseStudiesTab from "@/components/admin/tabs/case-studies-tab";
import SolutionPartnersTab from "@/components/admin/tabs/solution-partners-tab";
import AttributesTab from "@/components/admin/tabs/attributes-tab";

/* ── Tab definitions ─────────────────────────────────── */

type TabKey =
  | "service-providers"
  | "solution-partners"
  | "experts"
  | "clients"
  | "case-studies"
  | "attributes";

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
  countKey: string; // path into stats object
}

const TABS: TabDef[] = [
  {
    key: "service-providers",
    label: "Service Providers",
    icon: <Building2 className="h-4 w-4" />,
    countKey: "serviceProviders",
  },
  {
    key: "solution-partners",
    label: "Solution Partners",
    icon: <Puzzle className="h-4 w-4" />,
    countKey: "solutionPartners",
  },
  {
    key: "experts",
    label: "Experts",
    icon: <UserCheck className="h-4 w-4" />,
    countKey: "experts",
  },
  {
    key: "clients",
    label: "Clients",
    icon: <Briefcase className="h-4 w-4" />,
    countKey: "clients",
  },
  {
    key: "case-studies",
    label: "Case Studies",
    icon: <FileText className="h-4 w-4" />,
    countKey: "caseStudies",
  },
  {
    key: "attributes",
    label: "Attributes",
    icon: <Tag className="h-4 w-4" />,
    countKey: "attributes",
  },
];

/* ── Stats shape ─────────────────────────────────────── */

interface KGStats {
  serviceProviders: number;
  solutionPartners: number;
  experts: number;
  clients: number;
  caseStudies: number;
  attributes: {
    skills: number;
    industries: number;
    markets: number;
    languages: number;
  };
}

function getCount(stats: KGStats | null, countKey: string): number | null {
  if (!stats) return null;
  if (countKey === "attributes") {
    const a = stats.attributes;
    return a ? a.skills + a.industries + a.markets + a.languages : 0;
  }
  const val = (stats as unknown as Record<string, unknown>)[countKey];
  return typeof val === "number" ? val : null;
}

/* ── Page ────────────────────────────────────────────── */

export default function KnowledgeGraphPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("service-providers");
  const [stats, setStats] = useState<KGStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Read ?tab= from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as TabKey | null;
    if (tab && TABS.some((t) => t.key === tab)) {
      setActiveTab(tab);
    }
  }, []);

  // Update URL when tab changes (without page reload)
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", activeTab);
    window.history.replaceState({}, "", url.toString());
  }, [activeTab]);

  // Fetch tab counts
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/knowledge-graph/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error("Failed to load KG stats:", err);
      } finally {
        setStatsLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
          Knowledge Graph
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          The core entities and relationships that power matching, search, and
          recommendations.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1.5 border-b border-cos-border pb-0">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = getCount(stats, tab.countKey);
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`group relative flex items-center gap-2 rounded-t-cos-lg px-4 py-2.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-cos-surface text-cos-electric border border-cos-border border-b-cos-surface -mb-px z-10"
                  : "text-cos-slate hover:text-cos-midnight hover:bg-cos-cloud/50"
              }`}
            >
              <span
                className={
                  isActive ? "text-cos-electric" : "text-cos-slate-light group-hover:text-cos-slate"
                }
              >
                {tab.icon}
              </span>
              <span className="hidden sm:inline">{tab.label}</span>
              {count !== null ? (
                <span
                  className={`rounded-cos-pill px-1.5 py-0.5 text-[10px] font-semibold ${
                    isActive
                      ? "bg-cos-electric/10 text-cos-electric"
                      : "bg-cos-cloud text-cos-slate-light"
                  }`}
                >
                  {count.toLocaleString()}
                </span>
              ) : statsLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-cos-slate-light" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "service-providers" && <ServiceProvidersTab />}
        {activeTab === "solution-partners" && <SolutionPartnersTab />}
        {activeTab === "experts" && <ExpertsTab />}
        {activeTab === "clients" && <ClientsTab />}
        {activeTab === "case-studies" && <CaseStudiesTab />}
        {activeTab === "attributes" && <AttributesTab />}
      </div>
    </div>
  );
}
