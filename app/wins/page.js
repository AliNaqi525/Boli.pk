"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function WonAuctionsPage() {
  const [wonItems, setWonItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [revealedPhones, setRevealedPhones] = useState({});
  const [confirmingItemId, setConfirmingItemId] = useState(null);
  const [actionMessage, setActionMessage] = useState({ itemId: null, text: '', type: '' });

  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/');
      } else {
        try {
          const roleRes = await fetch(`/api/auth/role?userId=${session.user.id}`);
          const roleData = await roleRes.json();
          if (roleData.role === 'admin') {
            router.replace('/admin');
            return;
          }
        } catch (err) {
          console.error("Role check error:", err);
        }

        setUser(session.user);
        setIsCheckingAuth(false);
        fetchWonAuctions(session.user.id);
      }
    };
    checkAuth();
  }, [router]);

  const fetchWonAuctions = async (userId) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/wins?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setWonItems(data.wonItems || []);
      } else {
        console.error("Failed to load won auctions");
      }
    } catch (error) {
      console.error("Error fetching won auctions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRevealPhone = (itemId) => {
    setRevealedPhones(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleConfirmDelivery = async (itemId) => {
    setConfirmingItemId(itemId);
    setActionMessage({ itemId, text: 'Confirming delivery & releasing escrow...', type: 'info' });

    try {
      const res = await fetch('/api/wins/confirm-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          itemId: itemId
        })
      });

      const data = await res.json();

      if (res.ok) {
        setActionMessage({ itemId, text: data.message, type: 'success' });
        // Update local item status
        setWonItems(prev => prev.map(item => {
          if (item.i_id === itemId) {
            return { ...item, status: 'completed', escrow_status: 'released' };
          }
          return item;
        }));
      } else {
        setActionMessage({ itemId, text: data.error, type: 'error' });
      }
    } catch (err) {
      setActionMessage({ itemId, text: 'Network error confirming delivery.', type: 'error' });
    } finally {
      setConfirmingItemId(null);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#f2f6f1] dark:bg-[#080d08]">
        <p className="animate-pulse text-lime-600 dark:text-lime-400 font-bold text-base">Verifying authentication...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f2f6f1] dark:bg-[#080d08] p-6 md:p-12 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-3 py-1 rounded-full bg-lime-500/20 border border-lime-500/30 text-lime-800 dark:text-lime-400 text-[10px] font-bold uppercase tracking-wider">
                🏆 Winning Deliveries
              </span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-none mb-1">
              My Won Items & Deliveries
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold">
              Get seller contact details, verify parcel delivery, and release funds when satisfied.
            </p>
          </div>

          <button
            onClick={() => fetchWonAuctions(user.id)}
            disabled={isLoading}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition self-start md:self-auto"
          >
            {isLoading ? "Refreshing..." : "Refresh Purchases"}
          </button>
        </div>

        {/* Won Auctions Content Grid */}
        {isLoading && wonItems.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            <div className="h-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl"></div>
            <div className="h-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl"></div>
          </div>
        ) : wonItems.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm">
            <div className="w-16 h-16 bg-lime-500/10 rounded-full flex items-center justify-center text-lime-600 dark:text-lime-400 mx-auto mb-4 text-2xl">
              📦
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">No Won Items Yet</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs max-w-md mx-auto mb-6 font-medium">
              When you place the winning bid on a listing and the timer ends, your won purchases and delivery details will appear here!
            </p>
            <button
              onClick={() => router.push('/auction')}
              className="bg-lime-500 hover:bg-lime-600 text-slate-950 font-bold px-6 py-3 rounded-xl text-xs shadow-md transition active:scale-[0.99]"
            >
              Explore Live Bidding Drops
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {wonItems.map((item) => {
              const itemImg = item.image_url || (
                item.title.toLowerCase().includes('phone') || item.title.toLowerCase().includes('mobile') || item.title.toLowerCase().includes('iphone')
                  ? '/images/modern_smartphone.png' 
                  : item.title.toLowerCase().includes('headphone') || item.title.toLowerCase().includes('audio') || item.title.toLowerCase().includes('speaker')
                    ? '/images/premium_headphones.png' 
                    : '/images/vintage_watch.png'
              );
              const isSettled = item.status === 'completed' || item.status === 'settled' || item.escrow_status === 'released';
              const isPhoneRevealed = revealedPhones[item.i_id];

              return (
                <div 
                  key={item.i_id} 
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-md flex flex-col justify-between relative overflow-hidden transition-all hover:border-lime-500/50"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-lime-500/20 text-lime-800 dark:text-lime-400 border border-lime-500/30">
                        🏆 WON AUCTION
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Item #{item.i_id.substring(0, 8)}
                      </span>
                    </div>

                    <div className="w-full h-40 bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-hidden mb-4 border border-slate-200 dark:border-slate-700">
                      <img src={itemImg} alt={item.title} className="w-full h-full object-cover" />
                    </div>

                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1 leading-snug">
                      {item.title}
                    </h2>

                    {/* Final Winning Bid Card */}
                    <div className="bg-lime-500/10 border border-lime-500/30 p-4 rounded-2xl mb-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-lime-700 dark:text-lime-400 block mb-0.5">
                        Winning Final Price
                      </span>
                      <span className="text-2xl font-bold text-slate-950 dark:text-lime-400">
                        Rs. {item.winning_bid.toLocaleString()}
                      </span>
                    </div>

                    {/* Seller Phone Reveal Box (Winners Only) */}
                    <div className="mb-4 bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Seller Contact Info
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleRevealPhone(item.i_id)}
                          className="text-[10px] font-bold text-lime-600 dark:text-lime-400 hover:underline"
                        >
                          {isPhoneRevealed ? "Hide Phone" : "📞 Show Seller Phone"}
                        </button>
                      </div>

                      {isPhoneRevealed ? (
                        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            Seller: <span className="text-lime-600 dark:text-lime-400">{item.seller_name || "Verified Local Seller"}</span>
                          </p>
                          <p className="text-sm font-bold text-slate-950 dark:text-slate-100 font-mono tracking-wide">
                            📱 {item.seller_phone || "+923001234567"}
                          </p>
                          <p className="text-[9px] text-slate-500">Contact directly for pickup or courier delivery updates.</p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500 font-medium">
                          Click above to view seller phone number for delivery coordination.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Delivery Status & "Satisfied with Delivery" Action */}
                  <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300">Escrow Protected</span>
                      <span className={`px-3 py-1 rounded-xl text-[10px] font-bold uppercase ${
                        isSettled
                          ? 'bg-lime-500/20 text-lime-800 dark:text-lime-400 border border-lime-500/30'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                      }`}>
                        {isSettled ? 'Funds Released to Seller' : 'Funds Held in Escrow'}
                      </span>
                    </div>

                    {!isSettled ? (
                      <button
                        onClick={() => handleConfirmDelivery(item.i_id)}
                        disabled={confirmingItemId === item.i_id}
                        className="w-full bg-lime-500 hover:bg-lime-600 active:scale-[0.99] text-slate-950 font-bold py-3 rounded-xl text-xs transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {confirmingItemId === item.i_id ? (
                          "Releasing Escrow Funds..."
                        ) : (
                          <>
                            <span>✅</span> Satisfied with Delivery (Release Funds to Seller)
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="bg-lime-500/10 border border-lime-500/30 p-2.5 rounded-xl text-[10px] font-bold text-lime-700 dark:text-lime-400 text-center">
                        ✓ Delivery Confirmed & Escrow Settled
                      </div>
                    )}

                    {actionMessage.itemId === item.i_id && (
                      <p className={`text-[10px] font-bold text-center ${
                        actionMessage.type === 'success' ? 'text-lime-600 dark:text-lime-400' : 'text-red-500'
                      }`}>
                        {actionMessage.text}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
