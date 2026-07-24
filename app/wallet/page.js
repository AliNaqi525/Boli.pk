"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// Initialize the public frontend client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function WalletPage() {
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [user, setUser] = useState(null);
  
  // Wallet states
  const [walletData, setWalletData] = useState({
    balance: 0,
    locked_funds: 0,
    free_funds: 0
  });
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);

  const router = useRouter();

  // Route Guard: Verify session and fetch initial wallet balance
  useEffect(() => {
    const verifySession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.replace('/');
      } else {
        setUser(session.user);
        setIsCheckingAuth(false);
        fetchWalletBalance(session.user.id);
      }
    };
    verifySession();
  }, [router]);

  const fetchWalletBalance = async (userId) => {
    setIsLoadingWallet(true);
    try {
      const response = await fetch(`/api/wallet/balance?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setWalletData(data);
      } else {
        console.error("Failed to fetch wallet balance");
      }
    } catch (err) {
      console.error("Error fetching balance:", err);
    } finally {
      setIsLoadingWallet(false);
    }
  };

  const handleTopUp = async (e) => {
    e.preventDefault();
    setErrorMessage(''); 
    setSuccessMessage(''); 
    
    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setErrorMessage("Please enter a valid amount greater than 0.");
      return;
    } else if (numericAmount >= 1000000) {
      setErrorMessage("For security reasons, top-ups must be less than Rs. 1,000,000.");
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, amount: amount })
      });

      const result = await response.json();

      if (response.ok) {
        setSuccessMessage(`Successfully added Rs. ${Number(amount).toLocaleString()} to your Boli.pk wallet!`);
        setAmount('');
        // Refresh balance
        fetchWalletBalance(user.id);
      } else {
        setErrorMessage("Database Error: " + result.error);
      }
    } catch (error) {
      setErrorMessage("Network error. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#f2f6f1] dark:bg-[#080d08]">
        <p className="animate-pulse text-lime-600 dark:text-lime-400 font-bold text-base">Loading wallet...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f2f6f1] dark:bg-[#080d08] p-6 md:p-12 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className="max-w-md mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl relative overflow-hidden">
        
        {/* Glow */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-lime-400/20 rounded-full blur-3xl pointer-events-none"></div>

        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-1">
          Escrow Wallet
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold mb-6">
          Deposit funds to lock automated escrow holds for active bidding.
        </p>

        {/* Balance Card */}
        <div className="bg-lime-500/10 dark:bg-lime-500/15 border border-lime-500/30 p-6 rounded-2xl mb-8 relative">
          <span className="text-[10px] font-bold text-lime-700 dark:text-lime-400 uppercase tracking-wider block mb-1">
            Total Account Balance
          </span>

          {isLoadingWallet ? (
            <div className="h-10 bg-slate-200 dark:bg-slate-700 animate-pulse rounded-lg my-2"></div>
          ) : (
            <div>
              <span className="text-4xl font-bold text-slate-950 dark:text-lime-400 tracking-tight">
                Rs. {walletData.balance.toLocaleString()}
              </span>

              <div className="border-t border-lime-500/20 my-4"></div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-0.5">
                    Locked in Bids
                  </span>
                  <span className="text-base font-bold text-amber-600 dark:text-amber-400">
                    Rs. {walletData.locked_funds.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-lime-700 dark:text-lime-400 uppercase tracking-wider block mb-0.5">
                    Available to Bid
                  </span>
                  <span className="text-base font-bold text-lime-700 dark:text-lime-400">
                    Rs. {walletData.free_funds.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Top up quick select values */}
        <div className="flex gap-3 mb-6">
          <button 
            type="button" 
            onClick={() => setAmount(500)} 
            className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-lime-500 hover:text-slate-950 dark:hover:bg-lime-500 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 py-3 rounded-xl transition text-xs font-bold shadow-sm"
          >
            + Rs. 500
          </button>
          <button 
            type="button" 
            onClick={() => setAmount(1000)} 
            className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-lime-500 hover:text-slate-950 dark:hover:bg-lime-500 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 py-3 rounded-xl transition text-xs font-bold shadow-sm"
          >
            + Rs. 1,000
          </button>
          <button 
            type="button" 
            onClick={() => setAmount(5000)} 
            className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-lime-500 hover:text-slate-950 dark:hover:bg-lime-500 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 py-3 rounded-xl transition text-xs font-bold shadow-sm"
          >
            + Rs. 5,000
          </button>
        </div>

        {/* Top-up Form */}
        <form onSubmit={handleTopUp} className="space-y-6">
          <div>
            <label htmlFor="topupAmount" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Custom Top Up Amount (Rs.)
            </label>
            <input 
              id="topupAmount"
              name="topupAmount"
              type="number" 
              placeholder="e.g. 2500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-4 rounded-xl text-slate-900 dark:text-slate-100 font-bold text-lg focus:outline-none focus:ring-2 focus:ring-lime-500 transition-all placeholder:text-slate-400"
              required
              min="1"
              max="999999"
            />
          </div>

          <button 
            type="submit" 
            disabled={isProcessing || isLoadingWallet}
            className={`w-full font-bold text-base py-4 rounded-xl transition-all shadow-md active:scale-[0.99] ${
              isProcessing || isLoadingWallet 
                ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-50' 
                : 'bg-lime-500 hover:bg-lime-600 text-slate-950'
            }`}
          >
            {isProcessing ? "Processing Escrow Deposit..." : "Confirm Mock Deposit"}
          </button>
        </form>

        {/* Messages */}
        {errorMessage && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500 text-red-600 dark:text-red-400 text-sm font-bold text-center rounded-xl">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="mt-6 p-4 bg-lime-500/10 border border-lime-500 text-lime-700 dark:text-lime-400 text-sm font-bold text-center rounded-xl">
            {successMessage}
          </div>
        )}
      </div>
    </div>
  );
}