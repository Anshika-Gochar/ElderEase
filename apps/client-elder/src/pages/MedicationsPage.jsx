import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Plus, Edit2, Trash2, X, Clock, ChevronDown, Check, AlertCircle, Loader2 } from 'lucide-react'
import {
  fetchMedications,
  fetchTodayDoses,
  takeDose,
  addMedication,
  updateMedication,
  deleteMedication,
  selectMedications,
  selectTodayDoses,
  selectMedLoading,
  selectTakingDose,
  selectDoseErrors,
  clearDoseError,
} from '../store/slices/medSlice'
import { addNotification } from '../store/slices/uiSlice'
import { selectUser } from '../store/slices/authSlice'
import LoadingSpinner from '../components/common/LoadingSpinner'

// ─── Design tokens ────────────────────────────────────────────────────────────
const COLOR_SWATCHES = [
  { value: '#2BBD8E', label: 'Green' },
  { value: '#4A9EE8', label: 'Blue' },
  { value: '#F5A623', label: 'Amber' },
  { value: '#EF4444', label: 'Red' },
  { value: '#A78BFA', label: 'Purple' },
]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    taken:   { cls: 'badge-taken',   label: 'Taken' },
    pending: { cls: 'badge-due',     label: 'Due now' },
    missed:  { cls: 'badge-missed',  label: 'Missed' },
  }
  const { cls, label } = map[status] || { cls: 'badge-later', label: status }
  return <span className={cls}>{label}</span>
}

// ─── Add / Edit Modal ────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  dose: '',
  frequency: 'once_daily',
  scheduledTimes: ['08:00'],
  daysOfWeek: [],
  color: '#2BBD8E',
  instructions: '',
}

const FREQ_OPTIONS = [
  { value: 'once_daily',    label: 'Once daily' },
  { value: 'twice_daily',   label: 'Twice daily' },
  { value: 'thrice_daily',  label: 'Three times daily' },
  { value: 'weekly',        label: 'Weekly' },
  { value: 'as_needed',     label: 'As needed' },
]

/**
 * Modal for adding or editing a medication.
 * Handles name, dose, frequency, multi-time picker, color swatch, days of week, instructions.
 */
