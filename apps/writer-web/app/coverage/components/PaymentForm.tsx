"use client";

import { useState, type FormEvent } from "react";
import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";

interface PaymentFormProps {
  clientSecret: string;
  onSuccess: () => void;
}

export function PaymentForm({ clientSecret, onSuccess }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setConfirming(true);
    setErrorMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/coverage/orders`,
      },
      redirect: "if_required",
    });

    if (error) {
      setErrorMessage(error.message ?? "An unexpected error occurred.");
      setConfirming(false);
    } else {
      onSuccess();
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <PaymentElement />

      {errorMessage ? (
        <div className="subcard border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950" role="alert">
          <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
        </div>
      ) : null}

      <div className="inline-form">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!stripe || !elements || confirming}
        >
          {confirming ? "Processing payment..." : "Confirm Payment"}
        </button>
      </div>
    </form>
  );
}
