export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-cos-midnight">Dashboard</h1>
      <p className="mt-2 text-cos-slate">
        Welcome to Collective OS. Your partnership intelligence hub.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Match readiness card */}
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6">
          <h3 className="text-sm font-medium text-cos-slate">Match Readiness</h3>
          <p className="mt-2 text-3xl font-bold text-cos-midnight">—</p>
          <p className="mt-1 text-xs text-cos-slate-light">
            Complete your profile to start matching
          </p>
        </div>

        {/* Active partnerships card */}
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6">
          <h3 className="text-sm font-medium text-cos-slate">Active Partnerships</h3>
          <p className="mt-2 text-3xl font-bold text-cos-midnight">0</p>
          <p className="mt-1 text-xs text-cos-slate-light">
            Partnerships will appear here
          </p>
        </div>

        {/* New matches card */}
        <div className="rounded-cos-xl border border-cos-border bg-cos-surface p-6">
          <h3 className="text-sm font-medium text-cos-slate">New Matches</h3>
          <p className="mt-2 text-3xl font-bold text-cos-midnight">0</p>
          <p className="mt-1 text-xs text-cos-slate-light">
            AI-powered matches coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
