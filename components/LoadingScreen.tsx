'use client';

import { useEffect, useState } from 'react';

interface LoadingScreenProps {
  loaded: boolean;
}

export default function LoadingScreen({ loaded }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(true);

  // Ease toward 90% while waiting — never claims completion on its own
  useEffect(() => {
    if (loaded) return;
    const id = setInterval(() => {
      setProgress(p => (p >= 90 ? p : p + (90 - p) * 0.06 + 0.4));
    }, 100);
    return () => clearInterval(id);
  }, [loaded]);

  // Only snaps to 100% once the map is actually fully loaded, then fades out
  useEffect(() => {
    if (!loaded) return;
    setProgress(100);
    const fadeTimer = setTimeout(() => setVisible(false), 350);
    const unmountTimer = setTimeout(() => setMounted(false), 850);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, [loaded]);

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading map"
      aria-hidden={!visible}
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 500ms ease-in-out',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div className="relative w-56 h-[3px] rounded-full overflow-hidden bg-black/10 border border-white/[0.07]">
        <div
          className="absolute inset-y-0 left-0 bg-white rounded-full"
          style={{
            width: `${progress}%`,
            transition: loaded ? 'width 350ms ease-out' : 'width 80ms linear',
          }}
        />
      </div>
    </div>
  );
}
