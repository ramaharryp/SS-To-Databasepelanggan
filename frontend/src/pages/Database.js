import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "../lib/api";
import { formatDateShortID, formatDateID } from "../lib/format";
import {
  Search, RefreshCw, Users, Repeat, Package, Filter, Download, MessageCircle,
  Pencil, Trash2, X, Loader2, ChevronRight, MapPin,
} from "lucide-react";

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = {
    terracotta: "bg-terracotta-subtle text-terracotta",
    pine: "bg-pine-subtle text-pine",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5 flex items-center gap-4">
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-heading text-2xl font-extrabold text-ink font-mono-num">{value}</div>
        <div className="text-xs font-medium text-ink-muted">{label}</div>
      </div>
    </div>
  );
}

const EDIT_FIELDS = [
  { key: "recipient_name", label: "Nama Penerima" },
  { key: "tiktok_username", label: "Username TikTok" },
  { key: "phone", label: "No. HP (+62)" },
  { key: "affiliate_creator", label: "Kreator Afiliasi" },
  { key: "address_detail", label: "Alamat Detail", full: true },
  { key: "kelurahan", label: "Kelurahan" },
  { key: "kecamatan", label: "Kecamatan" },
  { key: "kota", label: "Kota/Kabupaten" },
  { key: "provinsi", label: "Provinsi" },
  { key: "negara", label: "Negara" },
];

