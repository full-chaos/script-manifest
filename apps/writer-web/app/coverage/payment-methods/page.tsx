"use client";

import { useEffect, useState } from "react";
import { getAuthHeaders } from "../../lib/authSession";
import { EmptyState } from "../../components/emptyState";
import { EmptyIllustration } from "../../components/illustrations";
import { SkeletonCard } from "../../components/skeleton";
import { useToast } from "../../components/toast";

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export default function PaymentMethodsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    void loadMethods();
  }, []);

  async function loadMethods() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/coverage/payment-methods", {
        headers: getAuthHeaders(),
        cache: "no-store"
      });
      if (res.ok) {
        const body = await res.json() as { paymentMethods?: PaymentMethod[] };
        setMethods(body.paymentMethods ?? []);
      }
    } catch {
      toast.error("Failed to load payment methods.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: string) {
    setRemoving(id);
    try {
      const res = await fetch(`/api/v1/coverage/payment-methods/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      if (res.ok) {
        setMethods(prev => prev.filter(m => m.id !== id));
        toast.success("Card removed.");
      } else {
        toast.error("Failed to remove card.");
      }
    } catch {
      toast.error("Failed to remove card.");
    } finally {
      setRemoving(null);
    }
  }

  if (loading) {
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
            {methods.map(method => (
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