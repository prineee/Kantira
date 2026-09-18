"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { customerSignUp, type CustomerSignUpState } from "./actions";

const initialState: CustomerSignUpState = { error: null, checkEmail: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-card bg-brand-royal px-4 py-3 text-base font-semibold text-white transition hover:bg-[#0f4fd6] disabled:opacity-60"
    >
      {pending ? "Creating account..." : "Create account"}
    </button>
  );
}

export default function CustomerSignupPage() {
  const [state, formAction] = useFormState(customerSignUp, initialState);

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
          Create your KANTIRA account
        </p>

        {state.checkEmail ? (
          <p className="text-sm text-kantira-navy-700">
            Check <strong>your email</strong> to confirm your account. Once
            confirmed, your account will be ready on first sign-in.
          </p>
        ) : (
          <form action={formAction} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-kantira-navy-700">
                Name
              </label>
              <input
                type="text"
                name="name"
                required
                autoComplete="name"
                className="w-full rounded-lg border border-kantira-navy-200 px-3 py-2 text-sm focus:border-brand-royal focus:outline-none focus:ring-1 focus:ring-brand-royal"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-kantira-navy-700">
                Phone <span className="font-normal text-brand-slate">(optional)</span>
              </label>
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                className="w-full rounded-lg border border-kantira-navy-200 px-3 py-2 text-sm focus:border-brand-royal focus:outline-none focus:ring-1 focus:ring-brand-royal"
              />
            </div>
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
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-kantira-navy-200 px-3 py-2 text-sm focus:border-brand-royal focus:outline-none focus:ring-1 focus:ring-brand-royal"
              />
            </div>

            {state.error ? (
              <p className="text-sm text-red-600">{state.error}</p>
            ) : null}

            <SubmitButton />
          </form>
        )}

        <p className="mt-6 text-center text-sm text-brand-slate">
          Already have an account?{" "}
          <Link href="/customer/login" className="font-medium text-brand-royal">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
