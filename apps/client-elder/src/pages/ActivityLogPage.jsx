// apps/client-elder/src/pages/ActivityLogPage.jsx  MODIFY
import React, { useState, useEffect } from 'react'
import { format, subDays, parseISO } from 'date-fns'
import { Pill, CheckSquare, MessageCircle, Activity, Filter, Calendar } from 'lucide-react'
import { useSelector } from 'react-redux'
import { selectUser } from '../store/slices/authSlice'
import api from '../api/axiosConfig'
import LoadingSpinner from '../components/common/LoadingSpinner'

// ─── Event Type Config ────────────────────────────────────────────────────────
const EVENT_TYPES = {
  medication: {
    icon:  Pill,
    color: 'text-[#2BBD8E]',
    bg:    'bg-[#D1FAE5]',
    label: 'Medication',
  },
  task: {
    icon:  CheckSquare,
    color: 'text-[#F5A623]',
    bg:    'bg-[#FEF3C7]',
    label: 'Task',
  },
  chat: {
    icon:  MessageCircle,
    color: 'text-[#4A9EE8]',
    bg:    'bg-[#DBEAFE]',
    label: 'Chat',
  },
  mood: {
    icon:  Activity,
    color: 'text-[#8B5CF6]',
    bg:    'bg-[#EDE9FE]',
    label: 'Mood',
  },
}

// ─── Demo Events ──────────────────────────────────────────────────────────────
const generateEvents = () => {
  const today = new Date()
  return [
    { id: 'e1',  type: 'medication', time: '08:02 AM', date: today,           description: 'Took Metformin 500mg' },
    { id: 'e2',  type: 'medication', time: '08:04 AM', date: today,           description: 'Took Amlodipine 5mg' },
    { id: 'e3',  type: 'task',       time: '07:45 AM', date: today,           description: 'Completed: Morning walk (30 min)' },
    { id: 'e4',  type: 'chat',       time: '09:15 AM', date: today,           description: 'Chat session with Saathi — 12 messages' },
    { id: 'e5',  type: 'mood',       time: '10:00 AM', date: today,           description: 'Mood logged: 8/10 — Feeling great' },
    { id: 'e6',  type: 'task',       time: '09:30 AM', date: today,           description: 'Completed: Blood pressure check' },
    { id: 'e7',  type: 'medication', time: '08:15 AM', date: subDays(today, 1), description: 'Took Metformin 500mg' },
    { id: 'e8',  type: 'task',       time: '07:50 AM', date: subDays(today, 1), description: 'Completed: Morning walk' },
    { id: 'e9',  type: 'chat',       time: '11:30 AM', date: subDays(today, 1), description: 'Chat session with Saathi — 7 messages' },
    { id: 'e10', type: 'mood',       time: '09:45 AM', date: subDays(today, 1), description: 'Mood logged: 6/10 — Bit tired' },
    { id: 'e11', type: 'medication', time: '08:00 AM', date: subDays(today, 2), description: 'Took Metformin 500mg' },
    { id: 'e12', type: 'medication', time: '08:01 AM', date: subDays(today, 2), description: 'Took Amlodipine 5mg' },
    { id: 'e13', type: 'mood',       time: '10:00 AM', date: subDays(today, 2), description: 'Mood logged: 9/10 — Wonderful day' },
    { id: 'e14', type: 'task',       time: '08:30 AM', date: subDays(today, 2), description: 'Completed: Evening stretching' },
  ]
}

const ALL_EVENTS = generateEvents()

const FILTER_OPTIONS = [
  { value: 'all',        label: 'All Activity' },
  { value: 'medication', label: 'Medications' },
  { value: 'task',       label: 'Tasks' },
  { value: 'chat',       label: 'Chat' },
  { value: 'mood',       label: 'Mood' },
]

const parseTime = (timeStr) => {
  if (!timeStr) return 'Today'
  try {
    const [h, m] = timeStr.split(':')
    const date = new Date()
    date.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0)
    return format(date, 'hh:mm a')
  } catch {
    return timeStr
  }
}

// ─── ActivityLogPage ──────────────────────────────────────────────────────────

/**
 * Activity log page showing a timeline of all elder events.
 * Supports filtering by event type.
 */
