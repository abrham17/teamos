"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { OnboardingModal } from "./OnboardingModal";

export function ProvisionUser() {
  const called = useRef(false);
  const [onboardingRequired, setOnboardingRequired] = useState(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    api.post<{ onboarding_required?: boolean }>("/auth/provision/", {}).then(res => {
      if (res?.onboarding_required) {
        setOnboardingRequired(true);
      }
    }).catch(() => {
      // Non-blocking bootstrap call; UI continues even if it fails.
    });
  }, []);

  if (onboardingRequired) {
    return <OnboardingModal onComplete={() => setOnboardingRequired(false)} />;
  }

  return null;
}
