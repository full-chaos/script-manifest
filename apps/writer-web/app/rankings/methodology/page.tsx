"use client";

import { useEffect, useState } from "react";
import type { ScoringMethodology } from "@script-manifest/contracts";

export default function MethodologyPage() {
  const [methodology, setMethodology] = useState<ScoringMethodology | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/v1/rankings/methodology", { cache: "no-store" });
        if (!response.ok) {
          setError("Failed to load methodology.");
          return;
        }
        const body = (await response.json()) as ScoringMethodology;
        setMethodology(body);
      } catch {
        setError("Unable to reach the rankings service.");
      }
    }
    void load();
  }, []);

  return (
    <section className="space-y-4">
      <article className="hero-card hero-card--tide animate-in">
        <p className="eyebrow eyebrow--tide">Rankings</p>
        <h1 className="text-4xl text-ink-900">Scoring Methodology</h1>
        <p className="max-w-3xl text-ink-700">
          Full transparency into how writer scores are calculated, weighted, and decayed over time.
        </p>
      </article>

      {error ? <p className="status-error">{error}</p> : null}

      {methodology ? (
        <>
          <article className="panel stack animate-in animate-in-delay-1">
            <div className="subcard-header">
              <h2 className="section-title">Algorithm v{methodology.version}</h2>
            </div>
            <p className="text-ink-700">
              Each placement score is computed as:
              <code className="mx-1 rounded bg-ink-500/10 px-1.5 py-0.5 text-sm font-mono">
                status_weight &times; prestige &times; verification &times; time_decay &times; confidence
              </code>
            </p>
          </article>

          <article className="panel stack animate-in animate-in-delay-2">
            <div className="subcard-header">
              <h2 className="section-title">Status Weights</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(methodology.statusWeights).map(([status, weight]) => (
                <div key={status} className="subcard flex items-center justify-between">
                  <span className="capitalize text-ink-900">{status}</span>
                  <span className="font-mono font-bold text-ember-700">{weight}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel stack animate-in animate-in-delay-3">
            <div className="subcard-header">
              <h2 className="section-title">Prestige Multipliers</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(methodology.prestigeMultipliers).map(([tier, mult]) => (
                <div key={tier} className="subcard flex items-center justify-between">
                  <span className="capitalize text-ink-900">{tier}</span>
                  <span className="font-mono font-bold text-tide-700">{mult}x</span>
                </div>
              ))}
            </div>
          </article>

          <article className="panel stack animate-in animate-in-delay-4">
            <div className="subcard-header">
              <h2 className="section-title">Time Decay &amp; Confidence</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="subcard">
                <p className="text-sm text-ink-600">Time decay half-life</p>
                <p className="text-2xl font-bold text-ink-900">{methodology.timeDecayHalfLifeDays} days</p>
                <p className="text-xs text-ink-500 mt-1">
                  Scores halve in value after this period, encouraging ongoing participation.
                </p>
              </div>
              <div className="subcard">
                <p className="text-sm text-ink-600">Confidence threshold</p>
                <p className="text-2xl font-bold text-ink-900">{methodology.confidenceThreshold} evaluations</p>
                <p className="text-xs text-ink-500 mt-1">
                  Writers reach full scoring confidence after this many evaluations.
                </p>
              </div>
            </div>
          </article>

          <article className="panel stack animate-in animate-in-delay-5">
            <div className="subcard-header">
              <h2 className="section-title">Tier Thresholds</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(methodology.tierThresholds).map(([tier, pct]) => (
                <div key={tier} className="subcard flex items-center justify-between">
                  <span className="text-ink-900">{tier.replace("_", " ")}</span>
                  <span className="font-mono font-bold text-sky-700">{((pct as number) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </article>
        </>
      ) : !error ? (
        <article className="panel stack animate-in animate-in-delay-1">
          <p className="text-ink-500">Loading methodology...</p>
        </article>
      ) : null}
    </section>
  );
}
