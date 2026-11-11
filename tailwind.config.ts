import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background-rgb) / <alpha-value>)",
        foreground: "var(--foreground)",
        // Custom MarrowNode Design System Colors
        charcoal: {
          DEFAULT: "#17201B",
          50: "#F4F6F4",
          100: "#E3E7E4",
          200: "#C6CFC8",
          300: "#9FB0A3",
          400: "#708775",
          500: "#4B6150",
          600: "#36473B",
          700: "#27342B",
          800: "#1C251F",
          900: "#17201B",
          950: "#0E1410",
        },
        ivory: {
          DEFAULT: "#F5F4EF",
          light: "#FAF9F5",
          dark: "#ECEBE5",
        },
        surface: {
          DEFAULT: "rgb(var(--surface-rgb) / <alpha-value>)",
          subtle: "rgb(var(--surface-subtle-rgb) / <alpha-value>)",
          muted: "rgb(var(--surface-muted-rgb) / <alpha-value>)",
          hover: "rgb(var(--surface-hover-rgb) / <alpha-value>)",
          dark: "#141A16",
          darkRaised: "#1A221D",
        },
        forest: {
          DEFAULT: "#56735F",
          hover: "#486251",
          subtle: "#EDF2EE",
          dark: "#3B5242",
          text: "#2D4233",
        },
        copper: {
          DEFAULT: "#B56B45",
          hover: "#9E5B38",
          subtle: "#F9EFE9",
          border: "#E2BAA6",
          text: "#7B4428",
        },
        border: {
          DEFAULT: "rgb(var(--border-rgb) / <alpha-value>)",
          subtle: "rgb(var(--border-subtle-rgb) / <alpha-value>)",
          strong: "rgb(var(--border-strong-rgb) / <alpha-value>)",
          dark: "#2A362E",
        },
        text: {
          primary: "rgb(var(--text-primary-rgb) / <alpha-value>)",
          secondary: "rgb(var(--text-secondary-rgb) / <alpha-value>)",
          muted: "rgb(var(--text-muted-rgb) / <alpha-value>)",
          subtle: "rgb(var(--text-subtle-rgb) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono)",
          "'IBM Plex Mono'",
          "'JetBrains Mono'",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgba(23, 32, 27, 0.04)",
        card: "0 1px 3px 0 rgba(23, 32, 27, 0.06), 0 1px 2px -1px rgba(23, 32, 27, 0.04)",
        dropdown: "0 4px 12px 0 rgba(23, 32, 27, 0.08)",
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