function MedModal({ med, onClose, onSave }) {
  const [form, setForm] = useState(
    med
      ? {
          name: med.name,
          dose: med.dose,
          frequency: med.frequency || 'once_daily',
          scheduledTimes: med.scheduledTimes?.length ? med.scheduledTimes : ['08:00'],
          daysOfWeek: med.daysOfWeek || [],
          color: med.color || '#2BBD8E',
          instructions: med.instructions || '',
        }
      : { ...EMPTY_FORM }
  )
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  const showDays = form.frequency === 'weekly' || form.frequency === 'as_needed'

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Medication name is required'
    if (!form.dose.trim()) e.dose = 'Dosage is required'
    if (!form.scheduledTimes.length || form.scheduledTimes.every((t) => !t)) {
      e.scheduledTimes = 'At least one time is required'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

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

  const toggleDay = (dayIdx) => {
    setForm((f) => {
      const days = f.daysOfWeek.includes(dayIdx)
        ? f.daysOfWeek.filter((d) => d !== dayIdx)
        : [...f.daysOfWeek, dayIdx]
      return { ...f, daysOfWeek: days }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex justify-center items-start p-4 md:p-10 animate-fade-in">
      <div className="bg-white rounded-card shadow-xl w-full max-w-lg my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-[17px] font-700 text-[#1A202C]">
            {med ? 'Edit Medication' : 'Add Medication'}
          </h2>
          <button onClick={onClose} className="text-[#718096] hover:text-[#1A202C] transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-left">
          {/* Name */}
          <div>
            <label className="block text-[13px] font-600 text-[#4A5568] mb-1">
              Medication Name *
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Metformin"
              className={`w-full border rounded-lg px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 transition-all ${
                errors.name
                  ? 'border-[#EF4444] focus:ring-[#EF4444]/20'
                  : 'border-[#E2E8F0] focus:border-[#2BBD8E] focus:ring-[#2BBD8E]/20'
              }`}
            />
            {errors.name && (
              <p className="text-[12px] text-[#EF4444] mt-1 flex items-center gap-1">
                <AlertCircle size={11} /> {errors.name}
              </p>
            )}
          </div>

          {/* Dose */}
          <div>
            <label className="block text-[13px] font-600 text-[#4A5568] mb-1">Dosage *</label>
            <input
              name="dose"
              value={form.dose}
              onChange={handleChange}
              placeholder="e.g. 500mg"
              className={`w-full border rounded-lg px-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 transition-all ${
                errors.dose
                  ? 'border-[#EF4444] focus:ring-[#EF4444]/20'
                  : 'border-[#E2E8F0] focus:border-[#2BBD8E] focus:ring-[#2BBD8E]/20'
              }`}
            />
            {errors.dose && (
              <p className="text-[12px] text-[#EF4444] mt-1 flex items-center gap-1">
                <AlertCircle size={11} /> {errors.dose}
              </p>
            )}
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-[13px] font-600 text-[#4A5568] mb-1">Frequency</label>
            <div className="relative">
              <select
                name="frequency"
                value={form.frequency}
                onChange={handleChange}
                className="w-full border border-[#E2E8F0] rounded-lg px-4 py-2.5 text-[15px] focus:outline-none focus:border-[#2BBD8E] appearance-none bg-white"
              >
                {FREQ_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#718096] pointer-events-none" />
            </div>
          </div>

          {/* Days of week (shown for weekly / as_needed) */}
          {showDays && (
            <div>
              <label className="block text-[13px] font-600 text-[#4A5568] mb-2">Days</label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((day, idx) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`w-10 h-10 rounded-full text-[13px] font-600 border transition-all ${
                      form.daysOfWeek.includes(idx)
                        ? 'bg-[#2BBD8E] text-white border-[#2BBD8E]'
                        : 'border-[#E2E8F0] text-[#718096] hover:border-[#2BBD8E]'
                    }`}
                  >
                    {day.slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scheduled Times */}
          <div>
            <label className="block text-[13px] font-600 text-[#4A5568] mb-2">
              Scheduled Times *
            </label>
            <div className="space-y-2">
              {form.scheduledTimes.map((t, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Clock size={15} className="text-[#718096] flex-shrink-0" />
                  <input
                    type="time"
                    value={t}
                    onChange={(e) => handleTimeChange(idx, e.target.value)}
                    className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-[15px] focus:outline-none focus:border-[#2BBD8E] flex-1"
                  />
                  {form.scheduledTimes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTime(idx)}
                      className="text-[#718096] hover:text-[#EF4444] transition-colors"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              {errors.scheduledTimes && (
                <p className="text-[12px] text-[#EF4444] flex items-center gap-1">
                  <AlertCircle size={11} /> {errors.scheduledTimes}
                </p>
              )}
              {form.scheduledTimes.length < 6 && (
                <button
                  type="button"
                  onClick={addTime}
                  className="text-[13px] text-[#4A9EE8] hover:underline font-500 flex items-center gap-1 mt-1"
                >
                  <Plus size={14} /> Add another time
                </button>
              )}
            </div>
          </div>

          {/* Color Tag */}
          <div>
            <label className="block text-[13px] font-600 text-[#4A5568] mb-2">Color Tag</label>
            <div className="flex gap-3">
              {COLOR_SWATCHES.map((sw) => (
                <button
                  key={sw.value}
                  type="button"
                  title={sw.label}
                  onClick={() => setForm((f) => ({ ...f, color: sw.value }))}
                  className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center ${
                    form.color === sw.value
                      ? 'border-[#1A202C] scale-110'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: sw.value }}
                >
                  {form.color === sw.value && (
                    <Check size={14} className="text-white" strokeWidth={3} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-[13px] font-600 text-[#4A5568] mb-1">
              Special Instructions{' '}
              <span className="font-400 text-[#718096]">(optional)</span>
            </label>
            <textarea
              name="instructions"
              value={form.instructions}
              onChange={handleChange}
              rows={2}
              placeholder="e.g. Take with food, avoid grapefruit"
              className="w-full border border-[#E2E8F0] rounded-lg px-4 py-2.5 text-[15px] focus:outline-none focus:border-[#2BBD8E] focus:ring-2 focus:ring-[#2BBD8E]/20 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-[#E2E8F0] text-[#4A5568] text-[15px] font-600 hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-lg bg-[#2BBD8E] text-white text-[15px] font-600 hover:bg-[#23a07a] disabled:opacity-60 transition-all flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 size={15} className="animate-spin" /> Saving…</>
              ) : (
                med ? 'Save Changes' : 'Add Medication'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── MedicationsPage ──────────────────────────────────────────────────────────

/**
 * Full medications management page.
 * Tab-based: Today's doses (wired to real API) | All medications (CRUD).
 */
export default function MedicationsPage() {
  const dispatch = useDispatch()
  const user = useSelector(selectUser)
  const medications = useSelector(selectMedications)
  const todayDoses = useSelector(selectTodayDoses)
  const loading = useSelector(selectMedLoading)
  const takingDose = useSelector(selectTakingDose)
  const doseErrors = useSelector(selectDoseErrors)

  const [activeTab, setActiveTab] = useState('today')
  const [showModal, setShowModal] = useState(false)
  const [editingMed, setEditingMed] = useState(null)

  useEffect(() => {
    dispatch(fetchMedications())
    if (user?._id || user?.id) {
      dispatch(fetchTodayDoses(user._id || user.id))
    }
  }, [dispatch, user])

  /**
   * Handle "Take now" click on a dose row.
   * @param {{ medicationId: string, scheduledAt: string }} dose
   */
  const handleTakeDose = async (dose) => {
    const key = `${dose.medicationId}|${dose.scheduledAt}`

    // Clear any previous error for this dose
    dispatch(clearDoseError(key))

    const result = await dispatch(
      takeDose({
        medicationId: dose.medicationId.toString(),
        scheduledTime: dose.scheduledAt,
      })
    )

    if (!result.error) {
      dispatch(
        addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Dose recorded!',
          message: `${dose.name} marked as taken.`,
        })
      )
    }
  }

  const handleSave = async (formData) => {
    if (editingMed) {
      await dispatch(updateMedication({ id: editingMed._id, updates: formData }))
      dispatch(addNotification({ id: Date.now().toString(), type: 'success', message: 'Medication updated.' }))
    } else {
      await dispatch(addMedication(formData))
      dispatch(addNotification({ id: Date.now().toString(), type: 'success', message: 'Medication added.' }))
    }
    setShowModal(false)
    setEditingMed(null)
    dispatch(fetchMedications())
    if (user?._id || user?.id) {
      dispatch(fetchTodayDoses(user._id || user.id))
    }
  }

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to remove this medication?')) {
      await dispatch(deleteMedication(id))
      dispatch(addNotification({ id: Date.now().toString(), type: 'info', message: 'Medication removed.' }))
    }
  }

  const openEdit = (med) => { setEditingMed(med); setShowModal(true) }
  const openAdd = () => { setEditingMed(null); setShowModal(true) }

  const takenCount = todayDoses.filter((d) => d.status === 'taken').length

  return (
    <div className="space-y-6 animate-fade-in pb-24">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-[#718096]">
            {takenCount} of {todayDoses.length} medications taken today
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-[#2BBD8E] text-white px-4 py-2.5 rounded-lg text-[14px] font-600 hover:bg-[#23a07a] shadow-sm transition-all"
        >
          <Plus size={17} />
          Add Medication
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-[#E2E8F0] w-fit shadow-sm">
        {[
          { id: 'today', label: "Today's Doses" },
          { id: 'all',   label: 'All Medications' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 rounded-lg text-[14px] font-600 transition-all ${
              activeTab === tab.id
                ? 'bg-[#2BBD8E] text-white shadow-sm'
                : 'text-[#718096] hover:text-[#1A202C]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner message="Loading medications…" />
      ) : (
        <>
          {/* ── Today's Doses Tab ── */}
          {activeTab === 'today' && (
            <div className="card overflow-hidden">
              {todayDoses.length === 0 ? (
                <div className="py-12 text-center text-[#718096]">
                  <p className="text-[15px]">No doses scheduled for today.</p>
                  <button onClick={openAdd} className="mt-3 text-[#2BBD8E] font-600 hover:underline text-[14px]">
                    Add a medication
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[#F1F5F9]">
                  {todayDoses.map((dose) => {
                    const key = `${dose.medicationId}|${dose.scheduledAt}`
                    const isLoading = !!takingDose[key]
                    const err = doseErrors[key]
                    return (
                      <div key={dose._id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-4">
                          {/* Color dot */}
                          <div
                            className={`w-3 h-3 rounded-full flex-shrink-0 ${
                              dose.status === 'pending' ? 'animate-pulse' : ''
                            }`}
                            style={{ backgroundColor: dose.color || '#CBD5E0' }}
                          />

                          {/* Name + info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-600 text-[#1A202C]">
                              {dose.name}
                              <span className="text-[#718096] font-400 ml-1.5 text-[14px]">
                                · {dose.dose}
                              </span>
                            </p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <p className="text-[13px] text-[#718096] flex items-center gap-1">
                                <Clock size={12} /> {dose.scheduledTime}
                              </p>
                              {dose.instructions && (
                                <p className="text-[12px] text-[#A0AEC0]">{dose.instructions}</p>
                              )}
                            </div>
                          </div>

                          {/* Status + action */}
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {dose.status === 'taken' ? (
                              <span className="flex items-center gap-1 text-[#2BBD8E] text-[13px] font-600">
                                <Check size={16} strokeWidth={2.5} /> Taken
                              </span>
                            ) : (
                              <>
                                <StatusBadge status={dose.status} />
                                <button
                                  onClick={() => handleTakeDose(dose)}
                                  disabled={isLoading}
                                  className="px-3 py-1.5 bg-[#2BBD8E] text-white text-[13px] font-600 rounded-lg hover:bg-[#23a07a] disabled:opacity-50 transition-all flex items-center gap-1.5"
                                >
                                  {isLoading ? (
                                    <><Loader2 size={13} className="animate-spin" /> Recording…</>
                                  ) : (
                                    'Take now'
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Inline error */}
                        {err && (
                          <div className="mt-2 ml-7 flex items-center gap-1.5 text-[12px] text-[#EF4444]">
                            <AlertCircle size={12} />
                            <span>{err}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── All Medications Tab ── */}
          {activeTab === 'all' && (
            <div className="card overflow-hidden">
              {medications.length === 0 ? (
                <div className="py-12 text-center text-[#718096]">
                  <p className="text-[15px]">No medications added yet.</p>
                  <button onClick={openAdd} className="mt-3 text-[#2BBD8E] font-600 hover:underline">
                    Add your first medication
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[#F1F5F9]">
                  {medications.map((med) => (
                    <div key={med._id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50">
                      {/* Color swatch icon */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${med.color || '#2BBD8E'}22` }}
                      >
                        <span style={{ color: med.color || '#2BBD8E' }} className="text-[18px]">💊</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-600 text-[#1A202C]">
                          {med.name}
                          <span className="text-[#718096] font-400 ml-1.5 text-[14px]">· {med.dose}</span>
                        </p>
                        <p className="text-[13px] text-[#718096] capitalize">
                          {FREQ_OPTIONS.find((f) => f.value === med.frequency)?.label || med.frequency}
                          {' · '}
                          {(med.scheduledTimes || []).join(', ')}
                        </p>
                        {med.instructions && (
                          <p className="text-[12px] text-[#A0AEC0] mt-0.5 italic">{med.instructions}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => openEdit(med)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#718096] hover:text-[#4A9EE8] hover:bg-[#EFF6FF] transition-all"
                          aria-label="Edit medication"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(med._id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-[#718096] hover:text-[#EF4444] hover:bg-[#FFF5F5] transition-all"
                          aria-label="Delete medication"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modal ── */}
      {showModal && createPortal(
        <MedModal
          med={editingMed}
          onClose={() => { setShowModal(false); setEditingMed(null) }}
          onSave={handleSave}
        />,
        document.body
      )}
    </div>
  )
}
