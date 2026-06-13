// apps/client-elder/src/pages/ProfilePage.jsx  NEW
import React, { useState, useRef, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { User, Phone, Mail, Lock, LogOut, Save, Camera, Loader2, Check, Shield } from 'lucide-react'
import { selectUser, logoutUser, clearAuth, setUser } from '../store/slices/authSlice'
import { addNotification } from '../store/slices/uiSlice'
import api from '../api/axiosConfig'

/**
 * Elder Profile & Settings page.
 * Accessible by clicking the avatar initials in the top header.
 *
 * Sections:
 *  - Avatar upload
 *  - Profile info (name, phone)
 *  - Change password
 *  - Sign out
 */
export default function ProfilePage() {
  const dispatch  = useDispatch()
  const navigate  = useNavigate()
  const user      = useSelector(selectUser)

  const [profileLoading, setProfileLoading] = useState(true)

  // ── Avatar ─────────────────────────────────────────────────────────────────
  const fileRef = useRef(null)
  const [avatarSrc,       setAvatarSrc]       = useState(user?.avatarUrl || user?.profilePhoto || null)
  const [avatarUploading, setAvatarUploading] = useState(false)

  // ── Profile ────────────────────────────────────────────────────────────────
  const [profile, setProfile]         = useState({ name: user?.name || '', phone: user?.phone || '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved,  setProfileSaved]  = useState(false)

  // Fetch full profile (with caregiver info populated) on mount
  useEffect(() => {
    let active = true
    const loadProfile = async () => {
      try {
        const { data } = await api.get('/users/profile')
        if (active) {
          dispatch(setUser(data))
          localStorage.setItem('user', JSON.stringify(data))
          setProfile({ name: data.name || '', phone: data.phone || '' })
          setAvatarSrc(data.avatarUrl || data.profilePhoto || null)
        }
      } catch (err) {
        console.error('Failed to load profile', err)
      } finally {
        if (active) setProfileLoading(false)
      }
    }
    loadProfile()
    return () => { active = false }
  }, [dispatch])

  // ── Password ───────────────────────────────────────────────────────────────
  const [pwForm, setPwForm]   = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError,  setPwError]  = useState('')
  const [pwSaved,  setPwSaved]  = useState(false)

  const initials = (user?.name || 'E').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  // ── Avatar upload ──────────────────────────────────────────────────────────
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      dispatch(addNotification({ id: Date.now().toString(), type: 'error', title: 'Image too large', message: 'Max 2 MB.' }))
      return
    }
    // Preview immediately
    const reader = new FileReader()
    reader.onload = (ev) => setAvatarSrc(ev.target.result)
    reader.readAsDataURL(file)

    setAvatarUploading(true)
    try {
      const form = new FormData()
      form.append('avatar', file)
      const { data } = await api.post('/users/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setAvatarSrc(data.avatarUrl)
      dispatch(addNotification({ id: Date.now().toString(), type: 'success', title: 'Photo updated!', message: '' }))
    } catch {
      dispatch(addNotification({ id: Date.now().toString(), type: 'error', title: 'Upload failed', message: 'Please try again.' }))
    } finally {
      setAvatarUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const hasChanges = profile.name.trim() !== (user?.name || '') || profile.phone.trim() !== (user?.phone || '')

  // ── Profile save ───────────────────────────────────────────────────────────
  const handleProfileSave = async (e) => {
    e.preventDefault()
    if (!hasChanges) return
    setProfileSaving(true)
    try {
      const { data } = await api.patch('/users/profile', { name: profile.name, phone: profile.phone })
      dispatch(setUser(data))
      localStorage.setItem('user', JSON.stringify(data))
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 3000)
      dispatch(addNotification({
        id: Date.now().toString(),
        type: 'success',
        title: 'Changes saved! ✓',
        message: 'Your profile has been updated.',
      }))
    } catch (err) {
      dispatch(addNotification({
        id: Date.now().toString(),
        type: 'error',
        title: 'Error saving changes',
        message: err.response?.data?.error || 'Could not update profile.',
      }))
    } finally {
      setProfileSaving(false)
    }
  }

  // ── Password change ────────────────────────────────────────────────────────
  const handlePasswordSave = async (e) => {
    e.preventDefault()
    setPwError('')
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match.'); return }
    if (pwForm.next.length < 8) { setPwError('Password must be at least 8 characters.'); return }
    setPwSaving(true)
    try {
      await api.patch('/users/profile', { password: pwForm.next })
      setPwSaved(true)
      setPwForm({ current: '', next: '', confirm: '' })
      setTimeout(() => setPwSaved(false), 3000)
    } catch (err) {
      setPwError(err.response?.data?.error || 'Could not update password.')
    } finally {
      setPwSaving(false)
    }
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    dispatch(clearAuth())
    await dispatch(logoutUser()).catch(() => {})
    navigate('/login')
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in pb-10">
      <div>
        <h2 className="text-[22px] font-700 text-[#1A202C]">My Profile</h2>
        <p className="text-[#718096] text-[14px] mt-0.5">Update your personal details and account settings.</p>
      </div>

      {/* ── Avatar + basic info ─────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center gap-5 mb-6">
          <div className="relative">
            {avatarSrc ? (
              <img src={avatarSrc} alt="avatar" className="w-20 h-20 rounded-full object-cover border-2 border-[#2BBD8E]/30" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#2BBD8E] to-[#4A9EE8] flex items-center justify-center text-white text-[20px] font-700">
                {initials}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={avatarUploading}
              className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#2BBD8E] rounded-full flex items-center justify-center shadow hover:bg-[#23a07a] transition-colors"
            >
              {avatarUploading
                ? <Loader2 size={13} className="text-white animate-spin" />
                : <Camera size={13} className="text-white" />
              }
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <p className="font-700 text-[#1A202C] text-[16px]">{user?.name || 'Elder'}</p>
            <p className="text-[#718096] text-[14px]">{user?.email}</p>
            <p className="text-[12px] text-[#A0AEC0] mt-1">JPEG, PNG · Max 2 MB</p>
          </div>
        </div>

        <form onSubmit={handleProfileSave} className="space-y-4">
          <div>
            <label className="block text-[13px] font-600 text-[#4A5568] mb-1.5">
              <User size={13} className="inline mr-1 mb-0.5" /> Full name
            </label>
            <input
              type="text" value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#2BBD8E]/40 text-[14px]"
            />
          </div>
          <div>
            <label className="block text-[13px] font-600 text-[#4A5568] mb-1.5">
              <Mail size={13} className="inline mr-1 mb-0.5" /> Email (read-only)
            </label>
            <input
              type="email" value={user?.email || ''} disabled
              className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8F0] bg-gray-50 text-[14px] text-[#718096] cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-[13px] font-600 text-[#4A5568] mb-1.5">
              <Phone size={13} className="inline mr-1 mb-0.5" /> Phone number
            </label>
            <input
              type="tel" value={profile.phone}
              onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
              placeholder="+91 98765 43210"
              className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#2BBD8E]/40 text-[14px]"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit" disabled={profileSaving || !hasChanges}
              className="flex items-center gap-2 bg-[#2BBD8E] text-white px-5 py-2.5 rounded-xl text-[14px] font-600 hover:bg-[#23a07a] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {profileSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {profileSaving ? 'Saving…' : 'Save changes'}
            </button>
            {profileSaved && (
              <span className="flex items-center gap-1 text-[14px] text-[#2BBD8E] font-600 animate-fade-in">
                <Check size={14} /> Saved!
              </span>
            )}
          </div>
        </form>
      </div>

      {/* ── Change Password ────────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Shield size={18} className="text-[#718096]" />
          <h3 className="font-700 text-[#1A202C]">Security</h3>
        </div>
        {pwError && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[14px]">{pwError}</div>
        )}
        {pwSaved && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-[14px] flex items-center gap-2">
            <Check size={14} /> Password updated successfully.
          </div>
        )}
        <form onSubmit={handlePasswordSave} className="space-y-4">
          {[
            { key: 'current', label: 'Current password' },
            { key: 'next',    label: 'New password' },
            { key: 'confirm', label: 'Confirm new password' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-[13px] font-600 text-[#4A5568] mb-1.5">{label}</label>
              <input
                type="password" value={pwForm[key]}
                onChange={(e) => setPwForm((p) => ({ ...p, [key]: e.target.value }))}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#2BBD8E]/40 text-[14px]"
              />
            </div>
          ))}
          <button
            type="submit" disabled={pwSaving}
            className="flex items-center gap-2 bg-gray-800 text-white px-5 py-2.5 rounded-xl text-[14px] font-600 hover:bg-gray-700 transition disabled:opacity-60"
          >
            {pwSaving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
            {pwSaving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>

      {/* ── Caregiver Details (Read-only) ─────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <User size={18} className="text-[#4A9EE8]" />
          <h3 className="font-700 text-[#1A202C]">My Caregiver</h3>
        </div>

        {profileLoading ? (
          <div className="flex items-center gap-2 text-[14px] text-[#718096]">
            <Loader2 size={16} className="animate-spin text-[#4A9EE8]" />
            <span>Loading caregiver details…</span>
          </div>
        ) : user?.linkedCaregivers && user.linkedCaregivers.length > 0 ? (
          <div className="space-y-4">
            {user.linkedCaregivers.map((cg) => {
              const cgInitials = (cg.name || 'C').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
              return (
                <div key={cg._id || cg.id} className="flex items-start gap-4 p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] hover:shadow-sm transition-all duration-300">
                  {cg.profilePhoto || cg.avatarUrl ? (
                    <img src={cg.profilePhoto || cg.avatarUrl} alt="caregiver" className="w-12 h-12 rounded-full object-cover border-2 border-[#4A9EE8]/30" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#4A9EE8] to-[#1E6FD9] flex items-center justify-center text-white text-[15px] font-700 shadow-sm flex-shrink-0">
                      {cgInitials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-700 text-[#1A202C] text-[15px]">{cg.name}</p>
                    <div className="flex flex-col gap-1.5 mt-2 text-[13px] text-[#718096]">
                      <span className="flex items-center gap-2">
                        <Mail size={14} className="text-[#A0AEC0]" /> {cg.email}
                      </span>
                      {cg.phone && (
                        <span className="flex items-center gap-2">
                          <Phone size={14} className="text-[#A0AEC0]" /> {cg.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-6 bg-[#F8FAFC] rounded-xl border border-dashed border-[#E2E8F0] p-4">
            <p className="text-[14px] font-500 text-[#718096]">No caregiver linked yet.</p>
            <div className="mt-3 inline-block px-4 py-2 bg-white border border-[#E2E8F0] rounded-xl shadow-sm">
              <p className="text-[10px] text-[#A0AEC0] uppercase tracking-wider font-700">Your Shareable ID</p>
              <p className="text-[14px] font-700 text-slate-700 select-all mt-0.5 font-mono">{user?._id || user?.id}</p>
            </div>
            <p className="text-[11px] text-[#A0AEC0] mt-2 px-4">Give this ID to your caregiver so they can link their profile to yours.</p>
          </div>
        )}
      </div>

      {/* ── Sign Out ───────────────────────────────────────────────────────── */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-600 text-[#1A202C]">Sign out</p>
            <p className="text-[14px] text-[#718096]">You'll need to sign in again next time.</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 border border-[#EF4444] text-[#EF4444] px-5 py-2.5 rounded-xl text-[14px] font-600 hover:bg-red-50 transition"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
