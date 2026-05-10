"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import Script from 'next/script';

interface PaddleInstance {
  Initialize: (config: { token: string; eventCallback?: (data: unknown) => void }) => void;
  Environment: {
    set: (env: 'sandbox' | 'production') => void;
  };
  Checkout: {
    open: (config: unknown) => void;
  };
}

interface WindowWithPaddle extends Window {
  Paddle?: PaddleInstance;
}

interface PaddleContextType {
  paddle: PaddleInstance | null;
  isReady: boolean;
}

const PaddleContext = createContext<PaddleContextType>({ paddle: null, isReady: false });

export const usePaddle = () => useContext(PaddleContext);

export function PaddleProvider({ children }: { children: React.ReactNode }) {
  const [paddle, setPaddle] = useState<PaddleInstance | null>(null);
  const [isReady, setIsReady] = useState(false);

  // You need to set this in your .env.local
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "";
  const isSandbox = process.env.NEXT_PUBLIC_PADDLE_SANDBOX === "true";

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const win = window as WindowWithPaddle;
      if (win.Paddle && !paddle) {
        const p = win.Paddle;
        p.Initialize({ 
          token: clientToken,
          eventCallback: (data: unknown) => {
            console.log("Paddle Event:", data);
          }
        });
        setPaddle(p);
        setIsReady(true);
      }
    }
  }, [clientToken, paddle]);

  const handleLoad = () => {
    const win = window as WindowWithPaddle;
    if (win.Paddle) {
      const p = win.Paddle;
      p.Environment.set(isSandbox ? 'sandbox' : 'production');
      p.Initialize({ 
        token: clientToken,
      });
      setPaddle(p);
      setIsReady(true);
    }
  };

  return (
    <PaddleContext.Provider value={{ paddle, isReady }}>
      <Script
        src="https://cdn.paddle.com/paddle/v2/paddle.js"
        onLoad={handleLoad}
      />
      {children}
    </PaddleContext.Provider>
  );
}
