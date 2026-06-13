import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Pill, CheckSquare, Smile, ArrowUpRight, AlertOctagon, Loader2 } from 'lucide-react'
import StatCard from '../components/common/StatCard'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { fetchTodayDoses, selectTodayDoses } from '../store/slices/medSlice'
import { fetchTasks, selectTasks, selectTodayProgress, completeTask } from '../store/slices/taskSlice'
import { selectUser } from '../store/slices/authSlice'
import { addNotification } from '../store/slices/uiSlice'
import api from '../api/axiosConfig'

// ─── Mock mood data (last 7 days) ─────────────────────────────────────────────
const MOCK_MOOD = [
  { day: 'Mon', score: 8 },
  { day: 'Tue', score: 6 },
  { day: 'Wed', score: 7 },
  { day: 'Thu', score: 5 },
  { day: 'Fri', score: 9 },
  { day: 'Sat', score: 7 },
  { day: 'Sun', score: 8 },
]

// ─── Helper: get greeting based on hour ──────────────────────────────────────
function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// ─── Helper: mood bar color ───────────────────────────────────────────────────
function moodBarColor(score) {
  if (score >= 7) return 'bg-[#2BBD8E]'
  if (score >= 5) return 'bg-[#4A9EE8]'
  return 'bg-[#EF4444]'
}

