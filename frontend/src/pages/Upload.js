import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "../lib/api";
import {
  UploadCloud, Loader2, X, ScanLine, Save, Trash2, ImageIcon, AlertTriangle, CheckCircle2, Eye,
} from "lucide-react";

const FIELD_LABELS = [
  { key: "order_id", label: "ID Pesanan", w: "min-w-[150px]" },
  { key: "created_at", label: "Waktu Pembuatan", w: "min-w-[170px]" },
  { key: "tiktok_username", label: "Username TikTok", w: "min-w-[150px]" },
  { key: "recipient_name", label: "Nama Penerima", w: "min-w-[150px]" },
  { key: "phone", label: "No. HP (+62)", w: "min-w-[150px]" },
  { key: "affiliate_creator", label: "Kreator Afiliasi", w: "min-w-[140px]" },
  { key: "address_detail", label: "Alamat Detail", w: "min-w-[220px]" },
  { key: "kelurahan", label: "Kelurahan", w: "min-w-[130px]" },
  { key: "kecamatan", label: "Kecamatan", w: "min-w-[130px]" },
  { key: "kota", label: "Kota/Kab.", w: "min-w-[130px]" },
  { key: "provinsi", label: "Provinsi", w: "min-w-[130px]" },
  { key: "negara", label: "Negara", w: "min-w-[110px]" },
];

