import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { PublicOnly, RequireNoShop, RequireShop } from './components/Guards'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import ImportPage from './pages/ImportPage'
import Opportunities from './pages/Opportunities'
import OpportunityPage from './pages/OpportunityPage'
import AddRepair from './pages/AddRepair'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import FollowUps from './pages/FollowUps'
import Reports from './pages/Reports'
import SettingsHome from './pages/SettingsHome'
import Respond from './pages/Respond'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public customer reply page (opened from follow-up emails) */}
        <Route path="/r/:token" element={<Respond />} />
        <Route
          path="/welcome"
          element={
            <PublicOnly>
              <Landing />
            </PublicOnly>
          }
        />
        <Route
          path="/login"
          element={
            <PublicOnly>
              <Auth />
            </PublicOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicOnly>
              <Auth initialMode="signup" />
            </PublicOnly>
          }
        />
        <Route
          path="/onboarding"
          element={
            <RequireNoShop>
              <Onboarding />
            </RequireNoShop>
          }
        />
        <Route
          element={
            <RequireShop>
              <Layout />
            </RequireShop>
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/opportunities/new" element={<AddRepair />} />
          <Route path="/opportunities/:id" element={<OpportunityPage />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/follow-ups" element={<FollowUps />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<SettingsHome />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
