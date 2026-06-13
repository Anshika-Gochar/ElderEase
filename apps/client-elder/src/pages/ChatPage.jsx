import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Send, Mic } from 'lucide-react'
import {
  fetchChatHistory,
  sendMessage,
  clearChatError,
  selectMessages,
  selectChatLoading,
  selectIsSending,
  selectChatError,
} from '../store/slices/chatSlice'
import LoadingSpinner from '../components/common/LoadingSpinner'

// ─── Typing Indicator ─────────────────────────────────────────────────────────
/**
 * Three-dot pulsing animation shown while Saathi is generating a response.
 */
function TypingIndicator() {
  return (
    <div className="flex items-end gap-2.5 animate-fade-in">
      {/* Saathi avatar */}
      <div className="w-8 h-8 rounded-full bg-[#2BBD8E] flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">
        S
      </div>
      <div className="bg-white border border-[#E2E8F0] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1.5 items-center h-4">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
        </div>
      </div>
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
/**
 * Individual chat message bubble.
 * @param {{ message: { role: string, content: string, createdAt?: string, isTyping?: boolean } }} props
 */
function MessageBubble({ message }) {
  const isUser = message.role === 'user'

  // Show typing indicator for placeholder
  if (message.isTyping) return <TypingIndicator />

  // Format time as "2:34 PM"
  const time = message.createdAt
    ? (() => {
        try {
          return new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        } catch {
          return ''
        }
      })()
    : ''

  return (
    <div className={`flex items-end gap-2.5 animate-fade-in ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      {!isUser ? (
        <div className="w-8 h-8 rounded-full bg-[#2BBD8E] flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">
          S
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full bg-[#4A9EE8] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
          Me
        </div>
      )}

      {/* Bubble + timestamp */}
      <div className={`max-w-[70%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm
            ${isUser
              ? 'bg-[#4A9EE8] text-white rounded-br-sm'
              : 'bg-white border border-[#E2E8F0] text-[#1A202C] rounded-bl-sm'
            }`}
        >
          {message.content}
        </div>
        {time && (
          <span className="text-[11px] text-[#A0AEC0] px-1">{time}</span>
        )}
      </div>
    </div>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────
/**
 * Shown when there are no messages yet — invites the elder to start chatting.
 */
function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 select-none">
      {/* Saathi avatar */}
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#2BBD8E] to-[#23a07a] flex items-center justify-center text-white text-3xl font-bold shadow-lg mb-5">
        S
      </div>
      <h2 className="text-[18px] font-bold text-[#1A202C] mb-2">
        Hi, I'm Saathi — your companion
      </h2>
      <p className="text-[14px] text-[#718096] max-w-xs leading-relaxed">
        Ask me anything, or just say hello 👋
      </p>
      <div className="mt-6 flex flex-wrap gap-2 justify-center">
        {['How are you?', 'Tell me a story', 'I need to talk'].map((prompt) => (
          <span
            key={prompt}
            className="px-3 py-1.5 bg-[#F0FDF4] border border-[#2BBD8E]/30 text-[#2BBD8E] text-[12px] rounded-full cursor-default"
          >
            {prompt}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── ChatPage ─────────────────────────────────────────────────────────────────
/**
 * Full chat interface with Saathi AI companion.
 * Features: optimistic messages, typing indicator, auto-scroll,
 * timestamps, empty state, error banner with auto-dismiss.
 */
export default function ChatPage() {
  const dispatch   = useDispatch()
  const messages   = useSelector(selectMessages)
  const isLoading  = useSelector(selectChatLoading)
  const isSending  = useSelector(selectIsSending)
  const error      = useSelector(selectChatError)

  const [input, setInput] = useState('')
  const messagesEndRef   = useRef(null)
  const inputRef         = useRef(null)

  // ── Fetch history on mount ──────────────────────────────────────────────────
  useEffect(() => {
    dispatch(fetchChatHistory())
  }, [dispatch])

  // ── Auto-scroll after every message change ─────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Auto-dismiss error after 4 seconds ─────────────────────────────────────
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => dispatch(clearChatError()), 4000)
    return () => clearTimeout(t)
  }, [error, dispatch])

  // ── Send handler ───────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isSending) return
    setInput('')          // clear immediately (optimistic)
    dispatch(sendMessage(text))
    inputRef.current?.focus()
  }, [input, isSending, dispatch])

  // ── Enter to send (Shift+Enter = newline) ──────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // True when no real messages exist (typing placeholder doesn't count)
  const hasNoMessages = messages.filter((m) => !m.isTyping).length === 0

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] animate-fade-in">
      {/* ── Chat Container ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white rounded-[16px] border border-[#E2E8F0] shadow-sm overflow-hidden">

        {/* ── Chat Header ── */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#E2E8F0] bg-white flex-shrink-0">
          <div className="relative">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#2BBD8E] to-[#23a07a] flex items-center justify-center text-white text-[16px] font-bold shadow-sm">
              S
            </div>
            {/* Online indicator */}
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#2BBD8E] border-2 border-white rounded-full" />
          </div>
          <div>
            <p className="text-[16px] font-bold text-[#1A202C]">Saathi</p>
            <p className="text-[12px] text-[#718096]">AI Health Companion · Always here for you</p>
          </div>
        </div>

        {/* ── Error Banner (auto-dismisses) ── */}
        {error && (
          <div className="flex-shrink-0 bg-red-50 border-b border-red-200 px-6 py-2.5 text-[13px] text-red-600 animate-fade-in">
            ⚠️ {error}
          </div>
        )}

        {/* ── Messages Area ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-[#F8F9FA]">
          {isLoading ? (
            <LoadingSpinner message="Loading your conversation…" />
          ) : hasNoMessages ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <MessageBubble key={msg._id || idx} message={msg} />
              ))}
              {/* Bottom sentinel for auto-scroll */}
              <div ref={messagesEndRef} />
            </div>
          )}
          {/* When there are messages, sentinel still needs to be here */}
          {!isLoading && !hasNoMessages && <div ref={messagesEndRef} />}
        </div>

        {/* ── Input Area ── */}
        <div className="px-4 py-4 border-t border-[#E2E8F0] bg-white flex-shrink-0">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message to Saathi…"
                rows={1}
                disabled={isSending}
                className="w-full border border-[#E2E8F0] rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:border-[#2BBD8E] focus:ring-2 focus:ring-[#2BBD8E]/20 resize-none max-h-28 disabled:opacity-60"
                style={{ overflowY: 'auto' }}
              />
            </div>

            {/* Mic button (coming soon) */}
            <button
              className="w-11 h-11 flex items-center justify-center rounded-xl border border-[#E2E8F0] text-[#718096] hover:text-[#4A9EE8] hover:border-[#4A9EE8] transition-all flex-shrink-0"
              aria-label="Voice input (coming soon)"
              title="Voice input (coming soon)"
              type="button"
            >
              <Mic size={18} />
            </button>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-[#2BBD8E] text-white hover:bg-[#23a07a] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex-shrink-0"
              aria-label="Send message"
              type="button"
            >
              {isSending ? (
                /* Mini spinner */
                <svg
                  className="animate-spin w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
          <p className="text-[11px] text-[#A0AEC0] mt-2 text-center">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>

      </div>
    </div>
  )
}
