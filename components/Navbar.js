"use client";
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('user');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Sync initial theme state on mount
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

  useEffect(() => {
    // 1. Fetch initial session and user role
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      if (session?.user) {
        fetchUserRole(session.user.id);
      }
    };
    getSession();

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        fetchUserRole(session.user.id);
      } else {
        setRole('user');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserRole = async (userId) => {
    try {
      const response = await fetch(`/api/auth/role?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setRole(data.role);
      }
    } catch (err) {
      console.error("Failed to fetch user role:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Signout error:", err);
    } finally {
      localStorage.removeItem('supabase.auth.token');
      sessionStorage.clear();
      router.replace('/');
    }
  };

  // If no user is logged in, don't show the navbar (keeps login page clean)
  if (!user) return null;

  // Build navigation links dynamically based on User vs Admin role
  let navLinks = [];

  if (role === 'admin') {
    // Admins do not have Seller Portal or Won Auctions portal
    navLinks = [
      { name: "Browse Auctions", path: "/auction" },
      { name: "Escrow Wallet", path: "/wallet" },
      { name: "Admin Portal", path: "/admin" },
    ];
  } else {
    // Regular users (Buyers / Sellers)
    navLinks = [
      { name: "Browse Auctions", path: "/auction" },
      { name: "Escrow Wallet", path: "/wallet" },
      { name: "List an Item", path: "/seller" },
      { name: "Won Items & Deliveries", path: "/wins" },
    ];
  }

  return (
    <nav className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 sticky top-0 z-50 backdrop-blur-md shadow-sm transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo Section */}
          <div className="flex items-center gap-8">
            <div 
              onClick={() => router.push(role === 'admin' ? '/admin' : '/auction')} 
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
            >
              <img 
                src="/logo.png" 
                alt="Boli.pk Logo" 
                className="h-9 w-9 object-contain rounded-lg shadow-sm"
              />
              <span className="text-2xl font-bold tracking-tight text-lime-600 dark:text-lime-400">
                Boli.pk
              </span>
            </div>
            
            {/* Nav Links */}
            <div className="hidden md:flex space-x-1">
              {navLinks.map((link) => {
                const isActive = pathname === link.path;
                return (
                  <button
                    key={link.path}
                    onClick={() => router.push(link.path)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${
                      isActive 
                        ? 'bg-lime-500 text-slate-950 shadow-sm font-bold' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-lime-50 dark:hover:bg-slate-800 hover:text-lime-700 dark:hover:text-lime-400'
                    }`}
                  >
                    {link.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* User Details, Theme Toggle & Sign Out */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-sm font-semibold flex items-center gap-1.5 border border-slate-200 dark:border-slate-700"
              title="Toggle Light / Dark Mode"
            >
              {isDarkMode ? "☀️ Light" : "🌙 Dark"}
            </button>

            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Signed in as</p>
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{user.phone}</p>
            </div>
            
            <button
              onClick={handleLogout}
              className="bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold px-3 py-1.5 rounded-lg text-xs transition-all duration-200"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Mobile Nav Links Container */}
        <div className="md:hidden flex justify-around border-t border-slate-200 dark:border-slate-800 py-2">
          {navLinks.map((link) => {
            const isActive = pathname === link.path;
            return (
              <button
                key={link.path}
                onClick={() => router.push(link.path)}
                className={`text-xs font-bold px-3 py-1.5 rounded-md transition-all ${
                  isActive 
                    ? 'text-slate-950 bg-lime-500' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {link.name}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
