import { useState, useEffect, lazy } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
} from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { supabase } from "./lib/supabase";
import type { AuthContextType, UserProfile } from "./hooks/useAuthContext";
import { ToastProvider } from "./components/ui/Toast";
import Header from "./components/Header";
import { CostStatusBanner } from "./components/CostStatusBanner";
import { AuthContextProvider } from "./hooks/useAuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

// Synchronous imports for critical path components (login + landing page)
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";

// Lazy-loaded page components for route-based code splitting
// Discovery pages - share common discovery patterns
const Discover = lazy(() => import("./pages/Discover"));
const DiscoveryQueue = lazy(() => import("./pages/DiscoveryQueue"));
const DiscoveryHistory = lazy(() => import("./pages/DiscoveryHistory"));
const ForYou = lazy(() => import("./pages/ForYou"));

// Card visualization pages - share React Flow and related viz libraries
const CardDetail = lazy(() => import("./pages/CardDetail"));
const Compare = lazy(() => import("./pages/Compare"));

// Workstream pages - share workstream components
const Workstreams = lazy(() => import("./pages/Workstreams"));
const WorkstreamFeed = lazy(() => import("./pages/WorkstreamFeed"));
const WorkstreamKanban = lazy(() => import("./pages/WorkstreamKanban"));
const WorkstreamPortfolios = lazy(() => import("./pages/WorkstreamPortfolios"));
const PortfolioDetail = lazy(() => import("./pages/PortfolioDetail"));
const Portfolios = lazy(() => import("./pages/Portfolios"));
const InviteAccept = lazy(() => import("./pages/InviteAccept"));
const PublicShareViewer = lazy(() => import("./pages/PublicShareViewer"));
const Notifications = lazy(() => import("./pages/Notifications"));

