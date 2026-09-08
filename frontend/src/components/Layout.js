import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ScanLine, Database, Users, LogOut, MapPinned } from "lucide-react";

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { to: "/upload", label: "Upload & Ekstraksi", icon: ScanLine, testId: "nav-upload-link" },
    { to: "/database", label: "Database Pelanggan", icon: Database, testId: "nav-database-link" },
  ];
  if (user?.role === "owner") {
    navItems.push({ to: "/operators", label: "Kelola Operator", icon: Users, testId: "nav-operators-link" });
  }

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-terracotta text-white shadow-sm">
                <MapPinned className="h-5 w-5" />
              </div>
              <div className="leading-tight">
                <div className="font-heading text-lg font-extrabold tracking-tight text-ink">PetaPembeli</div>
                <div className="text-[11px] font-medium text-ink-muted">Database pelanggan dari screenshot</div>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  data-testid={item.testId}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? "bg-terracotta text-white shadow-sm"
                        : "text-ink-soft hover:bg-surface-hover hover:text-ink"
                    }`
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right leading-tight">
                <div className="text-sm font-semibold text-ink">{user?.name}</div>
                <div className="text-[11px] font-medium text-ink-muted capitalize">
                  {user?.role === "owner" ? "Pemilik" : "Operator"}
                </div>
              </div>
              <button
                onClick={handleLogout}
                data-testid="logout-button"
                className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink-soft transition-all duration-200 hover:border-terracotta hover:text-terracotta active:scale-[0.98]"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>
          </div>

          {/* Mobile nav */}
          <nav className="flex md:hidden items-center gap-1 pb-3 -mt-1 overflow-x-auto thin-scroll">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                    isActive ? "bg-terracotta text-white" : "text-ink-soft bg-surface-subtle"
                  }`
                }
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</main>
    </div>
  );
};
