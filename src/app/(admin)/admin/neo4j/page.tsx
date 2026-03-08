"use client";

import { useState } from "react";
import { Database, Play, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null);
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
      setMigrateError(err instanceof Error ? err.message : "Migration failed");
    } finally {
      setMigrateLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-cos-midnight">
          Neo4j Administration
        </h1>
        <p className="mt-1 text-sm text-cos-slate">
          Manage the knowledge graph schema, taxonomy seed data, and legacy
          migrations.
        </p>
      </div>

      {/* Admin secret input */}
      <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
        <label className="text-xs font-semibold uppercase tracking-wider text-cos-slate">
          Admin Secret
        </label>
        <p className="mt-0.5 text-xs text-cos-slate-light">
          Required for Neo4j operations. This is the ADMIN_SECRET env var.
        </p>
        <input
          type="password"
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          placeholder="Enter admin secret..."
          className="mt-2 w-full rounded-cos-md border border-cos-border bg-cos-cloud px-3 py-2 text-sm text-cos-midnight placeholder:text-cos-slate-light focus:border-cos-electric focus:outline-none focus:ring-1 focus:ring-cos-electric"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Seed Card */}
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-cos-electric" />
            <h2 className="font-heading text-lg font-semibold text-cos-midnight">
              Seed Taxonomy
            </h2>
          </div>
          <p className="mt-1 text-sm text-cos-slate">
            Set up Neo4j schema (constraints + indexes) and seed all taxonomy
            data: categories, skills (L1/L2/L3), firm relationships, markets,
            languages, firm types, and industries.
          </p>
          <Button
            className="mt-4"
            onClick={handleSeed}
            disabled={seedLoading || !adminSecret}
          >
            {seedLoading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Seeding...
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Run Seed
              </>
            )}
          </Button>

          {seedError && (
            <div className="mt-3 flex items-center gap-2 rounded-cos-md bg-cos-ember/5 p-3 text-sm text-cos-ember">
              <XCircle className="h-4 w-4 shrink-0" />
              {seedError}
            </div>
          )}

          {seedResult && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-cos-signal">
                <CheckCircle2 className="h-4 w-4" />
                Seed completed successfully
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Constraints" value={seedResult.schema.constraints} />
                <Stat label="Indexes" value={seedResult.schema.indexes} />
                <Stat label="Categories" value={seedResult.seed.categories} />
                <Stat label="Skills L1" value={seedResult.seed.skillsL1} />
                <Stat label="Skills L2" value={seedResult.seed.skillsL2} />
                <Stat label="Skills L3" value={seedResult.seed.skillsL3} />
                <Stat
                  label="Firm Relationships"
                  value={seedResult.seed.firmRelationships}
                />
                <Stat label="Total Nodes" value={seedResult.seed.totalNodes} />
                <Stat
                  label="Duration"
                  value={`${seedResult.seed.durationMs}ms`}
                />
              </div>
              {seedResult.seed.errors.length > 0 && (
                <div className="text-xs text-cos-ember">
                  {seedResult.seed.errors.length} errors:{" "}
                  {seedResult.seed.errors.slice(0, 3).join(", ")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Migrate Card */}
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-5">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-cos-warm" />
            <h2 className="font-heading text-lg font-semibold text-cos-midnight">
              Legacy Migration
            </h2>
          </div>
          <p className="mt-1 text-sm text-cos-slate">
            Run legacy data migration from JSON files to Neo4j. This migrates
            existing data into the graph structure.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={handleMigrate}
            disabled={migrateLoading || !adminSecret}
          >
            {migrateLoading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Migrating...
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Run Migration
              </>
            )}
          </Button>

          {migrateError && (
            <div className="mt-3 flex items-center gap-2 rounded-cos-md bg-cos-ember/5 p-3 text-sm text-cos-ember">
              <XCircle className="h-4 w-4 shrink-0" />
              {migrateError}
            </div>
          )}

          {migrateResult && (
            <div className="mt-4">
              <div className="flex items-center gap-2 text-sm text-cos-signal">
                <CheckCircle2 className="h-4 w-4" />
                Migration {migrateResult.success ? "completed" : "finished with issues"}
              </div>
              <pre className="mt-2 max-h-48 overflow-auto rounded-cos-md bg-cos-cloud p-3 font-mono text-xs text-cos-midnight">
                {JSON.stringify(migrateResult.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-cos-md bg-cos-cloud p-2">
      <p className="text-[10px] uppercase tracking-wider text-cos-slate">
        {label}
      </p>
      <p className="font-heading text-sm font-bold text-cos-midnight">
        {value}
      </p>
    </div>
  );
}