// Standalone pages
const Settings = lazy(() => import("./pages/Settings"));
const Analytics = lazy(() => import("./pages/AnalyticsV2"));
const Methodology = lazy(() => import("./pages/Methodology"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const Signals = lazy(() => import("./pages/Signals"));
const TagDetail = lazy(() => import("./pages/TagDetail"));
const Patterns = lazy(() => import("./pages/Patterns"));
const PatternDetail = lazy(() => import("./pages/PatternDetail"));
const AskForesight = lazy(() => import("./pages/AskForesight"));
const Feeds = lazy(() => import("./pages/Feeds"));
const AdminConsole = lazy(() => import("./pages/AdminConsole"));

// Guide pages
const GuideSignals = lazy(() => import("./pages/GuideSignals"));
const GuideDiscover = lazy(() => import("./pages/GuideDiscover"));
const GuideWorkstreams = lazy(() => import("./pages/GuideWorkstreams"));

function CardRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  return (
    <Navigate
      to={`/signals/${slug || ""}${location.search}`}
      state={location.state}
      replace
    />
  );
}

function LoginRoute({ user }: { user: User | null }) {
  const location = useLocation();
  const requestedRedirect =
    new URLSearchParams(location.search).get("redirect") || "/";
  // Reject protocol-relative ("//host") and absolute-URL redirects.
  // React Router treats `//host` as in-app today, but if anyone later
  // swaps Navigate for window.location.assign this becomes an open
  // redirect — guard at the source.
  const isInternal =
    requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//");
  const redirect = isInternal ? requestedRedirect : "/";
  return user ? <Navigate to={redirect} replace /> : <Login />;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (nextUser: User | null) => {
    if (!nextUser) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from("users")
      .select("id, email, display_name, role, account_type")
      .eq("id", nextUser.id)
      .single();
    setProfile(
      data
        ? { ...data, account_type: data.account_type || "paid" }
        : {
            id: nextUser.id,
            email: nextUser.email || "",
            account_type: "paid",
          },
    );
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      await loadProfile(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      loadProfile(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const authValue: AuthContextType = {
    user,
    profile,
    loading,
    signIn,
    signOut,
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-faded-white dark:bg-brand-dark-blue">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-blue mx-auto"></div>
          <p className="mt-4 text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <ToastProvider>
        <AuthContextProvider value={authValue}>
          <Router
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <div className="min-h-screen bg-brand-faded-white dark:bg-brand-dark-blue transition-colors">
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-brand-blue focus:text-white focus:p-3 focus:rounded-md"
              >
                Skip to main content
              </a>
              {user && <Header />}
              <main id="main-content" className={user ? "pt-16" : ""}>
                {user && <CostStatusBanner />}
                <Routes>
                  {/* Login route - public, redirects to home if already authenticated */}
                  <Route path="/login" element={<LoginRoute user={user} />} />
                  <Route path="/share/:token" element={<PublicShareViewer />} />
                  <Route
                    path="/shared/:token"
                    element={<PublicShareViewer />}
                  />
                  <Route
                    path="/invite/:token"
                    element={
                      <ProtectedRoute
                        element={<InviteAccept />}
                        loadingMessage="Loading invitation..."
                      />
                    }
                  />

                  {/* Dashboard - synchronous landing page (critical path) */}
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute
                        element={<Dashboard />}
                        withSuspense={false}
                      />
                    }
                  />

                  {/* Discovery pages - lazy-loaded with Suspense */}
                  <Route
                    path="/discover"
                    element={
                      <ProtectedRoute
                        element={<Discover />}
                        loadingMessage="Loading discovery..."
                      />
                    }
                  />
                  <Route
                    path="/discover/queue"
                    element={
                      <ProtectedRoute
                        element={<DiscoveryQueue />}
                        loadingMessage="Loading queue..."
                      />
                    }
                  />
                  <Route
                    path="/for-you"
                    element={
                      <ProtectedRoute
                        element={<ForYou />}
                        loadingMessage="Loading recommendations..."
                      />
                    }
                  />
                  <Route
                    path="/discover/history"
                    element={
                      <ProtectedRoute
                        element={<DiscoveryHistory />}
                        loadingMessage="Loading history..."
                      />
                    }
                  />

                  {/* Signal pages */}
                  <Route
                    path="/signals/:slug"
                    element={
                      <ProtectedRoute
                        element={<CardDetail />}
                        loadingMessage="Loading signal details..."
                      />
                    }
                  />
                  <Route
                    path="/signals"
                    element={
                      <ProtectedRoute
                        element={<Signals />}
                        loadingMessage="Loading signals..."
                      />
                    }
                  />

                  {/* Community-tag detail (all cards carrying a tag) */}
                  <Route
                    path="/tags/:slug"
                    element={
                      <ProtectedRoute
                        element={<TagDetail />}
                        loadingMessage="Loading tagged signals..."
                      />
                    }
                  />

                  {/* Ask Foresight - AI chat interface */}
                  <Route
                    path="/ask"
                    element={
                      <ProtectedRoute
                        element={<AskForesight />}
                        loadingMessage="Loading Ask Foresight..."
                      />
                    }
                  />

                  {/* AI-detected patterns */}
                  <Route
                    path="/patterns"
                    element={
                      <ProtectedRoute
                        element={<Patterns />}
                        loadingMessage="Loading patterns..."
                      />
                    }
                  />
                  <Route
                    path="/patterns/:id"
                    element={
                      <ProtectedRoute
                        element={<PatternDetail />}
                        loadingMessage="Loading pattern..."
                      />
                    }
                  />

                  {/* Legacy card routes - redirect to signals */}
                  <Route
                    path="/cards/:slug"
                    element={
                      <ProtectedRoute
                        element={<CardRedirect />}
                        withSuspense={false}
                      />
                    }
                  />

                  {/* Comparison page - lazy-loaded with React Flow */}
                  <Route
                    path="/compare"
                    element={
                      <ProtectedRoute
                        element={<Compare />}
                        loadingMessage="Loading comparison..."
                      />
                    }
                  />

                  {/* Workstream pages - lazy-loaded */}
                  <Route
                    path="/workstreams/:id/board"
                    element={
                      <ProtectedRoute
                        element={<WorkstreamKanban />}
                        loadingMessage="Loading kanban board..."
                      />
                    }
                  />
                  <Route
                    path="/workstreams/:id/portfolios"
                    element={
                      <ProtectedRoute
                        element={<WorkstreamPortfolios />}
                        loadingMessage="Loading portfolios..."
                      />
                    }
                  />
                  <Route
                    path="/workstreams/:id/portfolios/:portfolioId"
                    element={
                      <ProtectedRoute
                        element={<PortfolioDetail />}
                        loadingMessage="Loading portfolio..."
                      />
                    }
                  />
                  <Route
                    path="/portfolios"
                    element={
                      <ProtectedRoute
                        element={<Portfolios />}
                        loadingMessage="Loading portfolios..."
                      />
                    }
                  />
                  <Route
                    path="/portfolios/:portfolioId"
                    element={
                      <ProtectedRoute
                        element={<PortfolioDetail />}
                        loadingMessage="Loading portfolio..."
                      />
                    }
                  />
                  <Route
                    path="/workstreams"
                    element={
                      <ProtectedRoute
                        element={<Workstreams />}
                        loadingMessage="Loading workstreams..."
                      />
                    }
                  />
                  <Route
                    path="/workstreams/:id"
                    element={
                      <ProtectedRoute
                        element={<WorkstreamFeed />}
                        loadingMessage="Loading workstream..."
                      />
                    }
                  />

                  {/* Feeds management */}
                  <Route
                    path="/feeds"
                    element={
                      <ProtectedRoute
                        element={<Feeds />}
                        loadingMessage="Loading feeds..."
                      />
                    }
                  />

                  {/* Settings and Analytics - lazy-loaded standalone pages */}
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute
                        element={<Settings />}
                        loadingMessage="Loading settings..."
                      />
                    }
                  />
                  <Route
                    path="/notifications"
                    element={
                      <ProtectedRoute
                        element={<Notifications />}
                        loadingMessage="Loading notifications..."
                      />
                    }
                  />
                  <Route
                    path="/analytics"
                    element={
                      <ProtectedRoute
                        element={<Analytics />}
                        loadingMessage="Loading analytics..."
                      />
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute
                        element={<AdminConsole />}
                        loadingMessage="Loading administration..."
                      />
                    }
                  />
                  <Route
                    path="/methodology"
                    element={
                      <ProtectedRoute
                        element={<Methodology />}
                        loadingMessage="Loading methodology..."
                      />
                    }
                  />
                  <Route
                    path="/how-it-works"
                    element={
                      <ProtectedRoute
                        element={<HowItWorks />}
                        loadingMessage="Loading the tour..."
                      />
                    }
                  />

                  {/* Guide pages */}
                  <Route
                    path="/guide/signals"
                    element={
                      <ProtectedRoute
                        element={<GuideSignals />}
                        loadingMessage="Loading guide..."
                      />
                    }
                  />
                  <Route
                    path="/guide/discover"
                    element={
                      <ProtectedRoute
                        element={<GuideDiscover />}
                        loadingMessage="Loading guide..."
                      />
                    }
                  />
                  <Route
                    path="/guide/workstreams"
                    element={
                      <ProtectedRoute
                        element={<GuideWorkstreams />}
                        loadingMessage="Loading guide..."
                      />
                    }
                  />

                  {/* 404 catch-all - redirect to home */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </Router>
        </AuthContextProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}

export default App;
