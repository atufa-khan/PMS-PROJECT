import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#f4f1ea",
        ink: "#1c1917",
        accent: "#0f766e",
        accentWarm: "#b45309",
        border: "#d6d3d1",
        muted: "#78716c"
      },
      boxShadow: {
        card: "0 18px 40px rgba(28, 25, 23, 0.08)"
      },
      borderRadius: {
        xl2: "1.5rem"
      },
      fontFamily: {
        sans: ["Segoe UI", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
