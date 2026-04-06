import { ActivityClient } from "@/components/ActivityClient";
import { hubFetch } from "@/lib/hub";

type ActivityData = {
  weeks: string[];
  repos: string[];
  data: Array<Record<string, string | number>>;
};

export default async function ActivityPage() {
  let activity: ActivityData = { weeks: [], repos: [], data: [] };
  try { activity = await hubFetch<ActivityData>("/stats/activity"); } catch {}

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-white">Atividade</h2>
      <ActivityClient activity={activity} />
    </div>
  );
}
