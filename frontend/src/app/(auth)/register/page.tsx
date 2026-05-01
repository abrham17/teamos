import { SignUp } from "@clerk/nextjs";

export default function RegisterPage() {
  return (
    <div className="min-h-[calc(100vh-3rem)] w-full bg-[var(--bg-900)] text-[var(--text-primary)] flex items-center justify-center p-6">
      <SignUp
        path="/register"
        signInUrl="/login"
        forceRedirectUrl="/wiki"
      />
    </div>
  );
}
