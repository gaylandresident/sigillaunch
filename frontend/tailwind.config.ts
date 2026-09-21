import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0a0908", // deep charcoal background
          800: "#12100e",
          700: "#1a1815",
          600: "#22201d",
          500: "#2b2825",
        },
        bone: {
          DEFAULT: "#f4f1eb", // warm white text
          400: "#c9c4b8",
          500: "#a29c8f",
          600: "#7a7566",
        },
        ember: {
          DEFAULT: "#d97706", // fire amber accent
          400: "#f59e0b",
          500: "#d97706",
          600: "#b45309",
          700: "#92400e",
        },
        crimson: {
          DEFAULT: "#b91c1c",
        },
      },
      fontFamily: {
        serif: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"Geist"', "Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "Menlo", "monospace"],
      },
      letterSpacing: {
        widest2: "0.2em",
      },
      animation: {
        "slow-pulse": "slow-pulse 4s ease-in-out infinite",
        "flicker": "flicker 3s ease-in-out infinite",
      },
      keyframes: {
        "slow-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        flicker: {
          "0%, 100%": { opacity: "0.85", transform: "translateY(0)" },
          "50%": { opacity: "1", transform: "translateY(-1px)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
