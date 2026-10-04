import { useEffect, useState } from "react";
import type { SchoolResourcesApplicationService } from "../application/school-resources-service";
import type { Attachment, AttachmentInput } from "../domain/school-resources";
export function AttachmentsScreen({
  service,
  linkKind = "standalone",
  linkId = null,
}: {
  service: SchoolResourcesApplicationService;
  linkKind?: AttachmentInput["linkKind"];
  linkId?: string | null;
}) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [previous, setPrevious] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void service
      .listAttachments()
      .then((v) => {
        if (live) setItems(v);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [service]);
  async function save() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await service.saveAttachment({
        filename: file.name,
        mimeType: file.type || (file.name.endsWith(".txt") ? "text/plain" : ""),
        bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
        linkKind,
        linkId,
        previousId: previous || null,
        reviewerUserId: null,
      });
      setItems(await service.listAttachments());
      setFile(null);
      setPrevious("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function download(item: Attachment) {
    setError("");
    try {
      const bytes = await service.readAttachment(item.id);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: item.mimeType }));
      const a = document.createElement("a");
      a.href = url;
      a.download = item.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section>
      <h2>Evidence and attachments</h2>
      <p>
        PDF, image or text, up to 2 MiB each. Saved on this device and included in its encrypted
        installation backup. Previous versions are retained.
      </p>
      {error && <p role="alert">{error}</p>}
      <label>
        Choose file{" "}
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.txt"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <label>
        Earlier version (optional)
        <select value={previous} onChange={(e) => setPrevious(e.target.value)}>
          <option value="">New attachment</option>
          {items
            .filter((i) => i.linkKind === linkKind && i.linkId === linkId)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.filename} · {i.createdAt}
              </option>
            ))}
        </select>
      </label>
      <button disabled={!file || busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save attachment"}
      </button>
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <button onClick={() => void download(i)}>{i.filename}</button> · {i.createdAt}
            {i.previousId && " · New version"}
          </li>
        ))}
      </ul>
    </section>
  );
}
