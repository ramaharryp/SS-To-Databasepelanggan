import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiErrorDetail } from "../lib/api";
import { MapPinned, Loader2, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/upload");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl grid lg:grid-cols-2 rounded-3xl overflow-hidden border border-line bg-surface shadow-[0_20px_60px_-30px_rgba(31,36,33,0.35)]">
        {/* Brand panel */}
        <div className="hidden lg:flex flex-col justify-between bg-ink p-10 text-paper relative overflow-hidden">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-terracotta/25 blur-2xl" />
          <div className="absolute -left-10 bottom-10 h-40 w-40 rounded-full bg-pine/30 blur-2xl" />
          <div className="relative flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-terracotta text-white">
              <MapPinned className="h-5 w-5" />
            </div>
            <span className="font-heading text-xl font-extrabold">PetaPembeli</span>
          </div>
          <div className="relative space-y-4">
            <h1 className="font-heading text-4xl font-extrabold leading-tight">
              Ubah screenshot pesanan jadi database pelanggan.
            </h1>
            <p className="text-paper/70 text-base leading-relaxed">
              Unggah tangkapan layar detail pesanan TikTok Shop, biarkan AI membaca datanya, koreksi
              sekejap, lalu simpan. Otomatis rapi, tanpa ketik ulang.
            </p>
          </div>
          <div className="relative flex gap-6 text-sm text-paper/60">
            <div><span className="font-heading text-2xl font-bold text-terracotta">1.</span> Unggah</div>
            <div><span className="font-heading text-2xl font-bold text-terracotta">2.</span> Koreksi</div>
            <div><span className="font-heading text-2xl font-bold text-terracotta">3.</span> Simpan</div>
          </div>
        </div>

        {/* Form */}
        <div className="p-8 sm:p-12 flex flex-col justify-center">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-terracotta text-white">
              <MapPinned className="h-5 w-5" />
            </div>
            <span className="font-heading text-xl font-extrabold text-ink">PetaPembeli</span>
          </div>

          <h2 className="font-heading text-2xl font-bold text-ink">Masuk ke akun Anda</h2>
          <p className="mt-1.5 text-sm text-ink-soft">Gunakan email dan kata sandi yang diberikan.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5">Email</label>
              <input
                data-testid="login-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@petapembeli.id"
                className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink outline-none transition-all focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5">Kata Sandi</label>
              <div className="relative">
                <input
                  data-testid="login-password-input"
                  type={show ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-line bg-paper px-4 py-3 pr-11 text-sm text-ink outline-none transition-all focus:border-terracotta focus:ring-2 focus:ring-terracotta/20"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  tabIndex={-1}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div data-testid="login-error" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-medium text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              data-testid="login-submit-button"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-terracotta px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-terracotta-hover active:scale-[0.98] disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Memproses..." : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
