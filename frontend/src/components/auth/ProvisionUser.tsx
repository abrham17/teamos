"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

export function ProvisionUser() {
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    api.post("/auth/provision/", {}).catch(() => {
      // Non-blocking bootstrap call; UI continues even if it fails.
    });
  }, []);

  return null;
}
