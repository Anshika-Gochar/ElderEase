// apps/client-caregiver/src/pages/AlertsPage.jsx  MODIFIED
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Bell, AlertTriangle, AlertCircle, Info,
  Filter, ChevronDown, ChevronUp, CheckCircle2,
  Clock, X, Download, FileText, FileSpreadsheet,
  StickyNote, Plus, Trash2, Loader2,
} from 'lucide-react'
import {
  selectAlerts, selectSosHistory, selectAlertsLoading,
  fetchAlerts, fetchSosHistory, markAlertRead, resolveSosAlert,
} from '../store/slices/alertSlice.js'
import { selectSelectedElder } from '../store/slices/elderSlice.js'
import { formatDistanceToNow, parseISO, format } from 'date-fns'
import api from '../api/axiosConfig.js'

const TYPES      = ['all', 'sos', 'anomaly', 'missed_meds', 'low_mood']
const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low']
const CATEGORIES = ['general', 'observation', 'concern', 'positive']
const DAYS_OPTS  = [7, 14, 30]

// ── Alert type config ─────────────────────────────────────────────────────────
const getAlertConfig = (type, severity) => {
  if (type === 'sos' || severity === 'critical')
    return { icon: AlertTriangle, color: 'text-[#EF4444]', bg: 'bg-red-50 border-red-200',   label: 'SOS' }
  if (type === 'anomaly' || severity === 'high')
    return { icon: AlertCircle,  color: 'text-[#F5A623]', bg: 'bg-amber-50 border-amber-100', label: 'Anomaly' }
  if (type === 'missed_meds')
    return { icon: Info,         color: 'text-[#4A9EE8]', bg: 'bg-blue-50 border-blue-100',   label: 'Missed Med' }
  return   { icon: Bell,         color: 'text-[#718096]', bg: 'bg-gray-50 border-gray-200',   label: 'Alert' }
}

