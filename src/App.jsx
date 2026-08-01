import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import Dashboard from './pages/Dashboard';
import TodaysPriorities from './pages/TodaysPriorities';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import JobForm from './pages/JobForm';
import JobImport from './pages/JobImport';
import Applications from './pages/Applications';
import ApplicationStudio from './pages/ApplicationStudio';
import Interviews from './pages/Interviews';
import CVLibrary from './pages/CVLibrary';
import CandidateProfile from './pages/CandidateProfile';
import Contacts from './pages/Contacts';
import Analytics from './pages/Analytics';
import JobSources from './pages/JobSources';
import SettingsPage from './pages/Settings';
import EmailImportReview from './pages/EmailImportReview';
import WeeklyReview from './pages/WeeklyReview';
import OIOverview from './pages/opportunity-intelligence/Overview';
import OISources from './pages/opportunity-intelligence/OpportunitySources';
import OIEmployers from './pages/opportunity-intelligence/TargetEmployers';
import OISearchProfile from './pages/opportunity-intelligence/SearchProfile';
import OIDiscoveryRules from './pages/opportunity-intelligence/DiscoveryRules';
import OISearchSchedules from './pages/opportunity-intelligence/SearchSchedules';
import OIAgentConfig from './pages/opportunity-intelligence/AgentConfiguration';
import OIDiscoveryRuns from './pages/opportunity-intelligence/DiscoveryRuns';
import OISourcePerformance from './pages/opportunity-intelligence/SourcePerformance';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError?.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  // Authentication-required errors are handled by ProtectedRoute. Keeping the
  // public auth routes mounted prevents /login redirecting back to itself.
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/priorities" element={<TodaysPriorities />} />
          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/new" element={<JobForm />} />
          <Route path="/jobs/import" element={<JobImport />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/jobs/:id/edit" element={<JobForm />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/studio" element={<ApplicationStudio />} />
          <Route path="/interviews" element={<Interviews />} />
          <Route path="/cv" element={<CVLibrary />} />
          <Route path="/profile" element={<CandidateProfile />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/sources" element={<JobSources />} />
          <Route path="/email-review" element={<EmailImportReview />} />
          <Route path="/opportunity-intelligence" element={<OIOverview />} />
          <Route path="/opportunity-intelligence/sources" element={<OISources />} />
          <Route path="/opportunity-intelligence/employers" element={<OIEmployers />} />
          <Route path="/opportunity-intelligence/search-profile" element={<OISearchProfile />} />
          <Route path="/opportunity-intelligence/rules" element={<OIDiscoveryRules />} />
          <Route path="/opportunity-intelligence/schedules" element={<OISearchSchedules />} />
          <Route path="/opportunity-intelligence/agents" element={<OIAgentConfig />} />
          <Route path="/opportunity-intelligence/runs" element={<OIDiscoveryRuns />} />
          <Route path="/opportunity-intelligence/performance" element={<OISourcePerformance />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/weekly-review" element={<WeeklyReview />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App