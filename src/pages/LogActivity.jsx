import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'
import { getCurrentWeek, getWeekLabel, getWeekDeadline, calculatePoints, breakdownPoints } from '../utils/points'

const SESSION_TYPES = [
  { value: 'workout',  label: 'WORKOUT',  emoji: '💪', minDuration: 30, color: 'lime',  examples: 'Gym, run, football, class, training…' },
  { value: 'recovery', label: 'RECOVERY', emoji: '🧘', minDuration: 20, color: 'blue',  examples: 'Stretching, yoga, sauna, massage gun…' },
  { value: 'social',   label: 'SOCIAL',   emoji: '🤝', minDuration: 0,  color: 'green', examples: '5-a-side, group class, training with someone…' },
]

const ACTIVITY_OPTIONS = {
  workout:  ['Gym', 'Run', 'Football', 'Basketball', 'Cycling', 'Swimming', 'HIIT', 'Boxing', 'CrossFit', 'Pilates', 'Other'],
  recovery: ['Stretching', 'Yoga', 'Mobility', 'Sauna', 'Ice Bath', 'Massage Gun', 'Foam Rolling', 'Other'],
  social:   ['5-a-side', 'Group Class', 'Tennis', 'Basketball', 'Training with friend', 'Team sport', 'Other'],
}

const RPE_LABELS = {
  1:'Very Light', 2:'Light', 3:'Moderate', 4:'Somewhat Hard',
  5:'Hard', 6:'Hard+', 7:'Very Hard', 8:'Very Hard+', 9:'Max Effort', 10:'All Out'
}

const emptyForm = { session_type:'', activity_name:'', duration_minutes:'', rpe:null, notes:'' }

