"use client";

import { useMemo } from "react";

interface PasswordStrengthMeterProps {
  password?: string;
}

export function PasswordStrengthMeter({ password = "" }: PasswordStrengthMeterProps) {
  const rules = useMemo(() => {
    return [
      { id: "length", label: "At least 8 characters", met: /^.{8,}$/.test(password) },
      { id: "uppercase", label: "One uppercase letter", met: /[A-Z]/.test(password) },
      { id: "number", label: "One number", met: /[0-9]/.test(password) },
      { id: "special", label: "One special character", met: /[^A-Za-z0-9]/.test(password) },
    ];
  }, [password]);

  const metCount = rules.filter((rule) => rule.met).length;

  let strengthLabel = "Weak";
  let barColor = "bg-red-500";
  let barWidth = "w-1/3";

  if (metCount >= 3) {
    strengthLabel = "Strong";
    barColor = "bg-green-500";
    barWidth = "w-full";
  } else if (metCount >= 1) {
    strengthLabel = "Fair";
    barColor = "bg-yellow-500";
    barWidth = "w-2/3";
  } else {
    strengthLabel = "Weak";
    barColor = "bg-red-500";
    barWidth = "w-1/3";
  }

  // If there's no password at all, it's still weak but maybe we show an empty bar? 
  // Requirements specifically say 0 rules met = weak (red). So we follow exactly.

  return (
    <div className="mt-2 flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs font-medium">
        <span className="text-foreground-secondary">Password strength</span>
        <span className={
          metCount >= 3 ? "text-green-600 dark:text-green-400" :
          metCount >= 1 ? "text-yellow-600 dark:text-yellow-400" :
          "text-red-600 dark:text-red-400"
        }>
          {strengthLabel}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/20">
        <div
          className={`h-full transition-all duration-300 ${barColor} ${barWidth}`}
          data-testid="strength-bar"
        />
      </div>

      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className={`flex items-center gap-2 text-xs transition-colors duration-200 ${
              rule.met ? "text-green-600 dark:text-green-400" : "text-foreground-secondary"
            }`}
          >
            {rule.met ? (
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                data-testid={`icon-check-${rule.id}`}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg
                className="h-3.5 w-3.5 text-foreground-secondary/50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                data-testid={`icon-cross-${rule.id}`}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
