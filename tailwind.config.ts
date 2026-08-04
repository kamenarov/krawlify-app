import type { Config } from "tailwindcss";

const config: Config = {
  // Toggled by <ThemeToggle /> — `.dark` is put on <html> before first paint.
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Status-code semantic palette (Screaming Frog style)
        status: {
          ok: "#16a34a", // 2xx
          redirect: "#2563eb", // 3xx
          clientErr: "#f97316", // 4xx
          serverErr: "#dc2626", // 5xx
          noresp: "#6b7280", // no response
        },
      },
    },
  },
  plugins: [],
};

export default config;
