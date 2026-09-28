import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "frontend",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    minify: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
  },
});

