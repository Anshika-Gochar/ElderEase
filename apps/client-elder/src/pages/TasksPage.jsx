import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Flame, Dumbbell, Heart, Brain, Utensils, CheckCircle2, Plus, X, Loader2 } from 'lucide-react'
import {
  fetchTasks, completeTask, fetchStreak, addTask,
  selectTasks, selectStreak, selectTaskLoading,
} from '../store/slices/taskSlice'
import { addNotification } from '../store/slices/uiSlice'
import LoadingSpinner from '../components/common/LoadingSpinner'

// ─── Category Icon Map ────────────────────────────────────────────────────────
const CATEGORY_ICONS = {
  exercise:   { icon: Dumbbell,      color: 'text-[#4A9EE8]', bg: 'bg-[#EFF6FF]' },
  health:     { icon: Heart,         color: 'text-[#EF4444]', bg: 'bg-[#FFF5F5]' },
  mental:     { icon: Brain,         color: 'text-[#F5A623]', bg: 'bg-[#FFFBEB]' },
  nutrition:  { icon: Utensils,      color: 'text-[#2BBD8E]', bg: 'bg-[#F0FDF9]' },
  social:     { icon: Heart,         color: 'text-[#A855F7]', bg: 'bg-[#FAF5FF]' },
  medication: { icon: CheckCircle2,  color: 'text-[#2BBD8E]', bg: 'bg-[#F0FDF9]' },
  default:    { icon: CheckCircle2,  color: 'text-[#718096]', bg: 'bg-[#F1F5F9]' },
}

const CATEGORIES = ['exercise', 'health', 'mental', 'nutrition', 'social', 'medication', 'other']
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function CategoryIcon({ category }) {
  const cfg = CATEGORY_ICONS[category?.toLowerCase()] || CATEGORY_ICONS.default
  const Icon = cfg.icon
  return (
    <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
      <Icon size={18} className={cfg.color} />
    </div>
  )
}

// ─── Helper: is task done today? ─────────────────────────────────────────────
// Backend returns `completedToday`, optimistic update sets `completed`
const isDone = (task) => task.completed || task.completedToday

