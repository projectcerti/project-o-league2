import { useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'
import LanePicker from '../components/LanePicker'

const STEPS = ['photo', 'username', 'lane', 'rules']

export default function Onboarding() {
  const { profile, refetchProfile } = useApp()
  const [step, setStep] = useState(0)
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [lane, setLane] = useState('')
  const [lanePublic, setLanePublic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoError, setPhotoError] = useState('')
  const fileRef = useRef()

  const progress = ((step + 1) / STEPS.length) * 100

  function handlePhotoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setPhotoError('')
  }

  async function uploadPhoto() {
    if (!photoFile) return null
    const ext  = photoFile.name.split('.').pop()
    const path = profile.id + '/avatar/profile.' + ext
    await supabase.storage.from('proofs').remove([path])
    const { error } = await supabase.storage.from('proofs').upload(path, photoFile, { contentType: photoFile.type })
    if (error) return null
    const { data: { publicUrl } } = supabase.storage.from('proofs').getPublicUrl(path)
    return publicUrl
  }

  async function checkUsername() {
    const u = username.toLowerCase().trim()
    if (!u) { setUsernameError('Please enter a username.'); return false }
    if (!/^[a-z0-9_]{3,20}$/.test(u)) {
      setUsernameError('3–20 chars: lowercase letters, numbers, underscores only.')
      return false
    }
    const { data } = await supabase.from('profiles').select('id').eq('username', u).neq('id', profile.id).maybeSingle()
    if (data) { setUsernameError('That username is already taken.'); return false }
    setUsernameError('')
    return true
  }

  async function nextStep() {
    // Validate current step
    if (step === 0) {
      if (!photoFile) { setPhotoError('Please add a profile photo to continue.'); return }
    }
    if (step === 1) {
      const ok = await checkUsername()
      if (!ok) return
    }
    if (step === 2 && !lane) return

    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
      return
    }

    // Final step — save everything
    await finish()
  }

  async function finish() {
    setSaving(true)
    const avatarUrl = await uploadPhoto()
    await supabase.from('profiles').update({
      username:    username.toLowerCase().trim(),
      avatar_url:  avatarUrl,
      lane,
      lane_public: lanePublic,
      onboarded:   true,
    }).eq('id', profile.id)
    await refetchProfile()
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Progress bar */}
      <div className="w-full h-1 bg-border">
        <div className="h-full bg-lime transition-all duration-500" style={{ width: progress + '%' }} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 py-8">
        <div className="w-full max-w-md">

          {/* Logo */}
          <div className="text-center mb-8">
            <img src="/logo.png" alt="Project Challenge" className="h-12 w-auto mx-auto" />
            <p className="text-muted text-xs font-dm mt-2 uppercase tracking-widest">
              Step {step + 1} of {STEPS.length}
            </p>
          </div>

          {/* Step 0: Profile Photo */}
          {step === 0 && (
            <div className="space-y-5">
              <div className="text-center">
                <h1 className="font-kanit font-bold italic uppercase text-3xl text-white">ADD YOUR PHOTO</h1>
                <p className="text-muted text-sm font-dm mt-2">This is how the league will see you</p>
              </div>

              {/* Photo upload area */}
              <div className="flex flex-col items-center gap-4">
                <button onClick={() => fileRef.current?.click()}
                  className="relative group">
                  {photoPreview ? (
                    <div className="relative">
                      <img src={photoPreview} alt="preview"
                        className="w-32 h-32 rounded-3xl object-cover border-2 border-lime shadow-lime-glow" />
                      <div className="absolute inset-0 bg-black/40 rounded-3xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-white text-xs font-dm">CHANGE</p>
                      </div>
                    </div>
                  ) : (
                    <div className="w-32 h-32 rounded-3xl border-2 border-dashed border-border bg-card flex flex-col items-center justify-center gap-2 group-hover:border-lime transition-colors">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted group-hover:text-lime transition-colors">
                        <rect x="3" y="3" width="18" height="18" rx="3"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <p className="text-muted text-xs font-dm group-hover:text-lime transition-colors">TAP TO UPLOAD</p>
                    </div>
                  )}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />

                {photoPreview && (
                  <p className="text-lime text-sm font-dm">✓ Photo selected</p>
                )}
                {photoError && (
                  <p className="text-red-400 text-sm font-dm text-center">{photoError}</p>
                )}

                <p className="text-muted text-xs font-dm text-center">
                  Use a clear photo of yourself so your teammates can recognise you
                </p>
              </div>
            </div>
          )}

          {/* Step 1: Username */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-center">
                <h1 className="font-kanit font-bold italic uppercase text-3xl text-white">SET YOUR USERNAME</h1>
                <p className="text-muted text-sm font-dm mt-2">How the league will know you</p>
              </div>

              {/* Preview */}
              <div className="flex items-center gap-3 bg-card border border-border rounded-2xl p-4">
                {photoPreview && (
                  <img src={photoPreview} alt="preview" className="w-10 h-10 rounded-2xl object-cover" />
                )}
                <div>
                  <p className="font-kanit font-semibold text-white text-sm">{profile?.full_name}</p>
                  <p className="text-lime text-sm font-dm">@{username || 'yourusername'}</p>
                </div>
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-dm">@</span>
                <input type="text" value={username}
                  onChange={e => { setUsername(e.target.value.toLowerCase()); setUsernameError('') }}
                  placeholder="yourusername" autoCapitalize="none" autoCorrect="off" maxLength={20}
                  className="w-full bg-card border border-border rounded-2xl pl-9 pr-4 py-4 text-lg text-white placeholder-muted focus:outline-none focus:border-lime/40 font-dm" />
              </div>
              {usernameError && <p className="text-red-400 text-sm font-dm">{usernameError}</p>}
              <p className="text-muted text-xs font-dm">3–20 chars · lowercase letters, numbers, underscores</p>
            </div>
          )}

          {/* Step 2: Lane */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="text-center">
                <h1 className="font-kanit font-bold italic uppercase text-3xl text-white">CHOOSE YOUR LANE</h1>
                <p className="text-muted text-sm font-dm mt-2">Lanes don't affect points — everyone competes equally</p>
              </div>
              <LanePicker value={lane} onChange={setLane} showPrivacy={true} lanePublic={lanePublic} onPrivacyChange={setLanePublic} />
            </div>
          )}

          {/* Step 3: Rules */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center">
                <h1 className="font-kanit font-bold italic uppercase text-3xl text-white">THE RULES</h1>
                <p className="text-muted text-sm font-dm mt-2">6 weeks. Stay consistent. Win prizes.</p>
              </div>
              <div className="space-y-3">
                <RuleCard emoji="🏆" title="POINTS (MAX 11/WEEK)">
                  <p>💪 Workouts: 1=2pts · 2=4pts · 3+=6pts</p>
                  <p>🧘 Recovery: 1+ session = 1pt</p>
                  <p>🤝 Social/class: 1+ session = 1pt</p>
                  <p>🥗 Nutrition: 5d=1pt · 6–7d=2pts</p>
                  <p>⭐ All 4 categories = +1pt bonus</p>
                </RuleCard>
                <RuleCard emoji="⏰" title="DEADLINE">
                  <p>Submit by <span className="text-white font-medium">Sunday 8pm</span> each week</p>
                  <p className="text-muted">15 minute grace period applies</p>
                </RuleCard>
                <RuleCard emoji="🎯" title="PRIZE ELIGIBILITY" highlight>
                  <p>• No more than <span className="text-white">1 missed week</span></p>
                  <p>• At least <span className="text-white">4 recovery weeks</span></p>
                  <p>• At least <span className="text-white">4 nutrition weeks</span></p>
                </RuleCard>
                <RuleCard emoji="💎" title="FLAWLESS BONUS — £50">
                  <p>Zero missed weeks + all requirements + every deadline met</p>
                </RuleCard>
                <RuleCard emoji="💰" title="PRIZE SPLIT">
                  <p>🥇 1st — 50% · 🥈 2nd — 30% · 🥉 3rd — 20%</p>
                </RuleCard>
              </div>
            </div>
          )}

          {/* Next button */}
          <button onClick={nextStep} disabled={saving || (step === 2 && !lane)}
            className="w-full mt-6 bg-lime hover:bg-lime-dim disabled:opacity-40 text-bg font-kanit font-bold italic uppercase text-xl rounded-2xl py-4 transition-all active:scale-95 shadow-lime-glow">
            {saving ? 'SAVING…' : step === STEPS.length - 1 ? "LET'S GO 🔥" : 'CONTINUE →'}
          </button>

          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)}
              className="w-full mt-3 text-muted text-sm font-dm hover:text-white transition-colors py-2">
              ← BACK
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function RuleCard({ emoji, title, children, highlight }) {
  return (
    <div className={`rounded-2xl border p-4 space-y-1.5 text-sm text-muted font-dm ${highlight ? 'border-lime/20 bg-lime/5' : 'border-border bg-card'}`}>
      <p className={`font-kanit font-semibold uppercase text-sm ${highlight ? 'text-lime' : 'text-white'}`}>
        {emoji} {title}
      </p>
      {children}
    </div>
  )
}
