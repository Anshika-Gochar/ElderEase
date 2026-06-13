import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useParams } from 'react-router-dom'
import {
  CheckSquare, Square, Flame, Clock, Dumbbell,
  Heart, Users, Pill, MoreHorizontal, PlusCircle,
} from 'lucide-react'
import { fetchLinkedElders } from '../store/slices/elderSlice'
import api from '../api/axiosConfig'

/** Category icon map */
const categoryIcon = {
  exercise: <Dumbbell size={16} className="text-brand-amber" />,
  health: <Heart size={16} className="text-brand-red" />,
  social: <Users size={16} className="text-brand-blue" />,
  medication: <Pill size={16} className="text-brand-green" />,
  other: <MoreHorizontal size={16} className="text-brand-text-secondary" />,
}

/** Mock tasks shown when API not yet connected */
const MOCK_TASKS = [
  { _id: '1', title: 'Morning walk — 20 min', category: 'exercise', scheduledTime: '07:00', completed: true },
  { _id: '2', title: 'Blood pressure reading', category: 'health', scheduledTime: '09:00', completed: true },
  { _id: '3', title: 'Call daughter Priya', category: 'social', scheduledTime: '11:00', completed: true },
  { _id: '4', title: 'Evening breathing exercise', category: 'exercise', scheduledTime: '18:00', completed: false },
  { _id: '5', title: 'Read for 30 minutes', category: 'other', scheduledTime: '20:00', completed: false },
]

