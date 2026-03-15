import { LANE_LIST } from '../utils/lanes'

export default function LanePicker({ value, onChange, showPrivacy, lanePublic, onPrivacyChange }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3">
        {LANE_LIST.map(lane => (
          <button
            key={lane.key}
            type="button"
            onClick={() => onChange(lane.key)}
            className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all ${
              value === lane.key
                ? `${lane.border} ${lane.bg}`
                : 'border-border bg-bg hover:border-gray-600'
            }`}
          >
            <span className="text-3xl flex-shrink-0">{lane.emoji}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`font-kanit font-bold italic uppercase text-lg tracking-tight ${value === lane.key ? lane.text : 'text-white'}`}>
                  {lane.label}
                </span>
                {value === lane.key && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${lane.border} ${lane.text}`}>Selected</span>
                )}
              </div>
              <p className="text-muted text-sm">{lane.description}</p>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
              value === lane.key ? `border-current ${lane.text}` : 'border-border'
            }`}>
              {value === lane.key && <div className="w-2.5 h-2.5 rounded-full bg-current" />}
            </div>
          </button>
        ))}
      </div>

      {showPrivacy && value && (
        <div
          className="flex items-center justify-between bg-card border border-border rounded-2xl px-4 py-3 cursor-pointer"
          onClick={() => onPrivacyChange?.(!lanePublic)}
        >
          <div>
            <p className="text-sm font-medium text-white">Show lane on profile</p>
            <p className="text-xs text-muted">Others can see which lane you're in</p>
          </div>
          <div className={`w-11 h-6 rounded-full transition-colors relative ${lanePublic ? 'bg-lime' : 'bg-border'}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${lanePublic ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </div>
      )}
    </div>
  )
}
