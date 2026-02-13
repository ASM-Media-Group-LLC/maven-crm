import { useState, useEffect } from "react";

interface CountdownResult {
  hours: number;
  minutes: number;
  seconds: number;
  isOverdue: boolean;
  isWarning: boolean;
  display: string;
}

export const useCountdown = (dueAt: string): CountdownResult => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const dueTime = new Date(dueAt).getTime();
  const remaining = Math.max(0, dueTime - now);
  const isOverdue = dueTime <= now;
  const isWarning = !isOverdue && remaining < 30 * 60 * 1000;

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");
  const display = isOverdue ? "00:00:00" : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  return { hours, minutes, seconds, isOverdue, isWarning, display };
};
