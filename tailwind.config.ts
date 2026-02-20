import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        wa: {
          green: "#00a884",
          "dark-green": "#005c4b",
          bg: "#0b141a",
          panel: "#111b21",
          surface: "#202c33",
          border: "#2a3942",
          text: "#e9edef",
          subtext: "#8696a0",
        },
      },
    },
  },
  plugins: [],
};

export default config;