export default function ActivityLogPage() {
  const [filter, setFilter] = useState('all')
  const user = useSelector(selectUser)

  const [loadingReal, setLoadingReal] = useState(false)
  const [realEvents, setRealEvents] = useState([])

  const isTestUser =
    user?.email === 'ramesh@test.com' ||
    user?.email === 'elder@test.com' ||
    user?.email === 'test@test.com' ||
    user?.email?.includes('demo') ||
    user?.email?.includes('test')

  useEffect(() => {
    if (!user?._id) return

    setLoadingReal(true)
    Promise.all([
      api.get(`/medications/logs/elder/${user._id}?days=14`).catch(() => ({ data: [] })),
      api.get('/tasks').catch(() => ({ data: [] })),
      api.get('/ai/chat/history?limit=50').catch(() => ({ data: [] })),
      api.get(`/ai/mood/${user._id}`).catch(() => ({ data: { scores: [] } })),
    ])
      .then(([medLogsRes, tasksRes, chatRes, moodRes]) => {
        const events = []

        // 1. Medication logs
        if (Array.isArray(medLogsRes.data)) {
          medLogsRes.data.forEach((log) => {
            if (log.status === 'taken') {
              events.push({
                id: log._id,
                type: 'medication',
                time: log.takenAt ? format(new Date(log.takenAt), 'hh:mm a') : 'Done',
                date: log.takenAt ? new Date(log.takenAt) : new Date(log.scheduledTime),
                description: `Took ${log.medicationName}`,
              })
            } else if (log.status === 'missed') {
              events.push({
                id: log._id,
                type: 'medication',
                time: log.scheduledTime ? format(new Date(log.scheduledTime), 'hh:mm a') : 'Missed',
                date: new Date(log.scheduledTime),
                description: `Missed ${log.medicationName}`,
              })
            }
          })
        }

        // 2. Tasks completed
        const taskArray = Array.isArray(tasksRes.data)
          ? tasksRes.data
          : (tasksRes.data?.tasks || [])
        taskArray.forEach((task) => {
          if (task.completed || task.completedToday) {
            events.push({
              id: task._id + '-completed',
              type: 'task',
              time: task.scheduledTime ? parseTime(task.scheduledTime) : 'Done',
              date: new Date(),
              description: `Completed: ${task.title}`,
            })
          }
        })

        // 3. Chat Messages (User side only)
        const messages = Array.isArray(chatRes.data)
          ? chatRes.data
          : (chatRes.data?.messages || [])
        messages.forEach((msg) => {
          if (msg.role === 'user') {
            events.push({
              id: msg._id,
              type: 'chat',
              time: msg.createdAt ? format(new Date(msg.createdAt), 'hh:mm a') : 'Sent',
              date: msg.createdAt ? new Date(msg.createdAt) : new Date(),
              description: `Chat with Saathi: "${msg.content.slice(0, 45)}${msg.content.length > 45 ? '...' : ''}"`,
            })
          }
        })

        // 4. Mood Scores
        const moodScores = Array.isArray(moodRes.data?.scores)
          ? moodRes.data.scores
          : (Array.isArray(moodRes.data) ? moodRes.data : [])
        moodScores.forEach((score) => {
          const scoreDate = score.date ? parseISO(score.date) : new Date()
          events.push({
            id: score._id || score.date,
            type: 'mood',
            time: '10:00 AM',
            date: scoreDate,
            description: `Mood logged: ${score.score}/10 — ${
              score.score >= 8
                ? 'Feeling great'
                : score.score >= 6
                ? 'Feeling good'
                : score.score >= 4
                ? 'Feeling okay'
                : 'Feeling low'
            }`,
          })
        })

        // Sort events descending by date
        events.sort((a, b) => b.date - a.date)
        setRealEvents(events)
      })
      .catch((err) => {
        console.error('Error fetching activity logs:', err)
      })
      .finally(() => {
        setLoadingReal(false)
      })
  }, [user?._id])

  const eventsList = isTestUser
    ? (realEvents.length > 0 ? realEvents : ALL_EVENTS)
    : realEvents

  const filtered = filter === 'all'
    ? eventsList
    : eventsList.filter((e) => e.type === filter)

  // Group by date
  const grouped = filtered.reduce((acc, event) => {
    const key = format(event.date, 'yyyy-MM-dd')
    if (!acc[key]) acc[key] = { label: formatDateLabel(event.date), events: [] }
    acc[key].events.push(event)
    return acc
  }, {})

  function formatDateLabel(date) {
    const today = new Date()
    const diff = Math.floor((today - date) / 86400000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    return format(date, 'EEEE, MMMM d')
  }

  if (loadingReal) {
    return <LoadingSpinner message="Loading activity log..." />
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Stats Row ── */}
      <div className="grid grid-cols-4 gap-4">
        {Object.entries(EVENT_TYPES).map(([type, cfg]) => {
          const Icon = cfg.icon
          const count = eventsList.filter((e) => e.type === type).length
          return (
            <button
              key={type}
              onClick={() => setFilter(filter === type ? 'all' : type)}
              className={`card p-4 flex items-center gap-3 hover:shadow-card-hover transition-all text-left ${filter === type ? `${cfg.bg} border-2` : ''}`}
            >
              <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={cfg.color} />
              </div>
              <div>
                <p className="text-[20px] font-700 text-[#1A202C]">{count}</p>
                <p className="text-[12px] text-[#718096] font-500">{cfg.label}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[#718096]">
          <Filter size={15} />
          <span className="text-[13px] font-500">Filter:</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-600 transition-all ${
                filter === opt.value
                  ? 'bg-[#1A202C] text-white'
                  : 'bg-white border border-[#E2E8F0] text-[#718096] hover:text-[#1A202C]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Timeline ── */}
      {Object.values(grouped).length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-[#718096] text-[15px]">No activity found for this filter.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.values(grouped).map(({ label, events }) => (
            <div key={label}>
              {/* Date label */}
              <div className="flex items-center gap-3 mb-3">
                <Calendar size={14} className="text-[#718096]" />
                <p className="text-[13px] font-700 text-[#718096] uppercase tracking-wider">{label}</p>
                <div className="flex-1 h-px bg-[#E2E8F0]" />
              </div>

              {/* Event cards */}
              <div className="card divide-y divide-[#F1F5F9]">
                {events.sort((a, b) => b.time.localeCompare(a.time)).map((event, idx) => {
                  const cfg = EVENT_TYPES[event.type]
                  const Icon = cfg.icon
                  return (
                    <div key={event.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-gray-50">
                      {/* Icon */}
                      <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <Icon size={16} className={cfg.color} />
                      </div>

                      {/* Description */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-500 text-[#1A202C]">{event.description}</p>
                        <p className="text-[12px] text-[#718096] mt-0.5">{cfg.label}</p>
                      </div>

                      {/* Time */}
                      <span className="text-[13px] text-[#718096] flex-shrink-0 font-500">{event.time}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
