import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { formatDateShortID } from "../lib/format";
import { Search, RefreshCw, Users, Repeat, Package, Filter } from "lucide-react";

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { search, provinsi, kota, affiliate, repeat_only: repeatOnly };
      const [{ data: rows }, { data: st }] = await Promise.all([
        api.get("/customers", { params }),
        api.get("/stats"),
      ]);
      setCustomers(rows);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }, [search, provinsi, kota, affiliate, repeatOnly]);

  useEffect(() => {
    api.get("/customers/filters").then(({ data }) => setFilters(data)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const selectCls =
    "rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-all focus:border-terracotta focus:ring-2 focus:ring-terracotta/20";

  return (
    <div className="space-y-6 animate-fade-up" data-testid="database-page">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-ink">Database Pelanggan</h1>
          <p className="mt-1 text-sm text-ink-soft">Data terdeduplikasi berdasarkan nomor HP. Pembeli berulang ditandai otomatis.</p>
        </div>
        <button
          onClick={load}
          data-testid="refresh-button"
          className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft transition-all hover:border-terracotta hover:text-terracotta active:scale-[0.98] w-fit"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Segarkan
        </button>
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
              {["Nama Penerima", "Username TikTok", "No. HP", "Kecamatan", "Kota/Kab.", "Provinsi", "Kreator Afiliasi", "Pesanan", "Pertama", "Terakhir", "Status"].map((h) => (
                <th key={h} className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-ink-soft whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="border-t border-line">
                  {[...Array(11)].map((__, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3.5 w-full max-w-[100px] animate-pulse rounded bg-surface-hover" /></td>
                  ))}
                </tr>
              ))
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-16 text-center">
                  <Users className="mx-auto h-8 w-8 text-ink-muted/50" />
                  <p className="mt-3 font-heading font-semibold text-ink">Belum ada pelanggan</p>
                  <p className="mt-1 text-sm text-ink-muted">Unggah screenshot di menu "Upload & Ekstraksi" untuk mulai membangun database.</p>
                </td>
              </tr>
            ) : (
              customers.map((c, i) => (
                <tr key={c.id} data-testid={`customer-row-${i}`} className="border-t border-line transition-colors hover:bg-surface-subtle/60">
                  <td className="px-4 py-3.5 font-semibold text-ink whitespace-nowrap">{c.recipient_name || "-"}</td>
                  <td className="px-4 py-3.5 text-ink-soft whitespace-nowrap">{c.tiktok_username || "-"}</td>
                  <td className="px-4 py-3.5 font-mono-num text-ink-soft whitespace-nowrap">{c.phone || "-"}</td>
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && customers.length > 0 && (
        <p className="text-xs text-ink-muted px-1">Menampilkan {customers.length} pelanggan.</p>
      )}
    </div>
  );
}