export default function TasksPage() {
  const { elderId } = useParams()
  const { selectedElder } = useSelector((s) => s.elder)

  const [tasks, setTasks] = React.useState([])
  const [streak, setStreak] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [showAddModal, setShowAddModal] = React.useState(false)
  const [newTask, setNewTask] = React.useState({ title: '', category: 'other', scheduledTime: '' })

  const targetId = elderId || selectedElder?._id

  const isTestUser =
    selectedElder?.email === 'ramesh@test.com' ||
    selectedElder?.email === 'elder@test.com' ||
    selectedElder?.email === 'test@test.com' ||
    selectedElder?.email?.includes('demo') ||
    selectedElder?.email?.includes('test')

  useEffect(() => {
    if (!targetId) return
    setLoading(true)
    Promise.all([
      api.get(`/tasks?elderId=${targetId}`),
      api.get(`/tasks/streak/${targetId}`),
    ])
      .then(([tasksRes, streakRes]) => {
        if (Array.isArray(tasksRes.data)) {
          if (tasksRes.data.length === 0 && isTestUser) {
            setTasks(MOCK_TASKS)
          } else {
            const mapped = tasksRes.data.map((t) => ({
              ...t,
              completed: t.completedToday || t.completed || false,
            }))
            setTasks(mapped)
          }
        }
        if (streakRes.data?.streak !== undefined) {
          setStreak(streakRes.data.streak)
        } else if (isTestUser) {
          setStreak(5)
        } else {
          setStreak(0)
        }
      })
      .catch(() => {
        if (isTestUser) {
          setTasks(MOCK_TASKS)
          setStreak(5)
        }
      })
      .finally(() => setLoading(false))
  }, [targetId, isTestUser])

  const completedCount = tasks.filter((t) => t.completed).length
  const totalCount = tasks.length
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const handleAddTask = async (e) => {
    e.preventDefault()
    if (!newTask.title.trim()) return
    try {
      const res = await api.post('/tasks', { ...newTask, elderId: targetId })
      if (res.data) {
        const addedTask = {
          ...res.data,
          completed: res.data.completedToday || res.data.completed || false
        }
        setTasks((prev) => {
          const isMocking = prev.some((t) => ['1', '2', '3', '4', '5'].includes(t._id))
          const baseList = isMocking ? [] : prev
          return [...baseList, addedTask]
        })
      }
    } catch (err) {
      console.error(err)
      setTasks((prev) => [
        ...prev,
        { _id: Date.now().toString(), ...newTask, completed: false },
      ])
    }
    setNewTask({ title: '', category: 'other', scheduledTime: '' })
    setShowAddModal(false)
  }

  const elderName = selectedElder?.name || 'Elder'

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-text-primary">Daily Tasks</h1>
          <p className="text-brand-text-secondary text-sm mt-0.5">{elderName}'s task list for today</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Streak badge */}
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5">
            <Flame size={16} className="text-brand-amber" />
            <span className="text-sm font-bold text-amber-700">{streak} day streak</span>
          </div>
          <button
            id="cg-tasks-add-btn"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-brand-green text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-500 transition"
          >
            <PlusCircle size={16} />
            Add task
          </button>
        </div>
      </div>

      {/* Progress card */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-brand-text-primary">Today's progress</span>
          <span className="text-sm font-bold text-brand-green">{completedCount}/{totalCount} done</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-green rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-brand-text-secondary mt-2">{progressPct}% complete</p>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-3 border-brand-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Pending */}
          {tasks.filter((t) => !t.completed).map((task) => (
            <div key={task._id} className="card p-4 flex items-center gap-4 hover:shadow-card-hover transition">
              <div className="text-brand-text-secondary">
                <Square size={22} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {categoryIcon[task.category] || categoryIcon.other}
                  <span className="font-medium text-brand-text-primary">{task.title}</span>
                </div>
                {task.scheduledTime && (
                  <p className="text-xs text-brand-text-secondary mt-0.5 flex items-center gap-1">
                    <Clock size={11} />
                    {task.scheduledTime}
                  </p>
                )}
              </div>
              <span className="text-xs bg-gray-100 text-brand-text-secondary px-2.5 py-1 rounded-full capitalize">
                {task.category}
              </span>
            </div>
          ))}

          {/* Divider */}
          {tasks.some((t) => t.completed) && (
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 border-t border-brand-border" />
              <span className="text-xs text-brand-text-secondary">Completed</span>
              <div className="flex-1 border-t border-brand-border" />
            </div>
          )}

          {/* Completed */}
          {tasks.filter((t) => t.completed).map((task) => (
            <div key={task._id} className="card p-4 flex items-center gap-4 opacity-60">
              <CheckSquare size={22} className="text-brand-green flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {categoryIcon[task.category] || categoryIcon.other}
                  <span className="font-medium text-brand-text-primary line-through">{task.title}</span>
                </div>
                {task.scheduledTime && (
                  <p className="text-xs text-brand-text-secondary mt-0.5 flex items-center gap-1">
                    <Clock size={11} />
                    {task.scheduledTime}
                  </p>
                )}
              </div>
              <span className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full">Done</span>
            </div>
          ))}

          {tasks.length === 0 && (
            <div className="card p-10 text-center">
              <p className="text-brand-text-secondary">No tasks for today. Add one to get started!</p>
            </div>
          )}
        </div>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 animate-fade-in">
            <h3 className="text-lg font-bold text-brand-text-primary mb-5">Add task for {elderName}</h3>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-brand-text-primary mb-1.5">Task title</label>
                <input
                  type="text"
                  required
                  value={newTask.title}
                  onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Evening walk"
                  className="w-full px-4 py-2.5 rounded-xl border border-brand-border bg-brand-bg focus:outline-none focus:ring-2 focus:ring-brand-green/40 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-brand-text-primary mb-1.5">Category</label>
                  <select
                    value={newTask.category}
                    onChange={(e) => setNewTask((p) => ({ ...p, category: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-brand-border bg-brand-bg focus:outline-none focus:ring-2 focus:ring-brand-green/40 text-sm"
                  >
                    <option value="exercise">Exercise</option>
                    <option value="health">Health</option>
                    <option value="social">Social</option>
                    <option value="medication">Medication</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-brand-text-primary mb-1.5">Time</label>
                  <input
                    type="time"
                    value={newTask.scheduledTime}
                    onChange={(e) => setNewTask((p) => ({ ...p, scheduledTime: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-brand-border bg-brand-bg focus:outline-none focus:ring-2 focus:ring-brand-green/40 text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 border border-brand-border rounded-xl text-sm font-semibold text-brand-text-primary hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-brand-green text-white rounded-xl text-sm font-semibold hover:bg-green-500 transition"
                >
                  Add task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