export default function Database() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [provinsi, setProvinsi] = useState("");
  const [kota, setKota] = useState("");
  const [affiliate, setAffiliate] = useState("");
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [filters, setFilters] = useState({ provinsi: [], kota: [], affiliate: [] });
  const [stats, setStats] = useState({ total_customers: 0, repeat_customers: 0, total_orders: 0 });
  const [exporting, setExporting] = useState(false);

  const [editing, setEditing] = useState(null); // customer object
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleting, setDeleting] = useState(null); // customer object
  const [historyFor, setHistoryFor] = useState(null); // customer object
  const [history, setHistory] = useState(null);

  const buildParams = useCallback(
    () => ({ search, provinsi, kota, affiliate, repeat_only: repeatOnly }),
    [search, provinsi, kota, affiliate, repeatOnly]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: rows }, { data: st }] = await Promise.all([
        api.get("/customers", { params: buildParams() }),
        api.get("/stats"),
      ]);
      setCustomers(rows);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const loadFilters = useCallback(() => {
    api.get("/customers/filters").then(({ data }) => setFilters(data)).catch(() => {});
  }, []);

  useEffect(() => { loadFilters(); }, [loadFilters]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const exportData = async (format) => {
    setExporting(true);
    try {
      const res = await api.get("/customers/export", {
        params: { ...buildParams(), format },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 10);
      a.download = `database_pelanggan_${ts}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Data diekspor ke ${format.toUpperCase()}`);
    } catch (err) {
      toast.error("Gagal mengekspor data");
    } finally {
      setExporting(false);
    }
  };

  const openHistory = async (c) => {
    setHistoryFor(c);
    setHistory(null);
    try {
      const { data } = await api.get(`/customers/${c.id}/orders`);
      setHistory(data.orders);
    } catch {
      setHistory([]);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setEditError("");
    setSavingEdit(true);
    try {
      await api.put(`/customers/${editing.id}`, editing);
      toast.success("Data pelanggan diperbarui");
      setEditing(null);
      load();
      loadFilters();
    } catch (err) {
      setEditError(formatApiErrorDetail(err.response?.data?.detail) || "Gagal memperbarui");
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/customers/${deleting.id}`);
      toast.success("Pelanggan dihapus");
      setDeleting(null);
      load();
      loadFilters();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  const waLink = (phone) => `https://wa.me/${(phone || "").replace(/\D/g, "")}`;

  const selectCls =
    "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-all focus:border-terracotta focus:ring-2 focus:ring-terracotta/20";

  return (
    <div className="space-y-6 animate-fade-up" data-testid="database-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-ink">Database Pelanggan</h1>
          <p className="mt-1 text-sm text-ink-soft">Data terdeduplikasi berdasarkan nomor HP. Klik baris untuk melihat riwayat pesanan.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-line bg-surface overflow-hidden">
            <button
              onClick={() => exportData("xlsx")}
              disabled={exporting || customers.length === 0}
              data-testid="export-xlsx-button"
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold text-ink-soft transition-all hover:bg-surface-hover hover:text-terracotta disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Excel
            </button>
            <span className="h-6 w-px bg-line" />
            <button
              onClick={() => exportData("csv")}
              disabled={exporting || customers.length === 0}
              data-testid="export-csv-button"
              className="px-3.5 py-2.5 text-sm font-semibold text-ink-soft transition-all hover:bg-surface-hover hover:text-terracotta disabled:opacity-50"
            >
              CSV
            </button>
          </div>
          <button
            onClick={load}
            data-testid="refresh-button"
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft transition-all hover:border-terracotta hover:text-terracotta active:scale-[0.98]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Segarkan</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Total Pelanggan" value={stats.total_customers} tone="terracotta" />
        <StatCard icon={Repeat} label="Pembeli Berulang" value={stats.repeat_customers} tone="amber" />
        <StatCard icon={Package} label="Total Pesanan" value={stats.total_orders} tone="pine" />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
          <input
            data-testid="customer-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, nomor HP, atau username TikTok..."
            className="w-full rounded-xl border border-line bg-paper pl-10 pr-4 py-3 text-sm text-ink outline-none transition-all focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted"><Filter className="h-3.5 w-3.5" /> Filter</span>
          <select data-testid="filter-provinsi" value={provinsi} onChange={(e) => setProvinsi(e.target.value)} className={selectCls}>
            <option value="">Semua Provinsi</option>
            {filters.provinsi.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select data-testid="filter-kota" value={kota} onChange={(e) => setKota(e.target.value)} className={selectCls}>
            <option value="">Semua Kota/Kab.</option>
            {filters.kota.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select data-testid="filter-affiliate" value={affiliate} onChange={(e) => setAffiliate(e.target.value)} className={selectCls}>
            <option value="">Semua Kreator</option>
            {filters.affiliate.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button
            data-testid="filter-repeat-toggle"
            onClick={() => setRepeatOnly((v) => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] ${
              repeatOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-line bg-surface text-ink-soft hover:border-terracotta hover:text-terracotta"
            }`}
          >
            <Repeat className="h-4 w-4" /> Pembeli Berulang
          </button>
          {(search || provinsi || kota || affiliate || repeatOnly) && (
            <button
              onClick={() => { setSearch(""); setProvinsi(""); setKota(""); setAffiliate(""); setRepeatOnly(false); }}
              className="text-sm font-medium text-ink-muted hover:text-terracotta"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto thin-scroll rounded-2xl border border-line bg-surface">
        <table data-testid="customer-table" className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-subtle text-left">
              {["Nama Penerima", "Username TikTok", "No. HP", "Kecamatan", "Kota/Kab.", "Provinsi", "Kreator Afiliasi", "Pesanan", "Pertama", "Terakhir", "Status", "Aksi"].map((h) => (
                <th key={h} className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-ink-soft whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="border-t border-line">
                  {[...Array(12)].map((__, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3.5 w-full max-w-[100px] animate-pulse rounded bg-surface-hover" /></td>
                  ))}
                </tr>
              ))
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center">
                  <Users className="mx-auto h-8 w-8 text-ink-muted/50" />
                  <p className="mt-3 font-heading font-semibold text-ink">Belum ada pelanggan</p>
                  <p className="mt-1 text-sm text-ink-muted">Unggah screenshot di menu "Upload & Ekstraksi" untuk mulai membangun database.</p>
                </td>
              </tr>
            ) : (
              customers.map((c, i) => (
                <tr
                  key={c.id}
                  data-testid={`customer-row-${i}`}
                  onClick={() => openHistory(c)}
                  className="group cursor-pointer border-t border-line transition-colors hover:bg-surface-subtle/60"
                >
                  <td className="px-4 py-3.5 font-semibold text-ink whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <ChevronRight className="h-3.5 w-3.5 text-ink-muted/50 transition-transform group-hover:translate-x-0.5 group-hover:text-terracotta" />
                      {c.recipient_name || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-ink-soft whitespace-nowrap">{c.tiktok_username || "-"}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {c.phone ? (
                      <a
                        href={waLink(c.phone)}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`whatsapp-link-${i}`}
                        className="inline-flex items-center gap-1.5 font-mono-num text-ink-soft transition-colors hover:text-emerald-600"
                      >
                        <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
                        {c.phone}
                      </a>
                    ) : "-"}
                  </td>
                  <td className="px-4 py-3.5 text-ink-soft whitespace-nowrap">{c.kecamatan || "-"}</td>
                  <td className="px-4 py-3.5 text-ink-soft whitespace-nowrap">{c.kota || "-"}</td>
                  <td className="px-4 py-3.5 text-ink-soft whitespace-nowrap">{c.provinsi || "-"}</td>
                  <td className="px-4 py-3.5 text-ink-soft whitespace-nowrap">{c.affiliate_creator || "-"}</td>
                  <td className="px-4 py-3.5 text-center font-mono-num font-semibold text-ink">{c.order_count}</td>
                  <td className="px-4 py-3.5 text-ink-muted whitespace-nowrap">{formatDateShortID(c.first_seen)}</td>
                  <td className="px-4 py-3.5 text-ink-muted whitespace-nowrap">{formatDateShortID(c.last_seen)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {c.is_repeat ? (
                      <span data-testid="repeat-buyer-badge" className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        <Repeat className="h-3 w-3" /> Pembeli Berulang
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-line bg-surface-subtle px-2.5 py-0.5 text-xs font-semibold text-ink-muted">Baru</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditing({ ...c })}
                        data-testid={`edit-customer-${i}`}
                        title="Edit"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition-all hover:border-terracotta hover:text-terracotta"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleting(c)}
                        data-testid={`delete-customer-${i}`}
                        title="Hapus"
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition-all hover:border-red-300 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && customers.length > 0 && (
        <p className="text-xs text-ink-muted px-1">Menampilkan {customers.length} pelanggan.</p>
      )}

      {/* Order history drawer */}
      {historyFor && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-sm" onClick={() => setHistoryFor(null)}>
          <div data-testid="history-drawer" className="h-full w-full max-w-md overflow-y-auto thin-scroll bg-surface shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-6 py-4">
              <div>
                <h2 className="font-heading text-lg font-bold text-ink">Riwayat Pesanan</h2>
                <p className="text-sm text-ink-soft">{historyFor.recipient_name} · {historyFor.tiktok_username}</p>
              </div>
              <button onClick={() => setHistoryFor(null)} className="text-ink-muted hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-3">
              {history === null ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-terracotta" /></div>
              ) : history.length === 0 ? (
                <p className="text-sm text-ink-muted text-center py-10">Tidak ada riwayat pesanan.</p>
              ) : (
                history.map((o, i) => (
                  <div key={o.id} data-testid={`order-item-${i}`} className="rounded-xl border border-line bg-paper p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-num text-xs font-semibold text-terracotta">{o.order_id || "Tanpa ID Pesanan"}</span>
                      {o.affiliate_creator && (
                        <span className="rounded-full bg-pine-subtle px-2 py-0.5 text-[11px] font-semibold text-pine">{o.affiliate_creator}</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-ink-muted">Waktu pembuatan: {o.created_at || "-"}</div>
                    {o.full_address_raw && (
                      <div className="mt-2 flex items-start gap-1.5 text-sm text-ink-soft">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
                        <span className="whitespace-pre-line">{o.full_address_raw}</span>
                      </div>
                    )}
                    <div className="mt-2 text-[11px] text-ink-muted">Disimpan {formatDateID(o.captured_at)} · oleh {o.captured_by}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-xl animate-fade-up max-h-[90vh] overflow-y-auto thin-scroll" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-bold text-ink">Edit Pelanggan</h2>
              <button onClick={() => setEditing(null)} className="text-ink-muted hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {EDIT_FIELDS.map((f) => (
                <div key={f.key} className={f.full ? "sm:col-span-2" : ""}>
                  <label className="block text-sm font-semibold text-ink mb-1.5">{f.label}</label>
                  {f.full ? (
                    <textarea
                      data-testid={`edit-field-${f.key}`}
                      value={editing[f.key] || ""}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                      rows={2}
                      className="w-full resize-y rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
                    />
                  ) : (
                    <input
                      data-testid={`edit-field-${f.key}`}
                      value={editing[f.key] || ""}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                      className={`w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20 ${f.key === "phone" ? "font-mono-num" : ""}`}
                    />
                  )}
                </div>
              ))}
              {editError && <div className="sm:col-span-2 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600">{editError}</div>}
              <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft hover:border-terracotta hover:text-terracotta">Batal</button>
                <button
                  type="submit"
                  data-testid="edit-save-button"
                  disabled={savingEdit}
                  className="flex items-center gap-2 rounded-xl bg-terracotta px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-terracotta-hover active:scale-[0.98] disabled:opacity-60"
                >
                  {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4" onClick={() => setDeleting(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-500"><Trash2 className="h-5 w-5" /></div>
            <h2 className="mt-4 font-heading text-lg font-bold text-ink">Hapus pelanggan?</h2>
            <p className="mt-1.5 text-sm text-ink-soft">
              Data <span className="font-semibold text-ink">{deleting.recipient_name}</span> beserta {deleting.order_count} riwayat pesanannya akan dihapus permanen.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft hover:border-ink/30">Batal</button>
              <button
                onClick={confirmDelete}
                data-testid="confirm-delete-button"
                className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-600 active:scale-[0.98]"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
