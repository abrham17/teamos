"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import Script from 'next/script';

interface PaddleContextType {
  paddle: any;
  isReady: boolean;
}

const PaddleContext = createContext<PaddleContextType>({ paddle: null, isReady: false });

export const usePaddle = () => useContext(PaddleContext);

export function PaddleProvider({ children }: { children: React.ReactNode }) {
  const [paddle, setPaddle] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);

  // You need to set this in your .env.local
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "";
  const isSandbox = process.env.NEXT_PUBLIC_PADDLE_SANDBOX === "true";

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Paddle && !paddle) {
      const p = (window as any).Paddle;
      p.Initialize({ 
        token: clientToken,
        eventCallback: (data: any) => {
          console.log("Paddle Event:", data);
        }
      });
      setPaddle(p);
      setIsReady(true);
    }
  }, [clientToken, paddle]);

  const handleLoad = () => {
    if ((window as any).Paddle) {
      const p = (window as any).Paddle;
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
