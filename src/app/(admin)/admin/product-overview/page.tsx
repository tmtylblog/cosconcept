"use client";

import { useState, useEffect } from "react";
import {
  MessageSquare,
  Search,
  Zap,
  Handshake,
  Phone,
  Mail,
  Building2,
  Users,
  FileText,
  Globe,
  CheckCircle2,
  Hammer,
  ClipboardList,
  Loader2,
} from "lucide-react";
import Image from "next/image";

// ─── Types ───────────────────────────────────────────────

interface Metrics {
  totalOrgs: number;
  totalUsers: number;
  totalFirms: number;
  totalExperts: number;
  totalCaseStudies: number;
  graph: { totalNodes: number; totalEdges: number };
}

// ─── Stat Card ───────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--cos-border)] bg-white p-5 text-center">
      <div className="flex justify-center mb-2 text-[var(--cos-primary)]">{icon}</div>
      <p className="text-2xl font-bold text-[var(--cos-text-primary)]">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-[var(--cos-text-muted)] mt-1">{label}</p>
    </div>
  );
}

// ─── Capability Card ─────────────────────────────────────

function CapabilityCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--cos-border)] bg-white p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--cos-primary)]/10 text-[var(--cos-primary)]">
          {icon}
        </div>
        <h3 className="font-semibold text-[var(--cos-text-primary)]">{title}</h3>
      </div>
      <p className="text-sm text-[var(--cos-text-secondary)] leading-relaxed">{description}</p>
    </div>
  );
}

// ─── Step Card ───────────────────────────────────────────

function StepCard({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cos-primary)] text-white font-bold text-sm">
        {number}
      </div>
      <h4 className="font-semibold text-[var(--cos-text-primary)] mb-1">{title}</h4>
      <p className="text-xs text-[var(--cos-text-muted)]">{description}</p>
    </div>
  );
}

// ─── Roadmap ─────────────────────────────────────────────

type RoadmapStatus = "live" | "building" | "planned";

const STATUS_CONFIG: Record<RoadmapStatus, { label: string; color: string; icon: React.ReactNode }> = {
  live: { label: "Live", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="h-3 w-3" /> },
  building: { label: "Building", color: "bg-amber-100 text-amber-700", icon: <Hammer className="h-3 w-3" /> },
  planned: { label: "Planned", color: "bg-slate-100 text-slate-600", icon: <ClipboardList className="h-3 w-3" /> },
};

interface RoadmapItem {
  phase: string;
  title: string;
  description: string;
  status: RoadmapStatus;
}

const ROADMAP: RoadmapItem[] = [
  { phase: "0", title: "Project Scaffold", description: "Next.js 15, Neon PostgreSQL, Neo4j, Better Auth, Vercel deployment", status: "live" },
  { phase: "1", title: "Ossy Chat Core", description: "AI consultant with conversational onboarding, voice input, memory system", status: "live" },
  { phase: "2", title: "Organization & Expert Profiles", description: "Firm pages, expert enrichment via PDL, team discovery, specialist profiles", status: "live" },
  { phase: "3", title: "Knowledge Graph Population", description: "8.5M+ company nodes, 18K skills, taxonomy seeding, case study ingestion", status: "live" },
  { phase: "4", title: "Search & Matching Engine", description: "Three-layer cascade: structured filters, vector similarity, LLM deep ranking", status: "building" },
  { phase: "5", title: "Partnerships & Opportunities", description: "Partnership lifecycle, three-way intros, opportunity extraction from calls", status: "building" },
  { phase: "6", title: "Call Intelligence", description: "Transcript analysis, coaching scores, opportunity detection, Chrome extension", status: "planned" },
  { phase: "7", title: "Email Agent", description: "Ossy-drafted outreach, approval queue, inbound intent classification", status: "building" },
  { phase: "8", title: "Advanced Features", description: "Proactive matching, partnership scoring, revenue attribution, meeting bot", status: "planned" },
];

// ─── Main Page ───────────────────────────────────────────

