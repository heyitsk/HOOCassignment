const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export interface RequestUploadResponse {
  postId: number;
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export interface FeedPost {
  id: number;
  key: string;
  url: string | null;
  status: "PENDING" | "UPLOADED" | "FAILED";
  postedAt: string;
  userId: number;
  user: { id: number; name: string | null };
}

export interface FeedResponse {
  posts: FeedPost[];
  nextCursor: number | null;
}

async function asJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed with status ${res.status}`);
  }
  return data as T;
}

/** Step 1: ask the backend for a presigned S3 PUT URL + a PENDING post row. */
export async function requestUpload(
  userId: number,
  contentType: string,
  durationSeconds: number,
  fileSize: number,
): Promise<RequestUploadResponse> {
  const res = await fetch(`${API_BASE}/vdo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, contentType, durationSeconds, fileSize }),
  });
  return asJson<RequestUploadResponse>(res);
}

/**
 * Step 2: PUT the raw file bytes directly to S3 using the presigned URL.
 * Uses XMLHttpRequest (not fetch) so upload progress can be reported.
 */
export function uploadToS3(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("S3 upload failed (network error)"));

    xhr.send(file);
  });
}

/** Step 3: tell the backend the S3 upload finished, so it can confirm + record it. */
export async function confirmUpload(
  postId: number,
): Promise<{ post: FeedPost }> {
  const res = await fetch(`${API_BASE}/vdo/${postId}/complete`, {
    method: "POST",
  });
  return asJson<{ post: FeedPost }>(res);
}

export async function getFeed(
  cursor?: number,
  limit = 20,
): Promise<FeedResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined) params.set("cursor", String(cursor));

  const res = await fetch(`${API_BASE}/feed?${params}`);
  return asJson<FeedResponse>(res);
}
