"use client";

import { useEffect, useRef } from "react";
import type { CoverageTier } from "@script-manifest/contracts";
import { useRouter, useSearchParams } from "next/navigation";

type CoverageFiltersProps = {
  tier: CoverageTier | "";
  minPrice: string;
  maxPrice: string;
};

function buildQueryString(form: HTMLFormElement): string {
  const formData = new FormData(form);
  const params = new URLSearchParams();
  for (const key of ["tier", "minPrice", "maxPrice"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value) {
      params.set(key, value);
    }
  }
  return params.toString();
}

export function CoverageFilters({ tier, minPrice, maxPrice }: CoverageFiltersProps) {
  const router = useRouter();
  useSearchParams();

  function pushFilters(form: HTMLFormElement) {
    const qs = buildQueryString(form);
    router.push(qs ? `/coverage?${qs}` : "/coverage");
  }

  function handleFieldChange(form: HTMLFormElement | null) {
    if (form) {
      pushFilters(form);
    }
  }

  return (
    <article className="panel stack animate-in animate-in-delay-1">
      <h2 className="section-title">Filter Services</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          pushFilters(event.currentTarget);
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <label className="stack-tight">
          <span className="text-sm font-medium text-foreground">Tier</span>
          <select
            name="tier"
            className="input"
            defaultValue={tier}
            onChange={(event) => handleFieldChange(event.currentTarget.form)}
          >
            <option value="">All tiers</option>
            <option value="concept_notes">Concept Notes</option>
            <option value="early_draft">Early Draft</option>
            <option value="polish_proofread">Polish Proofread</option>
            <option value="competition_ready">Competition Ready</option>
          </select>
        </label>
        <label className="stack-tight">
          <span className="text-sm font-medium text-foreground">Min Price ($)</span>
          <input
            name="minPrice"
            type="number"
            className="input"
            placeholder="0"
            min={0}
            step={1}
            defaultValue={minPrice}
            onChange={(event) => handleFieldChange(event.currentTarget.form)}
          />
        </label>
        <label className="stack-tight">
          <span className="text-sm font-medium text-foreground">Max Price ($)</span>
          <input
            name="maxPrice"
            type="number"
            className="input"
            placeholder="500"
            min={0}
            step={1}
            defaultValue={maxPrice}
            onChange={(event) => handleFieldChange(event.currentTarget.form)}
          />
        </label>
      </form>
    </article>
  );
}

export function OnboardingPing() {
  const onboardingMarked = useRef(false);

  useEffect(() => {
    if (!onboardingMarked.current) {
      onboardingMarked.current = true;
      void fetch("/api/v1/onboarding-progress", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coverageVisited: true }),
      });
    }
  }, []);

  return null;
}
