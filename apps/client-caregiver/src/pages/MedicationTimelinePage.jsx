import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { format, subDays, parseISO, isSameDay, startOfDay } from 'date-fns'
import { Pill, Plus, AlertCircle, X, Loader2, RefreshCw, Edit2, Trash2, Clock, Check } from 'lucide-react'
import axiosInstance from '../api/axiosConfig.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build an array of the last N days (oldest first) as Date objects. */
function buildDateRange(days = 14) {
  return Array.from({ length: days }, (_, i) => startOfDay(subDays(new Date(), days - 1 - i)))
}

/** Get the bar/dot colour based on adherence pct (per-med summary row). */
function adherenceColor(pct) {
  if (pct === null || pct === undefined) return '#CBD5E0'
  if (pct >= 90) return '#2BBD8E'
  if (pct >= 70) return '#F5A623'
  return '#EF4444'
}

/** Map a dose status to a grid cell colour. */
function statusColor(status) {
  switch (status) {
    case 'taken':   return '#2BBD8E'
    case 'missed':  return '#EF4444'
    case 'pending': return '#F5A623'
    default:        return '#E2E8F0'  // no log (future or not yet scheduled)
  }
}

/** Map a dose status to a readable label. */
function statusLabel(status) {
  switch (status) {
    case 'taken':   return 'Taken'
    case 'missed':  return 'Missed'
    case 'pending': return 'Pending'
    default:        return 'No log'
  }
}

// ─── Popover ──────────────────────────────────────────────────────────────────

/**
 * Small info popover shown when clicking a grid cell.
 */
