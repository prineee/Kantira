import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-poppins)", "Poppins", "Segoe UI", "Arial", "sans-serif"],
      },
      colors: {
        brand: {
          navy: "var(--kantira-primary-navy)",
          royal: "var(--kantira-royal-blue)",
          cyan: "var(--kantira-cyan)",
          purple: "var(--kantira-purple)",
          teal: "var(--kantira-accent-teal)",
          slate: "var(--kantira-slate)",
          gray: "var(--kantira-light-gray)",
          white: "var(--kantira-white)",
        },
        kantira: {
          green: {
            50: "#eefaf3",
            100: "#d6f2e1",
            200: "#ade6c4",
            300: "#7ad3a3",
            400: "#4bb783",
            500: "#2f9a6a",
            600: "#1f7d55",
            700: "#1a6446",
            800: "#17503a",
            900: "#0f3527",
          },
          navy: {
            50: "#eef1f6",
            100: "#d3dae6",
            200: "#a7b6cc",
            300: "#7a91b3",
            400: "#4e6d99",
            500: "#345480",
            600: "#243d5f",
            700: "#1a2c46",
            800: "#111c2e",
            900: "#0a1119",
          },
        },
      },
      borderRadius: {
        card: "1rem",
      },
    },
  },
  plugins: [],
};

export default config;
