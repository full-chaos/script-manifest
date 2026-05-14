"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import type { TierDesignation } from "@script-manifest/contracts";

type FiltersProps = {
  total: number;
};

const tierOptions: Array<{ value: TierDesignation | ""; label: string }> = [
  { value: "", label: "All tiers" },
  { value: "top_1", label: "Top 1%" },
  { value: "top_2", label: "Top 2%" },
  { value: "top_10", label: "Top 10%" },
  { value: "top_25", label: "Top 25%" }
];

function filterValue(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? "";
}

function buildQuery(form: HTMLFormElement): string {
  const formData = new FormData(form);
  const query = new URLSearchParams();
  for (const key of ["format", "genre", "tier"]) {
    const value = formData.get(key);
    if (typeof value === "string" && value.trim()) {
      query.set(key, value.trim());
    }
  }
  if (formData.get("trending") === "true") {
    query.set("trending", "true");
  }
  return query.toString();
}

export function LeaderboardFilters({ total }: FiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function pushQuery(form: HTMLFormElement) {
    const qs = buildQuery(form);
    router.push(qs ? `/leaderboard?${qs}` : "/leaderboard");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    pushQuery(event.currentTarget);
  }

  function handleChange(event: FormEvent<HTMLFormElement>) {
    pushQuery(event.currentTarget);
  }

  return (
    <article className="panel stack animate-in animate-in-delay-1">
      <form className="stack" onSubmit={handleSubmit} onChange={handleChange} key={searchParams.toString()}>
        <div className="grid-two">
          <label className="stack-tight">
            <span>Format filter</span>
            <input
              className="input"
              name="format"
              defaultValue={filterValue(searchParams, "format")}
              placeholder="feature / tv / short"
            />
          </label>
          <label className="stack-tight">
            <span>Genre filter</span>
            <input
              className="input"
              name="genre"
              defaultValue={filterValue(searchParams, "genre")}
              placeholder="drama / comedy"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="stack-tight">
            <span>Tier</span>
            <select className="input" name="tier" defaultValue={filterValue(searchParams, "tier")}>
              {tierOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end pb-1 cursor-pointer">
            <input
              type="checkbox"
              name="trending"
              value="true"
              defaultChecked={filterValue(searchParams, "trending") === "true"}
            />
            <span className="text-sm font-medium">Trending</span>
          </label>
        </div>
        <div className="inline-form">
          <button type="submit" className="btn btn-primary">
            Refresh leaderboard
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => router.push("/leaderboard")}>
            Reset
          </button>
          <span className="badge">{total} total</span>
        </div>
      </form>
    </article>
  );
}