function CellPopover({ log, date, onClose, anchorRef }) {
  const pop = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (pop.current && !pop.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  return (
    <div
      ref={pop}
      className="absolute z-50 bg-white rounded-[10px] shadow-xl border border-[#E2E8F0] p-3 w-52"
      style={{ top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6 }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-700 text-[#1A202C]">
          {format(date, 'EEEE, MMM d')}
        </span>
        <button onClick={onClose} className="text-[#A0AEC0] hover:text-[#718096]">
          <X size={13} />
        </button>
      </div>
      {log ? (
        <div className="space-y-1 text-[12px]">
          <div className="flex justify-between">
            <span className="text-[#718096]">Status</span>
            <span
              className="font-600"
              style={{ color: statusColor(log.status) }}
            >
              {statusLabel(log.status)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#718096]">Scheduled</span>
            <span className="text-[#1A202C]">
              {log.scheduledTime
                ? format(new Date(log.scheduledTime), 'h:mm a')
                : '—'}
            </span>
          </div>
          {log.takenAt && (
            <div className="flex justify-between">
              <span className="text-[#718096]">Taken at</span>
              <span className="text-[#2BBD8E] font-600">
                {format(new Date(log.takenAt), 'h:mm a')}
              </span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[12px] text-[#A0AEC0]">No dose scheduled for this day.</p>
      )}
    </div>
  )
}

// ─── Grid Cell ────────────────────────────────────────────────────────────────

/**
 * A single cell in the 14-day timeline grid.
 */
function GridCell({ log, date }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const color = log ? statusColor(log.status) : '#F1F5F9'

  return (
    <div className="relative flex items-center justify-center" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-6 h-6 rounded-full border-2 border-white shadow-sm transition-transform hover:scale-125 focus:outline-none"
        style={{ backgroundColor: color }}
        title={log ? statusLabel(log.status) : 'No log'}
        aria-label={`${format(date, 'MMM d')}: ${log ? statusLabel(log.status) : 'No log'}`}
      />
      {open && (
        <CellPopover
          log={log}
          date={date}
          onClose={() => setOpen(false)}
          anchorRef={ref}
        />
      )}
    </div>
  )
}

// ─── Med Modal ──────────────────────────────────────────────────────────────

const COLOR_SWATCHES = [
  { value: '#2BBD8E', label: 'Green' },
  { value: '#4A9EE8', label: 'Blue' },
  { value: '#F5A623', label: 'Amber' },
  { value: '#EF4444', label: 'Red' },
  { value: '#A78BFA', label: 'Purple' },
]

const MedModal = ({ elderId, medId, onClose, onSaved }) => {
  const [form, setForm] = useState({
    name: '',
    dose: '',
    frequency: 'once_daily',
    scheduledTimes: ['08:00'],
    instructions: '',
    color: '#2BBD8E',
  })
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (medId) {
      const fetchMedDetails = async () => {
        setFetching(true)
        setError(null)
        try {
          const { data } = await axiosInstance.get(`/medications/${medId}`)
          setForm({
            name: data.name || '',
            dose: data.dose || '',
            frequency: data.frequency || 'once_daily',
            scheduledTimes: data.scheduledTimes?.length ? data.scheduledTimes : ['08:00'],
            instructions: data.instructions || '',
            color: data.color || '#2BBD8E',
          })
        } catch (err) {
          setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load medication details')
        } finally {
          setFetching(false)
        }
      }
      fetchMedDetails()
    }
  }, [medId])

  const handleTimeChange = (idx, val) => {
    const times = [...form.scheduledTimes]
    times[idx] = val
    setForm((f) => ({ ...f, scheduledTimes: times }))
  }

  const addTime = () => {
    if (form.scheduledTimes.length < 6) {
      setForm((f) => ({ ...f, scheduledTimes: [...f.scheduledTimes, '12:00'] }))
    }
  }

  const removeTime = (idx) => {
    if (form.scheduledTimes.length > 1) {
      setForm((f) => ({ ...f, scheduledTimes: f.scheduledTimes.filter((_, i) => i !== idx) }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (medId) {
        await axiosInstance.patch(`/medications/${medId}`, form)
      } else {
        await axiosInstance.post('/medications', { ...form, elderId })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to save medication')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[12px] shadow-cardHover w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[#1A202C]">
            {medId ? 'Edit Medication' : 'Add Medication'}
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-[#718096]" /></button>
        </div>

        {fetching ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-[#2BBD8E] animate-spin mb-2" />
            <p className="text-sm text-[#718096]">Loading details…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label className="label">Medication Name</label>
              <input
                className="input-field"
                placeholder="e.g. Metformin"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Dosage</label>
                <input
                  className="input-field"
                  placeholder="e.g. 500mg"
                  value={form.dose}
                  onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="label">Frequency</label>
                <select
                  className="input-field"
                  value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                >
                  <option value="once_daily">Daily</option>
                  <option value="twice_daily">Twice daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="as_needed">As needed</option>
                </select>
              </div>
            </div>

            {/* Scheduled Times Multi-Time Picker */}
            <div>
              <label className="label">Scheduled Times</label>
              <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                {form.scheduledTimes.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#718096] flex-shrink-0" />
                    <input
                      type="time"
                      value={t}
                      onChange={(e) => handleTimeChange(idx, e.target.value)}
                      className="input-field py-1.5 text-sm"
                      required
                    />
                    {form.scheduledTimes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTime(idx)}
                        className="text-[#718096] hover:text-[#EF4444] transition-colors p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {form.scheduledTimes.length < 6 && (
                <button
                  type="button"
                  onClick={addTime}
                  className="text-xs text-[#4A9EE8] hover:underline font-semibold flex items-center gap-1 mt-2"
                >
                  <Plus className="w-3.5 h-3.5" /> Add another time
                </button>
              )}
            </div>

            {/* Color Swatch Tag */}
            <div>
              <label className="label">Color Tag</label>
              <div className="flex gap-2">
                {COLOR_SWATCHES.map((sw) => (
                  <button
                    key={sw.value}
                    type="button"
                    title={sw.label}
                    onClick={() => setForm((f) => ({ ...f, color: sw.value }))}
                    className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center ${
                      form.color === sw.value ? 'border-[#1A202C] scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: sw.value }}
                  >
                    {form.color === sw.value && (
                      <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Instructions (optional)</label>
              <input
                className="input-field"
                placeholder="e.g. Take with food"
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-[8px] border border-red-200">
                <AlertCircle className="w-4 h-4 text-[#EF4444]" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (medId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />)}
                {loading ? 'Saving…' : (medId ? 'Save Changes' : 'Add Medication')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── MedicationTimelinePage ───────────────────────────────────────────────────

/**
 * 14-day medication timeline grid for the caregiver view.
 *
 * Layout:
 * - Rows = each active medication
 * - Columns = last 14 days (oldest → today)
 * - Cell = coloured dot (green=taken, red=missed, amber=pending, gray=no log)
 * - Click cell → popover with scheduledTime / takenAt / status
 * - Bottom: per-medication adherence % summary row
 */
export default function MedicationTimelinePage() {
  const { elderId } = useParams()

  const [adherence, setAdherence]   = useState([])   // per-med stats
  const [logs, setLogs]             = useState([])   // all dose logs
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [showModal, setShowModal]   = useState(false)
  const [selectedMedId, setSelectedMedId] = useState(null)

  const dateRange = buildDateRange(14)

  const fetchData = useCallback(async () => {
    if (!elderId) return
    setLoading(true)
    setError(null)
    try {
      const [adhRes, logsRes] = await Promise.all([
        axiosInstance.get(`/medications/adherence/${elderId}?days=14`),
        axiosInstance.get(`/medications/logs/elder/${elderId}?days=14`),
      ])
      setAdherence(adhRes.data)
      setLogs(logsRes.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load medication data')
    } finally {
      setLoading(false)
    }
  }, [elderId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleOpenAdd = () => {
    setSelectedMedId(null)
    setShowModal(true)
  }

  const handleOpenEdit = (med) => {
    setSelectedMedId(med.medicationId?.toString())
    setShowModal(true)
  }

  const handleDeleteMed = async (medicationId) => {
    if (!medicationId) return
    if (window.confirm('Are you sure you want to remove this medication? This will also delete all scheduled doses.')) {
      try {
        await axiosInstance.delete(`/medications/${medicationId}`)
        fetchData()
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to delete medication')
      }
    }
  }

  /**
   * Build a lookup: medId → { dateStr → log[] }
   * A medication can have multiple logs on the same day (e.g. twice daily).
   */
  const logIndex = {}
  for (const log of logs) {
    const medId = log.medicationId?.toString()
    const dateStr = format(new Date(log.scheduledTime), 'yyyy-MM-dd')
    if (!logIndex[medId]) logIndex[medId] = {}
    if (!logIndex[medId][dateStr]) logIndex[medId][dateStr] = []
    logIndex[medId][dateStr].push(log)
  }

  /**
   * For a medication + day, pick the "worst" status to show in the cell.
   * Priority: missed > pending > taken > null
   */
  function pickLog(medId, day) {
    const dateStr = format(day, 'yyyy-MM-dd')
    const dayLogs = logIndex[medId]?.[dateStr] || []
    if (dayLogs.length === 0) return null
    if (dayLogs.some((l) => l.status === 'missed'))  return dayLogs.find((l) => l.status === 'missed')
    if (dayLogs.some((l) => l.status === 'pending')) return dayLogs.find((l) => l.status === 'pending')
    return dayLogs[0]
  }

  // ── Skeleton ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-5 page-enter">
        <div className="flex items-center justify-between">
          <div>
            <div className="skeleton h-6 w-36 rounded mb-2" />
            <div className="skeleton h-4 w-48 rounded" />
          </div>
          <div className="skeleton h-9 w-36 rounded-lg" />
        </div>
        <div className="card">
          <div className="skeleton h-5 w-44 rounded mb-6" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-4 w-28 rounded" />
                <div className="flex gap-2 flex-1">
                  {Array.from({ length: 14 }).map((_, j) => (
                    <div key={j} className="skeleton w-6 h-6 rounded-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-4 page-enter">
        <div className="card flex items-center gap-3 p-5 border-red-100 bg-red-50">
          <AlertCircle className="w-5 h-5 text-[#EF4444] flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={fetchData} className="ml-auto btn-secondary text-xs flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    )
  }

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 page-enter pb-24">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1A202C]">Medications</h1>
          <p className="text-sm text-[#718096] mt-0.5">14-day dose timeline</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={handleOpenAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Medication
          </button>
        </div>
      </div>

      {/* Empty state */}
      {adherence.length === 0 && (
        <div className="card flex flex-col items-center py-12 text-center">
          <Pill className="w-10 h-10 text-[#CBD5E0] mb-3" />
          <p className="text-[#718096] text-sm">No medications found for this elder.</p>
          <button onClick={handleOpenAdd} className="btn-primary mt-4 text-sm">
            Add first medication
          </button>
        </div>
      )}

      {/* Timeline grid */}
      {adherence.length > 0 && (
        <div className="card overflow-x-auto">
          <h3 className="text-sm font-semibold text-[#1A202C] mb-5">Dose Timeline</h3>

          <table className="w-full text-xs" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                {/* Medication name column */}
                <th className="text-left text-[#718096] font-semibold pr-4 pb-3 w-32">
                  Medication
                </th>
                {/* Date columns */}
                {dateRange.map((day) => (
                  <th
                    key={day.toISOString()}
                    className={`text-center pb-3 px-0.5 font-medium ${
                      isSameDay(day, new Date())
                        ? 'text-[#2BBD8E]'
                        : 'text-[#A0AEC0]'
                    }`}
                  >
                    <div>{format(day, 'EEE').slice(0, 1)}</div>
                    <div className={`text-[11px] ${isSameDay(day, new Date()) ? 'font-bold' : ''}`}>
                      {format(day, 'd')}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {adherence.map((med) => (
                <tr key={med.medicationId?.toString()} className="border-t border-[#F1F5F9]">
                  {/* Medication name */}
                  <td className="py-3 pr-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: med.color || '#CBD5E0' }}
                        />
                        <span className="font-medium text-[#1A202C] truncate max-w-[80px]" title={med.name}>
                          {med.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleOpenEdit(med)}
                          className="text-[#718096] hover:text-[#4A9EE8] p-0.5 rounded hover:bg-[#EFF6FF] transition-all"
                          title="Edit Medication"
                        >
                          <Edit2 size={11} />
                        </button>
                        <button
                          onClick={() => handleDeleteMed(med.medicationId)}
                          className="text-[#718096] hover:text-[#EF4444] p-0.5 rounded hover:bg-[#FFF5F5] transition-all"
                          title="Delete Medication"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                    <div className="text-[#A0AEC0] text-[10px] ml-4 mt-0.5">{med.dose}</div>
                  </td>

                  {/* Dose cells */}
                  {dateRange.map((day) => {
                    const log = pickLog(med.medicationId?.toString(), day)
                    return (
                      <td key={day.toISOString()} className="py-3 px-0.5 text-center">
                        <GridCell log={log} date={day} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>

            {/* Adherence % summary row */}
            <tfoot>
              <tr className="border-t-2 border-[#E2E8F0]">
                <td className="pt-3 pr-4">
                  <span className="text-[10px] font-semibold text-[#718096] uppercase tracking-wide">
                    Adherence
                  </span>
                </td>
                {adherence.map((med) => (
                  <td key={med.medicationId?.toString()} className="pt-3 text-center">
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: adherenceColor(med.adherencePct) }}
                    >
                      {med.adherencePct !== null ? `${med.adherencePct}%` : '—'}
                    </span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-5 pt-4 border-t border-[#F1F5F9] text-[11px] text-[#718096]">
            {[
              { color: '#2BBD8E', label: 'Taken' },
              { color: '#EF4444', label: 'Missed' },
              { color: '#F5A623', label: 'Pending' },
              { color: '#E2E8F0', label: 'No log' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-medication summary cards */}
      {adherence.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {adherence.map((med) => (
            <div key={med.medicationId?.toString()} className="card p-4">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: med.color || '#CBD5E0' }}
                />
                <span className="text-sm font-semibold text-[#1A202C] truncate max-w-[120px]" title={med.name}>
                  {med.name}
                </span>
                <span className="text-xs text-[#718096]">{med.dose}</span>

                {/* Actions */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    onClick={() => handleOpenEdit(med)}
                    className="text-[#718096] hover:text-[#4A9EE8] p-1 rounded hover:bg-[#EFF6FF] transition-all"
                    title="Edit Medication"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => handleDeleteMed(med.medicationId)}
                    className="text-[#718096] hover:text-[#EF4444] p-1 rounded hover:bg-[#FFF5F5] transition-all"
                    title="Delete Medication"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-[#718096] mb-2">
                <span>{med.taken} taken · {med.missed} missed</span>
                <span
                  className="font-bold text-sm"
                  style={{ color: adherenceColor(med.adherencePct) }}
                >
                  {med.adherencePct !== null ? `${med.adherencePct}%` : 'N/A'}
                </span>
              </div>
              {/* Mini progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${med.adherencePct ?? 0}%`,
                    backgroundColor: adherenceColor(med.adherencePct),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Medication Modal */}
      {showModal && (
        <MedModal
          elderId={elderId}
          medId={selectedMedId}
          onClose={() => { setShowModal(false); setSelectedMedId(null) }}
          onSaved={fetchData}
        />
      )}
    </div>
  )
}
