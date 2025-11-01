"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Mustache from "mustache";

type RecipientRow = Record<string, string | number | boolean | null | undefined> & {
  email?: string;
  name?: string;
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export default function Page() {
  const [rows, setRows] = useState<RecipientRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [subjectTemplate, setSubjectTemplate] = useState("Hello {{name}} ? Quick note");
  const [bodyTemplate, setBodyTemplate] = useState("Hi {{name}},\n\nGreat to connect. {{message}}\n\nBest,\n{{fromName}}");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("Team");
  const [replyTo, setReplyTo] = useState("");
  const [sending, setSending] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  const sampleData = useMemo(() => rows.slice(0, 3), [rows]);

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const firstSheetName = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheetName];
    const json = XLSX.utils.sheet_to_json<RecipientRow>(ws, { defval: "" });
    const normalized = json.map((r) => {
      const mapped: RecipientRow = { ...r };
      const keys = Object.keys(mapped).reduce<Record<string, any>>((acc, k) => {
        acc[k.trim()] = (mapped as any)[k];
        return acc;
      }, {});
      const email = (keys.email || keys.Email || keys.E_MAIL || keys["e-mail"]) as string | undefined;
      const name = (keys.name || keys.Name || keys.fullname || keys["full name"]) as string | undefined;
      return { ...keys, email, name };
    });
    const cols = Array.from(
      new Set(normalized.flatMap((r) => Object.keys(r)))
    ) as string[];
    setColumns(cols);
    setRows(normalized);
    setProgress(0);
    setLog([]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleSend = async () => {
    if (!fromEmail) {
      alert("Please provide From email");
      return;
    }
    setSending(true);
    setProgress(0);
    setLog([]);

    const batches = chunkArray(rows, 30); // keep payloads small and fast
    let sent = 0;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const res = await fetch("/api/send-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: batch,
          subjectTemplate,
          bodyTemplate,
          fromEmail,
          fromName,
          replyTo: replyTo || undefined,
          dryRun
        })
      });
      const data = await res.json();
      const entries: string[] = (data.results || []).map((r: any) => `${r.email}: ${r.status}${r.error ? " - " + r.error : ""}`);
      setLog((prev) => prev.concat(entries));
      sent += batch.length;
      setProgress(Math.round((sent / rows.length) * 100));
    }

    setSending(false);
  };

  const renderPreview = () => {
    if (sampleData.length === 0) return null;
    return (
      <div className="card">
        <div className="label">Preview (first 3 rows rendered)</div>
        <div className="grid">
          {sampleData.map((r, idx) => {
            const view = { ...r, fromName } as Record<string, any>;
            const subject = Mustache.render(subjectTemplate, view);
            const body = Mustache.render(bodyTemplate, view);
            return (
              <div key={idx} className="card" style={{ borderColor: "#f1f5f9" }}>
                <div><span className="badge">To</span> {String(r.email || "").trim()}</div>
                <div style={{ marginTop: 6 }}><span className="badge">Subject</span> {subject}</div>
                <pre style={{ whiteSpace: "pre-wrap", background: "#f8fafc", border: "1px solid #e2e8f0", padding: 12, borderRadius: 8, marginTop: 6 }}>{body}</pre>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="grid">
      <section className="card">
        <div className="label">1) Upload Excel (.xlsx, first sheet)</div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          style={{ border: "2px dashed #cbd5e1", borderRadius: 12, padding: 24, background: "#f8fafc" }}
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div className="help" style={{ marginTop: 8 }}>Expected columns include at least "email"; "name" optional. Any other columns become variables for templates.</div>
        </div>

        {rows.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="label">Detected columns</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {columns.map((c) => (
                <span key={c} className="badge">{c}</span>
              ))}
            </div>
            <div className="help" style={{ marginTop: 8 }}>Use these as Mustache variables like {{"{{name}}"}} in your templates.</div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="label">2) From and Template</div>
        <div className="grid">
          <div>
            <label className="label">From email</label>
            <input className="input" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="you@domain.com" />
          </div>
          <div>
            <label className="label">From name</label>
            <input className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your Name or Team" />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="label">Reply-To (optional)</label>
          <input className="input" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="replies@domain.com" />
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="label">Subject template</label>
          <input className="input" value={subjectTemplate} onChange={(e) => setSubjectTemplate(e.target.value)} />
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="label">Body template (text)</label>
          <textarea className="textarea" value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} />
        </div>

        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <label className="label" style={{ margin: 0 }}>Dry run</label>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          <span className="help">When enabled, no real emails will be sent; useful to validate rendering.</span>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
          <button className="button" disabled={rows.length === 0 || sending} onClick={handleSend}>{sending ? "Sending..." : "Send emails"}</button>
          <button className="button secondary" disabled={sending} onClick={() => { setRows([]); setColumns([]); setProgress(0); setLog([]); }}>Reset</button>
        </div>

        <div style={{ marginTop: 12 }} className="progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="help" style={{ marginTop: 6 }}>{rows.length} recipients ? {progress}% complete</div>
      </section>

      <section className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="label">3) Preview</div>
        {renderPreview()}
      </section>

      <section className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="label">Delivery log</div>
        {log.length === 0 ? (
          <div className="help">No entries yet.</div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", maxHeight: 260, overflow: "auto" }}>
            {log.map((l, i) => (
              <li key={i} style={{ padding: "6px 0", borderBottom: "1px solid #e2e8f0" }}>{l}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card" style={{ gridColumn: "1 / -1" }}>
        <div className="note">
          Tip: Your Excel should include at least an "email" column. Add any other columns (like "name", "company", "message") and reference them in templates with Mustache, e.g., {{"{{company}}"}}.
        </div>
      </section>
    </div>
  );
}
