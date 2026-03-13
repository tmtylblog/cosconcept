import { redirect } from "next/navigation";

export default function PipelineSettingsRedirect() {
  redirect("/admin/growth-ops/settings?tab=pipeline");
}
