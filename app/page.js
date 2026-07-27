"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// Initialize public Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Login() {
  const [authMode, setAuthMode] = useState('signin'); // 'signin' or 'register'
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);

  const router = useRouter();

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
    setIsDarkMode(isDark);
  }, []);

  const toggleTheme = () => {
    const isCurrentlyDark = document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
    const nextDark = !isCurrentlyDark;
    setIsDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    if (authMode === 'register' && !fullName.trim()) {
      setErrorMessage('Please enter your Full Name to register.');
      setIsLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      phone: phone,
      options: {
        data: {
          full_name: authMode === 'register' ? fullName.trim() : undefined
        }
      }
    });

    if (error) {
      setErrorMessage("Error sending verification code: " + error.message);
    } else {
      setSuccessMessage(`Verification code sent to ${phone}`);
      setStep(2); // Move to OTP verification step
    }
    setIsLoading(false);
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    const { data: { session }, error } = await supabase.auth.verifyOtp({
      phone: phone,
      token: otp,
      type: 'sms'
    });

    if (error) {
      setErrorMessage("Invalid code: " + error.message);
    } else {
      setSuccessMessage("Signed in successfully!");
      
      // Upsert profile into public users table
      if (session?.user) {
        try {
          await fetch('/api/admin/dashboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'register_profile',
              u_id: session.user.id,
              phone_number: session.user.phone,
              full_name: fullName.trim() || undefined
            })
          });
        } catch (err) {
          console.error("Profile sync notice:", err);
        }
      }
      // Redirect after verification
      router.push('/wallet');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f2f6f1] dark:bg-[#080d08] p-4 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200 relative overflow-hidden">
      
      {/* Ambient Lime Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-lime-500/10 dark:bg-lime-500/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Theme Toggle Button top-right */}
      <div className="absolute top-6 right-6">
        <button
          onClick={toggleTheme}
          className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900/90 border border-slate-300 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-1.5"
          title="Toggle Light / Dark Mode"
        >
          {isDarkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
        </button>
      </div>

      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-8 rounded-3xl border border-slate-300 dark:border-slate-800 shadow-2xl w-full max-w-md relative z-10">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center justify-center mb-6">
          <img 
            src="/logo.png" 
            alt="Boli.pk Logo" 
            className="h-16 w-16 object-contain mb-3 rounded-2xl shadow-md hover:scale-105 transition-transform"
          />
          <h1 className="text-3xl font-bold tracking-tight text-lime-600 dark:text-lime-400 mb-1">
            Boli.pk
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold">Real-Time Bidding & Escrow Platform</p>
        </div>

        {/* Mode Toggle Tabs (Sign In vs Register) */}
        {step === 1 && (
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 mb-6">
            <button
              type="button"
              onClick={() => { setAuthMode('signin'); setErrorMessage(''); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                authMode === 'signin'
                  ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-slate-100 shadow-sm border border-slate-200 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setErrorMessage(''); }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                authMode === 'register'
                  ? 'bg-lime-500 text-slate-950 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Register New User
            </button>
          </div>
        )}

        <p className="text-slate-600 dark:text-slate-400 mb-6 text-xs text-center leading-relaxed font-medium">
          {step === 1 
            ? (authMode === 'register' ? "Create your new account to bid & list items." : "Enter your registered phone number to sign in.") 
            : "Enter the 6-digit verification code sent to your mobile phone."}
        </p>

        {step === 1 ? (
          <form onSubmit={handleSendOTP} className="space-y-4">
            {authMode === 'register' && (
              <div>
                <label htmlFor="fullName" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  placeholder="e.g. Syed Ali Naqi"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 p-3.5 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-lime-500 bg-white dark:bg-slate-800 font-semibold text-sm transition-all"
                  required
                />
              </div>
            )}

            <div>
              <label htmlFor="phoneNumber" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Phone Number
              </label>
              <input
                id="phoneNumber"
                type="tel"
                placeholder="+923001234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-700 p-3.5 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-lime-500 bg-white dark:bg-slate-800 font-bold text-sm transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-lime-500 hover:bg-lime-600 text-slate-950 font-bold py-3.5 rounded-xl transition-all shadow-md active:scale-[0.99] text-sm disabled:opacity-50"
            >
              {isLoading ? "Sending..." : (authMode === 'register' ? "Register & Send Code" : "Send Verification Code")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div>
              <label htmlFor="otpCode" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                6-Digit Verification Code
              </label>
              <input
                id="otpCode"
                type="text"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-700 p-3.5 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-lime-500 bg-white dark:bg-slate-800 font-bold text-center text-lg tracking-widest transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-lime-500 hover:bg-lime-600 text-slate-950 font-bold py-3.5 rounded-xl transition-all shadow-md active:scale-[0.99] text-sm disabled:opacity-50"
            >
              {isLoading ? "Verifying..." : "Verify & Complete"}
            </button>

            <button
              type="button"
              onClick={() => { setStep(1); setOtp(''); }}
              className="w-full text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-lime-600 dark:hover:text-lime-400 transition-colors pt-2"
            >
              ← Back to phone input
            </button>
          </form>
        )}

        {successMessage && (
          <div className="mt-5 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-bold text-center">
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="mt-5 p-4 bg-red-50 border border-red-150 rounded-xl text-red-600 text-xs font-bold text-center">
            {errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}