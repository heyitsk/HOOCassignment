import { useState } from "react";
import { requestUpload, uploadToS3, confirmUpload } from "./api";
import { validateVideoFile } from "./ValidateVideo";

type Status =
  | "idle"
  | "validating"
  | "requesting"
  | "uploading"
  | "confirming"
  | "done"
  | "error";

export function UploadForm({ onUploaded }: { onUploaded?: () => void }) {
  const [userId, setUserId] = useState(
    () => localStorage.getItem("userId") ?? "1",
  );
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isBusy = status !== "idle" && status !== "done" && status !== "error";

  async function handleUpload() {
    if (!file) return;
    setError(null);
    localStorage.setItem("userId", userId);

    const userIdNum = Number(userId);
    if (!Number.isInteger(userIdNum) || userIdNum <= 0) {
      setStatus("error");
      setError("User ID must be a positive integer");
      return;
    }

    try {
      // 1. validate the file in-browser (type + duration)
      setStatus("validating");
      const validation = await validateVideoFile(file);
      if (!validation.ok) {
        setStatus("error");
        setError(validation.error ?? "Invalid video");
        return;
      }

      // 2. ask backend for a presigned S3 URL + PENDING post row
      setStatus("requesting");
      const { postId, uploadUrl } = await requestUpload(
        userIdNum,
        file.type,
        validation.durationSeconds!,
        file.size,
      );

      // 3. upload the raw file directly to S3
      setStatus("uploading");
      setProgress(0);
      await uploadToS3(uploadUrl, file, setProgress);

      // 4. tell the backend the upload is done so it can confirm + update the post
      setStatus("confirming");
      await confirmUpload(postId);

      setStatus("done");
      setFile(null);
      onUploaded?.();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Upload a video
      </h2>

      <label className="mb-1 block text-sm font-medium text-gray-700">
        User ID
      </label>
      <input
        type="number"
        min={1}
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        disabled={isBusy}
        className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
      />

      <label className="mb-1 block text-sm font-medium text-gray-700">
        Video file (.mp4, under 60s)
      </label>
      <input
        type="file"
        accept="video/mp4"
        disabled={isBusy}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="mb-4 w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
      />

      {status === "uploading" && (
        <div className="mb-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">{progress}% uploaded</p>
        </div>
      )}

      {status !== "idle" && status !== "error" && (
        <p className="mb-4 text-sm text-gray-600">
          {
            {
              validating: "Checking video…",
              requesting: "Requesting upload URL…",
              uploading: "Uploading to S3…",
              confirming: "Confirming upload…",
              done: "Uploaded! It will appear in the feed.",
            }[status]
          }
        </p>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <button
        onClick={handleUpload}
        disabled={!file || isBusy}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {isBusy ? "Uploading…" : "Upload"}
      </button>
    </div>
  );
}