// ─── AddTaskModal ─────────────────────────────────────────────────────────────
function AddTaskModal({ onClose, onSave, saving }) {
  const [title, setTitle]         = useState('')
  const [category, setCategory]   = useState('exercise')
  const [time, setTime]           = useState('')
  const [recurring, setRecurring] = useState(true)
  const [days, setDays]           = useState([0, 1, 2, 3, 4, 5, 6])

  const toggleDay = (d) =>
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      category,
      scheduledTime: time || undefined,
      isRecurring: recurring,
      daysOfWeek: recurring ? days : [],
    })
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex justify-center items-start p-4 md:p-10 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-[18px] font-700 text-[#1A202C]">Add New Task</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#718096] hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-left">
          {/* Title */}
          <div>
            <label className="block text-[13px] font-600 text-[#4A5568] mb-1.5">Task title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Morning walk (30 min)"
              autoFocus
              className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8F0] focus:outline-none focus:ring-2 focus:ring-[#2BBD8E]/40 text-[14px]"
            />
          </div>

          {/* Category + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-600 text-[#4A5568] mb-1.5">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#2BBD8E]/40 bg-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-600 text-[#4A5568] mb-1.5">Time (optional)</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#2BBD8E]/40"
              />
            </div>
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
            <div>
              <p className="text-[14px] font-600 text-[#1A202C]">Recurring task</p>
              <p className="text-[12px] text-[#718096]">Repeat on selected days</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-[#2BBD8E] transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
            </label>
          </div>

          {/* Days of week */}
          {recurring && (
            <div>
              <label className="block text-[13px] font-600 text-[#4A5568] mb-2">Repeat on</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS_OF_WEEK.map((d, i) => (
                  <button
                    key={d} type="button"
                    onClick={() => toggleDay(i)}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-600 transition-all ${
                      days.includes(i)
                        ? 'bg-[#2BBD8E] text-white'
                        : 'bg-[#F1F5F9] text-[#718096] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-[#E2E8F0]">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[#E2E8F0] bg-white text-[14px] font-600 text-[#718096] hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={!title.trim() || saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#2BBD8E] text-white text-[14px] font-600 hover:bg-[#23a07a] transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {saving ? 'Saving…' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── TasksPage ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const dispatch = useDispatch()
  const tasks    = useSelector(selectTasks)
  const streak   = useSelector(selectStreak)
  const loading  = useSelector(selectTaskLoading)

  const [showModal, setShowModal] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [completing, setCompleting] = useState(null) // taskId being completed

  useEffect(() => {
    dispatch(fetchTasks())
    dispatch(fetchStreak())
  }, [dispatch])

  const pending   = tasks.filter((t) => !isDone(t))
  const completed = tasks.filter((t) =>  isDone(t))
  const total = tasks.length
  const done  = completed.length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0

  const handleComplete = async (taskId) => {
    setCompleting(taskId)
    const result = await dispatch(completeTask(taskId))
    setCompleting(null)
    if (!result.error) {
      dispatch(addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Task completed! ✓',
        message: 'Great job keeping up with your routine.',
      }))
      dispatch(fetchStreak())
    }
  }

  const handleAddTask = async (taskData) => {
    setSaving(true)
    const result = await dispatch(addTask(taskData))
    setSaving(false)
    if (!result.error) {
      setShowModal(false)
      dispatch(addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Task added!',
        message: `"${taskData.title}" added to your routine.`,
      }))
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[#718096] text-[15px]">{done} of {total} tasks done today</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#FFFBEB] border border-[#FDE68A] px-4 py-2 rounded-full">
            <Flame size={18} className="text-[#F5A623]" />
            <span className="text-[15px] font-700 text-[#92400E]">{streak || 0} day streak</span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#2BBD8E] text-white rounded-full text-[14px] font-600 hover:bg-[#23a07a] transition-all shadow-sm"
          >
            <Plus size={16} /> Add Task
          </button>
        </div>
      </div>

      {/* ── Progress Bar ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[14px] font-600 text-[#4A5568]">Today's Progress</p>
          <p className="text-[14px] font-700 text-[#2BBD8E]">{pct}%</p>
        </div>
        <div className="w-full bg-[#F1F5F9] rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#2BBD8E] to-[#23a07a] rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[13px] text-[#718096] mt-2">{done} completed · {total - done} remaining</p>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading tasks…" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ── Pending Tasks ── */}
          <div className="card p-5">
            <h3 className="text-[13px] font-700 uppercase tracking-widest text-[#718096] mb-4">
              Pending Tasks
            </h3>
            {pending.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[32px] mb-2">🎉</p>
                <p className="text-[15px] font-600 text-[#2BBD8E]">All tasks completed!</p>
                <p className="text-[13px] text-[#718096] mt-1">Fantastic job today.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {pending.map((task) => (
                  <li key={task._id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-[#F8F9FA] transition-all">
                    <CategoryIcon category={task.category} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-600 text-[#1A202C]">{task.title}</p>
                      {task.scheduledTime && (
                        <p className="text-[12px] text-[#718096] mt-0.5">{task.scheduledTime}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleComplete(task._id)}
                      disabled={completing === task._id}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-600 bg-[#2BBD8E] text-white rounded-lg hover:bg-[#23a07a] transition-all shadow-sm disabled:opacity-60"
                    >
                      {completing === task._id
                        ? <Loader2 size={13} className="animate-spin" />
                        : 'Done ✓'
                      }
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Completed Tasks ── */}
          <div className="card p-5">
            <h3 className="text-[13px] font-700 uppercase tracking-widest text-[#718096] mb-4">
              Completed Today
            </h3>
            {completed.length === 0 ? (
              <p className="text-[14px] text-[#718096] text-center py-8">
                No tasks completed yet — you've got this!
              </p>
            ) : (
              <ul className="space-y-3">
                {completed.map((task) => (
                  <li key={task._id} className="flex items-start gap-3 p-3 rounded-xl opacity-70">
                    <div className="w-10 h-10 bg-[#D1FAE5] rounded-xl flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 size={20} className="text-[#2BBD8E]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-500 text-[#718096] line-through">{task.title}</p>
                      {task.scheduledTime && (
                        <p className="text-[12px] text-[#A0AEC0] mt-0.5">{task.scheduledTime}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Add Task Modal ── */}
      {showModal && createPortal(
        <AddTaskModal
          onClose={() => setShowModal(false)}
          onSave={handleAddTask}
          saving={saving}
        />,
        document.body
      )}
    </div>
  )
}
