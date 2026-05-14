import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dataFetchingPlugin = require("./eslint-rules/no-fetch-in-effect.cjs");

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    plugins: {
      "script-manifest-data-fetching": dataFetchingPlugin
    },
    rules: {
      "script-manifest-data-fetching/no-fetch-in-effect": "error"
    }
  },
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**", "next-env.d.ts", "eslint-rules/**"]
  }
];

export default eslintConfig;
