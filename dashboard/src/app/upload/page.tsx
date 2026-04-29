"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Check, X, UploadCloud, File } from "lucide-react";

const C = {
  bg:     "rgba(10,22,40,0.6)",
  border: "#1a2840",
  cyan:   "#06b6d4",
  green:  "#22c55e",
  red:    "#ef4444",
  text:   "#e2e8f0",
  muted:  "#8ab4cc",
  dim:    "#4a6a8a",
  card:   "rgba(15,30,55,0.85)",
};

type UploadedFile = { name: string; url: string; size: number; copied: boolean };

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

function FileRow({ f, onRemove }: { f: UploadedFile; onRemove: () => void }) {
  const [copied, setCopied] = useState(false);
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const full = base + f.url;

  function copy() {
    navigator.clipboard.writeText(full).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0.65rem 1rem" }}>
      <File size={14} color={C.cyan} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.78rem", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: C.dim, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{full}</div>
      </div>
      <span style={{ fontFamily: "var(--mono)", fontSize: "0.62rem", color: C.dim, flexShrink: 0 }}>{fmtSize(f.size)}</span>
      <button onClick={copy} title="Copiar URL" style={{ background: "none", border: "none", cursor: "pointer", color: copied ? C.green : C.muted, flexShrink: 0 }}>
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <button onClick={onRemove} title="Remover" style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, flexShrink: 0 }}>
        <X size={14} />
      </button>
    </div>
  );
}

export default function UploadPage() {
  const [files, setFiles]     = useState<UploadedFile[]>([]);
  const [dragging, setDrag]   = useState(false);
  const [uploading, setUping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;
    setUping(true);
    const form = new FormData();
    arr.forEach(f => form.append("files", f));
    try {
      const res  = await fetch("/painel/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (data.files) setFiles(prev => [...data.files.map((f: Omit<UploadedFile,"copied">) => ({ ...f, copied: false })), ...prev]);
    } catch {}
    setUping(false);
  }, []);

  // Ctrl+V — paste de imagens e arquivos
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const fs: File[] = [];
      for (const item of Array.from(items)) {
        const f = item.getAsFile();
        if (f) fs.push(f);
      }
      if (fs.length) upload(fs);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: 680 }}>
      <div>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.72rem", color: C.dim, letterSpacing: "0.08em", marginBottom: "0.35rem" }}>UPLOAD</div>
        <h2 style={{ fontFamily: "var(--mono)", fontSize: "1.4rem", fontWeight: 700, color: C.text, margin: 0 }}>Arquivos</h2>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? C.cyan : C.border}`,
          borderRadius: 12,
          padding: "3rem 2rem",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "rgba(6,182,212,0.05)" : C.bg,
          transition: "all 0.15s",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem",
        }}
      >
        <UploadCloud size={32} color={dragging ? C.cyan : C.dim} />
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.82rem", color: dragging ? C.cyan : C.muted }}>
          {uploading ? "Enviando..." : "Arraste arquivos, cole com Ctrl+V ou clique para selecionar"}
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.dim }}>
          Qualquer tipo de arquivo · Múltiplos arquivos
        </div>
        <input ref={inputRef} type="file" multiple style={{ display: "none" }} onChange={e => e.target.files && upload(e.target.files)} />
      </div>

      {/* Lista */}
      {files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: "0.68rem", color: C.dim }}>{files.length} arquivo{files.length > 1 ? "s" : ""}</span>
            <button onClick={() => setFiles([])} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--mono)", fontSize: "0.65rem", color: C.dim }}>limpar tudo</button>
          </div>
          {files.map((f, i) => (
            <FileRow key={f.url} f={f} onRemove={() => setFiles(prev => prev.filter((_, j) => j !== i))} />
          ))}
        </div>
      )}
    </div>
  );
}
