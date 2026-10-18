import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Icon, type IconName } from './Icons'
import '../layout.css'
import '../settings.css'

const ITEMS: { to: string; label: string; short: string; icon: IconName; end?: boolean; bottom?: boolean }[] = [
  { to: '/', label: 'Dashboard', short: 'Home', icon: 'dashboard', end: true, bottom: true },
  { to: '/opportunities', label: 'Declined Jobs', short: 'Jobs', icon: 'jobs', end: true, bottom: true },
  { to: '/follow-ups', label: 'Follow-ups', short: 'Follow-ups', icon: 'mail', bottom: true },
  { to: '/opportunities/new', label: 'Add Repair', short: 'Add', icon: 'plus' },
  { to: '/customers', label: 'Customers', short: 'Clients', icon: 'users', bottom: true },
  { to: '/import', label: 'Import CSV', short: 'Import', icon: 'upload', bottom: true },
  { to: '/reports', label: 'Reports', short: 'Reports', icon: 'trend' },
  { to: '/settings', label: 'Settings', short: 'Settings', icon: 'settings' },
]

function GearBoxMark() {
  return (
    <span className="logo-mark">
      <Icon name="settings" size={20} />
    </span>
  )
}

export default function Layout() {
  const { shop, session, signOut } = useAuth()

  const fullName = (session?.user.user_metadata?.full_name as string | undefined)?.trim()
  const initials = (fullName || session?.user.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <GearBoxMark />
          GearBox
        </div>
        <nav>
          {ITEMS.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}>
              <Icon name={i.icon} />
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <strong>{shop?.name}</strong>
          <span>Recover more. Keep customers.</span>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="mobile-logo">
            <GearBoxMark />
            GearBox
          </div>
          <span className="where">{shop?.name}</span>
          <div className="user">
            <Link to="/reports" className="icon-btn mobile-only" aria-label="Reports" title="Reports">
              <Icon name="trend" />
            </Link>
            <Link to="/settings" className="avatar" title={`Settings (${fullName || session?.user.email || ''})`} aria-label="Settings">
              {initials}
            </Link>
            <button type="button" className="icon-btn" onClick={signOut} aria-label="Log out" title="Log out">
              <Icon name="logout" />
            </button>
          </div>
        </header>
        <Outlet />
      </div>

      <nav className="bottomnav">
        {ITEMS.filter((i) => i.bottom).map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}>
            <Icon name={i.icon} size={19} />
            {i.short}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
