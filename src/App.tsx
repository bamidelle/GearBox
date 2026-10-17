import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { PublicOnly, RequireNoShop, RequireShop } from './components/Guards'
import Layout from './components/Layout'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import Import from './pages/Import'
import Opportunities from './pages/Opportunities'
import OpportunityDetail from './pages/OpportunityDetail'
import Settings from './pages/Settings'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <Auth />
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
          <Route path="/import" element={<Import />} />
          <Route path="/opportunities" element={<Opportunities />} />
          <Route path="/opportunities/:id" element={<OpportunityDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
