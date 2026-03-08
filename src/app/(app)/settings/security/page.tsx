export default function SecuritySettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Security
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          Password, authentication, and access management.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-cos-xl border border-cos-border p-5">
          <p className="text-sm font-medium text-cos-midnight">Password</p>
          <p className="mt-1 text-xs text-cos-slate">
            Change your account password.
          </p>
          <button className="mt-3 text-xs font-medium text-cos-electric hover:underline">
            Change password
          </button>
        </div>

        <div className="rounded-cos-xl border border-cos-border p-5">
          <p className="text-sm font-medium text-cos-midnight">
            Two-Factor Authentication
          </p>
          <p className="mt-1 text-xs text-cos-slate">
            Add an extra layer of security to your account.
          </p>
          <p className="mt-3 text-xs text-cos-slate-light">
            Coming soon.
          </p>
        </div>

        <div className="rounded-cos-xl border border-cos-border p-5">
          <p className="text-sm font-medium text-cos-midnight">
            Active Sessions
          </p>
          <p className="mt-1 text-xs text-cos-slate">
            Manage devices where you&apos;re signed in.
          </p>
          <p className="mt-3 text-xs text-cos-slate-light">
            Coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
