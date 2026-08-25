"use client";

type FileEntry = { file_name: string; download_url: string | null };

export function GetFilesButton({ files }: { files: FileEntry[] }) {
  async function handleClick() {
    for (const f of files) {
      if (!f.download_url) continue;
      // Fetch + blob so the browser downloads rather than navigates,
      // even for cross-origin signed Supabase Storage URLs.
      try {
        const res = await fetch(f.download_url);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = f.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        // Fall back to a plain navigation if the fetch/blob path fails
        // (e.g. blocked by an extension) — still better than nothing.
        window.open(f.download_url, "_blank");
      }
    }
  }

  return (
    <button type="button" className="get-files-btn" onClick={handleClick}>
      Get files
    </button>
  );
}
