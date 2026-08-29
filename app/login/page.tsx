"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { signIn } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-card bg-brand-royal px-4 py-3 text-base font-semibold text-white transition hover:bg-[#0f4fd6] disabled:opacity-60"
    >
      {pending ? "Signing in..." : "Sign in"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(signIn, { error: null });

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-navy px-4">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-cyan/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-brand-purple/20 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm rounded-card bg-white p-8 shadow-xl">
        <img
          src="/brand/logos/kantira_wordmark.svg"
          alt="KANTIRA Business OS"
          className="mb-6 h-10 w-auto"
        />
        <p className="mb-6 -mt-4 text-sm text-brand-slate">
          Sign in to your account
        </p>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-kantira-navy-700">
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-kantira-navy-200 px-3 py-2 text-sm focus:border-brand-royal focus:outline-none focus:ring-1 focus:ring-brand-royal"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-kantira-navy-700">
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-kantira-navy-200 px-3 py-2 text-sm focus:border-brand-royal focus:outline-none focus:ring-1 focus:ring-brand-royal"
            />
          </div>

          {state.error ? (
            <p className="text-sm text-red-600">{state.error}</p>
          ) : null}

          <SubmitButton />
        </form>

        <p className="mt-6 text-center text-sm text-brand-slate">
          Setting up KANTIRA for the first time?{" "}
          <Link href="/signup" className="font-medium text-brand-royal">
            Create your organization
          </Link>
        </p>
      </div>
    </main>
  );
}
