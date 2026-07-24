"use client";
import { useState, useEffect, useRef } from 'react';

export default function CountdownTimer({ endTime, onEnd }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isEnded, setIsEnded] = useState(false);
  const callbackTriggered = useRef(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = new Date(endTime).getTime() - new Date().getTime();
      
      if (difference <= 0) {
        setTimeLeft('Auction Ended');
        setIsEnded(true);
        if (onEnd && !callbackTriggered.current) {
          callbackTriggered.current = true;
          onEnd();
        }
        return false;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      let timeString = '';
      if (days > 0) timeString += `${days}d `;
      if (hours > 0 || days > 0) timeString += `${hours}h `;
      timeString += `${minutes}m ${seconds}s`;

      setTimeLeft(timeString);
      setIsEnded(false);
      return true;
    };

    // Calculate immediately
    const active = calculateTimeLeft();
    
    // Set interval if auction is still active
    let intervalId;
    if (active) {
      intervalId = setInterval(() => {
        const stillActive = calculateTimeLeft();
        if (!stillActive && intervalId) {
          clearInterval(intervalId);
        }
      }, 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [endTime, onEnd]);

  if (isEnded) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-red-100 text-red-800 border border-red-200">
        <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
        AUCTION ENDED
      </span>
    );
  }

  // Determine color based on time remaining (red for < 1 hour, orange for < 6 hours, blue otherwise)
  const isUrgent = new Date(endTime).getTime() - new Date().getTime() < 60 * 60 * 1000;
  const isClose = new Date(endTime).getTime() - new Date().getTime() < 6 * 60 * 60 * 1000;
  
  let badgeColor = "bg-emerald-50 text-emerald-800 border-emerald-100";
  let dotColor = "bg-emerald-500";
  
  if (isUrgent) {
    badgeColor = "bg-red-50 text-red-700 border-red-200 animate-pulse";
    dotColor = "bg-red-600";
  } else if (isClose) {
    badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
    dotColor = "bg-amber-500";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${badgeColor}`}>
      <span className={`w-2 h-2 rounded-full ${dotColor} ${isUrgent ? 'animate-ping' : ''}`}></span>
      Time Left: {timeLeft}
    </span>
  );
}
