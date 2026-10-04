import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? "/fitness-app/" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
});
