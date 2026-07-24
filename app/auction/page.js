"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import CountdownTimer from '@/components/CountdownTimer';
import { io } from 'socket.io-client';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function AuctionPage() {
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [user, setUser] = useState(null);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isAuctionEnded, setIsAuctionEnded] = useState(false);
  const [socket, setSocket] = useState(null);
  
  // New interactive states
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [zoomImage, setZoomImage] = useState(null);
  const [bidHistory, setBidHistory] = useState([]);

  const router = useRouter();

  // Socket Connection setup
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Helper to determine item photo URL
  const getItemImage = (item) => {
    if (item.image_url) return item.image_url;
    const titleLower = item.title.toLowerCase();
    if (titleLower.includes('watch') || titleLower.includes('seiko') || titleLower.includes('rolex')) {
      return '/images/vintage_watch.png';
    }
    if (titleLower.includes('phone') || titleLower.includes('mobile') || titleLower.includes('iphone') || titleLower.includes('pixel')) {
      return '/images/modern_smartphone.png';
    }
    if (titleLower.includes('headphone') || titleLower.includes('audio') || titleLower.includes('speaker') || titleLower.includes('sound')) {
      return '/images/premium_headphones.png';
    }
    return '/images/vintage_watch.png'; // default fallback
  };

  // Socket Live Bidding Updates setup
  useEffect(() => {
    if (!socket || !selectedItem) return;

    socket.emit('joinRoom', selectedItem.i_id);

    const handleBidUpdate = (bidData) => {
      console.log("WebSocket bid update received:", bidData);
      
      setSelectedItem(prev => {
        if (prev && prev.i_id === bidData.itemId) {
          return {
            ...prev,
            current_highest_bid: Number(bidData.bidAmount),
            highest_bidder_id: bidData.userId
          };
        }
        return prev;
      });

      setItems(prevItems => prevItems.map(item => {
        if (item.i_id === bidData.itemId) {
          return {
            ...item,
            current_highest_bid: Number(bidData.bidAmount),
            highest_bidder_id: bidData.userId,
            has_bids: true
          };
        }
        return item;
      }));

      // Append to live bid history widget
      setBidHistory(prev => [
        {
          id: Date.now(),
          amount: Number(bidData.bidAmount),
          userId: bidData.userId || 'Anonymous',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        },
        ...prev.slice(0, 4)
      ]);
    };

    socket.on('bidUpdated', handleBidUpdate);

    return () => {
      socket.emit('leaveRoom', selectedItem.i_id);
      socket.off('bidUpdated', handleBidUpdate);
    };
  }, [socket, selectedItem]);

  // Route Guard & initial fetch
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/');
      } else {
        setUser(session.user);
        fetchItems(session.user.id);
      }
    };
    checkAuth();
  }, [router]);

  const fetchItems = async (currentUserId) => {
    setIsLoadingItems(true);
    try {
      const response = await fetch('/api/items');
      if (response.ok) {
        const data = await response.json();
        
        // Filter out ended auctions AND sort by least time left (closest to ending first)
        const now = new Date();
        const activeItems = data
          .filter(item => item.status === 'active' && new Date(item.auction_end_time) > now)
          .sort((a, b) => new Date(a.auction_end_time) - new Date(b.auction_end_time));

        setItems(activeItems);
        
        // Select default active item
        if (activeItems.length > 0) {
          setSelectedItem(activeItems[0]);
          setIsAuctionEnded(new Date() > new Date(activeItems[0].auction_end_time));
        } else {
          setSelectedItem(null);
          setIsAuctionEnded(true);
        }
      } else {
        console.error("Failed to fetch auction items");
      }
    } catch (err) {
      console.error("Error loading items:", err);
    } finally {
      setIsLoadingItems(false);
    }
  };

  const handleItemSelect = (item) => {
    setSelectedItem(item);
    setBidAmount('');
    setMessage({ text: '', type: '' });
    setBidHistory([]);
    setIsAuctionEnded(new Date() > new Date(item.auction_end_time));
  };

  const handleQuickIncrement = (increment) => {
    if (!selectedItem) return;
    const nextBid = Number(selectedItem.current_highest_bid) + increment;
    setBidAmount(nextBid.toString());
  };

  const handlePlaceBid = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });
    
    if (isAuctionEnded) {
      setMessage({ text: 'This auction has already ended.', type: 'error' });
      return;
    }

    if (!bidAmount || Number(bidAmount) <= selectedItem.current_highest_bid) {
      setMessage({ 
        text: `Your bid of Rs. ${bidAmount} must be higher than current highest bid of Rs. ${selectedItem.current_highest_bid}`, 
        type: 'error' 
      });
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch('/api/bids/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          itemId: selectedItem.i_id,
          bidAmount: Number(bidAmount)
        })
      });

      const result = await response.json();

      if (response.ok) {
        setMessage({ text: result.message, type: 'success' });
        setBidAmount('');
        const updatedItem = {
          ...selectedItem,
          current_highest_bid: Number(bidAmount)
        };
        setSelectedItem(updatedItem);
      } else {
        setMessage({ text: result.error, type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter items by category
  const filteredItems = items.filter(item => {
    if (selectedCategory === 'All') return true;
    const title = item.title.toLowerCase();
    if (selectedCategory === 'Watches') return title.includes('watch') || title.includes('seiko') || title.includes('rolex');
    if (selectedCategory === 'Tech') return title.includes('phone') || title.includes('mobile') || title.includes('tech');
    if (selectedCategory === 'Audio') return title.includes('headphone') || title.includes('audio') || title.includes('sound');
    return true;
  });

  if (!user) return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-[#f2f6f1] dark:bg-[#080d08]">
      <p className="animate-pulse text-lime-600 dark:text-lime-400 font-semibold text-lg">Loading auction room...</p>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#f2f6f1] dark:bg-[#080d08] p-4 md:p-8 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Moving Live Ticker Banner Widget */}
        <div className="bg-slate-900 dark:bg-slate-900 text-slate-100 rounded-2xl p-2.5 shadow-md overflow-hidden relative border border-slate-800">
          <div className="flex items-center gap-3">
            <span className="bg-lime-500 text-slate-950 font-bold text-[10px] uppercase px-3 py-1 rounded-lg shrink-0">
              ⚡ LIVE ENGINE
            </span>
            <marquee className="text-xs font-semibold text-lime-400 tracking-wide">
              🇵🇰 Pakistan Trust Protocol Active &nbsp;•&nbsp; 🔒 Funds Protected in Digital Escrow &nbsp;•&nbsp; ⚡ Real-Time Bidding Socket Synchronized &nbsp;•&nbsp; 🏆 Verified Seller Auction Listings &nbsp;•&nbsp; ⏱️ Automatic Escrow Settlement Upon Parcel Delivery
            </marquee>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {['All', 'Watches', 'Tech', 'Audio'].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                selectedCategory === cat
                  ? 'bg-lime-500 text-slate-950 shadow-sm'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-lime-50 dark:hover:bg-slate-800 hover:text-lime-600 dark:hover:text-lime-400'
              }`}
            >
              {cat === 'All' ? '🌐 All Auctions' : cat === 'Watches' ? '⌚ Watches' : cat === 'Tech' ? '📱 Mobile & Tech' : '🎧 Audio Gear'}
            </button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Left Side: Active Auctions list */}
          <div className="w-full lg:w-2/5 flex flex-col gap-4">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center justify-between">
              <span>Live Bidding Drops</span>
              <span className="text-xs text-lime-600 dark:text-lime-400 font-bold">{filteredItems.length} Active</span>
            </h2>
            
            {isLoadingItems ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl"></div>
                <div className="h-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl"></div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-12 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 text-slate-500 shadow-sm p-6">
                <p className="font-bold text-slate-800 dark:text-slate-200">No active auctions in this category</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Check back soon or list an item in the Seller Portal!</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
                {filteredItems.map(item => {
                  const isSelected = selectedItem && selectedItem.i_id === item.i_id;
                  const itemImg = getItemImage(item);

                  return (
                    <div
                      key={item.i_id}
                      onClick={() => handleItemSelect(item)}
                      className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex gap-4 items-center ${
                        isSelected
                          ? 'bg-lime-500/10 dark:bg-lime-500/20 border-lime-500 shadow-md ring-2 ring-lime-500/30'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      {/* Product Thumbnail */}
                      <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700 relative group">
                        <img 
                          src={itemImg} 
                          alt={item.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2 mb-1">
                          <h3 className="font-bold truncate text-sm text-slate-900 dark:text-slate-100">{item.title}</h3>
                          <span className="text-[9px] bg-red-600 text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse shrink-0">
                            LIVE
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-end mt-2">
                          <div>
                            <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">High Bid</p>
                            <p className="text-base font-bold text-lime-600 dark:text-lime-400">Rs. {item.current_highest_bid.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <CountdownTimer endTime={item.auction_end_time} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Side: Detailed Bid Placement pane */}
          <div className="w-full lg:w-3/5">
            {selectedItem ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden flex flex-col md:flex-row min-h-[520px]">
                
                {/* Product Image Box & Zoom trigger */}
                <div className="md:w-1/2 bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-6 relative min-h-[300px] overflow-hidden group">
                  <img 
                    src={getItemImage(selectedItem)} 
                    alt={selectedItem.title} 
                    className="w-full h-64 object-cover rounded-2xl shadow-xl group-hover:scale-105 transition-transform duration-500 cursor-pointer"
                    onClick={() => setZoomImage(getItemImage(selectedItem))}
                  />
                  
                  <button 
                    onClick={() => setZoomImage(getItemImage(selectedItem))}
                    className="absolute bottom-4 right-4 bg-slate-900/80 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl backdrop-blur-md border border-white/20 hover:bg-slate-900"
                  >
                    🔍 Click to Zoom Image
                  </button>

                  <div className="absolute top-4 left-4">
                    <CountdownTimer 
                      endTime={selectedItem.auction_end_time} 
                      onEnd={() => setIsAuctionEnded(true)}
                    />
                  </div>
                </div>

                {/* Bidding Controls Pane */}
                <div className="md:w-1/2 p-6 flex flex-col justify-between relative bg-white dark:bg-slate-900">
                  <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1 tracking-tight leading-snug">
                      {selectedItem.title}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-xs mb-4">
                      {selectedItem.seller_id === user.id ? "Your item listing (Seller view)" : `Verified Seller #${selectedItem.seller_id.substring(0, 6)}`}
                    </p>

                    <div className="bg-lime-500/10 dark:bg-lime-500/15 border border-lime-500/30 rounded-2xl p-4 mb-4 shadow-inner">
                      <p className="text-lime-700 dark:text-lime-400 text-[10px] font-bold uppercase tracking-wider mb-0.5">Current Leading Bid</p>
                      <p className="text-3xl font-bold text-slate-950 dark:text-lime-400">Rs. {selectedItem.current_highest_bid.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Starting offer was Rs. {selectedItem.starting_price.toLocaleString()}</p>
                    </div>

                    {/* Notice if user is the current highest bidder */}
                    {selectedItem.highest_bidder_id === user.id && !isAuctionEnded && (
                      <div className="mb-4 p-3 bg-lime-500/15 border border-lime-500/40 rounded-xl text-xs font-bold text-lime-800 dark:text-lime-400 text-center flex items-center justify-center gap-2">
                        <span>🏆</span> You hold the leading bid! Waiting for another buyer to bid before you can bid again.
                      </div>
                    )}

                    {/* Quick Bid Increment Buttons */}
                    <div className="mb-4">
                      <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">Quick Add Amount:</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[100, 500, 1000, 5000].map(inc => (
                          <button
                            key={inc}
                            type="button"
                            onClick={() => handleQuickIncrement(inc)}
                            disabled={isAuctionEnded || selectedItem.seller_id === user.id || selectedItem.highest_bidder_id === user.id}
                            className="bg-slate-100 dark:bg-slate-800 hover:bg-lime-500 hover:text-slate-950 dark:hover:bg-lime-500 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 text-[10px] font-bold text-slate-800 dark:text-slate-200 transition active:scale-95 disabled:opacity-40"
                          >
                            +{inc}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handlePlaceBid} className="space-y-3">
                      <div>
                        <label htmlFor="bidAmount" className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                          Enter Your Bid (Rs.)
                        </label>
                        <input 
                          id="bidAmount"
                          type="number" 
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          placeholder={`Min bid: Rs. ${selectedItem.current_highest_bid + 1}`}
                          disabled={isAuctionEnded || selectedItem.seller_id === user.id || selectedItem.highest_bidder_id === user.id}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-3 rounded-xl text-slate-900 dark:text-slate-100 font-bold text-base focus:outline-none focus:ring-2 focus:ring-lime-500 transition-all placeholder:text-slate-400 disabled:opacity-40"
                          required
                          min={selectedItem.current_highest_bid + 1}
                          max="1000000"
                        />
                      </div>

                      <button 
                        type="submit" 
                        disabled={isProcessing || isAuctionEnded || selectedItem.seller_id === user.id || selectedItem.highest_bidder_id === user.id}
                        className={`w-full font-bold text-sm py-3.5 rounded-xl transition-all shadow-md active:scale-[0.99] ${
                          isProcessing || isAuctionEnded || selectedItem.seller_id === user.id || selectedItem.highest_bidder_id === user.id
                            ? 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-50' 
                            : 'bg-lime-500 hover:bg-lime-600 text-slate-950'
                        }`}
                      >
                        {isProcessing 
                          ? "Securing Bid & Escrow..." 
                          : isAuctionEnded 
                            ? "Auction Finished" 
                            : selectedItem.seller_id === user.id 
                              ? "Own Listing (Bidding Blocked)"
                              : selectedItem.highest_bidder_id === user.id
                                ? "You Hold Highest Bid"
                                : "Place Bid"
                        }
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

                  {/* Live Bid History Widget */}
                  {bidHistory.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] font-bold text-lime-600 dark:text-lime-400 uppercase tracking-wider mb-2">Live Bids Log:</p>
                      <div className="space-y-1">
                        {bidHistory.map(b => (
                          <div key={b.id} className="flex justify-between items-center text-[10px] bg-slate-50 dark:bg-slate-800/80 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                            <span className="font-bold text-slate-900 dark:text-slate-100">Bid: Rs. {b.amount.toLocaleString()}</span>
                            <span className="text-slate-500 font-mono">{b.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 text-center">
                     <button 
                       type="button"
                       onClick={() => router.push('/wallet')} 
                       className="text-xs text-lime-600 dark:text-lime-400 hover:underline font-bold transition-colors"
                     >
                       Need more funds? Top Up Wallet
                     </button>
                  </div>
                </div>

              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-12 text-center text-slate-500">
                No active item selected.
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Full-Screen Image Lightbox Zoom Modal */}
      {zoomImage && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-w-3xl w-full max-h-[85vh] flex items-center justify-center">
            <img 
              src={zoomImage} 
              alt="Zoomed Product" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/20"
            />
            <button 
              onClick={() => setZoomImage(null)}
              className="absolute -top-4 -right-4 bg-white text-slate-900 font-black w-8 h-8 rounded-full flex items-center justify-center shadow-lg border border-slate-200"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}