import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'
import { Avatar, getTimeAgo } from './Feed'
import { getLane } from '../utils/lanes'
import LanePicker from '../components/LanePicker'
import MyStats from './MyStats'
import { TOTAL_WEEKS } from '../utils/points'

export default function ProfilePage() {
  const { username } = useParams()
  const { profile: myProfile, refetchProfile } = useApp()
  const navigate = useNavigate()

  const [user, setUser]                 = useState(null)
  const [posts, setPosts]               = useState([])
  const [stats, setStats]               = useState(null)
  const [isFollowing, setIsFollowing]   = useState(false)
  const [isNotifying, setIsNotifying]   = useState(false)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [loading, setLoading]           = useState(true)
  const [editing, setEditing]           = useState(false)
  const [editForm, setEditForm]         = useState({})
  const [saving, setSaving]             = useState(false)
  const [editError, setEditError]       = useState('')
  const [activeTab, setActiveTab]       = useState('posts')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const [adminFeedback, setAdminFeedback] = useState([])
  const [mySessions, setMySessions] = useState([])
  const [deletingSessionId, setDeletingSessionId] = useState(null)
  const [showGrantAdmin, setShowGrantAdmin] = useState(false)
  const [grantEmail, setGrantEmail] = useState('')
  const [granting, setGranting] = useState(false)
  const [grantMsg, setGrantMsg] = useState('')
  const [isOwner, setIsOwner] = useState(false)
  const [nutritionGoals, setNutritionGoals] = useState({})
  const [goalsPublic, setGoalsPublic] = useState(false)
  const [savingGoals, setSavingGoals] = useState(false)
  const [showGoalsEditor, setShowGoalsEditor] = useState(false)
  const [goalsForm, setGoalsForm] = useState({
    protein: '', calories: '', water: '', fibre: '',
    carbs: '', fat: '', custom1_name: '', custom1_value: '',
    custom2_name: '', custom2_value: '',
  })

  const isMe = user?.id === myProfile?.id

  useEffect(() => { if (username) loadProfile() }, [username])

  useEffect(() => {
    // Check owner from profile role (fetched fresh from DB)
    async function checkOwner() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      if (data?.role === 'owner') setIsOwner(true)
    }
    checkOwner()
  }, [])

  async function loadProfile() {
    setLoading(true)
    try {
      const isUuid = /^[0-9a-f-]{36}$/.test(username)
      const { data: found } = await supabase
        .from('profiles').select('*')
        .eq(isUuid ? 'id' : 'username', username)
        .maybeSingle()

      if (!found) { navigate('/'); return }
      setUser(found)
      setEditForm({
        full_name:   found.full_name || '',
        username:    found.username || '',
        bio:         found.bio || '',
        avatar_url:  found.avatar_url || null,
        lane:        found.lane || '',
        lane_public: found.lane_public !== false,
        avatarFile:  null,
      })

      const [
        { data: userPosts },
        { data: submissions },
        { data: followers },
        { data: following },
        { data: myFollow },
        { data: myNotify },
      ] = await Promise.all([
        supabase.from('posts')
          .select('*, profiles(id, full_name, username, avatar_url)')
          .eq('user_id', found.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('weekly_submissions').select('*').eq('user_id', found.id),
        supabase.from('friendships').select('id').eq('following_id', found.id),
        supabase.from('friendships').select('id').eq('follower_id', found.id),
        supabase.from('friendships').select('id')
          .eq('follower_id', myProfile.id)
          .eq('following_id', found.id)
          .maybeSingle(),
        supabase.from('friendships').select('notify')
          .eq('follower_id', myProfile.id)
          .eq('following_id', found.id)
          .maybeSingle(),
      ])

      setPosts(userPosts || [])
      setFollowerCount(followers?.length || 0)
      setFollowingCount(following?.length || 0)
      setIsFollowing(!!myFollow)
      setIsNotifying(myNotify?.notify || false)

      // Load nutrition goals for own profile
      if (found.id === myProfile.id) {
        const goals = found.nutrition_goals || {}
        setNutritionGoals(goals)
        setGoalsPublic(found.nutrition_goals_public || false)
        setGoalsForm(f => ({
          ...f,
          protein: goals.protein || '',
          calories: goals.calories || '',
          water: goals.water || '',
          fibre: goals.fibre || '',
          carbs: goals.carbs || '',
          fat: goals.fat || '',
          custom1_name: goals.custom1_name || '',
          custom1_value: goals.custom1_value || '',
          custom2_name: goals.custom2_name || '',
          custom2_value: goals.custom2_value || '',
        }))
      }

      const subs = submissions || []
      setStats({
        total: subs.reduce((a, s) => a + (s.admin_override_points ?? s.calculated_points ?? 0), 0),
        best:  subs.reduce((m, s) => Math.max(m, s.admin_override_points ?? s.calculated_points ?? 0), 0),
        submitted: subs.length,
      })

      // Load sessions for own profile
      if (found.id === myProfile.id) {
        const { data: sess } = await supabase.from('sessions')
          .select('*').eq('user_id', found.id)
          .order('logged_at', { ascending: false })
        setMySessions(sess || [])
      }

      // Load private admin feedback (only if viewing own profile)
      if (found.id === myProfile.id) {
        const { data: fb } = await supabase.from('admin_feedback')
          .select('*, profiles!admin_feedback_admin_id_fkey(full_name, avatar_url)')
          .eq('user_id', found.id)
          .order('created_at', { ascending: false })
        setAdminFeedback(fb || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function toggleNotify() {
    if (!isFollowing) return // must follow first
    const newVal = !isNotifying
    setIsNotifying(newVal)
    await supabase.from('friendships')
      .update({ notify: newVal })
      .eq('follower_id', myProfile.id)
      .eq('following_id', user.id)
  }

  async function toggleFollow() {
    if (isFollowing) {
      await supabase.from('friendships').delete().eq('follower_id', myProfile.id).eq('following_id', user.id)
      setIsFollowing(false); setFollowerCount(c => c - 1)
    } else {
      await supabase.from('friendships').insert({ follower_id: myProfile.id, following_id: user.id })
      setIsFollowing(true); setFollowerCount(c => c + 1)
    }
  }

  async function saveProfile() {
    setSaving(true); setEditError('')

    let newAvatarUrl = editForm.avatar_url

    // Upload new photo if selected
    if (editForm.avatarFile) {
      const file = editForm.avatarFile
      const ext  = file.name.split('.').pop().toLowerCase() || 'jpg'
      // Unique filename every time = no caching issues
      const path = myProfile.id + '/avatar_' + Date.now() + '.' + ext

      const { error: upErr } = await supabase.storage
        .from('proofs')
        .upload(path, file, { contentType: file.type })

      if (upErr) {
        setEditError('Upload failed: ' + upErr.message)
        setSaving(false); return
      }

      const { data: urlData } = supabase.storage.from('proofs').getPublicUrl(path)
      newAvatarUrl = urlData.publicUrl
    }

    // Validate username
    const uname = editForm.username.toLowerCase().trim()
    if (uname && !/^[a-z0-9_]{3,20}$/.test(uname)) {
      setEditError('Username: 3–20 chars, lowercase letters, numbers, underscores.')
      setSaving(false); return
    }

    // Save to DB
    const { error: dbErr } = await supabase.from('profiles').update({
      full_name:   editForm.full_name.trim(),
      username:    uname || null,
      bio:         editForm.bio.trim(),
      avatar_url:  newAvatarUrl,
      lane:        editForm.lane || null,
      lane_public: editForm.lane_public,
    }).eq('id', myProfile.id)

    if (dbErr) {
      setEditError(dbErr.message.includes('unique') ? 'Username already taken.' : dbErr.message)
      setSaving(false); return
    }

    // Update state immediately — don't wait for loadProfile
    setUser(prev => ({ ...prev, 
      avatar_url: newAvatarUrl,
      full_name: editForm.full_name.trim(),
      username: uname || prev.username,
      bio: editForm.bio.trim(),
      lane: editForm.lane || null,
      lane_public: editForm.lane_public,
    }))
    setEditForm(prev => ({ ...prev, avatar_url: newAvatarUrl, avatarFile: null }))
    await refetchProfile()
    setEditing(false)
    setSaving(false)
  }

  async function deleteSessionFromProfile(id) {
    setDeletingSessionId(id)
    await supabase.from('sessions').delete().eq('id', id)
    await supabase.from('posts').delete().eq('session_id', id).eq('user_id', myProfile.id)
    // Recalculate points
    const { data: remaining } = await supabase.from('sessions').select('*').eq('user_id', myProfile.id)
    const { data: subs } = await supabase.from('weekly_submissions').select('*').eq('user_id', myProfile.id)
    // Update each affected week
    const weekNums = [...new Set((remaining || []).map(s => s.week_number))]
    for (const wk of weekNums) {
      const wSess = (remaining || []).filter(s => s.week_number === wk)
      const w = wSess.filter(s => s.session_type === 'workout' && s.duration_minutes >= 30).length
      const r = wSess.filter(s => s.session_type === 'recovery' && s.duration_minutes >= 20).length
      const soc = wSess.filter(s => s.session_type === 'social').length
      const nutDays = new Set(wSess.filter(s => s.session_type === 'nutrition' && s.goal_met).map(s => new Date(s.logged_at).toDateString())).size
      const { calculatePoints } = await import('../utils/points')
      const pts = calculatePoints({ workouts: w, recovery_sessions: r, social_sessions: soc, nutrition_days: nutDays })
      const sub = (subs || []).find(s => s.week_number === wk)
      if (sub) {
        await supabase.from('weekly_submissions').update({
          workouts: w, recovery_sessions: r, social_sessions: soc,
          nutrition_days: nutDays, calculated_points: pts,
        }).eq('id', sub.id)
      }
    }
    setMySessions(prev => prev.filter(s => s.id !== id))
    setDeletingSessionId(null)
  }

  async function saveGoals() {
    setSavingGoals(true)
    const goals = {}
    if (goalsForm.protein) goals.protein = goalsForm.protein
    if (goalsForm.calories) goals.calories = goalsForm.calories
    if (goalsForm.water) goals.water = goalsForm.water
    if (goalsForm.fibre) goals.fibre = goalsForm.fibre
    if (goalsForm.carbs) goals.carbs = goalsForm.carbs
    if (goalsForm.fat) goals.fat = goalsForm.fat
    if (goalsForm.custom1_name && goalsForm.custom1_value) {
      goals[goalsForm.custom1_name.toLowerCase().replace(/\s+/g, '_')] = goalsForm.custom1_value
    }
    if (goalsForm.custom2_name && goalsForm.custom2_value) {
      goals[goalsForm.custom2_name.toLowerCase().replace(/\s+/g, '_')] = goalsForm.custom2_value
    }
    await supabase.from('profiles').update({
      nutrition_goals: goals,
      nutrition_goals_public: goalsPublic,
    }).eq('id', myProfile.id)
    setNutritionGoals(goals)
    setShowGoalsEditor(false)
    setSavingGoals(false)
  }

  async function grantAdmin() {
    if (!grantEmail.trim()) return
    setGranting(true); setGrantMsg('')
    // Look up the user
    const { data: target } = await supabase.from('profiles')
      .select('id, full_name, role').eq('email', grantEmail.trim().toLowerCase()).maybeSingle()
    if (!target) {
      setGrantMsg('Not found — make sure they have signed up first.')
      setGranting(false); return
    }
    if (target.role === 'admin' || target.role === 'owner') {
      setGrantMsg(target.full_name + ' already has elevated access.')
      setGranting(false); return
    }
    // Call edge function (server-side role change)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/set-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ target_user_id: target.id, new_role: 'admin' }),
    })
    const result = await res.json()
    if (!res.ok) {
      setGrantMsg('Error: ' + (result.error || res.statusText))
    } else {
      setGrantMsg(target.full_name + ' is now an admin!')
      setGrantEmail('')
    }
    setGranting(false)
  }

  async function revokeAdmin(userId, name) {
    setGranting(true); setGrantMsg('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/set-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ target_user_id: userId, new_role: 'user' }),
    })
    const result = await res.json()
    if (!res.ok) setGrantMsg('Error: ' + (result.error || res.statusText))
    else setGrantMsg(name + ' admin access revoked.')
    setGranting(false)
  }

  async function deleteAccount() {
    setDeleting(true)
    try {
      await supabase.rpc('delete_user_account', { user_id_to_delete: myProfile.id })
    } catch (e) {
      // Auth deletion may throw but still succeed
    }
    await supabase.auth.signOut()
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-3 pt-2 animate-pulse">
      <div className="h-36 bg-card rounded-3xl" />
      <div className="h-24 bg-card rounded-3xl" />
    </div>
  )

  if (!user) return null
  const lane = getLane(user.lane)

  return (
    <div className="max-w-2xl mx-auto space-y-3 pt-1 fade-up">

      {/* Profile card */}
      <div className="bg-card border border-border rounded-3xl p-5">
        {editing ? (
          <EditForm
            form={editForm}
            onChange={(k, v) => setEditForm(f => ({ ...f, [k]: v }))}
            onSave={saveProfile}
            onCancel={() => { setEditing(false); setEditError('') }}
            saving={saving}
            error={editError}
          />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-4">
                <Avatar name={user.full_name} avatarUrl={user.avatar_url} size="lg" />
                <div>
                  <h1 className="font-kanit font-bold italic uppercase text-xl text-white leading-tight">
                    {user.full_name}
                  </h1>
                  {user.username && <p className="text-muted text-sm font-dm">@{user.username}</p>}
                  {user.bio && <p className="text-gray-300 text-sm font-dm mt-1 max-w-xs">{user.bio}</p>}
                  {lane && user.lane_public && (
                    <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full border text-xs font-dm ${lane.bg} ${lane.border} ${lane.text}`}>
                      {lane.emoji} {lane.label}
                    </div>
                  )}
                </div>
              </div>

              {isMe ? (
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button onClick={() => setEditing(true)}
                    className="text-xs font-dm px-3 py-2 rounded-2xl border border-border text-muted hover:text-white hover:border-lime/40 transition-colors uppercase">
                    EDIT
                  </button>
                  <button onClick={() => supabase.auth.signOut()}
                    className="text-xs font-dm px-3 py-2 rounded-2xl border border-border text-muted hover:text-red-400 hover:border-red-800/50 transition-colors uppercase">
                    SIGN OUT
                  </button>
                  <button onClick={() => setShowDeleteConfirm(true)}
                    className="text-xs font-dm px-3 py-2 rounded-2xl border border-red-900/50 text-red-500/70 hover:text-red-400 hover:border-red-700 transition-colors uppercase">
                    DELETE
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={toggleFollow}
                    className={`text-sm font-kanit font-semibold uppercase px-4 py-2 rounded-2xl transition-all ${
                      isFollowing ? 'border border-border text-muted hover:text-red-400' : 'bg-lime text-bg shadow-lime-sm'
                    }`}>
                    {isFollowing ? 'FOLLOWING' : 'FOLLOW'}
                  </button>
                  {isFollowing && (
                    <button onClick={toggleNotify} title={isNotifying ? 'Turn off notifications' : 'Get notified when they post'}
                      className={`p-2 rounded-2xl border transition-all ${isNotifying ? 'border-lime/40 bg-lime/10 text-lime' : 'border-border text-muted hover:text-white'}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={isNotifying ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 01-3.46 0"/>
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-2 mt-4">
              {[
                { label: 'POINTS',    value: stats?.total ?? 0 },
                { label: 'BEST WK',   value: stats?.best ?? 0 },
                { label: 'FOLLOWERS', value: followerCount },
                { label: 'FOLLOWING', value: followingCount },
              ].map(({ label, value }) => (
                <div key={label} className="bg-soft rounded-2xl p-2.5 text-center">
                  <p className="font-kanit font-semibold uppercase text-lg text-white leading-none">{value}</p>
                  <p className="text-muted text-xs font-dm mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-5">
          <div className="bg-card border border-red-800/50 rounded-3xl p-6 max-w-sm w-full space-y-4">
            <h2 className="font-kanit font-bold italic uppercase text-xl text-white">DELETE ACCOUNT?</h2>
            <p className="text-muted text-sm font-dm leading-relaxed">
              This will permanently delete your account, all your submissions, sessions, posts and remove you from the leaderboard. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 rounded-2xl border border-border text-muted font-dm text-sm hover:text-white transition-colors uppercase">
                CANCEL
              </button>
              <button onClick={deleteAccount} disabled={deleting}
                className="flex-1 py-3 rounded-2xl bg-red-900/40 border border-red-700 text-red-400 font-kanit font-bold uppercase text-sm disabled:opacity-50 hover:bg-red-900/60 transition-colors">
                {deleting ? 'DELETING…' : 'DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nutrition Goals — own profile only */}
      {isMe && !editing && (
        <div className="mt-1">
          <button onClick={() => setShowGoalsEditor(v => !v)}
            className="w-full flex items-center justify-between bg-card border border-border rounded-2xl px-4 py-3 hover:border-lime/20 transition-all">
            <div className="flex items-center gap-2">
              <span className="text-base">🥗</span>
              <div className="text-left">
                <p className="text-sm font-kanit font-semibold text-white uppercase">Nutrition Goals</p>
                <p className="text-xs text-muted font-dm">
                  {Object.keys(nutritionGoals).filter(k => nutritionGoals[k] && !k.includes('_name')).length > 0
                    ? `${Object.keys(nutritionGoals).filter(k => nutritionGoals[k] && !k.includes('_name')).length} goal${Object.keys(nutritionGoals).filter(k => nutritionGoals[k] && !k.includes('_name')).length !== 1 ? 's' : ''} set · ${goalsPublic ? 'Public' : 'Private'}`
                    : 'Tap to set your daily goals'}
                </p>
              </div>
            </div>
            <span className="text-muted text-sm">{showGoalsEditor ? '▲' : '▼'}</span>
          </button>

          {showGoalsEditor && (
            <div className="bg-card border border-border rounded-3xl p-4 mt-2 space-y-4">
              <p className="text-xs text-muted font-dm">Set goals to hit each day. Tick goal completion when logging nutrition to earn points. Leave blank to skip.</p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'protein',  label: 'Protein',  placeholder: 'e.g. 180g' },
                  { key: 'calories', label: 'Calories', placeholder: 'e.g. 2200 kcal' },
                  { key: 'water',    label: 'Water',    placeholder: 'e.g. 2-3L' },
                  { key: 'fibre',    label: 'Fibre',    placeholder: 'e.g. 30g' },
                  { key: 'carbs',    label: 'Carbs',    placeholder: 'e.g. 250g' },
                  { key: 'fat',      label: 'Fat',      placeholder: 'e.g. 70g' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <p className="text-xs font-dm text-muted mb-1">{label}</p>
                    <input type="text" value={goalsForm[key]}
                      onChange={e => setGoalsForm(f => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full bg-soft border border-border rounded-xl px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 font-dm" />
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">CUSTOM GOALS</p>
                <div className="space-y-2">
                  {[['custom1', 'Custom 1'], ['custom2', 'Custom 2']].map(([key, label]) => (
                    <div key={key} className="flex gap-2">
                      <input type="text" value={goalsForm[`${key}_name`]}
                        onChange={e => setGoalsForm(f => ({ ...f, [`${key}_name`]: e.target.value }))}
                        placeholder="Goal name"
                        className="flex-1 bg-soft border border-border rounded-xl px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 font-dm" />
                      <input type="text" value={goalsForm[`${key}_value`]}
                        onChange={e => setGoalsForm(f => ({ ...f, [`${key}_value`]: e.target.value }))}
                        placeholder="Target"
                        className="w-24 bg-soft border border-border rounded-xl px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 font-dm" />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">VISIBILITY</p>
                <div className="flex gap-2">
                  {[
                    { val: false, label: 'Private', desc: 'Only you and admin', icon: '🔒' },
                    { val: true,  label: 'Public',  desc: 'Show on my profile', icon: '👥' },
                  ].map(({ val, label, desc, icon }) => (
                    <button key={label} onClick={() => setGoalsPublic(val)}
                      className={`flex-1 rounded-2xl p-3 border text-left transition-all ${goalsPublic === val ? 'border-lime/40 bg-lime/10' : 'border-border hover:border-lime/20'}`}>
                      <p className="text-base">{icon}</p>
                      <p className={`text-xs font-kanit font-semibold uppercase mt-1 ${goalsPublic === val ? 'text-lime' : 'text-white'}`}>{label}</p>
                      <p className="text-xs text-muted font-dm">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={saveGoals} disabled={savingGoals}
                className="w-full bg-lime text-bg font-kanit font-bold uppercase py-3 rounded-2xl disabled:opacity-40 active:scale-95 transition-all shadow-lime-sm">
                {savingGoals ? 'SAVING…' : 'SAVE GOALS'}
              </button>
            </div>
          )}

          {!showGoalsEditor && Object.keys(nutritionGoals).filter(k => nutritionGoals[k] && !k.includes('_name')).length > 0 && (
            <div className="mt-2 bg-card border border-border rounded-2xl px-4 py-3 flex flex-wrap gap-2">
              {Object.entries(nutritionGoals)
                .filter(([k, v]) => v && !k.includes('_name'))
                .map(([key, value]) => (
                  <span key={key} className="bg-soft border border-border rounded-full px-3 py-1 text-xs font-dm">
                    <span className="text-muted capitalize">{key.replace(/_/g, ' ')}: </span>
                    <span className="text-white">{value}</span>
                  </span>
                ))}
              {!goalsPublic && <span className="text-xs text-muted font-dm self-center">🔒 Private</span>}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      {!editing && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(isMe
              ? ['posts', 'logs', 'stats', 'my stats', ...(adminFeedback.length > 0 ? ['feedback'] : [])]
              : ['posts', 'stats']
            ).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-4 py-2 rounded-2xl text-sm font-kanit font-semibold uppercase transition-all flex-shrink-0 ${
                  activeTab === t ? 'bg-lime text-bg' : 'bg-card border border-border text-muted hover:text-white'
                }`}>
                {t === 'posts' ? `POSTS (${posts.length})` : t === 'logs' ? `LOGS (${mySessions.length})` : t === 'my stats' ? 'MY STATS' : t === 'feedback' ? `💬 NOTES (${adminFeedback.length})` : 'SEASON'}
              </button>
            ))}
          </div>

          {activeTab === 'posts' && (
            <div className="space-y-3">
              {posts.length === 0 ? (
                <div className="bg-card border border-dashed border-border rounded-3xl p-10 text-center">
                  <p className="text-muted font-dm text-sm">
                    {isMe ? 'No posts yet — log a session!' : 'No posts yet.'}
                  </p>
                </div>
              ) : posts.map(post => (
                <div key={post.id} className="bg-card border border-border rounded-3xl overflow-hidden">
                  {post.photo_urls?.length > 0 && (
                    <img src={post.photo_urls[0]} alt="" className="w-full h-48 object-cover" />
                  )}
                  <div className="p-4">
                    <p className="text-sm text-gray-200 font-dm leading-relaxed whitespace-pre-wrap">{post.content}</p>
                    <p className="text-xs text-muted font-dm mt-2">{getTimeAgo(post.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="bg-card border border-border rounded-3xl p-4 space-y-3">
              <p className="font-kanit font-semibold uppercase text-sm text-white">SEASON 1 STATS</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'TOTAL POINTS', value: stats?.total ?? 0 },
                  { label: 'BEST WEEK',    value: `${stats?.best ?? 0} pts` },
                  { label: 'WEEKS LOGGED', value: `${stats?.submitted ?? 0}/${TOTAL_WEEKS}` },
                  { label: 'LANE',         value: lane ? `${lane.emoji} ${lane.label}` : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-soft rounded-2xl p-3">
                    <p className="text-muted text-xs font-dm uppercase">{label}</p>
                    <p className="font-kanit font-semibold text-lg text-white mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'my stats' && isMe && (
            <div className="bg-card border border-border rounded-3xl p-4">
              <MyStats embedded={true} />
            </div>
          )}

          {activeTab === 'feedback' && isMe && (
            <div className="space-y-3">
              <div className="bg-yellow-900/10 border border-yellow-700/30 rounded-2xl px-4 py-2.5">
                <p className="text-yellow-300 text-xs font-dm">🔒 Private — only you can see these notes from your coach.</p>
              </div>
              {adminFeedback.map(f => (
                <div key={f.id} className="bg-card border border-border rounded-3xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">💬</span>
                    <div>
                      <p className="text-xs font-kanit font-semibold text-lime uppercase">Coach Note</p>
                      <p className="text-xs text-muted font-dm">{new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-200 font-dm leading-relaxed">{f.message}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EditForm({ form, onChange, onSave, onCancel, saving, error }) {
  const avatarFileRef = useRef()
  const [previewUrl, setPreviewUrl] = useState(form.avatar_url || null)

  // Sync preview when form.avatar_url changes (e.g. after save)
  useEffect(() => {
    if (!form.avatarFile) setPreviewUrl(form.avatar_url || null)
  }, [form.avatar_url])

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    onChange('avatarFile', file)
  }

  return (
    <div className="space-y-4">
      <p className="font-kanit font-bold italic uppercase text-lg text-white">EDIT PROFILE</p>

      {error && (
        <div className="bg-red-900/20 border border-red-800/40 text-red-400 text-sm rounded-2xl px-4 py-3 font-dm">{error}</div>
      )}

      {/* Profile photo */}
      <div>
        <p className="text-xs font-dm text-muted uppercase tracking-widest mb-3">PROFILE PHOTO</p>
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0 cursor-pointer" onClick={() => avatarFileRef.current?.click()}>
            {previewUrl ? (
              <img src={previewUrl} alt="preview"
                className="w-16 h-16 rounded-2xl object-cover border-2 border-lime" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-soft border-2 border-dashed border-border flex items-center justify-center text-muted text-2xl">
                +
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 bg-lime text-bg rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
              +
            </div>
          </div>
          <div>
            <button type="button" onClick={() => avatarFileRef.current?.click()}
              className="text-lime text-sm font-dm uppercase font-medium hover:underline">
              {previewUrl ? 'CHANGE PHOTO' : 'ADD PHOTO'}
            </button>
            {form.avatarFile && (
              <p className="text-xs text-muted font-dm mt-1">✓ {form.avatarFile.name}</p>
            )}
          </div>
          <input ref={avatarFileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </div>
      </div>

      {/* Full name */}
      <div>
        <label className="block text-xs font-dm text-muted uppercase tracking-widest mb-1.5">FULL NAME</label>
        <input type="text" value={form.full_name} onChange={e => onChange('full_name', e.target.value)}
          className="w-full bg-soft border border-border rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-lime/40 font-dm" />
      </div>

      {/* Username */}
      <div>
        <label className="block text-xs font-dm text-muted uppercase tracking-widest mb-1.5">USERNAME</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-sm">@</span>
          <input type="text" value={form.username}
            onChange={e => onChange('username', e.target.value.toLowerCase())}
            placeholder="yourusername" autoCapitalize="none"
            className="w-full bg-soft border border-border rounded-2xl pl-8 pr-4 py-3 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 font-dm" />
        </div>
      </div>

      {/* Bio */}
      <div>
        <label className="block text-xs font-dm text-muted uppercase tracking-widest mb-1.5">BIO</label>
        <textarea value={form.bio} onChange={e => onChange('bio', e.target.value.slice(0, 160))}
          placeholder="Tell the league who you are…" rows={2}
          className="w-full bg-soft border border-border rounded-2xl px-4 py-3 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 resize-none font-dm" />
        <p className="text-xs text-muted font-dm mt-1">{form.bio.length}/160</p>
      </div>

      {/* Lane */}
      <div>
        <label className="block text-xs font-dm text-muted uppercase tracking-widest mb-2">LANE</label>
        <LanePicker value={form.lane} onChange={v => onChange('lane', v)}
          showPrivacy lanePublic={form.lane_public} onPrivacyChange={v => onChange('lane_public', v)} />
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onSave} disabled={saving}
          className="flex-1 bg-lime text-bg font-kanit font-bold uppercase text-base py-3.5 rounded-2xl disabled:opacity-50 active:scale-95 transition-all shadow-lime-sm">
          {saving ? 'SAVING…' : 'SAVE'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-5 rounded-2xl border border-border text-muted hover:text-white font-dm text-sm uppercase transition-colors">
          CANCEL
        </button>
      </div>
    </div>
  )
}

export function LaneBadge({ lane }) {
  const l = getLane(lane)
  if (!l) return null
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-dm ${l.bg} ${l.border} ${l.text}`}>
      {l.emoji} {l.label}
    </div>
  )
}
