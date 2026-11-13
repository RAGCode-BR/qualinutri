import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: { rollupOptions: { input: { app: "index.html", simulator: "load-simulator.html" } } },
});
