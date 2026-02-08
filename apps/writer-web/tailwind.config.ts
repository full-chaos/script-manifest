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
          900: "#171618",
          700: "#34323a",
          500: "#5d5965"
        },
        cream: {
          50: "#f9f6ee",
          100: "#f3efe3",
          200: "#e6decd"
        },
        ember: {
          500: "#c74724",
          700: "#9e3019"
        }
      },
      boxShadow: {
        panel: "0 14px 38px rgba(55, 38, 24, 0.10)"
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
