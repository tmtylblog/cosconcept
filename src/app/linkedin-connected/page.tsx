/**
 * Public page — shown after someone connects their LinkedIn account via Unipile hosted auth.
 * No auth required. No app chrome. Just a confirmation.
 */
export default function LinkedInConnectedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full rounded-2xl bg-white border border-gray-200 shadow-sm p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">LinkedIn connected</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Your LinkedIn account has been connected successfully. You can close this window.
        </p>
        <p className="mt-6 text-xs text-gray-400">Collective OS</p>
      </div>
    </div>
  );
}
