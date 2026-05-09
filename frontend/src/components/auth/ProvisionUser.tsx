"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";

export function ProvisionUser() {
  const called = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    // Don't re-check if already on onboarding page
    if (pathname === "/onboarding") return;

    api.post<{ onboarding_required?: boolean }>("/auth/provision/", {}).then(res => {
      if (res?.onboarding_required) {
        router.push("/onboarding");
      }
    }).catch(() => {
      // Non-blocking bootstrap call; UI continues even if it fails.
    });
  }, [router, pathname]);

  return null;
}
