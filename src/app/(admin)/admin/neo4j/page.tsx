"use client";

import { useState } from "react";
import {
  Database,
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  KeyRound,
  ArrowRightLeft,
  Layers,
} from "lucide-react";

interface SeedResult {
  schema: {
    constraints: number;
    indexes: number;
    errors: string[];
  };
  seed: {
    categories: number;
    skillsL1: number;
    skillsL2: number;
    skillsL3: number;
    firmRelationships: number;
    markets: number;
    languages: number;
    firmTypes: number;
    industries: number;
    totalNodes: number;
    durationMs: number;
    errors: string[];
  };
}

interface MigrateResult {
  success: boolean;
  result: unknown;
}

export default function AdminNeo4jPage() {
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(
    null
  );
  const [seedLoading, setSeedLoading] = useState(false);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [migrateError, setMigrateError] = useState<string | null>(null);
  const [adminSecret, setAdminSecret] = useState("");

  async function handleSeed() {
    if (!adminSecret) {
      setSeedError("Admin secret is required.");
      return;
    }
    setSeedLoading(true);
    setSeedError(null);
    setSeedResult(null);
    try {
      const res = await fetch("/api/admin/neo4j/seed", {
        method: "POST",
        headers: { "x-admin-secret": adminSecret },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setSeedResult(await res.json());
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setSeedLoading(false);
    }
  }

  async function handleMigrate() {
    if (!adminSecret) {
      setMigrateError("Admin secret is required.");
      return;
    }
    setMigrateLoading(true);
    setMigrateError(null);
    setMigrateResult(null);
    try {
      const res = await fetch("/api/admin/neo4j/migrate", {
        method: "POST",
        headers: {
          "x-admin-secret": adminSecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setMigrateResult(await res.json());
    } catch (err) {
      setMigrateError(
        err instanceof Error ? err.message : "Migration failed"
      );
    } finally {
      setMigrateLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-cos-midnight">
          Neo4j Administration
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          Manage the knowledge graph schema, taxonomy seed data, and legacy
          migrations.
        </p>
      </div>

      {/* Admin secret */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-cos-lg bg-cos-warm/10">
            <KeyRound className="h-4 w-4 text-cos-warm" />
          </div>
          <div>
            <p className="text-sm font-medium text-cos-midnight">
              Admin Secret
            </p>
            <p className="text-xs text-cos-slate-light">
              Required for Neo4j operations (ADMIN_SECRET env var)
            </p>
          </div>
        </div>
        <input
          type="password"
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          placeholder="Enter admin secret..."
          className="w-full rounded-cos-lg border border-cos-border bg-cos-cloud px-4 py-2.5 text-sm text-cos-midnight placeholder:text-cos-slate-light transition-colors focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Seed Card */}
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-cos-lg bg-cos-electric/10">
              <Layers className="h-5 w-5 text-cos-electric" />
            </div>
            <div>
              <h2 className="font-heading text-base font-semibold text-cos-midnight">
                Seed Taxonomy
              </h2>
              <p className="text-xs text-cos-slate">
                Schema + categories, skills, markets, languages, firm types
              </p>
            </div>
          </div>

          <button
            onClick={handleSeed}
            disabled={seedLoading || !adminSecret}
            className="mt-3 flex items-center gap-2 rounded-cos-lg bg-cos-electric px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-cos-electric-hover disabled:opacity-40"
          >
            {seedLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {seedLoading ? "Seeding..." : "Run Seed"}
          </button>

          {seedError && (
            <div className="mt-4 flex items-start gap-2 rounded-cos-lg bg-cos-ember/5 border border-cos-ember/15 p-3.5 text-sm text-cos-ember">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {seedError}
            </div>
          )}

          {seedResult && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-cos-signal">
                <CheckCircle2 className="h-4 w-4" />
                Seed completed successfully
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="Constraints" value={seedResult.schema.constraints} />
                <MiniStat label="Indexes" value={seedResult.schema.indexes} />
                <MiniStat label="Categories" value={seedResult.seed.categories} />
                <MiniStat label="Skills L1" value={seedResult.seed.skillsL1} />
                <MiniStat label="Skills L2" value={seedResult.seed.skillsL2} />
                <MiniStat label="Skills L3" value={seedResult.seed.skillsL3} />
                <MiniStat label="Relationships" value={seedResult.seed.firmRelationships} />
                <MiniStat label="Total Nodes" value={seedResult.seed.totalNodes} />
                <MiniStat
                  label="Duration"
                  value={`${(seedResult.seed.durationMs / 1000).toFixed(1)}s`}
                />
              </div>
              {seedResult.seed.errors.length > 0 && (
                <div className="rounded-cos-md bg-cos-ember/5 p-2.5 text-xs text-cos-ember">
                  {seedResult.seed.errors.length} errors:{" "}
                  {seedResult.seed.errors.slice(0, 3).join(", ")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Migrate Card */}
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-cos-lg bg-cos-warm/10">
              <ArrowRightLeft className="h-5 w-5 text-cos-warm" />
            </div>
            <div>
              <h2 className="font-heading text-base font-semibold text-cos-midnight">
                Legacy Migration
              </h2>
              <p className="text-xs text-cos-slate">
                Migrate JSON data files into the Neo4j graph
              </p>
            </div>
          </div>

          <button
            onClick={handleMigrate}
            disabled={migrateLoading || !adminSecret}
            className="mt-3 flex items-center gap-2 rounded-cos-lg border border-cos-border bg-cos-surface px-4 py-2.5 text-sm font-medium text-cos-midnight transition-all hover:border-cos-warm/30 hover:bg-cos-warm/5 disabled:opacity-40"
          >
            {migrateLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {migrateLoading ? "Migrating..." : "Run Migration"}
          </button>

          {migrateError && (
            <div className="mt-4 flex items-start gap-2 rounded-cos-lg bg-cos-ember/5 border border-cos-ember/15 p-3.5 text-sm text-cos-ember">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {migrateError}
            </div>
          )}

          {migrateResult && (
            <div className="mt-4">
              <div className="flex items-center gap-2 text-sm font-medium text-cos-signal mb-3">
                <CheckCircle2 className="h-4 w-4" />
                Migration{" "}
                {migrateResult.success ? "completed" : "finished with issues"}
              </div>
              <pre className="max-h-48 overflow-auto rounded-cos-lg bg-cos-cloud border border-cos-border p-3.5 font-mono text-xs text-cos-midnight leading-relaxed">
                {JSON.stringify(migrateResult.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-cos-md bg-cos-cloud px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-cos-slate-light">
        {label}
      </p>
      <p className="font-heading text-sm font-bold text-cos-midnight">
        {value}
      </p>
    </div>
  );
}
