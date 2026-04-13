"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Asset, createAsset, fetchAssets, toAssetFileUrl } from "@/lib/api-client";

type Notice = {
  tone: "success" | "error";
  message: string;
};

const INITIAL_FORM = {
  name: "",
  creator: "",
  eventDate: "",
  mediaFile: null as File | null
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function truncateHash(hash: string) {
  if (!hash) {
    return "N/A";
  }

  if (hash.length <= 16) {
    return hash;
  }

  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export default function UploadPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const filePreviewUrl = useMemo(() => {
    if (!form.mediaFile) {
      return "";
    }
    return URL.createObjectURL(form.mediaFile);
  }, [form.mediaFile]);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  async function loadAssets() {
    setIsLoadingAssets(true);
    try {
      const response = await fetchAssets(1, 20);
      setAssets(response.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load assets";
      setNotice({ tone: "error", message });
    } finally {
      setIsLoadingAssets(false);
    }
  }

  useEffect(() => {
    loadAssets();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!form.mediaFile) {
      setNotice({ tone: "error", message: "Select a media file before submitting." });
      return;
    }

    setIsSubmitting(true);

    try {
      const uploaded = await createAsset({
        name: form.name,
        creator: form.creator,
        eventDate: form.eventDate,
        mediaFile: form.mediaFile
      });

      setNotice({
        tone: "success",
        message: `Uploaded ${uploaded.asset.name} and generated ${uploaded.fingerprint.algorithm} fingerprint.`
      });

      setForm((previous) => ({
        ...INITIAL_FORM,
        creator: previous.creator
      }));

      await loadAssets();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setNotice({ tone: "error", message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-12 sm:px-10">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Asset Intake</p>
        <h1 className="text-3xl font-bold text-slate-900">Upload Sports Media</h1>
        <p className="text-slate-600">
          Register media assets with metadata, trigger fingerprint generation, and review uploaded entries.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Asset Name</span>
              <input
                type="text"
                required
                value={form.name}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, name: event.target.value }))
                }
                placeholder="Final Goal Celebration"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Creator</span>
              <input
                type="text"
                required
                value={form.creator}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, creator: event.target.value }))
                }
                placeholder="Federation Media Team"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Event Date</span>
            <input
              type="date"
              required
              value={form.eventDate}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, eventDate: event.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">Media File</span>
            <input
              type="file"
              accept="image/*,video/*"
              required
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  mediaFile: event.target.files?.[0] || null
                }))
              }
              className="w-full cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-emerald-700"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? "Uploading..." : "Upload Asset"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setForm((previous) => ({ ...INITIAL_FORM, creator: previous.creator }))}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>
          </div>

          {notice ? (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                notice.tone === "success"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
            >
              {notice.message}
            </p>
          ) : null}
        </form>

        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-600">Selected Media Preview</p>
          <div className="mt-4 flex min-h-56 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
            {form.mediaFile && filePreviewUrl ? (
              form.mediaFile.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={filePreviewUrl}
                  alt="Selected upload preview"
                  className="max-h-56 rounded-md object-contain"
                />
              ) : (
                <p className="text-center text-sm text-slate-600">
                  {form.mediaFile.name}
                  <br />
                  <span className="text-xs">Preview available for image files. Video will upload as selected.</span>
                </p>
              )
            ) : (
              <p className="text-sm text-slate-500">Choose a file to preview it before upload.</p>
            )}
          </div>
        </aside>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Uploaded Assets</h2>
          <button
            type="button"
            onClick={() => loadAssets()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {isLoadingAssets ? (
          <p className="text-sm text-slate-600">Loading uploaded assets...</p>
        ) : assets.length === 0 ? (
          <p className="text-sm text-slate-600">No assets uploaded yet. Submit the form above to create one.</p>
        ) : (
          <ul className="grid gap-3">
            {assets.map((asset) => (
              <li key={asset._id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{asset.name}</p>
                    <p className="text-sm text-slate-600">
                      {asset.creator} • Event: {formatDate(asset.eventDate)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Fingerprint: {truncateHash(asset.fingerprintHash)}</p>
                  </div>

                  {asset.fileUrl ? (
                    <a
                      href={toAssetFileUrl(asset.fileUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      Open File
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
