import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ProtectedRoute, PublicOnlyRoute } from "./components/RouteGuards";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Tutor from "./pages/Tutor";
import MemoryPage from "./pages/dashboard/Memory";
import PatternsPage from "./pages/dashboard/Patterns";
import SessionsPage from "./pages/dashboard/Sessions";
import SessionDetailPage from "./pages/dashboard/SessionDetail";
import SourceDetailPage from "./pages/dashboard/SourceDetail";
import { Toaster } from "./components/Toaster";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <Login />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicOnlyRoute>
                <Signup />
              </PublicOnlyRoute>
            }
          />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute requireOnboarded={false}>
                <Onboarding />
              </ProtectedRoute>
            }
          />
          {/* More specific /dashboard/* routes first (defensive ordering). */}
          <Route
            path="/dashboard/graph"
            element={
              <ProtectedRoute requireOnboarded>
                <MemoryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/memory"
            element={<Navigate to="/dashboard/graph" replace />}
          />
          <Route
            path="/graph"
            element={<Navigate to="/dashboard/graph" replace />}
          />
          <Route
            path="/dashboard/patterns"
            element={
              <ProtectedRoute requireOnboarded>
                <PatternsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/sessions"
            element={
              <ProtectedRoute requireOnboarded>
                <SessionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/sessions/:id"
            element={
              <ProtectedRoute requireOnboarded>
                <SessionDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/sources/:id"
            element={
              <ProtectedRoute requireOnboarded>
                <SourceDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requireOnboarded>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tutor"
            element={
              <ProtectedRoute requireOnboarded>
                <Tutor />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}
