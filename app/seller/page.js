"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import CountdownTimer from '@/components/CountdownTimer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function SellerPage() {
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const router = useRouter();

  // Form states
  const [title, setTitle] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [auctionEndTime, setAuctionEndTime] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // List states
  const [myListings, setMyListings] = useState([]);
  const [isLoadingListings, setIsLoadingListings] = useState(true);

  // Guard route & fetch user's listings
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/');
      } else {
        // Verify user role - Admins do not have Seller Portal access
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
        fetchMyListings(session.user.id);
      }
    };
    checkAuth();
  }, [router]);

  const fetchMyListings = async (userId) => {
    setIsLoadingListings(true);
    try {
      const response = await fetch('/api/items');
      if (response.ok) {
        const allItems = await response.json();
        // Filter items where user is the seller
        const userItems = allItems.filter(item => item.seller_id === userId);
        setMyListings(userItems);
      } else {
        console.error("Failed to load listings");
      }
    } catch (error) {
      console.error("Error loading listings:", error);
    } finally {
      setIsLoadingListings(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (!title.trim()) {
      setMessage({ text: 'Please enter a product title.', type: 'error' });
      return;
    }

    if (Number(startingPrice) <= 0) {
      setMessage({ text: 'Starting price must be greater than Rs. 0.', type: 'error' });
      return;
    }

    const endTime = new Date(auctionEndTime);
    const minAllowedTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (isNaN(endTime.getTime()) || endTime < minAllowedTime) {
      setMessage({ text: 'Auction end time must be at least 24 hours from now.', type: 'error' });
      return;
    }

    setIsUploading(true);

    try {
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: user.id,
          title: title.trim(),
          startingPrice: startingPrice,
          auctionEndTime: new Date(auctionEndTime).toISOString(),
          imageUrl: imageUrl.trim() || undefined
        })
      });

      const result = await response.json();

      if (response.ok) {
        setMessage({ text: result.message, type: 'success' });
        setTitle('');
        setStartingPrice('');
        setAuctionEndTime('');
        setImageUrl('');
        // Refresh listings
        fetchMyListings(user.id);
      } else {
        setMessage({ text: result.error, type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#f2f6f1] dark:bg-[#080d08]">
        <p className="animate-pulse text-lime-600 dark:text-lime-400 font-bold text-base">Checking authorization...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f2f6f1] dark:bg-[#080d08] p-6 md:p-12 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8">
        
        {/* Left Side: Upload Form */}
        <div className="w-full lg:w-1/3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 relative overflow-hidden h-fit shadow-xl">
          
          <h2 className="text-2xl font-bold mb-1 tracking-tight text-slate-900 dark:text-slate-100">Upload Product</h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs mb-4 leading-relaxed font-medium">List a new item for real-time bidding.</p>
          
          {/* 4% Platform Fee Notice */}
          <div className="mb-5 p-3 rounded-xl bg-lime-500/10 border border-lime-500/30 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-start gap-2">
            <span className="text-base">🏷️</span>
            <div>
              <span className="font-bold text-lime-700 dark:text-lime-400">4% Platform Fee: </span>
              Upon successful delivery, Boli.pk deducts a 4% service fee. You will receive <span className="font-bold">96%</span> of the final winning bid in your wallet.
            </div>
          </div>
          
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Product Title
              </label>
              <input 
                id="title"
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Vintage Seiko 5 Automatic Watch"
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-slate-100 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-lime-500 transition-all placeholder:text-slate-400"
                required
              />
            </div>

            <div>
              <label htmlFor="startingPrice" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Starting Price (Rs.)
              </label>
              <input 
                id="startingPrice"
                type="number" 
                value={startingPrice}
                onChange={(e) => setStartingPrice(e.target.value)}
                placeholder="e.g. 1500"
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-slate-100 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-lime-500 transition-all placeholder:text-slate-400"
                required
                min="1"
              />
            </div>

            <div>
              <label htmlFor="endTime" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Auction End Time
              </label>
              <input 
                id="endTime"
                type="datetime-local" 
                value={auctionEndTime}
                onChange={(e) => setAuctionEndTime(e.target.value)}
                onClick={(e) => e.target.showPicker?.()}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-slate-100 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-lime-500 transition-all cursor-pointer"
                required
              />
            </div>

            <div>
              <label htmlFor="imageUrl" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Product Image (Upload File or Paste Link)
              </label>
              
              {/* File Upload Button */}
              <div className="mb-2">
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        setMessage({ text: 'Image file size should be under 5MB.', type: 'error' });
                        return;
                      }
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setImageUrl(reader.result);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="block w-full text-xs text-slate-500 dark:text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-lime-500/20 file:text-lime-800 dark:file:text-lime-400 hover:file:bg-lime-500/30 cursor-pointer"
                />
              </div>

              {/* Or URL input */}
              <input 
                id="imageUrl"
                type="text" 
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Or paste image URL (e.g. https://...)"
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-slate-100 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-lime-500 transition-all placeholder:text-slate-400"
              />

              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setImageUrl('/images/vintage_watch.png')}
                  className="px-2 py-1 bg-lime-500/10 hover:bg-lime-500/20 border border-lime-500/30 rounded text-[10px] font-bold text-lime-700 dark:text-lime-400"
                >
                  ⌚ Watch Preset
                </button>
                <button
                  type="button"
                  onClick={() => setImageUrl('/images/modern_smartphone.png')}
                  className="px-2 py-1 bg-lime-500/10 hover:bg-lime-500/20 border border-lime-500/30 rounded text-[10px] font-bold text-lime-700 dark:text-lime-400"
                >
                  📱 Phone Preset
                </button>
                <button
                  type="button"
                  onClick={() => setImageUrl('/images/premium_headphones.png')}
                  className="px-2 py-1 bg-lime-500/10 hover:bg-lime-500/20 border border-lime-500/30 rounded text-[10px] font-bold text-lime-700 dark:text-lime-400"
                >
                  🎧 Audio Preset
                </button>
              </div>

              {/* Live Preview */}
              {imageUrl && (
                <div className="mt-3 p-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex items-center gap-3">
                  <img src={imageUrl} alt="Image Preview" className="w-12 h-12 object-cover rounded-lg border border-slate-300 dark:border-slate-600" />
                  <div className="text-xs">
                    <p className="font-bold text-slate-800 dark:text-slate-200">Image Preview Ready</p>
                    <button 
                      type="button" 
                      onClick={() => setImageUrl('')}
                      className="text-[10px] font-bold text-red-500 hover:underline"
                    >
                      Remove image
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button 
              type="submit" 
              disabled={isUploading}
              className={`w-full font-bold py-3.5 rounded-xl transition-all shadow-md active:scale-[0.99] text-sm ${
                isUploading 
                  ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-50' 
                  : 'bg-lime-500 hover:bg-lime-600 text-slate-950'
              }`}
            >
              {isUploading ? "Uploading listing..." : "Launch Auction"}
            </button>
          </form>

          {message.text && (
            <div className={`mt-4 p-3 rounded-xl text-xs font-bold text-center border ${
              message.type === 'success' ? 'bg-lime-500/10 border-lime-500 text-lime-700 dark:text-lime-400' : 'bg-red-500/10 border-red-500 text-red-600 dark:text-red-400'
            }`}>
              {message.text}
            </div>
          )}
        </div>

        {/* Right Side: Seller's Listed Items */}
        <div className="w-full lg:w-2/3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">My Listings</h2>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold">Manage your live auction products</p>
            </div>
            <span className="text-xs bg-lime-500/20 border border-lime-500/30 text-lime-800 dark:text-lime-400 font-bold px-3 py-1 rounded-full">
              {myListings.length} Total
            </span>
          </div>

          {isLoadingListings ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
              <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl"></div>
            </div>
          ) : myListings.length === 0 ? (
            <div className="text-center py-12 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-slate-500">
              No products uploaded yet. Fill the form to launch an auction!
            </div>
          ) : (
            <div className="space-y-4 max-h-[550px] overflow-y-auto pr-2">
              {myListings.map((item) => {
                let displayTitle = (item.title || '').trim();
                let displayImg = item.image_url || null;

                if (displayTitle.includes('[img:')) {
                  const match = displayTitle.match(/^(.*?)\s*\[img:(.*?)\]$/s);
                  if (match) {
                    displayTitle = match[1].trim();
                    if (!displayImg) displayImg = match[2].trim();
                  }
                }

                return (
                  <div 
                    key={item.i_id} 
                    className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-4 flex justify-between items-center"
                  >
                    <div className="flex items-center gap-4">
                      {displayImg && (
                        <img src={displayImg} alt={displayTitle} className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
                      )}
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{displayTitle}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Start: <span className="font-bold text-lime-600 dark:text-lime-400">Rs. {item.starting_price.toLocaleString()}</span>
                        </p>
                      </div>
                    </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                      item.status === 'active' 
                        ? 'bg-lime-500/20 text-lime-800 dark:text-lime-400 border border-lime-500/30' 
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>

      </div>
    </div>
  );
}
