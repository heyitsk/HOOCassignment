import { randomUUID } from "crypto";
import { Hono } from "hono";
import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "../config/db";
import { s3, S3_BUCKET } from "../config/s3";

export const handler = new Hono();

const PRESIGNED_URL_TTL_SECONDS = 5 * 60; // 5 minutes to complete the upload
const ALLOWED_CONTENT_TYPE = "video/mp4";
const MAX_DURATION_SECONDS = 60;
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const PLAYBACK_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * URL the browser uses to play a video. The bucket can stay private: we
 * hand out short-lived presigned GET URLs. If the bucket is fronted by a
 * CDN / public, set S3_PUBLIC_BASE_URL (e.g. https://cdn.example.com) and
 * that is used instead.
 */
async function playbackUrl(key: string): Promise<string> {
  const publicBase = process.env.S3_PUBLIC_BASE_URL;
  if (publicBase) return `${publicBase.replace(/\/$/, "")}/${key}`;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), {
    expiresIn: PLAYBACK_URL_TTL_SECONDS,
  });
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof S3ServiceException &&
    (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404)
  );
}

/**
 * GET /feed?limit=20&cursor=42
 *
 * Returns all successfully uploaded posts, newest first, with the
 * author's id and name. Paginated with a cursor (the last post id
 * from the previous page) so the feed can keep loading.
 */
handler.get("/feed", async (c) => {
  const limitParam = c.req.query("limit");
  const cursorParam = c.req.query("cursor");

  const limit = limitParam ? Number(limitParam) : 20;
  if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
    return c.json({ error: "limit must be an integer between 1 and 100" }, 400);
  }

  let cursor: number | undefined;
  if (cursorParam !== undefined) {
    cursor = Number(cursorParam);
    if (!Number.isInteger(cursor)) {
      return c.json({ error: "cursor must be an integer post id" }, 400);
    }
  }

  // Fetch one extra row to know whether another page exists. Ordered by id
  // (not postedAt) so the cursor is stable and unambiguous.
  const rows = await prisma.post.findMany({
    where: { status: "UPLOADED" },
    orderBy: { id: "desc" },
    take: limit + 1,
    ...(cursor !== undefined && { cursor: { id: cursor }, skip: 1 }),
    include: { user: { select: { id: true, name: true } } },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1]!.id : null;

  const posts = await Promise.all(
    page.map(async (post) => ({ ...post, url: await playbackUrl(post.key) })),
  );

  return c.json({ posts, nextCursor });
});

/**
 * POST /vdo
 * Body (JSON): { userId, contentType, durationSeconds, fileSize }
 *
 * The file itself never touches this server — it lives only in the
 * browser until the presigned PUT, so format/duration were already
 * checked client-side (via an HTML5 <video> element). This endpoint
 * re-checks the reported contentType/duration, then issues a presigned
 * S3 PUT URL and creates a PENDING post row. The browser uploads the
 * file directly to S3, then calls POST /vdo/:id/complete to confirm.
 */
handler.post("/vdo", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (
    !body ||
    !Number.isInteger(body.userId) ||
    body.userId <= 0 ||
    typeof body.contentType !== "string" ||
    typeof body.durationSeconds !== "number" ||
    !Number.isInteger(body.fileSize)
  ) {
    return c.json(
      {
        error:
          "Body must be { userId: number, contentType: string, durationSeconds: number, fileSize: number }",
      },
      400,
    );
  }

  const { userId, contentType, durationSeconds, fileSize } = body;

  if (contentType !== ALLOWED_CONTENT_TYPE) {
    return c.json(
      {
        error: `Unsupported content type: ${contentType}. Only ${ALLOWED_CONTENT_TYPE} is allowed.`,
      },
      415,
    );
  }
  if (durationSeconds <= 0 || durationSeconds > MAX_DURATION_SECONDS) {
    return c.json(
      {
        error: `Duration must be greater than 0 and under ${MAX_DURATION_SECONDS}s (got ${durationSeconds}s)`,
      },
      413,
    );
  }

  if (fileSize <= 0 || fileSize > MAX_FILE_SIZE_BYTES) {
    return c.json(
      { error: `File size must be between 1 byte and ${MAX_FILE_SIZE_BYTES} bytes` },
      413,
    );
  }

  // --- user existence check ---
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // --- validation passed: create the S3 key and presigned PUT URL ---
  const key = `videos/${userId}/${randomUUID()}.mp4`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: ALLOWED_CONTENT_TYPE,
      // Signed, so S3 rejects an upload whose size differs from what we validated.
      ContentLength: fileSize,
    }),
    { expiresIn: PRESIGNED_URL_TTL_SECONDS },
  );

  // --- create a PENDING post row; it becomes UPLOADED once confirmed ---
  const post = await prisma.post.create({
    data: {
      key,
      status: "PENDING",
      userId,
    },
  });

  return c.json(
    {
      postId: post.id,
      uploadUrl,
      key,
      expiresIn: PRESIGNED_URL_TTL_SECONDS,
    },
    200,
  );
});

/**
 * POST /vdo/:id/complete
 * Body: {} (no body required)
 *
 * Called by the browser after it has successfully PUT the file to the
 * presigned URL. Verifies the object actually exists in S3, then marks
 * the post as UPLOADED. Playback URLs are generated on read (see playbackUrl).
 */
handler.post("/vdo/:id/complete", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: "id must be an integer" }, 400);
  }

  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    return c.json({ error: "Post not found" }, 404);
  }
  if (post.status === "UPLOADED") {
    // already confirmed, idempotent
    return c.json({ post: { ...post, url: await playbackUrl(post.key) } }, 200);
  }

  // --- verify the object actually landed in S3 before trusting the client ---
  let head;
  try {
    head = await s3.send(
      new HeadObjectCommand({ Bucket: S3_BUCKET, Key: post.key }),
    );
  } catch (err) {
    if (isNotFound(err)) {
      // Leave the post PENDING: the client may simply have called too early
      // or can retry the upload while the presigned URL is still valid.
      return c.json({ error: "Upload not found in S3; cannot confirm" }, 409);
    }
    console.error("HeadObject failed:", err);
    return c.json({ error: "Could not verify upload with S3" }, 502);
  }

  // --- the object exists, but make sure it is what we agreed to accept ---
  if (
    head.ContentType !== ALLOWED_CONTENT_TYPE ||
    !head.ContentLength ||
    head.ContentLength > MAX_FILE_SIZE_BYTES
  ) {
    await s3
      .send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: post.key }))
      .catch((e) => console.error("Failed to delete invalid object:", e));
    await prisma.post.update({ where: { id }, data: { status: "FAILED" } });
    return c.json({ error: "Uploaded file failed validation" }, 422);
  }

  const updated = await prisma.post.update({
    where: { id },
    data: { status: "UPLOADED" },
  });

  return c.json({ post: { ...updated, url: await playbackUrl(updated.key) } }, 200);
});
