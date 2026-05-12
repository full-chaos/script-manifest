import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**", "next-env.d.ts"]
  },
  {
    // eslint-config-next@16.2.6 promoted several `react-hooks/*` rules to
    // error severity. These flag common, pre-existing patterns in client
    // pages (on-mount fetch via `useEffect(() => void loadX(), [])`, and
    // `Date.now()`/`Math.random()` calls inside `useMemo`). Refactoring to
    // Suspense / Server Components / `useEffectEvent` is a substantive
    // change that is tracked separately; for now demote these new rules
    // to warnings so dependency bumps remain unblocked while the existing
    // code is migrated incrementally.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn"
    }
  }
];

export default eslintConfig;
