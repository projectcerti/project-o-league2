import { NavLink, Link } from 'react-router-dom'
import { useApp } from '../App'
import { Avatar } from '../pages/Feed'
import { supabase } from '../supabaseClient'

const Icons = {
  home:    (a) => <svg width="21" height="21" viewBox="0 0 24 24" fill={a?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/></svg>,
  admin:   (a) => <svg width="21" height="21" viewBox="0 0 24 24" fill={a?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8"><path d="M12 2L3 7v5c0 5 3.8 9.7 9 11 5.2-1.3 9-6 9-11V7L12 2z"/></svg>,
  dashboard: (a) => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  log:     (a) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  targets: (a) => <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill={a?'currentColor':'none'}/></svg>,
  board:   (a) => <svg width="21" height="21" viewBox="0 0 24 24" fill={a?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8"><rect x="3" y="10" width="4" height="11" rx="1"/><rect x="10" y="6" width="4" height="15" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>,
  user:    (a) => <svg width="21" height="21" viewBox="0 0 24 24" fill={a?'currentColor':'none'} stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
}

export default function Navbar() {
  const { profile } = useApp()
  const profilePath = `/profile/${profile?.username || profile?.id}`

  const baseTabs = [
    { to: '/',           icon: 'home',      label: 'Home',    end: true },
    { to: '/leaderboard',icon: 'board',     label: 'Board' },
    { to: '/log',        icon: 'log',       label: 'Log',     special: true },
    { to: '/targets',    icon: 'targets',   label: 'Targets' },
    { to: profilePath,   icon: 'user',      label: 'Me' },
  ]
  const tabs = profile?.is_admin
    ? [baseTabs[0], baseTabs[1], baseTabs[2], { to: '/admin', icon: 'user', label: 'Admin' }, baseTabs[4]]
    : baseTabs

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-5 w-full h-13 flex items-center justify-between">
          <img src="/logo.png" alt="Project Challenge" className="h-7 w-auto max-w-[160px] object-contain" />
          <div className="flex items-center gap-5">
            {[
              { to: '/', label: 'Feed', end: true },
              { to: '/dashboard', label: 'Dashboard' },
              { to: '/log', label: 'Log' },
              { to: '/leaderboard', label: 'Leaderboard' },
              { to: '/targets', label: 'Targets' },
              ...(profile?.is_admin ? [{ to: '/admin', label: 'Admin' }] : []),
            ].map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `text-sm font-dm transition-colors ${isActive ? 'text-lime' : 'text-muted hover:text-white'}`}>
                {label}
              </NavLink>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link to={profilePath} className="flex items-center gap-2 group">
              <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size="sm" />
              <span className="text-sm text-muted group-hover:text-white transition-colors font-dm">
                {profile?.username ? `@${profile.username}` : profile?.full_name?.split(' ')[0]}
              </span>
            </Link>
            <button onClick={() => supabase.auth.signOut()}
              className="text-xs text-muted hover:text-lime transition-colors border border-border rounded-full px-3 py-1 font-dm">
              Out
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile top strip — logo + admin only */}
      <div className="md:hidden sticky top-0 z-50 bg-bg/98 backdrop-blur border-b border-border px-5 h-11 flex items-center justify-between">
        <img src="/logo.png" alt="Project Challenge" className="h-7 w-auto max-w-[160px] object-contain" />
        <div className="flex items-center gap-2">
          {profile?.is_admin && (
            <Link to="/admin" className="text-xs text-lime font-dm bg-lime/10 px-2.5 py-1 rounded-full">Admin</Link>
          )}
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg/98 backdrop-blur border-t border-border">
        <div className="flex items-center" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {tabs.map(({ to, icon, label, end, special }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-all ${isActive ? 'text-lime' : 'text-muted'}`}
            >
              {({ isActive }) => (
                <>
                  {special ? (
                    <div className="w-11 h-11 rounded-2xl bg-lime flex items-center justify-center -mt-5 shadow-lime-glow text-bg">
                      {Icons[icon](true)}
                    </div>
                  ) : (
                    <div className={`p-1.5 rounded-xl ${isActive ? 'bg-lime/10' : ''}`}>
                      {Icons[icon](isActive)}
                    </div>
                  )}
                  <span className={`text-xs font-dm ${special ? 'mt-1' : ''}`}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </>
  )
}
