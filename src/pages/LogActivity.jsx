import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'
import { getCurrentWeek, getWeekLabel, getWeekDeadline, calculatePoints, breakdownPoints } from '../utils/points'

const SESSION_TYPES = [
  { value: 'workout',   label: 'WORKOUT',   emoji: '💪', minDuration: 30, color: 'lime',   examples: 'Gym, run, football, class, training…' },
  { value: 'recovery',  label: 'RECOVERY',  emoji: '🧘', minDuration: 20, color: 'blue',   examples: 'Stretching, yoga, sauna, massage gun…' },
  { value: 'social',    label: 'SOCIAL',    emoji: '🤝', minDuration: 0,  color: 'green',  examples: '5-a-side, group class, training with someone…' },
]

const ACTIVITY_OPTIONS = {
  workout:  ['Gym', 'Run', 'Football', 'Basketball', 'Cycling', 'Swimming', 'HIIT', 'Boxing', 'CrossFit', 'Pilates', 'Other'],
  recovery: ['Stretching', 'Yoga', 'Mobility', 'Sauna', 'Ice Bath', 'Massage Gun', 'Foam Rolling', 'Other'],
  social:   ['5-a-side', 'Group Class', 'Tennis', 'Basketball', 'Training with friend', 'Team sport', 'Other'],
}

const MEAL_TYPES = [
  { value: 'all',       label: 'ALL MEALS', emoji: '🍽️', desc: 'Log your whole day at once' },
  { value: 'breakfast', label: 'BREAKFAST', emoji: '🌅', desc: 'Morning meal' },
  { value: 'lunch',     label: 'LUNCH',     emoji: '☀️', desc: 'Midday meal' },
  { value: 'dinner',    label: 'DINNER',    emoji: '🌙', desc: 'Evening meal' },
  { value: 'snack',     label: 'SNACK',     emoji: '🍎', desc: 'Snack or extra meal' },
]

const RPE_LABELS = {
  1:'Very Light', 2:'Light', 3:'Moderate', 4:'Somewhat Hard',
  5:'Hard', 6:'Hard+', 7:'Very Hard', 8:'Very Hard+', 9:'Max Effort', 10:'All Out'
}

const emptyForm = { session_type:'', activity_name:'', duration_minutes:'', rpe:null, notes:'' }
const emptyNutritionForm = { meal_type:'', notes:'', tracking_link:'', goal_met: false }

