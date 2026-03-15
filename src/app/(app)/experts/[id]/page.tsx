"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";
import {
  ExpertProfileCard,
  type ExpertProfileData,
  type SpecialistProfileData,
} from "@/components/experts/expert-profile-card";

export default function ExpertProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [expert, setExpert] = useState<ExpertProfileData | null>(null);
  const [specialistProfiles, setSpecialistProfiles] = useState<SpecialistProfileData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/experts/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setExpert(data.expert);
        setSpecialistProfiles(data.specialistProfiles ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const isOwner = !!(expert?.userId && session?.user?.id && expert.userId === session.user.id);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cos-electric" />
      </div>
    );
  }

  if (!expert) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-cos-slate-dim">Expert not found</p>
      </div>
    );
  }

  return (
    <div className="cos-scrollbar mx-auto max-w-2xl overflow-y-auto p-6">
      <ExpertProfileCard
        expert={expert}
        specialistProfiles={specialistProfiles}
        isOwner={isOwner}
        onEditClick={(spId) => {
          if (spId) {
            router.push(`/experts/${id}/edit?sp=${spId}`);
          } else {
            router.push(`/experts/${id}/edit`);
          }
        }}
      />
    </div>
  );
}
