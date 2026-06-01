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

  // Paddle client token from environment
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "";
  const isSandbox = process.env.NEXT_PUBLIC_PADDLE_SANDBOX === "true";

  useEffect(() => {
    if (typeof window !== 'undefined' && clientToken) {
      const win = window as WindowWithPaddle;
      if (win.Paddle && !paddle) {
        const p = win.Paddle;
        
        try {
          // Set environment first before initialization
          p.Environment.set(isSandbox ? 'sandbox' : 'production');
          
          p.Initialize({ 
            token: clientToken,
            eventCallback: (data: unknown) => {
              console.log("Paddle Event:", data);
            }
          });
          setPaddle(p);
          setIsReady(true);
        } catch (error) {
          console.error("Failed to initialize Paddle:", error);
          setIsReady(false);
        }
      }
    } else if (!clientToken) {
      console.warn("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is not set. Paddle billing will be disabled.");
      setIsReady(false);
    }
  }, [clientToken, isSandbox, paddle]);

  const handleLoad = () => {
    const win = window as WindowWithPaddle;
    if (win.Paddle && clientToken) {
      const p = win.Paddle;
      try {
        p.Environment.set(isSandbox ? 'sandbox' : 'production');
        p.Initialize({ 
          token: clientToken,
          eventCallback: (data: unknown) => {
            console.log("Paddle Event:", data);
          }
        });
        setPaddle(p);
        setIsReady(true);
      } catch (error) {
        console.error("Failed to initialize Paddle in handleLoad:", error);
        setIsReady(false);
      }
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
