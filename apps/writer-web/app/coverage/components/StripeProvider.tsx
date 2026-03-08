"use client";

import { useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

interface StripeProviderProps {
  clientSecret: string;
  children: React.ReactNode;
}

export function StripeProvider({ clientSecret, children }: StripeProviderProps) {
  const stripePromise = useMemo(() => {
    if (!stripePublishableKey) {
      return null;
    }
    return loadStripe(stripePublishableKey);
  }, []);

  if (!stripePublishableKey) {
    return (
      <div className="subcard" role="alert">
        <p className="text-sm text-foreground-secondary">
          Stripe is not configured. Please set the <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> environment variable.
        </p>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#7c3aed",
            borderRadius: "8px",
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}
