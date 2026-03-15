import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Navbar from './components/Navbar'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import LogActivity from './pages/LogActivity'
import Leaderboard from './pages/Leaderboard'
import MyStats from './pages/MyStats'
import AdminPanel from './pages/AdminPanel'
import Feed from './pages/Feed'
import Targets from './pages/Targets'
import ProfilePage from './pages/ProfilePage'

export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-2 border-orange border-t-transparent rounded-full animate-spin" />
        <img src="/logo.png" alt="Project Challenge" className="w-40 h-40 object-contain animate-pulse" />
      </div>
    )
  }

  if (!session) return <Auth />

  // Show onboarding for new users who haven't set a username yet
  if (!profile?.onboarded && !profile?.username) {
    return (
      <AppContext.Provider value={{ session, profile, setProfile, refetchProfile: () => fetchProfile(session?.user?.id) }}>
        <Onboarding />
      </AppContext.Provider>
    )
  }

  return (
    <AppContext.Provider value={{ session, profile, setProfile, refetchProfile: () => fetchProfile(session?.user?.id) }}>
      <BrowserRouter>
        <div className="min-h-screen bg-bg text-white font-dm">
          <Navbar />
          <main className="max-w-5xl mx-auto px-4 pt-6 pb-24 md:pb-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/log" element={<LogActivity />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/stats" element={<MyStats />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/targets" element={<Targets />} />
              <Route path="/profile/:username" element={<ProfilePage />} />
              <Route path="/profile" element={<Navigate to={`/profile/${profile?.username || profile?.id}`} />} />
              {profile?.is_admin && <Route path="/admin" element={<AdminPanel />} />}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AppContext.Provider>
  )
}
