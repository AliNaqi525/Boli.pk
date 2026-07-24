"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function AdminDashboard() {
  const [data, setData] = useState({ stats: { totalItems: 0, totalUsers: 0, totalEscrowLocked: 0 }, items: [], users: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('items'); // 'items' or 'users'
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // Quick action states
  const [topUpAmounts, setTopUpAmounts] = useState({}); // { [userId]: amount }
  const [actionMessage, setActionMessage] = useState({ text: '', type: '', id: null });
  
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/');
      } else {
        // Verify admin role via role API
        try {
          const roleRes = await fetch(`/api/auth/role?userId=${session.user.id}`);
          const roleData = await roleRes.json();
          
          if (roleData.role !== 'admin') {
            console.warn("Unauthorized access attempt to Admin Dashboard.");
            router.replace('/auction');
            return;
          }
        } catch (err) {
          router.replace('/auction');
          return;
        }

        setUser(session.user);
        setIsCheckingAuth(false);
        fetchDashboardData();
      }
    };
    checkAuth();
  }, [router]);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/dashboard');
      if (response.ok) {
        const resData = await response.json();
        setData(resData);
      } else {
        console.error("Failed to load admin stats");
      }
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEscrowAction = async (itemId, action) => {
    setActionMessage({ text: 'Processing...', type: 'info', id: itemId });
    try {
      const response = await fetch('/api/admin/escrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, action })
      });
      const result = await response.json();

      if (response.ok) {
        setActionMessage({ text: result.message, type: 'success', id: itemId });
        fetchDashboardData();
      } else {
        setActionMessage({ text: result.error, type: 'error', id: itemId });
      }
    } catch (err) {
      setActionMessage({ text: 'Network error. Try again.', type: 'error', id: itemId });
    }
  };

  const handleCnicToggle = async (userId) => {
    try {
      const response = await fetch('/api/admin/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'toggle_cnic' })
      });
      if (response.ok) {
        fetchDashboardData();
      }
    } catch (err) {
      console.error("Failed to toggle CNIC verified state:", err);
    }
  };

  const handleAdminTopUp = async (e, userId) => {
    e.preventDefault();
    const amount = topUpAmounts[userId];
    if (!amount || Number(amount) <= 0) return;

    try {
      const response = await fetch('/api/admin/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'admin_topup', topUpAmount: Number(amount) })
      });
      if (response.ok) {
        setTopUpAmounts(prev => ({ ...prev, [userId]: '' }));
        fetchDashboardData();
      }
    } catch (err) {
      console.error("Failed to execute manual top-up:", err);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-emerald-50/10">
        <p className="text-emerald-600 font-semibold animate-pulse text-lg tracking-wider">Verifying secure admin access...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f2f6f1] dark:bg-[#080d08] p-6 md:p-12 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-none mb-1">Escrow Admin Panel</h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold">Monitor real-time system states, manage locked funds, and regulate transaction logs.</p>
          </div>
          <button 
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-sm flex items-center gap-2 self-start md:self-auto"
          >
            {isLoading ? "Syncing..." : "Sync Database"}
          </button>
        </div>

        {/* Interactive Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div 
            onClick={() => setActiveTab('items')}
            className={`bg-white dark:bg-slate-900 border p-6 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden active:scale-[0.99] ${
              activeTab === 'items' ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-200 dark:border-slate-800 hover:border-amber-400'
            }`}
          >
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest block mb-1">Active Escrow Locked</span>
            <span className="text-3xl font-bold text-amber-600 dark:text-amber-400">Rs. {data.stats.totalEscrowLocked.toLocaleString()}</span>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-2 block">Click to view items →</span>
          </div>

          <div 
            onClick={() => setActiveTab('items')}
            className={`bg-white dark:bg-slate-900 border p-6 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden active:scale-[0.99] ${
              activeTab === 'items' ? 'border-lime-500 ring-2 ring-lime-500/30' : 'border-slate-200 dark:border-slate-800 hover:border-lime-400'
            }`}
          >
            <span className="text-[10px] font-bold text-lime-700 dark:text-lime-400 uppercase tracking-widest block mb-1">Total Items</span>
            <span className="text-3xl font-bold text-lime-700 dark:text-lime-400">{data.stats.totalItems} Listings</span>
            <span className="text-[10px] font-bold text-lime-600 dark:text-lime-400 mt-2 block">Click to open listings →</span>
          </div>

          <div 
            onClick={() => setActiveTab('users')}
            className={`bg-white dark:bg-slate-900 border p-6 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden active:scale-[0.99] ${
              activeTab === 'users' ? 'border-lime-500 ring-2 ring-lime-500/30' : 'border-slate-200 dark:border-slate-800 hover:border-lime-400'
            }`}
          >
            <span className="text-[10px] font-bold text-lime-700 dark:text-lime-400 uppercase tracking-widest block mb-1">Registered Accounts</span>
            <span className="text-3xl font-bold text-lime-700 dark:text-lime-400">{data.stats.totalUsers} Profiles</span>
            <span className="text-[10px] font-bold text-lime-600 dark:text-lime-400 mt-2 block">Click to open directory →</span>
          </div>
        </div>

        {/* Toggle Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
          <button 
            onClick={() => setActiveTab('items')}
            className={`px-6 py-3 font-bold text-sm border-b-2 transition-all ${
              activeTab === 'items'
                ? 'border-lime-500 text-slate-950 dark:text-lime-400 bg-lime-500/10 rounded-t-xl'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-lime-600 dark:hover:text-lime-400'
            }`}
          >
            Escrow & Auction Items ({data.items.length})
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 font-bold text-sm border-b-2 transition-all ${
              activeTab === 'users'
                ? 'border-lime-500 text-slate-950 dark:text-lime-400 bg-lime-500/10 rounded-t-xl'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-lime-600 dark:hover:text-lime-400'
            }`}
          >
            User Profiles & Wallets ({data.users.length})
          </button>
        </div>

        {/* Tab Content - Items List */}
        {activeTab === 'items' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">Auctions Ledger</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-6 font-medium">Track bids, expirations, and locked funds in active/ended states.</p>

            {isLoading && data.items.length === 0 ? (
              <div className="text-center py-12 text-lime-600 dark:text-lime-400">Loading ledger...</div>
            ) : data.items.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-semibold bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                No listings recorded in the system.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                      <th className="py-4 px-4">Item details</th>
                      <th className="py-4 px-4">Seller ID</th>
                      <th className="py-4 px-4 text-center">Expiry Status</th>
                      <th className="py-4 px-4 text-right">Locked Escrow Bid</th>
                      <th className="py-4 px-4">Winner / Bidder ID</th>
                      <th className="py-4 px-4 text-center">Escrow Status</th>
                      <th className="py-4 px-4 text-center">Administrative Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {data.items.map(item => {
                      const isEnded = new Date() > new Date(item.auction_end_time);
                      return (
                        <tr key={item.i_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-4 px-4 font-semibold text-slate-900 dark:text-slate-100">
                            <p className="font-bold text-sm">{item.title}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">ID: {item.i_id.substring(0, 8)}...</p>
                          </td>
                          <td className="py-4 px-4 font-mono text-slate-600 dark:text-slate-400">
                            {item.seller_id.substring(0, 8)}...
                          </td>
                          <td className="py-4 px-4 text-center">
                            {item.status === 'completed' || item.status === 'settled' ? (
                              <span className="px-2.5 py-1 rounded-full bg-lime-500/20 text-lime-800 dark:text-lime-400 border border-lime-500/30 font-bold text-[9px]">SETTLED</span>
                            ) : item.status === 'cancelled' || item.status === 'refunded' ? (
                              <span className="px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-[9px]">REFUNDED</span>
                            ) : isEnded ? (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold text-[9px]">ENDED</span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 font-bold text-[9px]">ACTIVE</span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-right font-bold text-lime-600 dark:text-lime-400 text-sm">
                            {item.locked_bid ? `Rs. ${Number(item.locked_bid.bid_amount).toLocaleString()}` : "No Bids"}
                          </td>
                          <td className="py-4 px-4 font-mono text-slate-600 dark:text-slate-400">
                            {item.locked_bid ? `${item.locked_bid.bidder_id.substring(0, 8)}...` : "—"}
                          </td>
                          <td className="py-4 px-4 text-center font-bold">
                            {item.locked_bid ? (
                              <span className="uppercase text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30">Locked</span>
                            ) : (
                              <span className="text-slate-400 font-medium">—</span>
                            )}
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex gap-2 justify-center">
                              {item.locked_bid && item.status !== 'completed' && item.status !== 'settled' && item.status !== 'cancelled' && item.status !== 'refunded' ? (
                                <>
                                  <button
                                    onClick={() => handleEscrowAction(item.i_id, 'release')}
                                    className="bg-lime-500 hover:bg-lime-600 text-slate-950 font-bold px-3 py-1.5 rounded-lg transition-colors active:scale-95 text-xs"
                                  >
                                    Release Funds
                                  </button>
                                  <button
                                    onClick={() => handleEscrowAction(item.i_id, 'refund')}
                                    className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-600 dark:text-red-400 font-bold px-3 py-1.5 rounded-lg transition-colors active:scale-95 text-xs"
                                  >
                                    Refund
                                  </button>
                                </>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-medium">No actions pending</span>
                              )}
                            </div>
                            {actionMessage.id === item.i_id && (
                              <p className={`text-[10px] mt-2 font-bold text-center ${
                                actionMessage.type === 'success' ? 'text-lime-600 dark:text-lime-400' : actionMessage.type === 'error' ? 'text-red-500' : 'text-blue-500 animate-pulse'
                              }`}>
                                {actionMessage.text}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab Content - Users List */}
        {activeTab === 'users' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">User Base Directory</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-6 font-medium">Manage user identities, toggle verified states, and confirm deposits.</p>

            {isLoading && data.users.length === 0 ? (
              <div className="text-center py-12 text-lime-600 dark:text-lime-400">Loading directory...</div>
            ) : data.users.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-semibold bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                No users registered.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                      <th className="py-4 px-4">User Details</th>
                      <th className="py-4 px-4 text-center">Identity (CNIC)</th>
                      <th className="py-4 px-4 text-right">Total Balance</th>
                      <th className="py-4 px-4 text-right text-amber-600 dark:text-amber-400">Locked Funds</th>
                      <th className="py-4 px-4 text-right text-lime-600 dark:text-lime-400">Free Balance</th>
                      <th className="py-4 px-4 text-center">Confirm Mock Deposit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {data.users.map(userItem => {
                      const wallet = (Array.isArray(userItem.wallets) && userItem.wallets.length > 0)
                        ? userItem.wallets[0]
                        : (userItem.wallets && !Array.isArray(userItem.wallets))
                        ? userItem.wallets
                        : null;

                      const balance = wallet?.balance ?? 0;
                      const lockedFunds = wallet?.locked_funds ?? 0;
                      const freeFunds = wallet?.free_funds ?? (balance - lockedFunds);

                      return (
                        <tr key={userItem.u_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-4 px-4 font-semibold text-slate-900 dark:text-slate-100">
                            <p className="font-bold text-sm">{userItem.full_name || 'N/A'}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Phone: {userItem.phone_number}</p>
                            <p className="text-[9px] text-slate-400 font-mono mt-0.5">UID: {userItem.u_id}</p>
                          </td>
                          <td className="py-4 px-4 text-center">
                            <button
                              onClick={() => handleCnicToggle(userItem.u_id)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-200 ${
                                userItem.cnic_verified 
                                  ? 'bg-lime-500/20 text-lime-800 dark:text-lime-400 border border-lime-500/30'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {userItem.cnic_verified ? "Verified ✅" : "Unverified ❌"}
                            </button>
                          </td>
                          <td className="py-4 px-4 text-right font-bold text-slate-900 dark:text-slate-100 text-sm">
                            Rs. {Number(balance).toLocaleString()}
                          </td>
                          <td className="py-4 px-4 text-right font-semibold text-amber-600 dark:text-amber-400 text-sm">
                            Rs. {Number(lockedFunds).toLocaleString()}
                          </td>
                          <td className="py-4 px-4 text-right font-bold text-lime-600 dark:text-lime-400 text-sm">
                            Rs. {Number(freeFunds).toLocaleString()}
                          </td>
                          <td className="py-4 px-4">
                            <form onSubmit={(e) => handleAdminTopUp(e, userItem.u_id)} className="flex items-center justify-center gap-2">
                              <input
                                type="number"
                                placeholder="Amount"
                                value={topUpAmounts[userItem.u_id] || ''}
                                onChange={(e) => setTopUpAmounts(prev => ({ ...prev, [userItem.u_id]: e.target.value }))}
                                className="w-24 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-1.5 rounded-lg text-slate-900 dark:text-slate-100 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-lime-500"
                                required
                                min="1"
                              />
                              <button
                                type="submit"
                                className="bg-lime-500 hover:bg-lime-600 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-[10px] transition-all"
                              >
                                Deposit
                              </button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