// ── AlertRow ──────────────────────────────────────────────────────────────────
const AlertRow = ({ alert, onMarkRead, onResolve }) => {
  const [expanded, setExpanded] = useState(false)
  const cfg           = getAlertConfig(alert.type, alert.severity)
  const IconComponent = cfg.icon
  const isSos         = alert.type === 'sos' || alert.severity === 'critical'

  const timeAgo = (() => {
    try { return formatDistanceToNow(parseISO(alert.createdAt || alert.receivedAt), { addSuffix: true }) }
    catch { return 'Unknown time' }
  })()
  const dateStr = (() => {
    try { return format(parseISO(alert.createdAt || alert.receivedAt), 'MMM d, yyyy • h:mm a') }
    catch { return '' }
  })()

  return (
    <div className={`border rounded-[10px] transition-all ${cfg.bg} ${!alert.read ? 'shadow-sm' : ''}`}>
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={() => { setExpanded((e) => !e); if (!alert.read) onMarkRead(alert._id) }}
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-white">
          <IconComponent className={`w-4 h-4 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`badge ${isSos ? 'badge-red' : alert.severity === 'high' ? 'badge-amber' : 'badge-blue'}`}>
              {cfg.label}
            </span>
            {alert.elderName && <span className="text-xs text-[#718096]">{alert.elderName}</span>}
            {!alert.read && <span className="ml-auto w-2 h-2 rounded-full bg-[#4A9EE8] flex-shrink-0" />}
            {alert.resolved && <span className="badge badge-green ml-auto">Resolved</span>}
          </div>
          <p className="text-sm font-medium text-[#1A202C] truncate">
            {alert.message || alert.description || 'Alert received'}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3 text-[#718096]" />
            <span className="text-[11px] text-[#718096]">{timeAgo}</span>
          </div>
        </div>
        <div className="flex-shrink-0 text-[#718096]">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-current border-opacity-10">
          <div className="bg-white rounded-[8px] p-3 mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-[#718096]">Date</span>
              <span className="text-[#1A202C] font-medium">{dateStr}</span>
              <span className="text-[#718096]">Type</span>
              <span className="text-[#1A202C] font-medium capitalize">{alert.type?.replace('_', ' ')}</span>
              <span className="text-[#718096]">Severity</span>
              <span className="text-[#1A202C] font-medium capitalize">{alert.severity}</span>
            </div>
            {alert.details && (
              <p className="text-xs text-[#718096] mt-2 border-t border-gray-100 pt-2">{alert.details}</p>
            )}
            <div className="flex gap-2 pt-2 border-t border-gray-100">
              {!alert.read && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkRead(alert._id) }}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#4A9EE8] hover:text-blue-600 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mark read
                </button>
              )}
              {isSos && !alert.resolved && (
                <button
                  onClick={(e) => { e.stopPropagation(); onResolve(alert._id) }}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#2BBD8E] hover:text-emerald-600 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mark resolved
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── SOS Card ──────────────────────────────────────────────────────────────────
const SosCard = ({ sos, onResolve, resolving }) => {
  const timeAgo = (() => {
    try { return formatDistanceToNow(parseISO(sos.createdAt), { addSuffix: true }) }
    catch { return '—' }
  })()
  const isResolved = sos.isRead || sos.resolved

  return (
    <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-[10px]"
         style={{ borderLeft: '4px solid #EF4444' }}>
      <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 text-base">
        {isResolved ? '✅' : '🚨'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <p className="text-sm font-semibold text-[#1A202C]">
            {sos.elderId?.name || 'Elder'} triggered SOS
          </p>
          <span className={`badge ${isResolved ? 'badge-green' : 'badge-red'}`}>
            {isResolved ? 'Resolved' : 'Active'}
          </span>
        </div>
        <p className="text-xs text-[#4A5568] mb-1">{sos.message || 'SOS triggered by elder'}</p>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-[#718096]" />
          <span className="text-[11px] text-[#718096]">{timeAgo}</span>
        </div>
        {!isResolved && (
          <button
            onClick={() => onResolve(sos._id)}
            disabled={resolving}
            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#2BBD8E] hover:text-emerald-600 transition-colors disabled:opacity-50"
          >
            {resolving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Mark as resolved
          </button>
        )}
      </div>
    </div>
  )
}

// ── ExportButton ──────────────────────────────────────────────────────────────
const ExportButton = ({ elderId, elderName }) => {
  const [open,     setOpen]     = useState(false)
  const [days,     setDays]     = useState(30)
  const [loading,  setLoading]  = useState(null)  // 'pdf' | 'csv' | null
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const download = async (format) => {
    if (!elderId) return
    setLoading(format)
    setOpen(false)
    try {
      const response = await api.get(`/reports/health/${elderId}`, {
        params: { format, days },
        responseType: 'blob',
      })
      const mime     = format === 'pdf' ? 'application/pdf' : 'text/csv'
      const ext      = format === 'pdf' ? 'pdf' : 'csv'
      const safeName = (elderName || 'Elder').replace(/\s+/g, '-')
      const date     = new Date().toISOString().slice(0, 10)
      const blob     = new Blob([response.data], { type: mime })
      const url      = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      a.href         = url
      a.download     = `ElderEase-${safeName}-${date}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('[Export]', err)
      alert('Export failed. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!elderId || loading}
        className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-[8px] bg-[#4A9EE8] text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        Export Report
        <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-[10px] shadow-lg z-50 p-3 space-y-3">
          {/* Days selector */}
          <div>
            <p className="text-xs font-semibold text-[#718096] uppercase tracking-wider mb-1.5">Time range</p>
            <div className="flex gap-1">
              {DAYS_OPTS.map((d) => (
                <button key={d}
                  onClick={() => setDays(d)}
                  className={`flex-1 py-1 text-xs font-medium rounded-[6px] border transition-all ${
                    days === d ? 'bg-[#4A9EE8] text-white border-[#4A9EE8]' : 'text-[#718096] border-gray-200 hover:border-[#4A9EE8]'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          {/* Format buttons */}
          <div className="space-y-1.5">
            <button onClick={() => download('pdf')}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#1A202C] hover:bg-gray-50 rounded-[6px] transition-colors">
              <FileText className="w-4 h-4 text-[#EF4444]" /> PDF Report
            </button>
            <button onClick={() => download('csv')}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[#1A202C] hover:bg-gray-50 rounded-[6px] transition-colors">
              <FileSpreadsheet className="w-4 h-4 text-[#2BBD8E]" /> CSV Data
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── NotesSection ──────────────────────────────────────────────────────────────
const NotesSection = ({ elderId }) => {
  const [open,     setOpen]     = useState(false)
  const [notes,    setNotes]    = useState([])
  const [content,  setContent]  = useState('')
  const [category, setCategory] = useState('general')
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)

  const loadNotes = useCallback(async () => {
    if (!elderId) return
    setLoading(true)
    try {
      const { data } = await api.get(`/notes/${elderId}`)
      setNotes(data)
    } catch (e) {
      console.error('[Notes]', e)
    } finally {
      setLoading(false)
    }
  }, [elderId])

  useEffect(() => { if (open) loadNotes() }, [open, loadNotes])

  const handleSave = async () => {
    if (!content.trim() || !elderId) return
    setSaving(true)
    try {
      const { data } = await api.post('/notes', { elderId, content, category })
      setNotes((prev) => [data, ...prev])
      setContent('')
      setCategory('general')
    } catch (e) {
      console.error('[Notes/save]', e)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (noteId) => {
    try {
      await api.delete(`/notes/${noteId}`)
      setNotes((prev) => prev.filter((n) => n._id !== noteId))
    } catch (e) {
      console.error('[Notes/delete]', e)
    }
  }

  const catColour = { general: 'badge-blue', observation: 'badge-amber', concern: 'badge-red', positive: 'badge-green' }

  return (
    <div className="card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between"
      >
        <h2 className="text-base font-bold text-[#1A202C] flex items-center gap-2">
          <StickyNote className="w-5 h-5 text-[#4A9EE8]" />
          Caregiver Notes
          {notes.length > 0 && (
            <span className="text-xs bg-[#EEF6FF] text-[#4A9EE8] font-semibold px-2 py-0.5 rounded-full">
              {notes.length}
            </span>
          )}
        </h2>
        {open ? <ChevronUp className="w-4 h-4 text-[#718096]" /> : <ChevronDown className="w-4 h-4 text-[#718096]" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Add note form */}
          <div className="bg-[#F8FAFC] rounded-[8px] p-4 space-y-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write a clinical observation or note..."
              maxLength={1000}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-[8px] p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#4A9EE8] focus:border-transparent"
            />
            <div className="flex items-center gap-3">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="text-sm border border-gray-200 rounded-[8px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4A9EE8] bg-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
              <button
                onClick={handleSave}
                disabled={!content.trim() || saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-[#4A9EE8] text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-colors ml-auto"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Save Note
              </button>
            </div>
            <p className="text-[11px] text-[#718096] text-right">{content.length}/1000</p>
          </div>

          {/* Notes list */}
          {loading ? (
            <div className="text-center py-6 text-sm text-[#718096]">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading notes…
            </div>
          ) : notes.length === 0 ? (
            <p className="text-center text-sm text-[#718096] py-4">No notes yet. Add your first observation above.</p>
          ) : (
            <div className="space-y-3">
              {notes.slice(0, 5).map((note) => (
                <div key={note._id} className="bg-white border border-gray-100 rounded-[8px] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`badge ${catColour[note.category] || 'badge-blue'} text-[11px]`}>
                          {note.category}
                        </span>
                        <span className="text-[11px] text-[#718096]">
                          {note.createdAt
                            ? formatDistanceToNow(parseISO(note.createdAt), { addSuffix: true })
                            : '—'}
                        </span>
                      </div>
                      <p className="text-sm text-[#2D3748]">{note.content}</p>
                    </div>
                    <button
                      onClick={() => handleDelete(note._id)}
                      className="flex-shrink-0 p-1.5 rounded-[6px] text-[#718096] hover:text-[#EF4444] hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── AlertsPage ────────────────────────────────────────────────────────────────
export default function AlertsPage() {
  const dispatch      = useDispatch()
  const alerts        = useSelector(selectAlerts)
  const sosHistory    = useSelector(selectSosHistory)
  const loading       = useSelector(selectAlertsLoading)
  const selectedElder = useSelector(selectSelectedElder)

  const [typeFilter,     setTypeFilter]     = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [showFilters,    setShowFilters]    = useState(false)
  const [resolvingId,    setResolvingId]    = useState(null)

  useEffect(() => {
    dispatch(fetchAlerts())
    dispatch(fetchSosHistory())
  }, [dispatch])

  const handleMarkRead = useCallback((id) => dispatch(markAlertRead(id)), [dispatch])

  const handleResolve = useCallback(async (id) => {
    setResolvingId(id)
    await dispatch(resolveSosAlert(id))
    setResolvingId(null)
  }, [dispatch])

  const filteredAlerts = alerts.filter((a) => {
    const typeMatch     = typeFilter     === 'all' || a.type     === typeFilter
    const severityMatch = severityFilter === 'all' || a.severity === severityFilter
    return typeMatch && severityMatch
  })

  const unreadCount = alerts.filter((a) => !a.read).length

  return (
    <div className="space-y-5 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1A202C]">Alerts</h1>
          <p className="text-sm text-[#718096] mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((f) => !f)}
            className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-[8px] border transition-all ${
              showFilters ? 'bg-[#EEF6FF] border-[#4A9EE8] text-[#1E6FD9]' : 'bg-white border-gray-200 text-[#718096]'
            }`}
          >
            <Filter className="w-4 h-4" /> Filter
            {(typeFilter !== 'all' || severityFilter !== 'all') && (
              <span className="w-2 h-2 bg-[#4A9EE8] rounded-full" />
            )}
          </button>
          <ExportButton
            elderId={selectedElder?._id}
            elderName={selectedElder?.name}
          />
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="card flex flex-wrap gap-5">
          <div>
            <p className="text-xs font-semibold text-[#718096] uppercase tracking-wider mb-2">Type</p>
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t) => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    typeFilter === t ? 'bg-[#1E6FD9] text-white border-[#1E6FD9]' : 'bg-white text-[#718096] border-gray-200 hover:border-[#4A9EE8]'
                  }`}>
                  {t === 'all' ? 'All' : t.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#718096] uppercase tracking-wider mb-2">Severity</p>
            <div className="flex flex-wrap gap-1.5">
              {SEVERITIES.map((s) => (
                <button key={s} onClick={() => setSeverityFilter(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    severityFilter === s ? 'bg-[#1E6FD9] text-white border-[#1E6FD9]' : 'bg-white text-[#718096] border-gray-200 hover:border-[#4A9EE8]'
                  }`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {(typeFilter !== 'all' || severityFilter !== 'all') && (
            <button onClick={() => { setTypeFilter('all'); setSeverityFilter('all') }}
              className="self-end flex items-center gap-1.5 text-xs font-medium text-[#EF4444] hover:text-red-600">
              <X className="w-3.5 h-3.5" /> Clear filters
            </button>
          )}
        </div>
      )}

      {/* SOS History */}
      {sosHistory.length > 0 && (
        <div className="card">
          <h2 className="text-base font-bold text-[#1A202C] mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#EF4444]" /> SOS History
            <span className="text-xs bg-red-50 text-[#EF4444] font-semibold px-2 py-0.5 rounded-full ml-1">
              {sosHistory.filter((s) => !s.isRead && !s.resolved).length} active
            </span>
          </h2>
          <div className="space-y-3">
            {sosHistory.map((sos, i) => (
              <SosCard
                key={sos._id || i}
                sos={sos}
                onResolve={handleResolve}
                resolving={resolvingId === sos._id}
              />
            ))}
          </div>
        </div>
      )}

      {/* General alerts feed */}
      <div>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="card flex gap-3">
                <div className="skeleton w-8 h-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/3 rounded" />
                  <div className="skeleton h-3 w-2/3 rounded" />
                  <div className="skeleton h-3 w-1/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <Bell className="w-12 h-12 text-[#718096] mb-3 opacity-30" />
            <p className="text-sm font-medium text-[#1A202C]">No alerts found</p>
            <p className="text-xs text-[#718096] mt-1">
              {typeFilter !== 'all' || severityFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'All is well — no alerts at this time.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAlerts.map((alert, i) => (
              <AlertRow
                key={alert._id || i}
                alert={alert}
                onMarkRead={handleMarkRead}
                onResolve={handleResolve}
              />
            ))}
          </div>
        )}
      </div>

      {/* Notes section */}
      <NotesSection elderId={selectedElder?._id} />
    </div>
  )
}