const LOW_CONF = 0.85;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Upload() {
  const [files, setFiles] = useState([]); // {id, file, preview}
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [rows, setRows] = useState(null); // extracted review rows
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const addFiles = useCallback((fileList) => {
    const imgs = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    const mapped = imgs.map((f) => ({
      id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`,
      file: f,
      preview: URL.createObjectURL(f),
    }));
    setFiles((prev) => [...prev, ...mapped]);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const removeFile = (id) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const CHUNK = 5;

  const startExtraction = async () => {
    if (files.length === 0) return;
    setExtracting(true);
    setProgress({ done: 0, total: files.length });
    const collected = [];
    try {
      for (let start = 0; start < files.length; start += CHUNK) {
        const batch = files.slice(start, start + CHUNK);
        const images = await Promise.all(batch.map((f) => fileToDataUrl(f.file)));
        const { data } = await api.post("/extract", { images });
        data.results.forEach((r, j) => {
          const src = batch[j];
          collected.push({
            _rid: src?.id || `r-${start + j}`,
            preview: src?.preview,
            fields: r.fields,
            confidence: r.confidence,
            verified: false,
            error: r.error,
          });
        });
        setProgress({ done: Math.min(start + CHUNK, files.length), total: files.length });
      }
      setRows(collected);
      const ok = collected.filter((r) => !r.error).length;
      toast.success(`Berhasil mengekstrak ${ok} dari ${collected.length} gambar`);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Gagal mengekstrak gambar");
    } finally {
      setExtracting(false);
    }
  };

  const updateField = (rid, key, value) => {
    setRows((prev) =>
      prev.map((r) =>
        r._rid === rid
          ? { ...r, fields: { ...r.fields, [key]: value }, confidence: { ...r.confidence, [key]: 1 } }
          : r
      )
    );
  };

  const toggleVerified = (rid) =>
    setRows((prev) => prev.map((r) => (r._rid === rid ? { ...r, verified: !r.verified } : r)));

  const removeRow = (rid) => setRows((prev) => prev.filter((r) => r._rid !== rid));

  const resetAll = () => {
    files.forEach((f) => URL.revokeObjectURL(f.preview));
    setFiles([]);
    setRows(null);
  };

  const saveToDatabase = async () => {
    if (!rows) return;
    const payload = rows.filter((r) => r.fields.phone).map((r) => r.fields);
    const missingPhone = rows.length - payload.length;
    if (payload.length === 0) {
      toast.error("Tidak ada baris dengan nomor HP yang valid untuk disimpan");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/customers/save", { rows: payload });
      let msg = `${data.saved} data disimpan — ${data.new_customers} pelanggan baru, ${data.repeat_customers} pembeli berulang`;
      if (missingPhone > 0) msg += ` (${missingPhone} baris dilewati karena tanpa HP)`;
      toast.success(msg);
      resetAll();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Gagal menyimpan data");
    } finally {
      setSaving(false);
    }
  };

  const lowCount = rows
    ? rows.reduce((acc, r) => acc + FIELD_LABELS.filter((f) => (r.confidence[f.key] ?? 0) < LOW_CONF && f.key !== "affiliate_creator").length, 0)
    : 0;

  return (
    <div className="space-y-6 animate-fade-up" data-testid="upload-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-ink">Upload & Ekstraksi</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Seret satu atau banyak tangkapan layar detail pesanan TikTok Shop. AI akan membaca datanya untuk Anda koreksi.
        </p>
      </div>

      {/* Dropzone */}
      {!rows && (
        <div className="space-y-4">
          <div
            data-testid="upload-dropzone"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all duration-200 ${
              dragOver ? "border-terracotta bg-terracotta-subtle" : "border-line bg-surface hover:border-terracotta/60 hover:bg-surface-subtle"
            }`}
          >
            <input
              ref={inputRef}
              data-testid="upload-file-input"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-terracotta-subtle text-terracotta">
              <UploadCloud className="h-7 w-7" />
            </div>
            <p className="mt-4 font-heading text-lg font-semibold text-ink">Seret gambar ke sini</p>
            <p className="mt-1 text-sm text-ink-soft">atau klik untuk memilih dari perangkat Anda (bisa banyak sekaligus)</p>
            <p className="mt-3 text-xs text-ink-muted">Format PNG / JPG • Hingga 60 gambar per antrean</p>
          </div>

          {files.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <ImageIcon className="h-4 w-4 text-terracotta" />
                  {files.length} gambar siap diekstrak
                </div>
                <button onClick={resetAll} className="text-sm font-medium text-ink-muted hover:text-terracotta">
                  Hapus semua
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {files.map((f) => (
                  <div key={f.id} className="group relative aspect-[9/16] overflow-hidden rounded-xl border border-line bg-surface-subtle">
                    <img src={f.preview} alt="" className="h-full w-full object-cover" />
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {extracting && (
                <div className="mt-5" data-testid="extraction-progress">
                  <div className="flex items-center justify-between text-xs font-medium text-ink-soft mb-1.5">
                    <span>Mengekstrak antrean...</span>
                    <span className="font-mono-num">{progress.done}/{progress.total}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-hover">
                    <div
                      className="h-full rounded-full bg-terracotta transition-all duration-300"
                      style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                data-testid="start-extraction-button"
                onClick={startExtraction}
                disabled={extracting}
                className="mt-5 flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-terracotta px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-terracotta-hover active:scale-[0.98] disabled:opacity-60"
              >
                {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                {extracting ? "Mengekstrak data..." : `Mulai Ekstraksi (${files.length})`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Quick-correct review */}
      {rows && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-line bg-surface p-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span className="font-semibold text-ink">{rows.length} hasil ekstraksi</span>
              {lowCount > 0 ? (
                <span className="flex items-center gap-1.5 font-medium text-amber-600">
                  <AlertTriangle className="h-4 w-4" />
                  {lowCount} field perlu diperiksa
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" /> Semua field terbaca yakin
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={resetAll}
                className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft transition-all hover:border-terracotta hover:text-terracotta active:scale-[0.98]"
              >
                Batal
              </button>
              <button
                data-testid="save-database-button"
                onClick={saveToDatabase}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-terracotta-hover active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan ke Database
              </button>
            </div>
          </div>

          <p className="text-xs text-ink-muted -mt-1 px-1">
            Field bertanda merah = keyakinan AI rendah. Klik sel mana pun untuk mengoreksi sebelum menyimpan. Hanya baris ber-No. HP yang tersimpan.
          </p>

          <div className="overflow-x-auto thin-scroll rounded-2xl border border-line bg-surface">
            <table data-testid="quick-correct-table" className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface-subtle text-left">
                  <th className="sticky left-0 z-10 bg-surface-subtle px-3 py-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Screenshot</th>
                  {FIELD_LABELS.map((f) => (
                    <th key={f.key} className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-ink-soft whitespace-nowrap">{f.label}</th>
                  ))}
                  <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={r._rid} data-testid={`review-row-${ri}`} className={`border-t border-line ${r.verified ? "bg-pine-subtle/50" : ""}`}>
                    <td className="sticky left-0 z-10 bg-inherit px-3 py-2 align-top">
                      <a href={r.preview} target="_blank" rel="noreferrer" className="group relative block h-16 w-10 overflow-hidden rounded-lg border border-line">
                        <img src={r.preview} alt="" className="h-full w-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center bg-ink/40 opacity-0 transition-opacity group-hover:opacity-100">
                          <Eye className="h-4 w-4 text-white" />
                        </span>
                      </a>
                      {r.error && <div className="mt-1 text-[10px] font-medium text-red-500 max-w-[80px]">Gagal baca</div>}
                    </td>
                    {FIELD_LABELS.map((f) => {
                      const low = (r.confidence[f.key] ?? 0) < LOW_CONF && f.key !== "affiliate_creator";
                      const isTextarea = f.key === "address_detail";
                      return (
                        <td key={f.key} className={`px-2 py-2 align-top ${f.w}`}>
                          {isTextarea ? (
                            <textarea
                              data-testid={`field-${f.key}-${ri}`}
                              value={r.fields[f.key] || ""}
                              onChange={(e) => updateField(r._rid, f.key, e.target.value)}
                              rows={2}
                              className={`w-full resize-y rounded-lg border px-2.5 py-1.5 text-xs text-ink outline-none transition-all focus:ring-2 focus:ring-terracotta/20 ${
                                low ? "border-red-300 bg-red-50 focus:border-red-400" : "border-line bg-paper focus:border-terracotta"
                              }`}
                            />
                          ) : (
                            <input
                              data-testid={`field-${f.key}-${ri}`}
                              value={r.fields[f.key] || ""}
                              onChange={(e) => updateField(r._rid, f.key, e.target.value)}
                              className={`w-full rounded-lg border px-2.5 py-1.5 text-xs text-ink outline-none transition-all focus:ring-2 focus:ring-terracotta/20 ${
                                low ? "border-red-300 bg-red-50 focus:border-red-400" : "border-line bg-paper focus:border-terracotta"
                              } ${f.key === "phone" || f.key === "order_id" ? "font-mono-num" : ""}`}
                            />
                          )}
                          {low && <div className="mt-0.5 text-[10px] font-medium text-red-500">Periksa</div>}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 align-top">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleVerified(r._rid)}
                          title="Tandai terverifikasi"
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
                            r.verified ? "border-emerald-300 bg-emerald-50 text-emerald-600" : "border-line bg-surface text-ink-muted hover:text-emerald-600"
                          }`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => removeRow(r._rid)}
                          title="Hapus baris"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition-all hover:border-red-300 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
