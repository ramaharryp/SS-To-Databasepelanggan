import "./index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Upload from "./pages/Upload";
import Database from "./pages/Database";
import Operators from "./pages/Operators";
import { Loader2 } from "lucide-react";

function Protected({ children, ownerOnly }) {
  const { user, loading } = useAuth();
  if (loading || user === null) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-terracotta" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (ownerOnly && user.role !== "owner") return <Navigate to="/upload" replace />;
  return <Layout>{children}</Layout>;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading || user === null) return null;
  if (user) return <Navigate to="/upload" replace />;
  return <Login />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/upload" element={<Protected><Upload /></Protected>} />
          <Route path="/database" element={<Protected><Database /></Protected>} />
          <Route path="/operators" element={<Protected ownerOnly><Operators /></Protected>} />
          <Route path="*" element={<Navigate to="/upload" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
