/**
 * Inngest Function: Full System Enrichment
 *
 * Orchestrates the complete enrichment pipeline for one or more firms.
 * Supports two modes:
 *
 * - **full-system**: Pro treatment — enrich ALL experts (no cap), force
 *   re-abstraction, skip nothing. Used for periodic full-platform refresh.
 * - **incremental** (default): Skip already-completed steps to save credits.
 *
 * Steps run in dependency order:
 *
 * 1. Deep Crawl (PDL company + website crawl + classify + graph + services + case studies)
 * 2. Team Roster Import (PDL people search, autoEnrichLimit: -1 in full-system mode)
 * 3. [Async cascades: expert enrichment + case study ingestion run via downstream triggers]
 * 4. Graph Sync (ensure all PG data is mirrored to Neo4j)
 * 5. Skill Strength Recomputation
 * 6. Abstraction Profile Generation (AI summary + embedding)
 *
 * Skip logic (incremental mode only):
 * - Deep Crawl: skip if firmServices > 0 AND firmCaseStudies > 0 AND has classifier audit
 * - Team Roster: skip if expertProfiles > 3 AND last import < 30 days
 * - Expert Enrichment: handled by downstream triggers (skip if pdlEnrichedAt < 6 months)
 * - Case Studies: handled by downstream triggers (skip if status = "active")
 * - Graph Sync: skip if firm has recent deep_crawl audit entry
 * - Abstraction: skip if lastEnrichedAt < 7 days old
 */

import { inngest } from "../client";
import { db } from "@/lib/db";
import {
  serviceFirms,
  expertProfiles,
  firmServices,
  firmCaseStudies,
  abstractionProfiles,
  backgroundJobs,
  enrichmentAuditLog,
} from "@/lib/db/schema";
import { eq, and, sql, count } from "drizzle-orm";

/** Generate a unique ID */
function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

interface BackfillProgress {
  firmId: string;
  firmName: string;
  stepsCompleted: string[];
  stepsSkipped: string[];
  stepsFailed: string[];
  currentStep: string | null;
}

