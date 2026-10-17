import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { PublicOnly, RequireNoShop, RequireShop } from './components/Guards'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import Import from './pages/Import'

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
          path="/"
          element={
            <RequireShop>
              <Home />
            </RequireShop>
          }
        />
        <Route
          path="/import"
          element={
            <RequireShop>
              <Import />
            </RequireShop>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