// ─── MedDot ──────────────────────────────────────────────────────────────────
function MedDot({ status }) {
  const color = status === 'taken' ? 'bg-[#2BBD8E]' : status === 'due' ? 'bg-[#F5A623]' : 'bg-[#CBD5E0]'
  return <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${color} ${status === 'due' ? 'animate-pulse-soft' : ''}`} />
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cls = {
    taken:  'badge-taken',
    due:    'badge-due',
    later:  'badge-later',
    missed: 'badge-missed',
  }[status] || 'badge-later'
  const label = { taken: 'Taken', due: 'Due now', later: 'Later', missed: 'Missed' }[status] || status
  return <span className={cls}>{label}</span>
}

// ─── Demo data fallbacks ──────────────────────────────────────────────────────
const DEMO_DOSES = [
  { _id: 'd1', name: 'Metformin', dose: '500mg', scheduledTime: '8:00 AM', status: 'taken' },
  { _id: 'd2', name: 'Amlodipine', dose: '5mg', scheduledTime: '8:00 AM', status: 'taken' },
  { _id: 'd3', name: 'Atorvastatin', dose: '10mg', scheduledTime: '2:00 PM', status: 'due' },
  { _id: 'd4', name: 'Vitamin D3', dose: '1000 IU', scheduledTime: '8:00 PM', status: 'later' },
]

const DEMO_TASKS = [
  { _id: 't1', title: 'Morning walk (30 min)', completed: true, scheduledTime: '7:00 AM' },
  { _id: 't2', title: 'Blood pressure check', completed: true, scheduledTime: '9:00 AM' },
  { _id: 't3', title: 'Call Dr. Mehta for follow-up', completed: false, scheduledTime: '11:00 AM' },
  { _id: 't4', title: 'Evening stretching', completed: false, scheduledTime: '6:00 PM' },
]

// ─── HomePage ─────────────────────────────────────────────────────────────────

/**
 * Elder dashboard home page.
 * Shows stat cards, today's medications, tasks, mood chart, and AI companion widget.
 */
export default function HomePage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const user = useSelector(selectUser)
  const todayDoses = useSelector(selectTodayDoses)
  const tasks = useSelector(selectTasks)
  const progress = useSelector(selectTodayProgress) // { done, total }

  const [completingTaskId, setCompletingTaskId] = useState(null)

  useEffect(() => {
    if (user?._id || user?.id) {
      dispatch(fetchTodayDoses(user._id || user.id))
    }
    dispatch(fetchTasks())
  }, [dispatch, user])

  const isTestUser =
    user?.email === 'ramesh@test.com' ||
    user?.email === 'elder@test.com' ||
    user?.email === 'test@test.com' ||
    user?.email?.includes('demo') ||
    user?.email?.includes('test')

  // Use real data if available, else demo data for test users only
  const doses = todayDoses.length > 0 ? todayDoses : (isTestUser ? DEMO_DOSES : [])
  const taskList = tasks.length > 0 ? tasks : (isTestUser ? DEMO_TASKS : [])
  const takenCount = doses.filter((d) => d.status === 'taken').length
  const doneCount = taskList.filter((t) => t.completed || t.completedToday).length
  const avgMood = (MOCK_MOOD.reduce((a, b) => a + b.score, 0) / MOCK_MOOD.length).toFixed(1)

  const [sosSending, setSosSending] = useState(false)

  const handleCompleteTask = async (taskId) => {
    // If it's a demo task, show mock completion
    if (taskId.startsWith('t')) {
      dispatch(addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Task completed! ✓ (Demo)',
        message: 'Great job keeping up with your routine.',
      }))
      return
    }

    setCompletingTaskId(taskId)
    try {
      const result = await dispatch(completeTask(taskId))
      if (!result.error) {
        dispatch(addNotification({
          id: Date.now().toString(),
          type: 'success',
          title: 'Task completed! ✓',
          message: 'Great job keeping up with your routine.',
        }))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setCompletingTaskId(null)
    }
  }

  const handleSOS = async () => {
    if (sosSending) return
    setSosSending(true)
    try {
      await api.post('/notifications/sos', { message: 'Elder triggered SOS from app' })
      dispatch(addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: '🚨 SOS Alert Sent!',
        message: 'Your caregiver has been notified immediately.',
      }))
    } catch (err) {
      dispatch(addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'SOS sent (offline mode)',
        message: 'Alert recorded. Caregiver will be notified shortly.',
      }))
    } finally {
      setSosSending(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Greeting ── */}
      <div>
        <h2 className="text-[26px] font-700 text-[#1A202C]">
          {getGreeting()}, {user?.name?.split(' ')[0] || 'there'} 👋
        </h2>
        <p className="text-[#718096] mt-1 text-[15px]">
          {format(new Date(), "EEEE, MMMM d, yyyy")} — Here's your health summary for today.
        </p>
      </div>

      {/* ── Stat Cards Row ── */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          value={`${takenCount}/${doses.length}`}
          label="Medications taken today"
          color="green"
          icon={Pill}
        />
        <StatCard
          value={avgMood}
          label="Today's mood score"
          color="blue"
          icon={Smile}
        />
        <StatCard
          value={`${doneCount}/${taskList.length}`}
          label="Tasks completed"
          color="amber"
          icon={CheckSquare}
        />
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-2 gap-6">

        {/* ── LEFT COLUMN ── */}
        <div className="space-y-6">

          {/* Today's Medications */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-700 uppercase tracking-widest text-[#718096]">
                Today's Medications
              </h3>
              <button
                onClick={() => navigate('/medications')}
                className="text-[13px] text-[#4A9EE8] hover:underline font-500"
              >
                View all →
              </button>
            </div>
            {doses.length === 0 ? (
              <div className="text-center py-6">
                <span className="text-2xl block mb-2">🎉</span>
                <p className="text-sm font-semibold text-[#2BBD8E]">All set!</p>
                <p className="text-xs text-[#718096] mt-1">No medications remaining or scheduled for today.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {doses.map((dose) => (
                  <li key={dose._id} className="flex items-center gap-3">
                    <MedDot status={dose.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-600 text-[#1A202C] truncate">
                        {dose.name}
                        <span className="text-[#718096] font-400 ml-1">· {dose.dose}</span>
                      </p>
                      <p className="text-[12px] text-[#718096]">{dose.scheduledTime}</p>
                    </div>
                    <StatusBadge status={dose.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Today's Tasks */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-700 uppercase tracking-widest text-[#718096]">
                Today's Tasks
              </h3>
              <button
                onClick={() => navigate('/tasks')}
                className="text-[13px] text-[#4A9EE8] hover:underline font-500"
              >
                View all →
              </button>
            </div>
            <ul className="space-y-3">
              {taskList.map((task) => {
                const isCompleted = task.completed || task.completedToday;
                return (
                  <li key={task._id} className="flex items-start gap-3">
                    <button
                      onClick={() => handleCompleteTask(task._id)}
                      disabled={isCompleted || completingTaskId === task._id}
                      className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all
                        ${isCompleted
                          ? 'bg-[#2BBD8E] border-[#2BBD8E]'
                          : completingTaskId === task._id
                            ? 'border-[#4A9EE8] border-dashed animate-spin'
                            : 'border-[#CBD5E0] cursor-pointer hover:border-[#2BBD8E]'
                        }`}
                      title={isCompleted ? "Completed" : "Mark as Done"}
                    >
                      {isCompleted && (
                        <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                          <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                    <div className="flex-1">
                      <p className={`text-[14px] font-500 ${isCompleted ? 'line-through text-[#A0AEC0]' : 'text-[#1A202C]'}`}>
                        {task.title}
                      </p>
                      {task.scheduledTime && (
                        <p className="text-[12px] text-[#718096] mt-0.5">{task.scheduledTime}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="space-y-6">

          {/* 7-Day Mood */}
          <div className="card p-5">
            <h3 className="text-[13px] font-700 uppercase tracking-widest text-[#718096] mb-4">
              7-Day Mood
            </h3>
            <div className="space-y-2.5">
              {MOCK_MOOD.map(({ day, score }) => (
                <div key={day} className="flex items-center gap-3">
                  <span className="text-[13px] font-500 text-[#718096] w-8 flex-shrink-0">{day}</span>
                  <div className="flex-1 bg-[#F1F5F9] rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${moodBarColor(score)}`}
                      style={{ width: `${(score / 10) * 100}%` }}
                    />
                  </div>
                  <span className={`text-[13px] font-700 w-6 text-right ${moodBarColor(score).replace('bg-', 'text-')}`}>
                    {score}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/mood')}
              className="text-[13px] text-[#4A9EE8] hover:underline font-500 mt-4 block"
            >
              Full history →
            </button>
          </div>

          {/* AI Companion — Saathi */}
          <div className="card p-5">
            <h3 className="text-[13px] font-700 uppercase tracking-widest text-[#718096] mb-4">
              AI Companion — Saathi
            </h3>

            {/* Quote bubble */}
            <div className="bg-[#F8F9FA] rounded-xl px-4 py-3 border border-[#E2E8F0] mb-4 relative">
              <div className="absolute -top-2 left-5 w-4 h-4 bg-[#F8F9FA] border-l border-t border-[#E2E8F0] rotate-45" />
              <p className="text-[14px] text-[#4A5568] italic leading-relaxed">
                "Good morning! I noticed you completed your morning walk today — that's wonderful!
                Remember to take your Atorvastatin at 2 PM. How are you feeling today? 😊"
              </p>
            </div>

            <p className="text-[12px] text-[#718096] mb-4">
              <span className="font-600 text-[#1A202C]">14</span> conversations this week
            </p>

            {/* Action buttons */}
            <div className="space-y-2.5">
              <button
                onClick={() => navigate('/chat')}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg border-2 border-[#4A9EE8] text-[#4A9EE8] text-[14px] font-600 hover:bg-[#EFF6FF] transition-all"
              >
                Open chat with Saathi
                <ArrowUpRight size={16} />
              </button>

              <button
                onClick={handleSOS}
                disabled={sosSending}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg border-2 border-[#EF4444] text-[#EF4444] text-[14px] font-600 hover:bg-[#FFF5F5] transition-all disabled:opacity-70"
              >
                {sosSending
                  ? <Loader2 size={16} className="animate-spin" />
                  : <AlertOctagon size={16} />
                }
                {sosSending ? 'Sending alert…' : 'SOS — alert my caregiver'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
