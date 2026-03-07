export default function NotificationsSettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-cos-midnight">
          Notifications
        </h2>
        <p className="mt-1 text-sm text-cos-slate">
          Control how and when you receive notifications.
        </p>
      </div>

      <div className="space-y-3">
        {[
          { label: "New match alerts", description: "Get notified when Ossy finds a new potential partner" },
          { label: "Partnership updates", description: "Activity on active partnerships" },
          { label: "Weekly digest", description: "Summary of matches, messages, and opportunities" },
          { label: "Product updates", description: "New features and platform announcements" },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-cos-xl border border-cos-border p-4"
          >
            <div>
              <p className="text-sm font-medium text-cos-midnight">
                {item.label}
              </p>
              <p className="text-xs text-cos-slate">{item.description}</p>
            </div>
            <div className="h-5 w-9 rounded-cos-full bg-cos-cloud-dim" />
          </div>
        ))}
      </div>

      <p className="text-xs text-cos-slate-light">
        Notification preferences will be available in a future update.
      </p>
    </div>
  );
}
