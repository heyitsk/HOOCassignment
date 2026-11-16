const MAX_DURATION_SECONDS = 60;
const ALLOWED_CONTENT_TYPE = "video/mp4";

export interface VideoValidationResult {
  ok: boolean;
  error?: string;
  durationSeconds?: number;
}

/**
 * Client-side validation: the file never goes through the server before
 * the presigned upload, so type + duration are checked here using an
 * offscreen <video> element instead of server-side ffprobe.
 */
export function validateVideoFile(file: File): Promise<VideoValidationResult> {
  if (file.type !== ALLOWED_CONTENT_TYPE) {
    return Promise.resolve({
      ok: false,
      error: `Only ${ALLOWED_CONTENT_TYPE} files are allowed (got ${file.type || "unknown type"})`,
    });
  }

  return new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      const durationSeconds = video.duration;
      URL.revokeObjectURL(objectUrl);

      if (!isFinite(durationSeconds) || durationSeconds <= 0) {
        resolve({ ok: false, error: "Could not read video duration" });
      } else if (durationSeconds > MAX_DURATION_SECONDS) {
        resolve({
          ok: false,
          error: `Video is ${durationSeconds.toFixed(1)}s long; must be under ${MAX_DURATION_SECONDS}s`,
          durationSeconds,
        });
      } else {
        resolve({ ok: true, durationSeconds });
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ ok: false, error: "Could not read this file as a video" });
    };
  });
}
