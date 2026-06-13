import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { Heart, Eye, EyeOff, Loader2, ChevronDown, User, Mail, Lock, Phone, Briefcase } from 'lucide-react'
import { registerUser, selectAuthLoading, selectAuthError, clearError, clearAuth } from '../store/slices/authSlice'

/**
 * User registration page.
 * Collects name, email, password, role, and optional phone number.
 * Features an enhanced split screen card layout matching the brand.
 */
export default function RegisterPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const loading = useSelector(selectAuthLoading)
  const authError = useSelector(selectAuthError)

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'elder',
    phone: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState(null)

  const handleChange = (e) => {
    dispatch(clearError())
    setLocalError(null)
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLocalError(null)

    if (form.password !== form.confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }
    if (form.password.length < 6) {
      setLocalError('Password must be at least 6 characters.')
      return
    }

    const { confirmPassword, ...payload } = form
    const result = await dispatch(registerUser(payload))
    if (!result.error) {
      if (result.payload?.user?.role !== 'elder') {
        dispatch(clearAuth())
        navigate('/login', {
          replace: true,
          state: { error: 'Caregiver account created successfully! Please log in to the Caregiver Portal.' }
        })
      } else {
        navigate('/home', { replace: true })
      }
    }
  }

  const errorMsg = localError || authError

  return (
    <div className="relative min-h-screen bg-[#F5F4F0] flex flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
      {/* Outer split card */}
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-white/60 overflow-hidden flex flex-col md:flex-row min-h-[600px] animate-fade-in">
        
        {/* Left Side: Brand Panel */}
        <div className="hidden md:flex md:w-5/12 bg-gradient-to-br from-[#2BBD8E] to-[#23a07a] text-white flex-col justify-between p-10 relative overflow-hidden">
          {/* Subtle background decoration shapes */}
          <div className="absolute top-[-20%] right-[-20%] w-[300px] h-[300px] bg-white/10 rounded-full filter blur-xl pointer-events-none" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[200px] h-[200px] bg-white/5 rounded-full filter blur-lg pointer-events-none" />
          
          {/* Brand Header */}
          <div className="flex items-center gap-2 relative z-10">
            <div className="inline-flex items-center justify-center w-9 h-9 bg-white/20 rounded-xl">
              <Heart size={20} className="text-white" fill="white" />
            </div>
            <span className="text-[20px] font-700 tracking-tight">ElderEase</span>
          </div>

          {/* Core Content */}
          <div className="my-auto space-y-6 relative z-10">
            <h2 className="text-[32px] font-700 leading-tight">Welcome Back!</h2>
            <p className="text-[15px] text-white/90 leading-relaxed font-400">
              To keep connected with us, please sign in with your account credentials.
            </p>
            <div className="pt-2">
              <span className="block text-[13px] text-white/70 mb-3 uppercase tracking-wider font-600">Already registered?</span>
              <Link
                to="/login"
                className="inline-block px-8 py-3 border border-white/80 hover:bg-white hover:text-[#2BBD8E] text-white text-[14px] font-700 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm text-center"
              >
                Sign In
              </Link>
            </div>
          </div>

          {/* Footer branding */}
          <div className="text-[12px] text-white/60 relative z-10 font-500">
            Your daily companion for health and happiness
          </div>
        </div>

        {/* Right Side: Form Panel */}
        <div className="w-full md:w-7/12 p-8 md:p-10 flex flex-col justify-center bg-white">
          <div className="mb-6 block md:hidden text-center">
            {/* Mobile logo header */}
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-tr from-[#2BBD8E] to-[#4A9EE8] rounded-xl shadow-md shadow-[#2BBD8E]/10 mb-2">
              <Heart size={22} className="text-white" fill="white" />
            </div>
            <h1 className="text-[24px] font-700 tracking-tight text-[#1A202C]">
              Elder<span className="text-[#2BBD8E]">Ease</span>
            </h1>
          </div>

          <div className="max-w-md mx-auto w-full">
            <h2 className="text-[24px] font-700 text-[#1A202C] tracking-tight mb-1">Create Account</h2>
            <p className="text-[14px] text-[#718096] mb-5 font-500">Fill in the details below to establish your profile</p>

            {errorMsg && (
              <div className="bg-[#FFF5F5] border border-[#FED7D7] text-[#C53030] px-4 py-3 rounded-xl text-[14px] mb-4 font-500 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[#C53030] rounded-full flex-shrink-0" />
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
              {/* Full Name */}
              <div>
                <label htmlFor="name" className="block text-[12px] font-600 text-[#4A5568] mb-1 uppercase tracking-wider">
                  Full name
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A0AEC0]">
                    <User size={18} />
                  </div>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    required
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Ramesh Sharma"
                    className="w-full border border-[#E2E8F0] bg-[#F8FAFC]/60 rounded-xl pl-11 pr-4 py-2.5 text-[15px] focus:outline-none focus:border-[#2BBD8E] focus:ring-4 focus:ring-[#2BBD8E]/10 focus:bg-white transition-all duration-200"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-[12px] font-600 text-[#4A5568] mb-1 uppercase tracking-wider">
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A0AEC0]">
                    <Mail size={18} />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    className="w-full border border-[#E2E8F0] bg-[#F8FAFC]/60 rounded-xl pl-11 pr-4 py-2.5 text-[15px] focus:outline-none focus:border-[#2BBD8E] focus:ring-4 focus:ring-[#2BBD8E]/10 focus:bg-white transition-all duration-200"
                  />
                </div>
              </div>

              {/* Role */}
              <div>
                <label htmlFor="role" className="block text-[12px] font-600 text-[#4A5568] mb-1 uppercase tracking-wider">
                  I am a…
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A0AEC0]">
                    <Briefcase size={18} />
                  </div>
                  <select
                    id="role"
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    className="w-full border border-[#E2E8F0] bg-[#F8FAFC]/60 rounded-xl pl-11 pr-10 py-2.5 text-[15px] focus:outline-none focus:border-[#2BBD8E] focus:ring-4 focus:ring-[#2BBD8E]/10 focus:bg-white appearance-none transition-all duration-200"
                  >
                    <option value="elder">Elder / Patient</option>
                    <option value="caregiver">Caregiver / Family</option>
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#718096] pointer-events-none" />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-[12px] font-600 text-[#4A5568] mb-1 uppercase tracking-wider">
                  Phone number <span className="font-400 text-[#718096]">(optional)</span>
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A0AEC0]">
                    <Phone size={18} />
                  </div>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="+91 98765 43210"
                    className="w-full border border-[#E2E8F0] bg-[#F8FAFC]/60 rounded-xl pl-11 pr-4 py-2.5 text-[15px] focus:outline-none focus:border-[#2BBD8E] focus:ring-4 focus:ring-[#2BBD8E]/10 focus:bg-white transition-all duration-200"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-[12px] font-600 text-[#4A5568] mb-1 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A0AEC0]">
                    <Lock size={18} />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={form.password}
                    onChange={handleChange}
                    placeholder="At least 6 characters"
                    className="w-full border border-[#E2E8F0] bg-[#F8FAFC]/60 rounded-xl pl-11 pr-12 py-2.5 text-[15px] focus:outline-none focus:border-[#2BBD8E] focus:ring-4 focus:ring-[#2BBD8E]/10 focus:bg-white transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A0AEC0] hover:text-[#4A5568] transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-[12px] font-600 text-[#4A5568] mb-1 uppercase tracking-wider">
                  Confirm password
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A0AEC0]">
                    <Lock size={18} />
                  </div>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={form.confirmPassword}
                    onChange={handleChange}
                    placeholder="Repeat your password"
                    className="w-full border border-[#E2E8F0] bg-[#F8FAFC]/60 rounded-xl pl-11 pr-4 py-2.5 text-[15px] focus:outline-none focus:border-[#2BBD8E] focus:ring-4 focus:ring-[#2BBD8E]/10 focus:bg-white transition-all duration-200"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-[#2BBD8E] to-[#23a07a] text-white text-[15px] font-700 rounded-xl hover:shadow-lg hover:shadow-[#2BBD8E]/20 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none transition-all duration-200 flex items-center justify-center gap-2 mt-4"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Creating account…
                  </>
                ) : (
                  'Create account'
                )}
              </button>
            </form>

            {/* Mobile Login Link */}
            <p className="block md:hidden text-center text-[14px] text-[#718096] mt-6">
              Already have an account?{' '}
              <Link to="/login" className="text-[#2BBD8E] hover:text-[#23a07a] font-700 hover:underline transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