export default function ProductOverviewPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then((r) => r.json())
      .then((data) => setMetrics(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-12">
      {/* ─── Hero ─── */}
      <div className="text-center pt-4">
        <div className="flex justify-center mb-4">
          <Image src="/logo.png" alt="Collective OS" width={64} height={64} className="rounded-2xl" />
        </div>
        <h1 className="text-3xl font-bold text-[var(--cos-text-primary)] font-heading">
          Collective OS
        </h1>
        <p className="text-lg text-[var(--cos-text-muted)] mt-1">Grow Faster Together</p>
        <p className="text-sm text-[var(--cos-text-secondary)] mt-3 max-w-2xl mx-auto">
          The operating system for partnership-led growth. Find, match, and manage the right
          partners for your professional services firm &mdash; powered by AI, a massive knowledge
          graph, and real relationship data.
        </p>
      </div>

      {/* ─── Live Stats ─── */}
      <div>
        <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-[var(--cos-text-muted)] mb-4">
          Platform at a Glance
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[var(--cos-text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
          </div>
        ) : metrics ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Service Firms" value={metrics.totalFirms} icon={<Building2 className="h-5 w-5" />} />
            <StatCard label="Experts" value={metrics.totalExperts} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Case Studies" value={metrics.totalCaseStudies} icon={<FileText className="h-5 w-5" />} />
            <StatCard label="Active Users" value={metrics.totalUsers} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Graph Nodes" value={metrics.graph?.totalNodes ?? 0} icon={<Globe className="h-5 w-5" />} />
            <StatCard label="Graph Edges" value={metrics.graph?.totalEdges ?? 0} icon={<Globe className="h-5 w-5" />} />
          </div>
        ) : null}
      </div>

      {/* ─── Capabilities ─── */}
      <div>
        <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-[var(--cos-text-muted)] mb-4">
          Core Capabilities
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <CapabilityCard
            icon={<MessageSquare className="h-5 w-5" />}
            title="Ossy AI Consultant"
            description="AI-powered onboarding and ongoing advisor that learns your firm, remembers conversations, and proactively surfaces opportunities."
          />
          <CapabilityCard
            icon={<Search className="h-5 w-5" />}
            title="Discover & Matching"
            description="Three-layer cascade search across 8.5M+ companies. Structured filters narrow the field, vector similarity finds hidden matches, and an LLM deep ranker scores mutual fit."
          />
          <CapabilityCard
            icon={<Zap className="h-5 w-5" />}
            title="Enrichment Engine"
            description="Auto-builds rich firm profiles from websites, PDL data, and AI classification. Discovers services, case studies, team members, and skills without manual data entry."
          />
          <CapabilityCard
            icon={<Handshake className="h-5 w-5" />}
            title="Partnership Hub"
            description="Manage the full partnership lifecycle from suggestion to trusted partner. AI-generated three-way intros, referral tracking, and mutual fit scoring."
          />
          <CapabilityCard
            icon={<Phone className="h-5 w-5" />}
            title="Call Intelligence"
            description="Upload call transcripts for AI analysis. Automatically extract partnership opportunities, generate coaching scores, and surface actionable insights."
          />
          <CapabilityCard
            icon={<Mail className="h-5 w-5" />}
            title="Email Agent"
            description="Ossy drafts personalized intro emails, manages an approval queue, classifies inbound intent, and handles follow-up sequences automatically."
          />
        </div>
      </div>

      {/* ─── How It Works ─── */}
      <div>
        <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-[var(--cos-text-muted)] mb-6">
          How It Works
        </h2>
        <div className="flex items-start gap-6 max-w-3xl mx-auto">
          <StepCard
            number={1}
            title="Submit Your Firm"
            description="Enter your website and Ossy instantly researches your company, services, team, and case studies."
          />
          <div className="mt-5 text-[var(--cos-text-muted)]">&rarr;</div>
          <StepCard
            number={2}
            title="Define Your Ideal Partners"
            description="Tell Ossy what you need in a partner. AI builds your matching profile from a quick 5-question conversation."
          />
          <div className="mt-5 text-[var(--cos-text-muted)]">&rarr;</div>
          <StepCard
            number={3}
            title="Get Matched & Grow"
            description="Discover firms that complement your capabilities. Build trusted partnerships and grow revenue together."
          />
        </div>
      </div>

      {/* ─── Roadmap ─── */}
      <div>
        <h2 className="text-center text-xs font-semibold uppercase tracking-wider text-[var(--cos-text-muted)] mb-4">
          Product Roadmap
        </h2>
        <div className="space-y-2 max-w-3xl mx-auto">
          {ROADMAP.map((item) => {
            const cfg = STATUS_CONFIG[item.status];
            return (
              <div
                key={item.phase}
                className="flex items-center gap-4 rounded-lg border border-[var(--cos-border)] bg-white px-4 py-3"
              >
                <span className="text-xs font-mono font-bold text-[var(--cos-text-muted)] w-6">
                  P{item.phase}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--cos-text-primary)]">{item.title}</p>
                  <p className="text-xs text-[var(--cos-text-muted)] truncate">{item.description}</p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${cfg.color}`}>
                  {cfg.icon}
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
