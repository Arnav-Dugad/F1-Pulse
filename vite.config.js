import { defineConfig } from "vite";
export default defineConfig({
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: true } },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      onwarn(warning, warn) {
        // motion ships "use client" directives for React Server Components; irrelevant in a SPA.
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        warn(warning);
      },
      output: {
        manualChunks: { react: ["react", "react-dom"], motion: ["motion/react"] },
      },
    },
  },
});
