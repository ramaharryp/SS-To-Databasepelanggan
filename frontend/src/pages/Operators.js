import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiErrorDetail } from "../lib/api";
import { formatDateShortID } from "../lib/format";
import { UserPlus, Loader2, ShieldCheck, User, X } from "lucide-react";

export default function Operators() {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/operators");
      setOperators(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createOperator = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/operators", form);
      toast.success(`Operator ${form.email} berhasil dibuat`);
      setShowModal(false);
      setForm({ name: "", email: "", password: "" });
      load();
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || "Gagal membuat operator");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (op) => {
    try {
      await api.patch(`/operators/${op.id}/toggle`);
      toast.success(op.active ? "Operator dinonaktifkan" : "Operator diaktifkan");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div className="space-y-6 animate-fade-up" data-testid="operators-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-ink">Kelola Operator</h1>
          <p className="mt-1 text-sm text-ink-soft">Buat dan atur akun operator yang bisa mengunggah serta mengelola data.</p>
        </div>
        <button
          data-testid="operator-create-button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-terracotta px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-terracotta-hover active:scale-[0.98] w-fit"
        >
          <UserPlus className="h-4 w-4" /> Tambah Operator
        </button>
      </div>

      <div className="overflow-x-auto thin-scroll rounded-2xl border border-line bg-surface">
        <table data-testid="operators-table" className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-subtle text-left">
              {["Nama", "Email", "Peran", "Dibuat", "Status", "Aksi"].map((h) => (
                <th key={h} className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-ink-soft whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="border-t border-line">
                  {[...Array(6)].map((__, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-3.5 w-24 animate-pulse rounded bg-surface-hover" /></td>
                  ))}
                </tr>
              ))
            ) : (
              operators.map((op, i) => (
                <tr key={op.id} data-testid={`operator-row-${i}`} className="border-t border-line hover:bg-surface-subtle/60">
                  <td className="px-4 py-3.5 font-semibold text-ink whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      {op.role === "owner" ? <ShieldCheck className="h-4 w-4 text-terracotta" /> : <User className="h-4 w-4 text-ink-muted" />}
                      {op.name}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-ink-soft whitespace-nowrap">{op.email}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${op.role === "owner" ? "bg-terracotta-subtle text-terracotta" : "bg-pine-subtle text-pine"}`}>
                      {op.role === "owner" ? "Pemilik" : "Operator"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-ink-muted whitespace-nowrap">{formatDateShortID(op.created_at)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${op.active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                      {op.active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {op.role !== "owner" ? (
                      <button
                        onClick={() => toggle(op)}
                        data-testid={`operator-toggle-${i}`}
                        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft transition-all hover:border-terracotta hover:text-terracotta"
                      >
                        {op.active ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-bold text-ink">Tambah Operator Baru</h2>
              <button onClick={() => setShowModal(false)} className="text-ink-muted hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={createOperator} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">Nama</label>
                <input
                  data-testid="operator-name-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nama operator"
                  className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">Email</label>
                <input
                  data-testid="operator-email-input"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="operator@petapembeli.id"
                  className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">Kata Sandi</label>
                <input
                  data-testid="operator-password-input"
                  type="text"
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimal 6 karakter"
                  className="w-full rounded-xl border border-line bg-paper px-4 py-2.5 text-sm text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
                />
              </div>
              {error && <div data-testid="operator-error" className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600">{error}</div>}
              <button
                type="submit"
                data-testid="operator-submit-button"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-terracotta-hover active:scale-[0.98] disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? "Menyimpan..." : "Buat Operator"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
