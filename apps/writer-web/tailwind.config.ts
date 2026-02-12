import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#101827",
          700: "#243247",
          500: "#4a607a"
        },
        cream: {
          50: "#f7fafc",
          100: "#eff3f8",
          200: "#dfe8f1"
        },
        ember: {
          500: "#e05b2b",
          700: "#bb3f1c"
        },
        tide: {
          500: "#0f766e",
          700: "#115e59"
        },
        amber: {
          500: "#d97706",
          700: "#b45309"
        },
        sky: {
          500: "#0284c7",
          700: "#0369a1"
        },
        violet: {
          500: "#7c3aed",
          700: "#6d28d9"
        }
      },
      boxShadow: {
        panel: "0 20px 46px rgba(16, 24, 39, 0.12)"
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"]
      }
    }
  },
  plugins: []
};

export default config;
