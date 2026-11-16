import { useState } from "react";
import { UploadForm } from "./UploadForm";
import { Feed } from "./Feed";

export default function App() {
  const [tab, setTab] = useState<"upload" | "feed">("upload");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto mb-8 flex max-w-xl justify-center gap-2">
        <button
          onClick={() => setTab("upload")}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            tab === "upload"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-700 hover:bg-gray-100"
          }`}
        >
          Upload
        </button>
        <button
          onClick={() => setTab("feed")}
          className={`rounded-md px-4 py-2 text-sm font-medium ${
            tab === "feed"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-700 hover:bg-gray-100"
          }`}
        >
          Feed
        </button>
      </div>

      {tab === "upload" ? (
        <UploadForm onUploaded={() => setRefreshKey((k) => k + 1)} />
      ) : (
        <Feed refreshKey={refreshKey} />
      )}
    </div>
  );
}
