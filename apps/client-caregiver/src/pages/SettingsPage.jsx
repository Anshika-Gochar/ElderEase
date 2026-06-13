// apps/client-caregiver/src/pages/SettingsPage.jsx  MODIFIED
import React, { useState, useRef, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  User, Phone, Mail, Bell, BellOff, Link2, Trash2,
  Lock, LogOut, Save, Camera, Check, Loader2,
} from 'lucide-react'
import { logout } from '../store/slices/authSlice'
import { useNavigate } from 'react-router-dom'
import api from '../api/axiosConfig'

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ id, checked, onChange, disabled }) {
  return (
    <label htmlFor={id} className="relative inline-flex items-center cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-[#2BBD8E] transition-colors duration-200" />
      <div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 peer-checked:translate-x-5" />
    </label>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon: Icon, iconColor = 'text-[#2BBD8E]', children }) {
  return (
    <section className="card p-6">
      <div className="flex items-center gap-2 mb-5">
        <Icon size={18} className={iconColor} />
        <h2 className="font-bold text-[#1A202C]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

// ── SettingsPage ──────────────────────────────────────────────────────────────
/**
 * Caregiver settings page.
 * Sections: Profile (avatar + fields), Notification Preferences (API-backed),
 *           Linked Elders, Security (password), Sign Out.
 *
 * Phase 5 changes:
 *  - Avatar upload via POST /api/users/avatar (multipart)
 *  - Notification prefs fetched from user profile and saved via
 *    PATCH /api/users/notification-prefs
 */
export default function SettingsPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { user }   = useSelector((s) => s.auth)
  const { elders } = useSelector((s) => s.elder)

  // ── Profile form ─────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState({
    name:  user?.name  || '',
    email: user?.email || '',
    phone: user?.phone || '',
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved,  setProfileSaved]  = useState(false)

  // ── Avatar ───────────────────────────────────────────────────────────────────
  const fileRef    = useRef(null)
  const [avatarSrc,      setAvatarSrc]      = useState(user?.avatarUrl || user?.profilePhoto || null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError,     setAvatarError]     = useState('')

  // ── Notification prefs (Phase 5) ─────────────────────────────────────────────
  const serverPrefs = user?.notificationPrefs || {}
  const [notifPrefs, setNotifPrefs] = useState({
    emailAnomalies: serverPrefs.emailAnomalies ?? true,
    smsAnomalies:   serverPrefs.smsAnomalies   ?? true,
    emailDigest:    serverPrefs.emailDigest     ?? true,
  })
  const [prefsSaving, setPrefsSaving] = useState(false)
  const [prefsSaved,  setPrefsSaved]  = useState(false)
  const [prefsError,  setPrefsError]  = useState('')

  // ── Password form ────────────────────────────────────────────────────────────
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' })
  const [pwError,  setPwError]  = useState('')
  const [pwSaved,  setPwSaved]  = useState(false)
  const [pwSaving, setPwSaving] = useState(false)

  // Sync prefs if Redux user changes (e.g. after profile re-fetch)
  useEffect(() => {
    const p = user?.notificationPrefs || {}
    setNotifPrefs({
      emailAnomalies: p.emailAnomalies ?? true,
      smsAnomalies:   p.smsAnomalies   ?? true,
      emailDigest:    p.emailDigest     ?? true,
    })
    if (user?.avatarUrl || user?.profilePhoto) {
      setAvatarSrc(user.avatarUrl || user.profilePhoto)
    }
  }, [user])

  // ── Avatar upload ─────────────────────────────────────────────────────────────
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate client-side before uploading
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError('Please choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('Image must be under 2 MB.')
      return
    }

    setAvatarError('')
    setAvatarUploading(true)

    // Preview locally immediately
    const reader = new FileReader()
    reader.onload = (ev) => setAvatarSrc(ev.target.result)
    reader.readAsDataURL(file)

    try {
      const form = new FormData()
      form.append('avatar', file)
      const { data } = await api.post('/users/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAvatarSrc(data.avatarUrl)
    } catch (err) {
      setAvatarError(err.response?.data?.error || 'Upload failed. Please try again.')
      // Revert preview
      setAvatarSrc(user?.avatarUrl || user?.profilePhoto || null)
    } finally {
      setAvatarUploading(false)
      // Reset input so the same file can be re-selected
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Profile save ──────────────────────────────────────────────────────────────
  const handleProfileSave = async (e) => {
    e.preventDefault()
    setProfileSaving(true)
    try {
      await api.patch('/users/profile', {
        name:  profile.name,
        phone: profile.phone,
      })
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 3000)
    } catch {
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 3000)
    } finally {
      setProfileSaving(false)
    }
  }

  // ── Notification prefs save ───────────────────────────────────────────────────
  const handlePrefChange = async (key, value) => {
    const next = { ...notifPrefs, [key]: value }
    setNotifPrefs(next)
    setPrefsSaving(true)
    setPrefsError('')
    try {
      await api.patch('/users/notification-prefs', { [key]: value })
      setPrefsSaved(true)
      setTimeout(() => setPrefsSaved(false), 2500)
    } catch (err) {
      setPrefsError(err.response?.data?.error || 'Could not save preference.')
      // Revert on failure
      setNotifPrefs((prev) => ({ ...prev, [key]: !value }))
    } finally {
      setPrefsSaving(false)
    }
  }

  // ── Password change ───────────────────────────────────────────────────────────
  const handlePasswordSave = async (e) => {
    e.preventDefault()
    setPwError('')
    if (passwordForm.next !== passwordForm.confirm) {
      setPwError('New passwords do not match.')
      return
    }
    if (passwordForm.next.length < 8) {
      setPwError('New password must be at least 8 characters.')
      return
    }
    setPwSaving(true)
    try {
      await api.patch('/users/profile', { password: passwordForm.next })
      setPwSaved(true)
      setPasswordForm({ current: '', next: '', confirm: '' })
      setTimeout(() => setPwSaved(false), 3000)
    } catch (err) {
      setPwError(err.response?.data?.error || 'Could not update password.')
    } finally {
      setPwSaving(false)
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
  }

  // ── Initials fallback for avatar ──────────────────────────────────────────────
  const initials = (user?.name || 'C').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-[#1A202C]">Settings</h1>
        <p className="text-sm text-[#718096] mt-0.5">Manage your profile and notification preferences.</p>
      </div>

      {/* ── Profile ──────────────────────────────────────────────────────────── */}
      <Section title="Profile" icon={User}>
        {/* Avatar */}
        <div className="flex items-center gap-5 mb-6">
          <div className="relative flex-shrink-0">
            {avatarSrc ? (
              <img
                src={avatarSrc.startsWith('/uploads') ? `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}${avatarSrc}` : avatarSrc}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover border-2 border-[#4A9EE8]/30"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#4A9EE8] to-[#2BBD8E] flex items-center justify-center text-white text-xl font-bold">
                {initials}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={avatarUploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#4A9EE8] rounded-full flex items-center justify-center shadow-md hover:bg-blue-600 transition-colors disabled:opacity-60"
              title="Change avatar"
            >
              {avatarUploading
                ? <Loader2 size={13} className="text-white animate-spin" />
                : <Camera size={13} className="text-white" />
              }
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div>
            <p className="font-semibold text-[#1A202C]">{user?.name || 'Caregiver'}</p>
            <p className="text-sm text-[#718096]">{user?.email}</p>
            {avatarError && <p className="text-xs text-[#EF4444] mt-1">{avatarError}</p>}
            <p className="text-xs text-[#718096] mt-1">JPEG, PNG, WebP · Max 2 MB</p>
          </div>
        </div>

        {/* Profile form */}
        <form onSubmit={handleProfileSave} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#1A202C] mb-1.5">Full name</label>
            <input
              id="settings-name"
              type="text"
              value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#4A9EE8]/40 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-[#1A202C] mb-1.5">
                <Mail size={13} className="inline mr-1 mb-0.5" />Email
              </label>
              <input
                id="settings-email"
                type="email"
                value={profile.email}
                disabled
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-[#718096] cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1A202C] mb-1.5">
                <Phone size={13} className="inline mr-1 mb-0.5" />Phone (SOS)
              </label>
              <input
                id="settings-phone"
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+91 98765 43210"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#4A9EE8]/40 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              id="settings-profile-save"
              type="submit"
              disabled={profileSaving}
              className="flex items-center gap-2 bg-[#2BBD8E] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-green-500 transition disabled:opacity-60"
            >
              {profileSaving
                ? <Loader2 size={15} className="animate-spin" />
                : <Save size={15} />
              }
              {profileSaving ? 'Saving…' : 'Save changes'}
            </button>
            {profileSaved && (
              <span className="flex items-center gap-1 text-sm text-[#2BBD8E] font-medium">
                <Check size={14} /> Saved!
              </span>
            )}
          </div>
        </form>
      </Section>

      {/* ── Notification Preferences ──────────────────────────────────────────── */}
      <Section title="Notification preferences" icon={Bell} iconColor="text-[#F5A623]">
        <p className="text-xs text-[#718096] mb-4">
          Control how ElderEase notifies you about health alerts and daily reports.
          Changes are saved instantly to your profile.
        </p>

        {prefsError && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {prefsError}
          </div>
        )}
        {prefsSaved && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
            <Check size={14} /> Preference saved.
          </div>
        )}

        <div className="space-y-1">
          {[
            {
              key:   'emailAnomalies',
              label: 'Email alerts for anomalies',
              desc:  'Receive an email when high-severity health anomalies are detected',
              icon:  Mail,
            },
            {
              key:   'smsAnomalies',
              label: 'SMS alerts for anomalies',
              desc:  'Receive a text message on your phone for urgent health alerts',
              icon:  Phone,
            },
            {
              key:   'emailDigest',
              label: 'Daily email digest',
              desc:  'Receive a morning summary of your elder\'s health from the AI',
              icon:  BellOff,
            },
          ].map(({ key, label, desc, icon: Icon }) => (
            <label
              key={key}
              htmlFor={`notif-${key}`}
              className="flex items-center justify-between p-4 rounded-xl hover:bg-gray-50 cursor-pointer transition group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#EEF6FF] flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-[#4A9EE8]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1A202C]">{label}</p>
                  <p className="text-xs text-[#718096]">{desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {prefsSaving && <Loader2 size={12} className="text-[#718096] animate-spin" />}
                <Toggle
                  id={`notif-${key}`}
                  checked={notifPrefs[key]}
                  onChange={(e) => handlePrefChange(key, e.target.checked)}
                  disabled={prefsSaving}
                />
              </div>
            </label>
          ))}
        </div>
      </Section>

      {/* ── Linked Elders ─────────────────────────────────────────────────────── */}
      <Section title="Linked elders" icon={Link2} iconColor="text-[#4A9EE8]">
        {elders && elders.length > 0 ? (
          <div className="space-y-3">
            {elders.map((elder) => (
              <div key={elder._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  {elder.profilePhoto || elder.avatarUrl ? (
                    <img
                      src={elder.profilePhoto || elder.avatarUrl}
                      alt={elder.name}
                      className="w-9 h-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 bg-[#2BBD8E]/10 rounded-full flex items-center justify-center text-[#2BBD8E] font-bold text-sm">
                      {elder.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-[#1A202C]">{elder.name}</p>
                    <p className="text-xs text-[#718096]">{elder.email}</p>
                  </div>
                </div>
                <button className="text-[#718096] hover:text-[#EF4444] transition p-1.5" title="Unlink elder">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#718096]">
            No elders linked yet. Go to{' '}
            <a href="/elders" className="text-[#4A9EE8] hover:underline">My Elders</a> to add one.
          </p>
        )}
      </Section>

      {/* ── Security ──────────────────────────────────────────────────────────── */}
      <Section title="Security" icon={Lock} iconColor="text-[#718096]">
        {pwError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-sm">
            {pwError}
          </div>
        )}
        {pwSaved && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-2.5 text-sm flex items-center gap-2">
            <Check size={14} /> Password updated successfully.
          </div>
        )}
        <form onSubmit={handlePasswordSave} className="space-y-4">
          {[
            { id: 'pw-current', key: 'current', label: 'Current password' },
            { id: 'pw-new',     key: 'next',    label: 'New password' },
            { id: 'pw-confirm', key: 'confirm', label: 'Confirm new password' },
          ].map(({ id, key, label }) => (
            <div key={key}>
              <label htmlFor={id} className="block text-sm font-semibold text-[#1A202C] mb-1.5">
                {label}
              </label>
              <input
                id={id}
                type="password"
                value={passwordForm[key]}
                onChange={(e) => setPasswordForm((p) => ({ ...p, [key]: e.target.value }))}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#4A9EE8]/40 text-sm"
              />
            </div>
          ))}
          <button
            id="settings-pw-save"
            type="submit"
            disabled={pwSaving}
            className="flex items-center gap-2 bg-gray-800 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-700 transition disabled:opacity-60"
          >
            {pwSaving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
            {pwSaving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </Section>

      {/* ── Sign Out ──────────────────────────────────────────────────────────── */}
      <section className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-[#1A202C]">Sign out</p>
            <p className="text-sm text-[#718096]">You'll need to sign in again next time.</p>
          </div>
          <button
            id="settings-logout"
            onClick={handleLogout}
            className="flex items-center gap-2 border border-[#EF4444] text-[#EF4444] px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-50 transition"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </section>
    </div>
  )
}
