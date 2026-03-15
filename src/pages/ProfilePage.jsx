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
  const [showGrantAdmin, setShowGrantAdmin] = useState(false)
  const [grantEmail, setGrantEmail] = useState('')
  const [granting, setGranting] = useState(false)
  const [grantMsg, setGrantMsg] = useState('')
  const [isOwner, setIsOwner] = useState(false)

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
      ])

      setPosts(userPosts || [])
      setFollowerCount(followers?.length || 0)
      setFollowingCount(following?.length || 0)
      setIsFollowing(!!myFollow)

      const subs = submissions || []
      setStats({
        total: subs.reduce((a, s) => a + (s.admin_override_points ?? s.calculated_points ?? 0), 0),
        best:  subs.reduce((m, s) => Math.max(m, s.admin_override_points ?? s.calculated_points ?? 0), 0),
        submitted: subs.length,
      })

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
                <button onClick={toggleFollow}
                  className={`flex-shrink-0 text-sm font-kanit font-semibold uppercase px-4 py-2 rounded-2xl transition-all ${
                    isFollowing ? 'border border-border text-muted hover:text-red-400' : 'bg-lime text-bg shadow-lime-sm'
                  }`}>
                  {isFollowing ? 'FOLLOWING' : 'FOLLOW'}
                </button>
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

      {/* Tabs */}
      {!editing && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(isMe
              ? ['posts', 'stats', 'my stats', ...(adminFeedback.length > 0 ? ['feedback'] : [])]
              : ['posts', 'stats']
            ).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-4 py-2 rounded-2xl text-sm font-kanit font-semibold uppercase transition-all flex-shrink-0 ${
                  activeTab === t ? 'bg-lime text-bg' : 'bg-card border border-border text-muted hover:text-white'
                }`}>
                {t === 'posts' ? `POSTS (${posts.length})` : t === 'my stats' ? 'MY STATS' : t === 'feedback' ? `💬 NOTES (${adminFeedback.length})` : 'SEASON'}
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
