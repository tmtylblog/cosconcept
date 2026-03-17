"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Users,
  ArrowLeft,
  Linkedin,
  Mail,
  Loader2,
  Briefcase,
  MessageSquare,
  TrendingUp,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import CrmAnnotationsPanel from "@/components/admin/crm-annotations-panel";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ENTITY_BADGE: Record<string, { label: string; className: string }> = {
  expert: { label: "Expert", className: "bg-green-100 text-green-700" },
  prospect_contact: { label: "Prospect", className: "bg-blue-100 text-blue-700" },
  platform_user: { label: "Platform User", className: "bg-purple-100 text-purple-700" },
  legacy_contact: { label: "Legacy Contact", className: "bg-gray-100 text-gray-600" },
};

const EVENT_ICONS: Record<string, string> = {
  email_sent: "Sent email",
  email_opened: "Opened email",
  email_replied: "Replied to email",
  linkedin_invite_sent: "LinkedIn invite sent",
  linkedin_invite_accepted: "LinkedIn invite accepted",
  linkedin_message: "LinkedIn message",
  deal_created: "Deal created",
  signed_up: "Signed up",
  onboarded: "Onboarded",
  paying: "Became paying",
};

type Tab = "profile" | "activity" | "deals" | "messages";

export default function PersonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/growth-ops/crm/people/${encodeURIComponent(id as string)}`)
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
        Loading person...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-24">
        <p className="text-cos-slate mb-4">Person not found.</p>
        <Button variant="outline" onClick={() => router.push("/admin/growth-ops/crm/people")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to People
        </Button>
      </div>
    );
  }

  const badge = ENTITY_BADGE[data.entityClass] || ENTITY_BADGE.legacy_contact;
  const deals: any[] = data.deals || [];
  const timeline: any[] = data.timeline || [];
  const conversations: any[] = data.conversations || [];
  const skills: string[] = data.topSkills || [];
  const allSkills: string[] = data.allSkills || [];
  const industries: string[] = data.topIndustries || [];
  const experience: any[] = data.experience || [];
  const education: any[] = data.education || [];

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { key: "profile", label: "Profile", icon: Briefcase },
    { key: "activity", label: "Activity", icon: Clock, count: timeline.length },
    { key: "deals", label: "Deals", icon: TrendingUp, count: deals.length },
    { key: "messages", label: "Messages", icon: MessageSquare, count: conversations.length },
  ];

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/admin/growth-ops/crm/people")}
        className="flex items-center gap-1 text-sm text-cos-slate hover:text-cos-electric transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to People
      </button>

      {/* Person Header */}
      <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {data.photoUrl ? (
              <img src={data.photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className="h-14 w-14 rounded-full bg-cos-electric/10 flex items-center justify-center text-lg font-bold text-cos-electric">
                {(data.fullName || "?").charAt(0)}
              </div>
            )}
            <div>
              <h1 className="text-xl font-heading font-bold text-cos-midnight">{data.fullName}</h1>
              {data.title && <p className="text-sm text-cos-slate mt-0.5">{data.title}</p>}
              {data.headline && !data.title && <p className="text-sm text-cos-slate mt-0.5">{data.headline}</p>}
              <div className="flex items-center gap-3 mt-1 text-xs text-cos-slate-light">
                {data.location && <span>{data.location}</span>}
                {data.division && <span>&middot; {data.division}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
            {data.email && (
              <Button variant="outline" size="sm" onClick={() => window.open(`mailto:${data.email}`)}>
                <Mail className="h-4 w-4 mr-1" /> Email
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

      {/* Tab Content + Annotations Sidebar */}
      <div className="flex gap-6">
      <div className="flex-1 rounded-cos-lg border border-cos-border bg-cos-surface p-6 min-h-[300px]">
        {/* ─── Profile ─── */}
        {activeTab === "profile" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {data.email && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Email</h3>
                  <p className="text-sm text-cos-midnight">{data.email}</p>
                </div>
              )}
              {data.linkedinUrl && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">LinkedIn</h3>
                  <a href={data.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-cos-electric hover:underline">
                    {data.linkedinUrl.replace("https://www.linkedin.com/in/", "").replace(/\/$/, "")}
                  </a>
                </div>
              )}
              {data.firmId && (
                <div>
                  <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Firm</h3>
                  <button
                    onClick={() => router.push(`/admin/growth-ops/crm/companies/${encodeURIComponent(`sf_${data.firmId}`)}`)}
                    className="text-sm text-cos-electric hover:underline"
                  >
                    View company
                  </button>
                </div>
              )}
            </div>

            {data.bio && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-1">Bio</h3>
                <p className="text-sm text-cos-midnight whitespace-pre-line">{data.bio}</p>
              </div>
            )}

            {skills.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-2">Top Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s: string) => (
                    <span key={s} className="text-xs bg-cos-electric/10 text-cos-electric rounded-full px-2.5 py-1">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {allSkills.length > skills.length && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-2">All Skills ({allSkills.length})</h3>
                <div className="flex flex-wrap gap-1.5">
                  {allSkills.map((s: string) => (
                    <span key={s} className="text-xs bg-cos-cloud text-cos-slate-dim rounded-full px-2.5 py-1">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {industries.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-2">Industries</h3>
                <div className="flex flex-wrap gap-1.5">
                  {industries.map((i: string) => (
                    <span key={i} className="text-xs bg-purple-100 text-purple-700 rounded-full px-2.5 py-1">{i}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Work History */}
            {experience.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-2">Work History</h3>
                <div className="space-y-3">
                  {experience.map((exp: any, i: number) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center pt-1">
                        <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${exp.isCurrent || exp.is_current ? "bg-cos-electric" : "bg-cos-slate-light"}`} />
                        {i < experience.length - 1 && <div className="w-px flex-1 bg-cos-border mt-1" />}
                      </div>
                      <div className="pb-1">
                        <div className="text-sm font-medium text-cos-midnight">{exp.title}</div>
                        <div className="text-xs text-cos-slate">
                          {typeof exp.company === "object" ? exp.company?.name : exp.company}
                          {exp.location && <span> &middot; {exp.location}</span>}
                        </div>
                        <div className="text-xs text-cos-slate-light">
                          {exp.startDate || exp.start_date || ""}
                          {(exp.startDate || exp.start_date) && " — "}
                          {exp.isCurrent || exp.is_current ? "Present" : exp.endDate || exp.end_date || ""}
                        </div>
                        {exp.description && <div className="text-xs text-cos-slate mt-1 line-clamp-2">{exp.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {education.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-cos-slate-dim mb-2">Education</h3>
                <div className="space-y-2">
                  {education.map((edu: any, i: number) => {
                    const schoolName = typeof edu.school === "object" ? edu.school?.name : (edu.schoolName || edu.school_name || edu.school || "");
                    const degree = edu.degreeName || edu.degree_name || (Array.isArray(edu.degrees) ? edu.degrees[0] : null) || "";
                    const field = edu.fieldOfStudy || edu.field_of_study || "";
                    const endDate = edu.graduationDate || edu.graduation_date || edu.endDate || edu.end_date || "";
                    return (
                      <div key={i} className="p-2.5 rounded-cos-md bg-cos-cloud/50">
                        <div className="text-sm font-medium text-cos-midnight">{schoolName}</div>
                        {(degree || field) && (
                          <div className="text-xs text-cos-slate">
                            {degree}{degree && field && " — "}{field}
                          </div>
                        )}
                        {endDate && <div className="text-xs text-cos-slate-light">{endDate}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick stats */}
            <div className="flex gap-6 pt-4 border-t border-cos-border/50">
              <div className="text-center">
                <div className="text-lg font-bold text-cos-midnight">{deals.length}</div>
                <div className="text-xs text-cos-slate">Deals</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-cos-midnight">{timeline.length}</div>
                <div className="text-xs text-cos-slate">Timeline Events</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-cos-midnight">{conversations.length}</div>
                <div className="text-xs text-cos-slate">Conversations</div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Activity Timeline ─── */}
        {activeTab === "activity" && (
          timeline.length === 0 ? (
            <div className="text-center py-12 text-cos-slate-light text-sm">No activity timeline events for this person.</div>
          ) : (
            <div className="space-y-0">
              {timeline.map((e: any, i: number) => (
                <div key={e.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-2.5 w-2.5 rounded-full bg-cos-electric mt-1.5 shrink-0" />
                    {i < timeline.length - 1 && <div className="w-px flex-1 bg-cos-border" />}
                  </div>
                  <div className="pb-4">
                    <div className="text-sm font-medium text-cos-midnight">
                      {EVENT_ICONS[e.eventType] || e.eventType}
                    </div>
                    <div className="text-xs text-cos-slate-light mt-0.5">
                      {e.channel && <span className="capitalize">{e.channel}</span>}
                      {e.campaignName && <span> &middot; {e.campaignName}</span>}
                      {e.eventAt && <span> &middot; {new Date(e.eventAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ─── Deals ─── */}
        {activeTab === "deals" && (
          deals.length === 0 ? (
            <div className="text-center py-12 text-cos-slate-light text-sm">No deals for this person.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cos-border text-left">
                    <th className="pb-2 font-medium text-cos-slate-dim">Deal</th>
                    <th className="pb-2 font-medium text-cos-slate-dim">Stage</th>
                    <th className="pb-2 font-medium text-cos-slate-dim">Value</th>
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

        {/* ─── Messages ─── */}
        {activeTab === "messages" && (
          conversations.length === 0 ? (
            <div className="text-center py-12 text-cos-slate-light text-sm">No LinkedIn conversations found for this person.</div>
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
                  {c.participantHeadline && <div className="text-xs text-cos-slate mb-1">{c.participantHeadline}</div>}
                  {c.lastMessagePreview && <div className="text-xs text-cos-slate-light line-clamp-2">{c.lastMessagePreview}</div>}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Annotations Sidebar */}
      <div className="w-72 shrink-0 hidden lg:block">
        <div className="rounded-cos-lg border border-cos-border bg-cos-surface p-4 sticky top-4">
          <h3 className="text-sm font-heading font-semibold text-cos-midnight mb-3">Sales Notes</h3>
          <CrmAnnotationsPanel entityType="person" entityId={data.id} />
        </div>
      </div>
      </div>
    </div>
  );
}