export default function LogActivity() {
  const { profile } = useApp()
  const currentWeek = getCurrentWeek()
  const [weekNum, setWeekNum]     = useState(currentWeek)
  const [sessions, setSessions]   = useState([])
  const [weekSub, setWeekSub]     = useState(null)
  const [nutritionDays, setNutritionDays] = useState(0)
  const [savingNutrition, setSavingNutrition] = useState(false)
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const fileRef = useRef()

  const deadline      = getWeekDeadline(weekNum)
  const isPastDeadline = new Date() > deadline
  const isLocked      = isPastDeadline || weekSub?.status === 'approved'

  useEffect(() => { load() }, [weekNum, profile.id])

  async function load() {
    setLoading(true)
    const [{ data: sesh }, { data: sub }] = await Promise.all([
      supabase.from('sessions').select('*').eq('user_id', profile.id).eq('week_number', weekNum).order('logged_at', { ascending: false }),
      supabase.from('weekly_submissions').select('*').eq('user_id', profile.id).eq('week_number', weekNum).maybeSingle(),
    ])
    setSessions(sesh || [])
    setWeekSub(sub)
    setNutritionDays(sub?.nutrition_days ?? 0)
    setLoading(false)
  }

  const workouts        = sessions.filter(s => s.session_type === 'workout'  && s.duration_minutes >= 30).length
  const recoverySessions = sessions.filter(s => s.session_type === 'recovery' && s.duration_minutes >= 20).length
  const socialSessions  = sessions.filter(s => s.session_type === 'social').length
  const pointsData      = { workouts, recovery_sessions: recoverySessions, social_sessions: socialSessions, nutrition_days: nutritionDays }
  const pts             = calculatePoints(pointsData)
  const bd              = breakdownPoints(pointsData)

  function setField(field, val) { setForm(f => ({ ...f, [field]: val })); setError('') }

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

  async function uploadPhoto() {
    if (!photoFile) return null
    const ext  = photoFile.name.split('.').pop()
    const path = `${profile.id}/sessions/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('proofs').upload(path, photoFile)
    if (error) return null
    const { data: { publicUrl } } = supabase.storage.from('proofs').getPublicUrl(path)
    return publicUrl
  }

  async function addSession() {
    setError('')
    const type = SESSION_TYPES.find(t => t.value === form.session_type)
    if (!type)                                       { setError('Please choose a session type.'); return }
    if (!form.duration_minutes || parseInt(form.duration_minutes) < 1) { setError('Please enter a duration.'); return }
    setSaving(true)

    // Upload photo first if attached
    const photoUrl = await uploadPhoto()

    // Save session
    const { data: newSession, error: sessErr } = await supabase.from('sessions').insert({
      user_id:          profile.id,
      week_number:      weekNum,
      session_type:     form.session_type,
      activity_name:    form.activity_name || null,
      duration_minutes: parseInt(form.duration_minutes),
      rpe:              form.rpe,
      photo_url:        photoUrl,
      notes:            form.notes || null,
    }).select().single()

    if (sessErr) { setError(sessErr.message); setSaving(false); return }

    // Auto-post to feed
    const activityLabel = form.activity_name || type.label
    const durationText  = `${form.duration_minutes} mins`
    const rpeText       = form.rpe ? ` · RPE ${form.rpe}/10` : ''
    const notesText     = form.notes ? `\n"${form.notes}"` : ''
    const postContent   = `${type.emoji} ${activityLabel} — ${durationText}${rpeText}${notesText}\n#Week${weekNum} #ProjectOChallenge`

    await supabase.from('posts').insert({
      user_id:    profile.id,
      content:    postContent.slice(0, 500),
      session_id: newSession.id,
      photo_urls: photoUrl ? [photoUrl] : [],
    })

    // Sync weekly submission
    await syncWeeklySubmission()

    // Reset form
    setForm(emptyForm)
    removePhoto()
    setShowForm(false)
    setSaving(false)
    load()
  }

  async function deleteSession(id) {
    setDeletingId(id)
    await supabase.from('sessions').delete().eq('id', id)
    // Also delete the auto-post for this session
    await supabase.from('posts').delete().eq('session_id', id).eq('user_id', profile.id)
    await syncWeeklySubmission()
    setDeletingId(null)
    load()
  }

  async function saveNutrition(days) {
    setNutritionDays(days)
    setSavingNutrition(true)
    await syncWeeklySubmission(days)
    setSavingNutrition(false)
  }

  async function syncWeeklySubmission(overrideNutrition) {
    const { data: latestSessions } = await supabase.from('sessions').select('*').eq('user_id', profile.id).eq('week_number', weekNum)
    const s   = latestSessions || []
    const w   = s.filter(x => x.session_type === 'workout'  && x.duration_minutes >= 30).length
    const r   = s.filter(x => x.session_type === 'recovery' && x.duration_minutes >= 20).length
    const soc = s.filter(x => x.session_type === 'social').length
    const nd  = overrideNutrition !== undefined ? overrideNutrition : nutritionDays
    const calc = calculatePoints({ workouts: w, recovery_sessions: r, social_sessions: soc, nutrition_days: nd })
    const payload = {
      user_id: profile.id, week_number: weekNum,
      workouts: w, recovery_sessions: r, social_sessions: soc,
      nutrition_days: nd, calculated_points: calc,
      status: weekSub?.status === 'approved' ? 'approved' : 'submitted',
      submitted_at: weekSub?.submitted_at || new Date().toISOString(),
    }
    if (weekSub) {
      await supabase.from('weekly_submissions').update(payload).eq('id', weekSub.id)
    } else if (s.length > 0 || nd > 0) {
      await supabase.from('weekly_submissions').insert(payload)
    }
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
          <button key={w} onClick={() => { setWeekNum(w); setShowForm(false) }}
            className={`px-3 py-1.5 rounded-2xl text-sm font-kanit font-semibold uppercase transition-all flex-shrink-0 ${
              weekNum === w ? 'bg-lime text-bg' : 'bg-card border border-border text-muted hover:text-white'
            }`}>
            WK {w}
          </button>
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
            { label: '🥗', sub: 'Nutrition', p: bd.nutrition_pts, max: 2 },
            { label: '⭐', sub: 'Bonus', p: bd.bonus_pts, max: 1 },
          ].map(({ label, sub, p, max }) => (
            <div key={sub} className={`rounded-2xl p-2 text-center border ${p > 0 ? 'border-lime/20 bg-lime/5' : 'border-border bg-soft'}`}>
              <p>{label}</p>
              <p className="text-muted text-xs font-dm">{sub}</p>
              <p className={`font-kanit font-semibold text-base leading-tight mt-0.5 ${p > 0 ? 'text-lime' : 'text-border'}`}>{p}<span className="text-muted text-xs">/{max}</span></p>
            </div>
          ))}
        </div>
      </div>

      {/* Sessions list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="font-kanit font-semibold uppercase text-sm text-white">SESSIONS THIS WEEK</p>
          {!isLocked && !showForm && (
            <button onClick={() => setShowForm(true)}
              className="bg-lime text-bg font-kanit font-semibold uppercase text-xs px-4 py-2 rounded-2xl shadow-lime-sm transition-all active:scale-95">
              + ADD
            </button>
          )}
        </div>

        {sessions.length === 0 && !showForm ? (
          <div className="border border-dashed border-border rounded-3xl p-8 text-center">
            <p className="text-muted font-dm text-sm">No sessions logged yet.</p>
            {!isLocked && (
              <button onClick={() => setShowForm(true)} className="mt-2 text-lime text-sm font-dm hover:underline">
                Log your first session →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => {
              const type = SESSION_TYPES.find(t => t.value === s.session_type)
              const meetsMin = type?.minDuration ? s.duration_minutes >= type.minDuration : true
              return (
                <div key={s.id} className={`bg-card border rounded-3xl overflow-hidden ${!meetsMin ? 'border-yellow-800/40' : 'border-border'}`}>
                  {/* Photo if attached */}
                  {s.photo_url && (
                    <img src={s.photo_url} alt="proof" className="w-full h-40 object-cover" />
                  )}
                  <div className="px-4 py-3 flex items-center gap-3">
                    <span className="text-2xl flex-shrink-0">{type?.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-kanit font-semibold uppercase text-sm text-white">{s.activity_name || type?.label}</p>
                        {!meetsMin && <span className="text-xs text-yellow-500 font-dm">⚠ Under minimum</span>}
                      </div>
                      <p className="text-xs text-muted font-dm mt-0.5">
                        ⏱ {s.duration_minutes} min
                        {s.rpe ? ` · RPE ${s.rpe}/10 — ${RPE_LABELS[s.rpe]}` : ''}
                      </p>
                      {s.notes && <p className="text-xs text-muted font-dm italic mt-0.5">"{s.notes}"</p>}
                    </div>
                    {!isLocked && (
                      <button onClick={() => deleteSession(s.id)} disabled={deletingId === s.id}
                        className="text-muted hover:text-red-400 transition-colors text-lg w-8 h-8 flex items-center justify-center rounded-xl hover:bg-red-900/20 flex-shrink-0">
                        {deletingId === s.id ? '…' : '×'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add session form */}
      {showForm && !isLocked && (
        <div className="bg-card border border-lime/20 rounded-3xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-kanit font-bold italic uppercase text-lg text-white">NEW SESSION</p>
            <button onClick={() => { setShowForm(false); setForm(emptyForm); removePhoto(); setError('') }}
              className="text-muted hover:text-white text-2xl w-8 h-8 flex items-center justify-center rounded-xl">×</button>
          </div>

          {error && <div className="bg-red-900/20 border border-red-800/40 text-red-400 text-sm rounded-2xl px-4 py-3 font-dm">{error}</div>}

          {/* Session type */}
          <div>
            <p className="text-xs font-dm text-muted uppercase tracking-widest mb-2">SESSION TYPE</p>
            <div className="grid grid-cols-3 gap-2">
              {SESSION_TYPES.map(type => (
                <button key={type.value} onClick={() => setField('session_type', type.value)}
                  className={`py-3 rounded-2xl border text-center transition-all ${
                    form.session_type === type.value
                      ? type.value === 'workout'  ? 'border-lime/40 bg-lime/10 text-lime'
                      : type.value === 'recovery' ? 'border-blue-500/40 bg-blue-900/20 text-blue-400'
                      : 'border-green-500/40 bg-green-900/20 text-green-400'
                      : 'border-border text-muted hover:text-white'
                  }`}>
                  <p className="text-2xl">{type.emoji}</p>
                  <p className="text-xs font-kanit font-semibold uppercase mt-1">{type.label}</p>
                  {type.minDuration > 0 && <p className="text-xs text-muted font-dm">{type.minDuration}+ min</p>}
                </button>
              ))}
            </div>
            {selectedType && <p className="text-xs text-muted font-dm mt-2">{selectedType.examples}</p>}
          </div>

          {/* Activity */}
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

          {/* Duration */}
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

          {/* RPE */}
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
            <div className="flex justify-between text-xs text-muted font-dm mt-1">
              <span>Easy</span><span>Max effort</span>
            </div>
          </div>

          {/* Photo proof */}
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
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <p className="text-xs font-dm">TAP TO ADD PHOTO PROOF</p>
                <p className="text-xs text-muted font-dm">Strava, watch screenshot, gym photo…</p>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
          </div>

          {/* Notes */}
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

      {/* Nutrition */}
      <div className="bg-card border border-border rounded-3xl p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="font-kanit font-semibold uppercase text-sm text-white">🥗 NUTRITION</p>
          {savingNutrition && <span className="text-xs text-muted font-dm animate-pulse">Saving…</span>}
        </div>
        <p className="text-muted text-xs font-dm mb-3">How many days did you eat well this week?</p>
        <div className="flex gap-1.5">
          {Array.from({ length: 8 }, (_, i) => i).map(d => (
            <button key={d} disabled={isLocked} onClick={() => saveNutrition(d)}
              className={`flex-1 py-2.5 rounded-2xl text-sm font-kanit font-semibold transition-all ${
                nutritionDays === d ? 'bg-lime text-bg' : 'bg-soft border border-border text-muted hover:text-white disabled:opacity-40'
              }`}>{d}</button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted font-dm mt-2">
          <span>0 days</span>
          <span className={nutritionDays >= 6 ? 'text-lime font-kanit font-semibold' : nutritionDays >= 5 ? 'text-green-400' : ''}>
            {nutritionDays >= 6 ? '🔥 2 pts' : nutritionDays >= 5 ? '✓ 1 pt' : nutritionDays > 0 ? 'Need 5+ for points' : '5+ days for points'}
          </span>
          <span>7 days</span>
        </div>
      </div>

    </div>
  )
}