export default function LogActivity() {
  const { profile } = useApp()
  const currentWeek = getCurrentWeek()
  const [weekNum, setWeekNum]           = useState(currentWeek)
  const [sessions, setSessions]         = useState([])
  const [nutritionLogs, setNutritionLogs] = useState([])
  const [weekSub, setWeekSub]           = useState(null)
  const [loading, setLoading]           = useState(true)
  const [activeTab, setActiveTab]       = useState('activity') // 'activity' | 'nutrition'
  const [showForm, setShowForm]         = useState(false)
  const [showNutritionForm, setShowNutritionForm] = useState(false)
  const [form, setForm]                 = useState(emptyForm)
  const [nutForm, setNutForm]           = useState(emptyNutritionForm)
  const [photoFile, setPhotoFile]       = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [nutPhotos, setNutPhotos]       = useState([]) // [{file, preview}]
  const [saving, setSaving]             = useState(false)
  const [savingNut, setSavingNut]       = useState(false)
  const [error, setError]               = useState('')
  const [nutError, setNutError]         = useState('')
  const [deletingId, setDeletingId]     = useState(null)
  const [nutritionGoals, setNutritionGoals] = useState({})
  const fileRef    = useRef()
  const nutFileRef = useRef()

  const deadline       = getWeekDeadline(weekNum)
  const isPastDeadline = new Date() > deadline
  const isLocked       = isPastDeadline || weekSub?.status === 'approved'

  // Calculate nutrition_days from distinct calendar days with nutrition logs
  const hasGoals = Object.keys(nutritionGoals).length > 0
  const nutritionDays = (() => {
    const qualifying = nutritionLogs.filter(l => hasGoals ? l.goal_met : true)
    const days = new Set(qualifying.map(l => new Date(l.logged_at).toDateString()))
    return days.size
  })()
  const totalLoggedDays = (() => {
    const days = new Set(nutritionLogs.map(l => new Date(l.logged_at).toDateString()))
    return days.size
  })()

  const workouts         = sessions.filter(s => s.session_type === 'workout'  && s.duration_minutes >= 30).length
  const recoverySessions = sessions.filter(s => s.session_type === 'recovery' && s.duration_minutes >= 20).length
  const socialSessions   = sessions.filter(s => s.session_type === 'social').length
  const pointsData       = { workouts, recovery_sessions: recoverySessions, social_sessions: socialSessions, nutrition_days: nutritionDays }
  const pts              = calculatePoints(pointsData)
  const bd               = breakdownPoints(pointsData)

  useEffect(() => { load() }, [weekNum, profile.id])

  async function load() {
    setLoading(true)
    const [{ data: sesh }, { data: nutLogs }, { data: sub }] = await Promise.all([
      supabase.from('sessions').select('*')
        .eq('user_id', profile.id).eq('week_number', weekNum)
        .neq('session_type', 'nutrition')
        .order('logged_at', { ascending: false }),
      supabase.from('sessions').select('*')
        .eq('user_id', profile.id).eq('week_number', weekNum)
        .eq('session_type', 'nutrition')
        .order('logged_at', { ascending: false }),
      supabase.from('weekly_submissions').select('*')
        .eq('user_id', profile.id).eq('week_number', weekNum).maybeSingle(),
    ])
    setSessions(sesh || [])
    setNutritionLogs(nutLogs || [])
    setWeekSub(sub)
    // Load user's nutrition goals (resilient — column may not exist yet)
    try {
      const { data: prof } = await supabase.from('profiles').select('nutrition_goals').eq('id', profile.id).single()
      setNutritionGoals(prof?.nutrition_goals || {})
    } catch(e) {
      setNutritionGoals({})
    }
    setLoading(false)
  }

  function setField(field, val) { setForm(f => ({ ...f, [field]: val })); setError('') }
  function setNutField(field, val) { setNutForm(f => ({ ...f, [field]: val })); setNutError('') }

  // --- Session photo ---
  function handlePhotoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }
  function removePhoto() {
    setPhotoFile(null)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // --- Nutrition photos (up to 3) ---
  function handleNutPhotoSelect(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const remaining = 3 - nutPhotos.length
    const toAdd = files.slice(0, remaining).map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setNutPhotos(prev => [...prev, ...toAdd])
    if (nutFileRef.current) nutFileRef.current.value = ''
  }
  function removeNutPhoto(idx) {
    setNutPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  async function uploadPhoto(file) {
    const ext  = file.name.split('.').pop()
    const path = `${profile.id}/sessions/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('proofs').upload(path, file)
    if (error) return null
    const { data: { publicUrl } } = supabase.storage.from('proofs').getPublicUrl(path)
    return publicUrl
  }

  async function syncWeeklySubmission(nutrDays) {
    // Always fetch fresh data from DB — never rely on stale state
    const [{ data: latestSessions }, { data: existingSub }] = await Promise.all([
      supabase.from('sessions').select('*').eq('user_id', profile.id).eq('week_number', weekNum),
      supabase.from('weekly_submissions').select('*').eq('user_id', profile.id).eq('week_number', weekNum).maybeSingle(),
    ])
    const s   = latestSessions || []
    const w   = s.filter(x => x.session_type === 'workout'  && x.duration_minutes >= 30).length
    const r   = s.filter(x => x.session_type === 'recovery' && x.duration_minutes >= 20).length
    const soc = s.filter(x => x.session_type === 'social').length
    const nutSessions = s.filter(x => x.session_type === 'nutrition')
    const hasGoals = Object.keys(nutritionGoals || {}).length > 0
    const goalMetSessions = nutSessions.filter(x => hasGoals ? x.goal_met : true)
    const nd = nutrDays !== undefined ? nutrDays : new Set(goalMetSessions.map(x => new Date(x.logged_at).toDateString())).size
    const calc = calculatePoints({ workouts: w, recovery_sessions: r, social_sessions: soc, nutrition_days: nd })
    const payload = {
      user_id: profile.id, week_number: weekNum,
      workouts: w, recovery_sessions: r, social_sessions: soc,
      nutrition_days: nd, calculated_points: calc,
      status: existingSub?.status === 'approved' ? 'approved' : 'submitted',
      submitted_at: existingSub?.submitted_at || new Date().toISOString(),
    }
    if (existingSub) {
      await supabase.from('weekly_submissions').update(payload).eq('id', existingSub.id)
    } else if (s.length > 0 || nd > 0) {
      await supabase.from('weekly_submissions').insert(payload)
    }
    // Update local state so subsequent syncs in same session know the row exists
    setWeekSub(existingSub || { ...payload })
    // Refresh leaderboard cache immediately
    await supabase.rpc('refresh_leaderboard_cache').catch(() => {})
  }

  async function addSession() {
    setError('')
    const type = SESSION_TYPES.find(t => t.value === form.session_type)
    if (!type) { setError('Please choose a session type.'); return }
    if (!form.duration_minutes || parseInt(form.duration_minutes) < 1) { setError('Please enter a duration.'); return }
    setSaving(true)
    const photoUrl = photoFile ? await uploadPhoto(photoFile) : null
    const { data: newSession, error: sessErr } = await supabase.from('sessions').insert({
      user_id: profile.id, week_number: weekNum,
      session_type: form.session_type, activity_name: form.activity_name || null,
      duration_minutes: parseInt(form.duration_minutes), rpe: form.rpe,
      photo_url: photoUrl, notes: form.notes || null,
    }).select().single()
    if (sessErr) { setError(sessErr.message); setSaving(false); return }
    const activityLabel = form.activity_name || type.label
    const durationText  = `${form.duration_minutes} mins`
    const rpeText       = form.rpe ? ` · RPE ${form.rpe}/10` : ''
    const notesText     = form.notes ? `\n"${form.notes}"` : ''
    const postContent   = `${type.emoji} ${activityLabel} — ${durationText}${rpeText}${notesText}\n#Week${weekNum} #ProjectOChallenge`
    await supabase.from('posts').insert({
      user_id: profile.id, content: postContent.slice(0, 500),
      session_id: newSession.id, photo_urls: photoUrl ? [photoUrl] : [],
    })
    await syncWeeklySubmission()
    setForm(emptyForm); removePhoto(); setShowForm(false); setSaving(false); load()
  }

  async function addNutritionLog() {
    setNutError('')
    if (!nutForm.meal_type) { setNutError('Please select a meal type.'); return }
    setSavingNut(true)

    // Upload up to 3 photos
    const uploadedUrls = []
    for (const { file } of nutPhotos) {
      const url = await uploadPhoto(file)
      if (url) uploadedUrls.push(url)
    }

    const mealLabel = MEAL_TYPES.find(m => m.value === nutForm.meal_type)?.label || 'Meal'
    const { error: nutErr } = await supabase.from('sessions').insert({
      user_id: profile.id, week_number: weekNum,
      session_type: 'nutrition',
      meal_type: nutForm.meal_type,
      activity_name: mealLabel,
      duration_minutes: 0,
      notes: nutForm.notes || null,
      tracking_link: nutForm.tracking_link || null,
      photo_urls: uploadedUrls.length > 0 ? uploadedUrls : null,
      ...(nutForm.goal_met !== undefined ? { goal_met: nutForm.goal_met } : {}),
    })
    if (nutErr) { setNutError(nutErr.message); setSavingNut(false); return }

    // Post to feed
    const nutEmoji = MEAL_TYPES.find(m => m.value === nutForm.meal_type)?.emoji || '🥗'
    const postContent = `${nutEmoji} ${mealLabel} logged${nutForm.notes ? `\n"${nutForm.notes}"` : ''}\n#Nutrition #Week${weekNum} #ProjectOChallenge`
    await supabase.from('posts').insert({
      user_id: profile.id, content: postContent.slice(0, 500),
      photo_urls: uploadedUrls,
    })

    await syncWeeklySubmission()
    setNutForm(emptyNutritionForm)
    setNutPhotos([])
    setShowNutritionForm(false)
    setSavingNut(false)
    load()
  }

  async function deleteSession(id) {
    setDeletingId(id)
    await supabase.from('sessions').delete().eq('id', id)
    await supabase.from('posts').delete().eq('session_id', id).eq('user_id', profile.id)
    await syncWeeklySubmission()
    setDeletingId(null)
    load()
  }

  const selectedType = SESSION_TYPES.find(t => t.value === form.session_type)

  if (loading) return (
    <div className="space-y-3 animate-pulse max-w-2xl mx-auto pt-2">
      {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-card rounded-3xl" />)}
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-3 pt-1 fade-up">

      {/* Header */}
      <div className="flex items-start justify-between py-1">
        <div>
          <p className="text-muted text-xs font-dm">Week {weekNum}: {getWeekLabel(weekNum)}</p>
          <h1 className="font-kanit font-bold italic uppercase text-2xl text-white">LOG ACTIVITY</h1>
        </div>
        <div className="bg-card border border-border rounded-2xl px-4 py-2 text-right">
          <p className="font-kanit font-semibold text-xl text-lime leading-none">{pts}<span className="text-muted text-sm">/11</span></p>
          <p className="text-muted text-xs font-dm">this week</p>
        </div>
      </div>

      {/* Week tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: currentWeek }, (_, i) => i + 1).map(w => (
          <button key={w} onClick={() => { setWeekNum(w); setShowForm(false); setShowNutritionForm(false) }}
            className={`px-3 py-1.5 rounded-2xl text-sm font-kanit font-semibold uppercase transition-all flex-shrink-0 ${
              weekNum === w ? 'bg-lime text-bg' : 'bg-card border border-border text-muted hover:text-white'
            }`}>WK {w}</button>
        ))}
      </div>

      {isLocked && (
        <div className="bg-blue-900/20 border border-blue-700/30 text-blue-300 text-sm rounded-2xl px-4 py-3 font-dm">
          {weekSub?.status === 'approved' ? '✓ This week has been approved.' : '🔒 Deadline passed for this week.'}
        </div>
      )}

      {/* Points breakdown */}
      <div className="bg-card border border-border rounded-3xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-kanit font-semibold uppercase text-sm text-white">POINTS</p>
          <div className="flex-1 mx-4 h-1.5 bg-soft rounded-full overflow-hidden">
            <div className="h-full bg-lime rounded-full transition-all duration-500" style={{ width: `${(pts/11)*100}%` }} />
          </div>
          <p className="text-xs text-muted font-dm">{pts}/11</p>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {[
            { label: '💪', sub: 'Workout', p: bd.workout_pts, max: 6 },
            { label: '🧘', sub: 'Recovery', p: bd.recovery_pts, max: 1 },
            { label: '🤝', sub: 'Social', p: bd.social_pts, max: 1 },
            { label: '🥗', sub: 'Nutrition', p: bd.nutrition_pts, max: 2, extra: `${nutritionDays}d` },
            { label: '⭐', sub: 'Bonus', p: bd.bonus_pts, max: 1 },
          ].map(({ label, sub, p, max, extra }) => (
            <div key={sub} className={`rounded-2xl p-2 text-center border ${p > 0 ? 'border-lime/20 bg-lime/5' : 'border-border bg-soft'}`}>
              <p>{label}</p>
              <p className="text-muted text-xs font-dm">{sub}</p>
              <p className={`font-kanit font-semibold text-base leading-tight mt-0.5 ${p > 0 ? 'text-lime' : 'text-border'}`}>{p}<span className="text-muted text-xs">/{max}</span></p>
              {extra && <p className="text-xs text-muted font-dm">{extra}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2">
        <button onClick={() => { setActiveTab('activity'); setShowNutritionForm(false) }}
          className={`flex-1 py-2.5 rounded-2xl text-sm font-kanit font-semibold uppercase transition-all ${activeTab === 'activity' ? 'bg-lime text-bg' : 'bg-card border border-border text-muted hover:text-white'}`}>
          💪 ACTIVITY
        </button>
        <button onClick={() => { setActiveTab('nutrition'); setShowForm(false) }}
          className={`flex-1 py-2.5 rounded-2xl text-sm font-kanit font-semibold uppercase transition-all ${activeTab === 'nutrition' ? 'bg-lime text-bg' : 'bg-card border border-border text-muted hover:text-white'}`}>
          🥗 NUTRITION {nutritionDays > 0 ? `· ${nutritionDays}d` : ''}
        </button>
      </div>

      {/* ─── ACTIVITY TAB ─── */}
      {activeTab === 'activity' && (
        <>
          <div className="flex items-center justify-between">
            <p className="font-kanit font-semibold uppercase text-sm text-white">SESSIONS THIS WEEK</p>
            {!isLocked && !showForm && (
              <button onClick={() => setShowForm(true)}
                className="bg-lime text-bg font-kanit font-semibold uppercase text-xs px-4 py-2 rounded-2xl shadow-lime-sm active:scale-95 transition-all">
                + ADD
              </button>
            )}
          </div>

          {sessions.length === 0 && !showForm ? (
            <div className="border border-dashed border-border rounded-3xl p-8 text-center">
              <p className="text-muted font-dm text-sm">No sessions logged yet.</p>
              {!isLocked && <button onClick={() => setShowForm(true)} className="mt-2 text-lime text-sm font-dm hover:underline">Log your first session →</button>}
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => {
                const type = SESSION_TYPES.find(t => t.value === s.session_type)
                const meetsMin = type?.minDuration ? s.duration_minutes >= type.minDuration : true
                return (
                  <div key={s.id} className={`bg-card border rounded-3xl overflow-hidden ${!meetsMin ? 'border-yellow-800/40' : 'border-border'}`}>
                    {s.photo_url && <img src={s.photo_url} alt="proof" className="w-full h-40 object-cover" />}
                    <div className="p-3 flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <span className="text-xl mt-0.5">{type?.emoji || '🏃'}</span>
                        <div>
                          <p className="font-kanit font-semibold text-sm text-white uppercase">{s.activity_name || s.session_type}</p>
                          <p className="text-muted text-xs font-dm">
                            {s.duration_minutes} min{s.rpe ? ` · RPE ${s.rpe}` : ''}
                            {!meetsMin && <span className="text-yellow-500"> · needs {type?.minDuration}+ min</span>}
                          </p>
                          {s.notes && <p className="text-gray-400 text-xs font-dm mt-1">"{s.notes}"</p>}
                        </div>
                      </div>
                      {!isLocked && (
                        <button onClick={() => deleteSession(s.id)} disabled={deletingId === s.id}
                          className="text-muted hover:text-red-400 text-sm transition-colors flex-shrink-0 p-1">
                          {deletingId === s.id ? '…' : '×'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Session form */}
          {showForm && !isLocked && (
            <div className="bg-card border border-border rounded-3xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-kanit font-bold italic uppercase text-base text-white">LOG SESSION</p>
                <button onClick={() => { setShowForm(false); setForm(emptyForm); removePhoto() }}
                  className="text-muted hover:text-white text-xl">×</button>
              </div>
              {error && <div className="bg-red-900/20 border border-red-800/40 text-red-400 text-sm rounded-2xl px-4 py-3 font-dm">{error}</div>}

              <div>
                <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">SESSION TYPE</p>
                <div className="grid grid-cols-3 gap-2">
                  {SESSION_TYPES.map(type => (
                    <button key={type.value} onClick={() => setField('session_type', type.value)}
                      className={`rounded-2xl p-3 text-center border transition-all ${
                        form.session_type === type.value ? 'border-lime/40 bg-lime/10 text-white' : 'border-border text-muted hover:text-white'
                      }`}>
                      <p className="text-2xl">{type.emoji}</p>
                      <p className="text-xs font-kanit font-semibold uppercase mt-1">{type.label}</p>
                      {type.minDuration > 0 && <p className="text-xs text-muted font-dm">{type.minDuration}+ min</p>}
                    </button>
                  ))}
                </div>
                {selectedType && <p className="text-xs text-muted font-dm mt-2">{selectedType.examples}</p>}
              </div>

              {form.session_type && (
                <div>
                  <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">ACTIVITY</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(ACTIVITY_OPTIONS[form.session_type] || []).map(opt => (
                      <button key={opt} onClick={() => setField('activity_name', opt)}
                        className={`text-xs px-3 py-1.5 rounded-2xl border font-dm transition-all ${
                          form.activity_name === opt ? 'border-lime/40 bg-lime/10 text-lime' : 'border-border text-muted hover:text-white'
                        }`}>{opt}</button>
                    ))}
                  </div>
                  <input type="text" value={form.activity_name} onChange={e => setField('activity_name', e.target.value)}
                    placeholder="Or type your own…"
                    className="w-full bg-soft border border-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 font-dm" />
                </div>
              )}

              <div>
                <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">
                  DURATION (MINS){selectedType?.minDuration > 0 ? ` · ${selectedType.minDuration}+ TO COUNT` : ''}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="number" min="1" max="600" value={form.duration_minutes}
                    onChange={e => setField('duration_minutes', e.target.value)} placeholder="e.g. 60"
                    className="w-24 bg-soft border border-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 font-dm" />
                  {[20, 30, 45, 60, 90].map(d => (
                    <button key={d} onClick={() => setField('duration_minutes', d)}
                      className={`text-xs px-3 py-2 rounded-2xl border font-dm transition-all ${
                        parseInt(form.duration_minutes) === d ? 'border-lime/40 bg-lime/10 text-lime' : 'border-border text-muted hover:text-white'
                      }`}>{d}m</button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">
                  RPE{form.rpe ? ` — ${form.rpe}/10 · ${RPE_LABELS[form.rpe]}` : ' (OPTIONAL)'}
                </p>
                <div className="flex gap-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                    <button key={n} onClick={() => setField('rpe', form.rpe === n ? null : n)}
                      className={`flex-1 h-9 rounded-xl text-sm font-kanit font-semibold transition-all ${
                        form.rpe === n
                          ? n <= 3 ? 'bg-green-500 text-white' : n <= 6 ? 'bg-lime text-bg' : 'bg-red-500 text-white'
                          : 'bg-soft border border-border text-muted hover:text-white'
                      }`}>{n}</button>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-muted font-dm mt-1"><span>Easy</span><span>Max effort</span></div>
              </div>

              <div>
                <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">PROOF PHOTO</p>
                {photoPreview ? (
                  <div className="relative rounded-2xl overflow-hidden">
                    <img src={photoPreview} alt="proof preview" className="w-full h-48 object-cover" />
                    <button onClick={removePhoto}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg hover:bg-black/80">×</button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()}
                    className="w-full h-32 border border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-2 text-muted hover:text-white hover:border-lime/40 transition-colors">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <p className="text-xs font-dm">TAP TO ADD PHOTO PROOF</p>
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
              </div>

              <div>
                <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">NOTES (OPTIONAL)</p>
                <textarea value={form.notes} onChange={e => setField('notes', e.target.value)}
                  placeholder="Anything worth mentioning…" rows={2}
                  className="w-full bg-soft border border-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 resize-none font-dm" />
              </div>

              <button onClick={addSession} disabled={saving}
                className="w-full bg-lime text-bg font-kanit font-bold uppercase text-lg py-4 rounded-2xl shadow-lime-glow disabled:opacity-50 active:scale-95 transition-all">
                {saving ? 'SAVING…' : 'LOG SESSION'}
              </button>
              <p className="text-xs text-muted font-dm text-center">This will also post to your feed automatically</p>
            </div>
          )}
        </>
      )}

      {/* ─── NUTRITION TAB ─── */}
      {activeTab === 'nutrition' && (
        <>
          {/* Progress strip — compact, same style as activity header area */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-kanit font-semibold uppercase text-sm text-white">NUTRITION THIS WEEK</p>
              <div className="flex gap-1 mt-1.5">
                {Array.from({ length: 7 }, (_, i) => i + 1).map(d => (
                  <div key={d} className={`w-6 h-2 rounded-full transition-all ${d <= nutritionDays ? 'bg-lime' : 'bg-soft'}`} />
                ))}
              </div>
              <p className={`text-xs font-dm mt-1 ${bd.nutrition_pts >= 2 ? 'text-lime' : bd.nutrition_pts >= 1 ? 'text-green-400' : 'text-muted'}`}>
                {nutritionDays >= 6 ? '2 pts — great week!' : nutritionDays >= 5 ? '1 pt — log 1 more for 2pts' : `Log ${Math.max(0,5 - nutritionDays)} more day${5 - nutritionDays !== 1 ? 's' : ''} to earn points`}
              </p>
            </div>
            {!isLocked && !showNutritionForm && (
              <button onClick={() => setShowNutritionForm(true)}
                className="bg-lime text-bg font-kanit font-semibold uppercase text-xs px-4 py-2 rounded-2xl shadow-lime-sm active:scale-95 transition-all flex-shrink-0">
                + ADD
              </button>
            )}
          </div>

          {/* Nutrition form */}
          {showNutritionForm && !isLocked && (
            <div className="bg-card border border-border rounded-3xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-kanit font-bold italic uppercase text-base text-white">LOG NUTRITION</p>
                <button onClick={() => { setShowNutritionForm(false); setNutForm(emptyNutritionForm); setNutPhotos([]) }}
                  className="text-muted hover:text-white text-xl">×</button>
              </div>
              {nutError && <div className="bg-red-900/20 border border-red-800/40 text-red-400 text-sm rounded-2xl px-4 py-3 font-dm">{nutError}</div>}

              {/* Meal type */}
              <div>
                <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">WHAT ARE YOU LOGGING?</p>
                <div className="grid grid-cols-2 gap-2">
                  {MEAL_TYPES.map(m => (
                    <button key={m.value} onClick={() => setNutField('meal_type', m.value)}
                      className={`rounded-2xl p-3 text-left border transition-all ${
                        nutForm.meal_type === m.value ? 'border-lime/40 bg-lime/10' : 'border-border hover:border-lime/20'
                      }`}>
                      <span className="text-xl">{m.emoji}</span>
                      <p className={`text-xs font-kanit font-semibold uppercase mt-1 ${nutForm.meal_type === m.value ? 'text-lime' : 'text-white'}`}>{m.label}</p>
                      <p className="text-xs text-muted font-dm">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Photos (up to 3) */}
              <div>
                <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">
                  PHOTOS ({nutPhotos.length}/3) — OPTIONAL
                </p>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {nutPhotos.map((p, i) => (
                    <div key={i} className="relative rounded-2xl overflow-hidden aspect-square">
                      <img src={p.preview} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removeNutPhoto(i)}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">×</button>
                    </div>
                  ))}
                  {nutPhotos.length < 3 && (
                    <button onClick={() => nutFileRef.current?.click()}
                      className="aspect-square rounded-2xl border border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted hover:text-white hover:border-lime/40 transition-colors">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                      <p className="text-xs font-dm">Add</p>
                    </button>
                  )}
                </div>
                <input ref={nutFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleNutPhotoSelect} />
              </div>

              {/* Tracking link */}
              <div>
                <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">TRACKING APP LINK (OPTIONAL)</p>
                <input type="url" value={nutForm.tracking_link}
                  onChange={e => setNutField('tracking_link', e.target.value)}
                  placeholder="MyFitnessPal, Cronometer link…"
                  className="w-full bg-soft border border-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 font-dm" />
              </div>

              {/* Notes */}
              <div>
                <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">NOTES (OPTIONAL)</p>
                <textarea value={nutForm.notes} onChange={e => setNutField('notes', e.target.value)}
                  placeholder="What did you eat? Any wins today?…" rows={2}
                  className="w-full bg-soft border border-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 resize-none font-dm" />
              </div>

              {/* Goal checkbox */}
              {hasGoals && (
                <div className={`rounded-2xl border p-4 transition-all ${nutForm.goal_met ? 'border-lime/40 bg-lime/5' : 'border-border'}`}>
                  <p className="text-xs font-dm text-muted uppercase tracking-widest mb-3">YOUR DAILY GOALS</p>
                  <div className="space-y-2 mb-3">
                    {Object.entries(nutritionGoals).filter(([k, v]) => v).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs text-white font-dm capitalize">{key.replace(/_/g, ' ')}:</span>
                        <span className="text-xs text-lime font-kanit font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setNutField('goal_met', !nutForm.goal_met)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                      nutForm.goal_met ? 'border-lime/40 bg-lime/10' : 'border-border hover:border-lime/20'
                    }`}>
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                      nutForm.goal_met ? 'bg-lime border-lime' : 'border-border'
                    }`}>
                      {nutForm.goal_met && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-kanit font-semibold uppercase ${nutForm.goal_met ? 'text-lime' : 'text-white'}`}>
                        {nutForm.goal_met ? 'Goal Reached!' : 'Did you reach your goal today?'}
                      </p>
                      <p className="text-xs text-muted font-dm">Tick this to earn nutrition points</p>
                    </div>
                  </button>
                  {!nutForm.goal_met && (
                    <p className="text-xs text-yellow-400 font-dm mt-2">You need to reach your goal to earn points for this log.</p>
                  )}
                </div>
              )}

              {!hasGoals && (
                <div className="bg-soft border border-border rounded-2xl p-3">
                  <p className="text-xs text-muted font-dm">Set your nutrition goals in the <span className="text-lime">Me</span> tab to track goal completion and earn points.</p>
                </div>
              )}

              <button onClick={addNutritionLog} disabled={savingNut}
                className="w-full bg-lime text-bg font-kanit font-bold uppercase text-lg py-4 rounded-2xl shadow-lime-glow disabled:opacity-50 active:scale-95 transition-all">
                {savingNut ? 'SAVING…' : 'LOG NUTRITION'}
              </button>
              <p className="text-xs text-muted font-dm text-center">This will also post to your feed automatically</p>
            </div>
          )}

          {nutritionLogs.length === 0 && !showNutritionForm && (
            <div className="border border-dashed border-border rounded-3xl p-8 text-center">
              <p className="text-muted font-dm text-sm">No nutrition logged yet.</p>
              {!isLocked && <button onClick={() => setShowNutritionForm(true)} className="mt-2 text-lime text-sm font-dm hover:underline">Log your first meal</button>}
            </div>
          )}

          {/* Nutrition log list */}
          {nutritionLogs.length > 0 && (
            <div className="space-y-2">
              <p className="font-kanit font-semibold uppercase text-sm text-white">NUTRITION LOGS</p>
              {nutritionLogs.map(log => {
                const meal = MEAL_TYPES.find(m => m.value === log.meal_type)
                const logDate = new Date(log.logged_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
                return (
                  <div key={log.id} className="bg-card border border-border rounded-3xl overflow-hidden">
                    {log.photo_urls?.length > 0 && (
                      <div className={`grid gap-1 ${log.photo_urls.length === 1 ? 'grid-cols-1' : log.photo_urls.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {log.photo_urls.map((url, i) => (
                          <img key={i} src={url} alt="" className={`w-full object-cover ${log.photo_urls.length === 1 ? 'h-48' : 'h-28'}`} />
                        ))}
                      </div>
                    )}
                    <div className="p-3 flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <span className="text-xl mt-0.5">{meal?.emoji || '🥗'}</span>
                        <div>
                          <p className="font-kanit font-semibold text-sm text-white uppercase">{meal?.label || 'Nutrition'}</p>
                          <p className="text-muted text-xs font-dm">{logDate}</p>
                          {log.notes && <p className="text-gray-400 text-xs font-dm mt-1">"{log.notes}"</p>}
                          {log.tracking_link && (
                            <a href={log.tracking_link} target="_blank" rel="noopener noreferrer"
                              className="text-lime text-xs font-dm hover:underline mt-1 block">📊 View tracking →</a>
                          )}
                        </div>
                      </div>
                      {!isLocked && (
                        <button onClick={() => deleteSession(log.id)} disabled={deletingId === log.id}
                          className="text-muted hover:text-red-400 text-sm transition-colors flex-shrink-0 p-1">
                          {deletingId === log.id ? '…' : '×'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
