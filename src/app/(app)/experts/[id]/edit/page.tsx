"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { SpecialistProfileEditor } from "@/components/experts/specialist-profile-editor";
import { SpecialistProfileCard } from "@/components/experts/specialist-profile-card";

interface PdlExperience {
  company: { name: string; website?: string | null; industry?: string | null };
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  summary?: string;
}

interface WorkExample {
  id?: string;
  title?: string | null;
  subject?: string | null;
  companyName?: string | null;
  companyIndustry?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  isPdlSource?: boolean;
  pdlExperienceIndex?: number;
  exampleType?: "project" | "role";
  position?: number;
}

interface SpecialistProfile {
  id: string;
  title?: string | null;
  bodyDescription?: string | null;
  skills?: string[] | null;
  industries?: string[] | null;
  services?: string[] | null;
  qualityScore?: number | null;
  qualityStatus?: string | null;
  isPrimary?: boolean | null;
  isSearchable?: boolean | null;
  status?: string | null;
  examples?: WorkExample[];
}

export default function ExpertEditPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const spId = searchParams.get("sp");
  const isNew = searchParams.get("new") === "1";

  const [loading, setLoading] = useState(true);
  const [pdlExperiences, setPdlExperiences] = useState<PdlExperience[]>([]);
  const [specialistProfiles, setSpecialistProfiles] = useState<SpecialistProfile[]>([]);
  const [editingProfile, setEditingProfile] = useState<SpecialistProfile | null>(null);
  const [creatingNew, setCreatingNew] = useState(isNew);
  const [expertBio, setExpertBio] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/experts/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const pdl = data.expert?.pdlData?.experience ?? [];
        setPdlExperiences(pdl);
        setSpecialistProfiles(data.specialistProfiles ?? []);
        setExpertBio(data.expert?.bio ?? data.expert?.pdlData?.summary ?? "");

        if (spId) {
          const found = (data.specialistProfiles ?? []).find(
            (sp: SpecialistProfile) => sp.id === spId
          );
          if (found) setEditingProfile(found);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, spId]);

  const handleSaved = (savedSpId: string) => {
    // Reload and go to view that profile
    router.push(`/experts/${id}?saved=${savedSpId}`);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
      </div>
    );
  }

  // Editing a specific profile
  if (editingProfile) {
    return (
      <SpecialistProfileEditor
        expertId={id}
        initialProfile={{
          ...editingProfile,
          examples: (editingProfile.examples ?? []).map((ex) => ({
            title: ex.title ?? "",
            subject: ex.subject ?? "",
            companyName: ex.companyName ?? "",
            companyIndustry: ex.companyIndustry ?? "",
            startDate: ex.startDate ?? "",
            endDate: ex.endDate ?? "",
            isCurrent: ex.isCurrent ?? false,
            isPdlSource: ex.isPdlSource ?? false,
            pdlExperienceIndex: ex.pdlExperienceIndex,
            exampleType: ex.exampleType ?? "project",
          })),
        }}
        pdlExperiences={pdlExperiences}
        expertBio={expertBio}
        onSave={handleSaved}
        onCancel={() => router.push(`/experts/${id}`)}
      />
    );
  }

  // Creating a new profile
  if (creatingNew) {
    return (
      <SpecialistProfileEditor
        expertId={id}
        initialProfile={null}
        pdlExperiences={pdlExperiences}
        expertBio={expertBio}
        onSave={handleSaved}
        onCancel={() => {
          setCreatingNew(false);
          router.push(`/experts/${id}`);
        }}
      />
    );
  }

  // Default: list existing profiles + add new button
  return (
    <div className="cos-scrollbar mx-auto max-w-2xl space-y-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Your Specialist Profiles
        </h2>
        <button
          onClick={() => setCreatingNew(true)}
          className="flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-3 py-2 text-xs font-medium text-white hover:bg-cos-electric/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New profile
        </button>
      </div>

      {specialistProfiles.length === 0 ? (
        <div className="rounded-cos-xl border border-dashed border-cos-electric/30 bg-cos-electric/3 p-8 text-center">
          <p className="text-sm font-medium text-cos-midnight">
            No specialist profiles yet
          </p>
          <p className="mt-1 text-xs text-cos-slate-dim">
            Create a specialist profile to appear in search results.
          </p>
          <button
            onClick={() => setCreatingNew(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-cos-lg bg-cos-electric px-4 py-2 text-xs font-medium text-white hover:bg-cos-electric/90 transition-colors"
          >
            Create first profile
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {specialistProfiles.map((sp) => (
            <SpecialistProfileCard
              key={sp.id}
              profile={sp}
              isOwner
              onEditClick={(spId) => setEditingProfile(
                specialistProfiles.find((s) => s.id === spId) ?? null
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
