import { useEffect, useState } from "react";
import { getFeed, type FeedPost } from "./api";

export function Feed({ refreshKey }: { refreshKey?: number }) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadFirstPage() {
    setLoading(true);
    setError(null);
    try {
      const { posts, nextCursor } = await getFeed();
      setPosts(posts);
      setNextCursor(nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (nextCursor === null) return;
    setLoading(true);
    try {
      const { posts: more, nextCursor: next } = await getFeed(nextCursor);
      setPosts((prev) => [...prev, ...more]);
      setNextCursor(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoading(false);
    }
  }

  // reload whenever refreshKey changes (e.g. after a new upload completes)
  useEffect(() => {
    loadFirstPage();
  }, [refreshKey]);

  return (
    <div className="mx-auto max-w-xl">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Feed</h2>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {!loading && posts.length === 0 && !error && (
        <p className="text-sm text-gray-500">
          No videos yet. Upload one to get started.
        </p>
      )}

      <div className="space-y-6">
        {posts.map((post) => (
          <div
            key={post.id}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
          >
            {post.url && (
              <video controls className="w-full bg-black" src={post.url} />
            )}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-gray-900">
                {post.user.name ?? `User #${post.user.id}`}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(post.postedAt).toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {nextCursor !== null && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="mt-6 w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
