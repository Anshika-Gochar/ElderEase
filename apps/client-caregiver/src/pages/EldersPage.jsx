import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { Users, PlusCircle, X, User, Clock, Activity, Pill, Loader2, AlertCircle } from 'lucide-react'
import {
  selectElders,
  selectElderLoading,
  fetchLinkedElders,
  linkElder,
  setSelectedElder,
} from '../store/slices/elderSlice.js'
import { formatDistanceToNow, parseISO } from 'date-fns'

/**
 * Modal for linking a new elder by email or elder ID.
 * @param {{ onClose: () => void, onLink: (data: object) => void, loading: boolean, error: string|null }} props
 */
const LinkElderModal = ({ onClose, onLink, loading, error }) => {
  const [form, setForm] = useState({ email: '', elderId: '' })
  const [mode, setMode] = useState('email') // 'email' | 'id'

  const handleSubmit = (e) => {
    e.preventDefault()
    onLink(mode === 'email' ? { email: form.email } : { elderId: form.elderId })
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[12px] shadow-cardHover w-full max-w-md p-6 animate-[fadeIn_0.2s_ease]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[#1A202C]">Link a New Elder</h2>
          <button onClick={onClose} className="text-[#718096] hover:text-[#1A202C]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-[#F5F4F0] rounded-[8px] p-1 mb-5">
          {['email', 'id'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 text-sm font-medium rounded-[6px] transition-all ${
                mode === m
                  ? 'bg-white text-[#1A202C] shadow-card'
                  : 'text-[#718096]'
              }`}
            >
              {m === 'email' ? 'By Email' : 'By Elder ID'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'email' ? (
            <div>
              <label className="label">Elder's Email Address</label>
              <input
                type="email"
                className="input-field"
                placeholder="elder@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
          ) : (
            <div>
              <label className="label">Elder ID</label>
              <input
                type="text"
                className="input-field font-mono"
                placeholder="64f3a2b1c9e2d7a8b0c1d2e3"
                value={form.elderId}
                onChange={(e) => setForm((f) => ({ ...f, elderId: e.target.value }))}
                required
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 rounded-[8px] border border-red-200">
              <AlertCircle className="w-4 h-4 text-[#EF4444] flex-shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Linking…' : 'Link Elder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Elder card showing photo/initials, name, age, last seen, quick stats.
 * @param {{ elder: object, onSelect: () => void }} props
 */
const ElderCard = ({ elder, onSelect }) => {
  const initials = elder.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'E'

  const lastSeen = elder.lastSeen
    ? formatDistanceToNow(parseISO(elder.lastSeen), { addSuffix: true })
    : 'Never'

  return (
    <div
      onClick={onSelect}
      className="card hover:shadow-cardHover transition-all duration-200 cursor-pointer group"
    >
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#4A9EE8] to-[#2BBD8E] flex items-center justify-center text-white text-xl font-bold flex-shrink-0 group-hover:scale-105 transition-transform">
          {elder.profilePicture ? (
            <img
              src={elder.profilePicture}
              alt={elder.name}
              className="w-14 h-14 rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-base font-bold text-[#1A202C] group-hover:text-[#1E6FD9] transition-colors">
                {elder.name}
              </h3>
              <p className="text-xs text-[#718096]">{elder.age} years old</p>
            </div>
            <span className="flex items-center gap-1 text-[11px] text-[#718096]">
              <Clock className="w-3 h-3" />
              {lastSeen}
            </span>
          </div>

          {/* Quick stats */}
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs text-[#718096]">
              <Activity className="w-3.5 h-3.5 text-[#4A9EE8]" />
              Mood: {elder.latestMood != null ? `${elder.latestMood}/10` : '—'}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-[#718096]">
              <Pill className="w-3.5 h-3.5 text-[#2BBD8E]" />
              Adherence: {elder.adherencePct != null ? `${elder.adherencePct}%` : '—'}
            </span>
            {elder.activeAlerts > 0 && (
              <span className="badge badge-red">
                {elder.activeAlerts} alert{elder.activeAlerts !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-end">
        <span className="text-xs font-medium text-[#4A9EE8] group-hover:text-[#1E6FD9] transition-colors">
          View Dashboard →
        </span>
      </div>
    </div>
  )
}

/**
 * EldersPage — Lists all linked elders with an option to add new ones.
 */
export default function EldersPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const elders = useSelector(selectElders)
  const loading = useSelector(selectElderLoading)
  const [showModal, setShowModal] = useState(false)
  const [linkError, setLinkError] = useState(null)
  const [linking, setLinking] = useState(false)

  useEffect(() => {
    dispatch(fetchLinkedElders())
  }, [dispatch])

  /**
   * Handle linking a new elder.
   * @param {object} data - { email? } or { elderId? }
   */
  const handleLinkElder = async (data) => {
    setLinking(true)
    setLinkError(null)
    try {
      await dispatch(linkElder(data)).unwrap()
      setShowModal(false)
    } catch (err) {
      setLinkError(typeof err === 'string' ? err : 'Failed to link elder')
    } finally {
      setLinking(false)
    }
  }

  /**
   * Select an elder and navigate to their dashboard.
   * @param {object} elder
   */
  const handleSelectElder = (elder) => {
    dispatch(setSelectedElder(elder))
    navigate('/dashboard')
  }

  return (
    <div className="space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1A202C]">My Elders</h1>
          <p className="text-sm text-[#718096] mt-0.5">
            {elders.length} elder{elders.length !== 1 ? 's' : ''} linked to your account
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <PlusCircle className="w-4 h-4" />
          Add Elder
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card">
              <div className="flex gap-4">
                <div className="skeleton w-14 h-14 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-32 rounded" />
                  <div className="skeleton h-3 w-20 rounded" />
                  <div className="skeleton h-3 w-48 rounded mt-2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Elder grid */}
      {!loading && elders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {elders.map((elder) => (
            <ElderCard
              key={elder._id}
              elder={elder}
              onSelect={() => handleSelectElder(elder)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && elders.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <div className="w-20 h-20 bg-white rounded-full shadow-card flex items-center justify-center mb-4">
            <Users className="w-10 h-10 text-[#718096]" />
          </div>
          <h2 className="text-lg font-bold text-[#1A202C] mb-2">No Elders Linked Yet</h2>
          <p className="text-sm text-[#718096] max-w-xs mb-5">
            Add your first elder to start monitoring their health, medications, and wellbeing.
          </p>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <PlusCircle className="w-4 h-4" />
            Link Your First Elder
          </button>
        </div>
      )}

      {/* Link elder modal */}
      {showModal && (
        <LinkElderModal
          onClose={() => { setShowModal(false); setLinkError(null) }}
          onLink={handleLinkElder}
          loading={linking}
          error={linkError}
        />
      )}
    </div>
  )
}
