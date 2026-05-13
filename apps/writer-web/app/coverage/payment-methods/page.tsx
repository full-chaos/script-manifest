"use client";

import { useState } from "react";
import useSWR from "swr";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { useAuth } from "../../lib/AuthProvider";
import { fetcher, ApiError } from "../../lib/fetcher";

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export default function PaymentMethodsPage() {
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? "";
  const [removing, setRemoving] = useState<string | null>(null);

  // Auth-paused: do not fetch until auth resolves and user is known
  const paymentMethodsKey = authLoading || !userId ? null : "/api/v1/coverage/payment-methods";

  const {
    data,
    isLoading,
    mutate,
  } = useSWR<{ paymentMethods?: PaymentMethod[] }>(paymentMethodsKey, fetcher, {
    onError(err: unknown) {
      toast.error(err instanceof ApiError ? err.message : "Failed to load payment methods.");
    },
  });

  const methods = data?.paymentMethods ?? [];

  async function handleRemove(id: string) {
    setRemoving(id);
    try {
      await fetcher(`/api/v1/coverage/payment-methods/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      toast.success("Card removed.");
      void mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove card.");
    } finally {
      setRemoving(null);
    }
  }

  if (authLoading || isLoading) {
    return <section className="space-y-4"><SkeletonCard /></section>;
  }

  return (
    <section className="space-y-4">
      <article className="hero-card animate-in">
        <p className="eyebrow">Account</p>
        <h1 className="text-4xl text-foreground">Payment Methods</h1>
        <p className="max-w-3xl text-foreground-secondary">
          Manage your saved payment methods. Cards are saved when you place an order.
        </p>
      </article>

      {methods.length === 0 ? (
        <EmptyState
          illustration={<EmptyIllustration variant="search" className="h-14 w-14 text-foreground" />}
          title="No saved payment methods"
          description="Cards are saved when you place an order."
          actionLabel="Browse coverage services"
          actionHref="/coverage"
        />
      ) : (
        <article className="panel stack animate-in">
          <h2 className="section-title">Saved Cards</h2>
          <div className="stack">
            {methods.map((method) => (
              <div key={method.id} className="subcard flex items-center justify-between">
                <div className="stack-tight">
                  <p className="text-sm font-medium text-foreground capitalize">
                    {method.brand} •••• {method.last4}
                  </p>
                  <p className="text-xs text-foreground-secondary">
                    Expires {String(method.expMonth).padStart(2, "0")}/{method.expYear}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                  onClick={() => void handleRemove(method.id)}
                  disabled={removing === method.id}
                  aria-label={`Remove ${method.brand} ending in ${method.last4}`}
                >
                  {removing === method.id ? "Removing..." : "Remove"}
                </button>
              </div>
            ))}
          </div>
        </article>
      )}
    </section>
  );
}
