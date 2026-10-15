import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * PWA wiring without touching index.html:
 * - injects the web-app manifest, touch icon and standalone meta tags into the built page;
 * - after the build, writes the app-shell precache list and a build version into
 *   dist/service-worker.js (replacing the marker comment), so every deploy ships a byte-different
 *   worker that the browser installs.
 */
function pulsePwa() {
  let outDir = "dist";
  let shell = [];
  return {
    name: "pulse-pwa",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml() {
      return [
        { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" }, injectTo: "head" },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "F1 Pulse" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" }, injectTo: "head" },
      ];
    },
    // writeBundle (not generateBundle): Vite drops CSS-only JS chunks during generateBundle.
    writeBundle(_, bundle) {
      shell = Object.keys(bundle)
        .filter((file) => /\.(js|css|woff2?)$/.test(file))
        .map((file) => "/" + file.replace(/\\/g, "/"))
        .sort();
    },
    async closeBundle() {
      if (!shell.length) return;
      const swPath = resolve(outDir, "service-worker.js");
      let sw;
      try {
        sw = await readFile(swPath, "utf8");
      } catch {
        return;
      }
      const html = await readFile(resolve(outDir, "index.html"), "utf8").catch(() => "");
      // Self-hosted fonts copied from public/assets are part of the shell too.
      const fonts = (await readdir(resolve(outDir, "assets")).catch(() => [])).filter((f) => /\.woff2$/.test(f)).map((f) => "/assets/" + f);
      const wanted = [...new Set(["/index.html", "/theme-init.js", "/favicon.svg", "/manifest.webmanifest", "/icons/icon-192.png", ...fonts, ...shell])];
      const present = await Promise.all(wanted.map((f) => access(resolve(outDir, "." + f)).then(() => true, () => false)));
      const files = wanted.filter((_, i) => present[i]);
      const hash = createHash("sha256").update(html).update(files.join("\n")).digest("hex").slice(0, 10);
      // Base-36 timestamp first so the worker can tell which older shell is the newest previous one.
      const version = Date.now().toString(36).padStart(9, "0") + "-" + hash;
      const marker = /\/\*__PULSE_BUILD__\*\/[\s\S]*?\/\*__PULSE_BUILD_END__\*\//;
      if (!marker.test(sw)) throw Error("service-worker.js is missing the __PULSE_BUILD__ marker");
      await writeFile(swPath, sw.replace(marker, JSON.stringify({ version, files })));
      this.info?.(`service worker: ${files.length} shell files, version ${version}`);
    },
  };
}

export default defineConfig({
  plugins: [pulsePwa()],
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
