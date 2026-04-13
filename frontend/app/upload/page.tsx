export default function UploadPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12 sm:px-10">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Asset Intake</p>
        <h1 className="text-3xl font-bold text-slate-900">Upload Sports Media</h1>
        <p className="text-slate-600">
          Day 1 scaffold for asset registration. Next step is adding file upload and metadata form fields.
        </p>
      </header>

      <section className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-slate-600">
        Upload form coming next: file input, event metadata, and API submission.
      </section>
    </main>
  );
}