export const backfillAllFirms = inngest.createFunction(
  {
    id: "enrich-backfill-all-firms",
    name: "Full System Enrichment",
    retries: 1,
    concurrency: [{ limit: 2 }],
  },
  { event: "enrich/backfill-all-firms" },
  async ({ event, step }) => {
    const {
      firmIds,
      skipCompleted = true,
      jobId,
      mode = "incremental",
    } = event.data;

    // Full-system mode overrides
    const isFullSystem = mode === "full-system";
    const effectiveSkip = isFullSystem ? false : skipCompleted;
    const autoEnrichLimit = isFullSystem ? -1 : 10;

    // Step 1: Resolve which firms to process
    const firms = await step.run("resolve-firms", async () => {
      if (firmIds && firmIds.length > 0) {
        return db
          .select({
            id: serviceFirms.id,
            name: serviceFirms.name,
            website: serviceFirms.website,
            organizationId: serviceFirms.organizationId,
            enrichmentData: serviceFirms.enrichmentData,
            enrichmentStatus: serviceFirms.enrichmentStatus,
          })
          .from(serviceFirms)
          .where(
            sql`${serviceFirms.id} IN ${firmIds}`
          );
      }
      return db
        .select({
          id: serviceFirms.id,
          name: serviceFirms.name,
          website: serviceFirms.website,
          organizationId: serviceFirms.organizationId,
          enrichmentData: serviceFirms.enrichmentData,
          enrichmentStatus: serviceFirms.enrichmentStatus,
        })
        .from(serviceFirms);
    });

    // Update job status to running
    if (jobId) {
      await step.run("mark-job-running", async () => {
        await db
          .update(backgroundJobs)
          .set({ status: "running", startedAt: new Date() })
          .where(eq(backgroundJobs.id, jobId));
      });
    }

    const results: BackfillProgress[] = [];
    let processed = 0;
    const total = firms.length;

    for (const firm of firms) {
      const progress: BackfillProgress = {
        firmId: firm.id,
        firmName: firm.name,
        stepsCompleted: [],
        stepsSkipped: [],
        stepsFailed: [],
        currentStep: null,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const enrichmentData = firm.enrichmentData as Record<string, any> | null;

      // ── Phase 1: Deep Crawl ──────────────────────────────
      // Includes: PDL company enrichment (with fallback), website crawl,
      // AI classification, graph write, services + case study bulk insert,
      // queues case study ingestion + expert enrichment for discovered team
      const needsDeepCrawl = await step.run(`check-deep-crawl-${firm.id}`, async () => {
        if (!effectiveSkip) return true;
        if (!enrichmentData?.companyData?.employeeCount) return true;
        const [svcRow] = await db
          .select({ cnt: count() })
          .from(firmServices)
          .where(eq(firmServices.firmId, firm.id));
        const [csRow] = await db
          .select({ cnt: count() })
          .from(firmCaseStudies)
          .where(eq(firmCaseStudies.firmId, firm.id));
        const [auditRow] = await db
          .select({ cnt: count() })
          .from(enrichmentAuditLog)
          .where(
            and(
              eq(enrichmentAuditLog.firmId, firm.id),
              eq(enrichmentAuditLog.phase, "classifier")
            )
          );
        const hasServices = (svcRow?.cnt ?? 0) > 0;
        const hasCaseStudies = (csRow?.cnt ?? 0) > 0;
        const hasClassifier = (auditRow?.cnt ?? 0) > 0;
        return !(hasServices && hasCaseStudies && hasClassifier);
      });

      if (needsDeepCrawl && firm.website) {
        progress.currentStep = "deep-crawl";
        try {
          await step.run(`deep-crawl-${firm.id}`, async () => {
            await inngest.send({
              name: "enrich/deep-crawl",
              data: {
                firmId: firm.id,
                organizationId: firm.organizationId,
                website: firm.website!,
                firmName: firm.name,
              },
            });
          });
          progress.stepsCompleted.push("deep-crawl");
        } catch {
          progress.stepsFailed.push("deep-crawl");
        }
      } else if (!firm.website) {
        progress.stepsSkipped.push("deep-crawl (no website)");
      } else {
        progress.stepsSkipped.push("deep-crawl (already complete)");
      }

      // ── Phase 2: Team Roster Import ──────────────────────
      const needsTeamIngest = await step.run(`check-team-${firm.id}`, async () => {
        if (!effectiveSkip) return true;
        const [row] = await db
          .select({ cnt: count() })
          .from(expertProfiles)
          .where(eq(expertProfiles.firmId, firm.id));
        return (row?.cnt ?? 0) < 3;
      });

      if (needsTeamIngest && firm.website) {
        progress.currentStep = "team-ingest";
        try {
          const teamJobId = uid("job");
          await step.run(`team-ingest-${firm.id}`, async () => {
            await db.insert(backgroundJobs).values({
              id: teamJobId,
              type: "team-ingest",
              status: "pending",
              payload: { firmId: firm.id, source: "full-system-enrichment", mode },
              priority: 3,
            });
            const domain = new URL(
              firm.website!.startsWith("http") ? firm.website! : `https://${firm.website}`
            ).hostname.replace("www.", "");
            await inngest.send({
              name: "enrich/team-ingest",
              data: {
                firmId: firm.id,
                domain,
                limit: 500,
                autoEnrichLimit,
                force: isFullSystem,
                jobId: teamJobId,
                companyName: firm.name,
              },
            });
          });
          progress.stepsCompleted.push(`team-ingest (autoEnrich=${autoEnrichLimit})`);
        } catch {
          progress.stepsFailed.push("team-ingest");
        }
      } else if (!firm.website) {
        progress.stepsSkipped.push("team-ingest (no website)");
      } else {
        progress.stepsSkipped.push("team-ingest (enough experts)");
      }

      // Phases 3-4 (expert enrichment + case study ingestion) are triggered
      // automatically by deep-crawl and team-ingest downstream cascades.
      // Client stub enrichment runs via hourly cron (company-enrich-stub).

      // ── Phase 4: Graph Sync ──────────────────────────────
      const needsGraphSync = await step.run(`check-graph-sync-${firm.id}`, async () => {
        if (!effectiveSkip) return true;
        const hasGraphNode = !!enrichmentData?.graphNodeId;
        const [row] = await db
          .select({ cnt: count() })
          .from(enrichmentAuditLog)
          .where(
            and(
              eq(enrichmentAuditLog.firmId, firm.id),
              eq(enrichmentAuditLog.phase, "deep_crawl")
            )
          );
        return !hasGraphNode && (row?.cnt ?? 0) === 0;
      });

      if (needsGraphSync) {
        progress.currentStep = "graph-sync";
        try {
          await step.run(`graph-sync-${firm.id}`, async () => {
            await inngest.send({
              name: "graph/sync-firm",
              data: {
                firmId: firm.id,
                organizationId: firm.organizationId,
                firmName: firm.name,
                website: firm.website ?? undefined,
              },
            });
          });
          progress.stepsCompleted.push("graph-sync");
        } catch {
          progress.stepsFailed.push("graph-sync");
        }
      } else {
        progress.stepsSkipped.push("graph-sync (already synced)");
      }

      // ── Phase 5: Skill Strength Recomputation ────────────
      // Always run in full-system mode to recalculate weights
      if (isFullSystem) {
        progress.currentStep = "skill-strength";
        try {
          await step.run(`skill-strength-${firm.id}`, async () => {
            await inngest.send({
              name: "graph/skill-compute-strength",
              data: { firmId: firm.id },
            });
          });
          progress.stepsCompleted.push("skill-strength");
        } catch {
          progress.stepsFailed.push("skill-strength");
        }
      } else {
        progress.stepsSkipped.push("skill-strength (incremental mode)");
      }

      // ── Phase 6: Abstraction Profile ─────────────────────
      const needsAbstraction = await step.run(`check-abstraction-${firm.id}`, async () => {
        if (!effectiveSkip) return true; // full-system always re-abstracts
        const [row] = await db
          .select({ cnt: count(), lastEnrichedAt: abstractionProfiles.lastEnrichedAt })
          .from(abstractionProfiles)
          .where(
            and(
              eq(abstractionProfiles.entityType, "firm"),
              eq(abstractionProfiles.entityId, firm.id)
            )
          );
        if (!row || row.cnt === 0) return true;
        if (row.lastEnrichedAt) {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return new Date(row.lastEnrichedAt) <= sevenDaysAgo;
        }
        return true;
      });

      if (needsAbstraction) {
        progress.currentStep = "abstraction";
        try {
          await step.run(`abstraction-${firm.id}`, async () => {
            await inngest.send({
              name: "enrich/firm-abstraction",
              data: {
                firmId: firm.id,
                organizationId: firm.organizationId,
              },
            });
          });
          progress.stepsCompleted.push("abstraction");
        } catch {
          progress.stepsFailed.push("abstraction");
        }
      } else {
        progress.stepsSkipped.push("abstraction (recent profile exists)");
      }

      // ── Logo fallback ────────────────────────────────────
      if (firm.website && !enrichmentData?.companyData?.logoUrl) {
        await step.run(`logo-fallback-${firm.id}`, async () => {
          try {
            const domain = new URL(
              firm.website!.startsWith("http") ? firm.website! : `https://${firm.website}`
            ).hostname.replace("www.", "");
            const logoUrl = `https://img.logo.dev/${domain}?token=pk_anonymous&size=128&format=png`;
            const existing = (firm.enrichmentData as Record<string, unknown>) ?? {};
            await db
              .update(serviceFirms)
              .set({
                enrichmentData: {
                  ...existing,
                  logoUrl,
                },
              })
              .where(eq(serviceFirms.id, firm.id));
          } catch {
            // Non-critical, ignore
          }
        });
        progress.stepsCompleted.push("logo-fallback");
      }

      progress.currentStep = null;
      results.push(progress);
      processed++;

      // Update job progress
      if (jobId) {
        await step.run(`update-progress-${firm.id}`, async () => {
          await db
            .update(backgroundJobs)
            .set({
              result: {
                processed,
                total,
                mode,
                currentFirm: firm.name,
                lastUpdate: new Date().toISOString(),
              },
            })
            .where(eq(backgroundJobs.id, jobId));
        });
      }

      // Rate limit: delay between firms
      if (processed < total) {
        await step.sleep(`delay-${firm.id}`, "5s");
      }
    }

    // Mark job complete
    if (jobId) {
      await step.run("mark-job-done", async () => {
        await db
          .update(backgroundJobs)
          .set({
            status: "done",
            completedAt: new Date(),
            result: {
              processed,
              total,
              mode,
              results: results.map((r) => ({
                firmId: r.firmId,
                firmName: r.firmName,
                completed: r.stepsCompleted.length,
                skipped: r.stepsSkipped.length,
                failed: r.stepsFailed.length,
                steps: {
                  completed: r.stepsCompleted,
                  skipped: r.stepsSkipped,
                  failed: r.stepsFailed,
                },
              })),
            },
          })
          .where(eq(backgroundJobs.id, jobId));
      });
    }

    return {
      processed,
      total,
      mode,
      results,
    };
  }
);
