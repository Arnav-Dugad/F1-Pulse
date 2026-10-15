import { useEffect } from "react";

/**
 * Global, page-agnostic interaction layer:
 *  - swipe navigation: a horizontal swipe over <main> on touch devices clicks the page's
 *    `[data-swipe="prev"]` / `[data-swipe="next"]` link, with an edge-peek and a springy release;
 *  - press ripples on `.btn` / `.icon-btn`;
 *  - scroll parallax for race-card and hero photos.
 * Everything respects reduced motion (the in-app toggle and the OS setting).
 */

const reduced = () =>
  document.documentElement.dataset.motion === "reduced" ||
  (document.documentElement.dataset.motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);

/** Swipes that start inside these never navigate (they scroll or drag on their own). */
const IGNORE = [
  ".rail", ".table-wrap", ".chart", "svg", "canvas", "input", "textarea", "select", "[contenteditable]",
  ".seg", ".snav", ".sheet", ".dialog", ".live-pill", "[data-no-swipe]", "[data-swipe-ignore]", "[draggable='true']", "video", "iframe",
].join(",");

function scrollsHorizontally(start: Element | null, stop: Element) {
  for (let el = start; el && el !== stop; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 2) {
      const o = getComputedStyle(el).overflowX;
      if (o === "auto" || o === "scroll") return true;
    }
  }
  return false;
}

function linkLabel(link: HTMLElement) {
  return (link.getAttribute("aria-label") || link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 42);
}

function setupSwipe() {
  const peek = document.createElement("div");
  peek.className = "swipe-peek";
  peek.setAttribute("aria-hidden", "true");
  peek.innerHTML = '<span class="sp-arrow"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg></span><span class="sp-label"></span>';
  document.body.append(peek);
  const label = peek.querySelector<HTMLElement>(".sp-label")!;

  let startX = 0, startY = 0, startT = 0, dx = 0;
  let mode: "idle" | "pending" | "swipe" | "off" = "idle";
  let main: HTMLElement | null = null;
  let link: HTMLElement | null = null;
  let dir: "prev" | "next" | null = null;
  const THRESHOLD = 84;

  const reset = (animate: boolean) => {
    peek.classList.remove("show", "armed");
    peek.style.removeProperty("--pull");
    if (main) {
      if (animate) main.classList.add("swipe-release");
      main.style.removeProperty("translate");
      const m = main;
      window.setTimeout(() => m.classList.remove("swipe-release"), 520);
    }
    mode = "idle"; main = null; link = null; dir = null; dx = 0;
  };

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) { mode = "off"; return; }
    const t = e.touches[0];
    const target = e.target as Element | null;
    const m = document.getElementById("main");
    // Leave the outer 22px to the OS back/forward gestures.
    if (!m || !target || !m.contains(target) || t.clientX < 22 || t.clientX > innerWidth - 22) { mode = "off"; return; }
    if (target.closest(IGNORE) || scrollsHorizontally(target, m)) { mode = "off"; return; }
    if (!m.querySelector("[data-swipe]")) { mode = "off"; return; }
    main = m; startX = t.clientX; startY = t.clientY; startT = performance.now(); mode = "pending";
  };

  const onMove = (e: TouchEvent) => {
    if (mode === "off" || mode === "idle" || !main) return;
    const t = e.touches[0];
    const mx = t.clientX - startX, my = t.clientY - startY;
    if (mode === "pending") {
      if (Math.abs(mx) < 12 && Math.abs(my) < 12) return;
      if (Math.abs(mx) < Math.abs(my) * 1.5) { mode = "off"; return; }
      mode = "swipe";
    }
    dx = mx;
    const nextDir = dx > 0 ? "prev" : "next";
    if (nextDir !== dir) {
      dir = nextDir;
      link = main.querySelector<HTMLElement>(`[data-swipe="${dir}"]:not([aria-disabled="true"]):not([disabled])`);
      peek.classList.toggle("right", dir === "next");
      label.textContent = link ? linkLabel(link) : "";
    }
    const pull = Math.min(1, Math.abs(dx) / THRESHOLD);
    // Rubber-band: the page follows the finger with resistance, and barely at all with nowhere to go.
    const resist = link ? 0.28 : 0.08;
    const travel = Math.sign(dx) * Math.min(Math.abs(dx) * resist, link ? 64 : 18);
    if (!reduced()) main.style.translate = `${travel}px 0`;
    if (link) {
      peek.classList.add("show");
      peek.style.setProperty("--pull", pull.toFixed(3));
      const armed = pull >= 1;
      if (armed && !peek.classList.contains("armed")) navigator.vibrate?.(6);
      peek.classList.toggle("armed", armed);
    }
  };

  const onEnd = () => {
    if (mode !== "swipe" || !main) { if (mode !== "idle") reset(false); mode = "idle"; return; }
    const velocity = Math.abs(dx) / Math.max(1, performance.now() - startT);
    const go = link && (Math.abs(dx) >= THRESHOLD || (velocity > 0.6 && Math.abs(dx) > 40));
    const target = link;
    if (go && target) {
      navigator.vibrate?.(10);
      peek.classList.add("commit");
      window.setTimeout(() => peek.classList.remove("commit"), 420);
      reset(true);
      target.click();
    } else reset(true);
  };

  document.addEventListener("touchstart", onStart, { passive: true });
  document.addEventListener("touchmove", onMove, { passive: true });
  document.addEventListener("touchend", onEnd, { passive: true });
  document.addEventListener("touchcancel", onEnd, { passive: true });
  return () => {
    document.removeEventListener("touchstart", onStart);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("touchend", onEnd);
    document.removeEventListener("touchcancel", onEnd);
    peek.remove();
  };
}

function setupRipples() {
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || reduced()) return;
    const btn = (e.target as Element | null)?.closest<HTMLElement>(".btn, .icon-btn");
    if (!btn || btn.matches(":disabled, [aria-disabled='true']")) return;
    const r = btn.getBoundingClientRect();
    const host = document.createElement("span");
    host.className = "ripple-host";
    const dot = document.createElement("span");
    dot.className = "ripple";
    const size = Math.hypot(r.width, r.height) * 2;
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    host.append(dot);
    btn.append(host);
    window.setTimeout(() => host.remove(), 700);
  };
  document.addEventListener("pointerdown", onDown, { passive: true });
  return () => document.removeEventListener("pointerdown", onDown);
}

/** Photos that drift with scroll. Heroes drift down as they leave; card photos float within frame. */
const PARALLAX = ".rc-media img, [data-parallax], main > :first-child [class*='hero-media'] img";

/** The box a photo sits in — skipping the layout-less `<picture>` wrapper that `Img` adds for AVIF. */
const frameOf = (el: HTMLElement): HTMLElement => {
  const p = el.parentElement;
  return (p?.tagName === "PICTURE" ? p.parentElement : p) || el;
};

function setupParallax() {
  if (typeof IntersectionObserver === "undefined") return () => {};
  const visible = new Set<HTMLElement>();
  let frame = 0;
  const update = () => {
    frame = 0;
    if (reduced()) { visible.forEach((el) => el.style.removeProperty("translate")); return; }
    const vh = innerHeight;
    visible.forEach((el) => {
      const box = frameOf(el).getBoundingClientRect();
      if (el.closest(".rc-media") || el.hasAttribute("data-parallax")) {
        const strength = Number(el.dataset.parallax) || 0.045;
        // -1 (entering at the bottom) … 1 (leaving at the top)
        const p = Math.max(-1, Math.min(1, (vh / 2 - (box.top + box.height / 2)) / (vh / 2 + box.height / 2)));
        el.style.translate = `0 ${(p * strength * box.height).toFixed(1)}px`;
      } else {
        const off = Math.max(0, -box.top);
        el.style.translate = `0 ${Math.min(off * 0.28, box.height * 0.3).toFixed(1)}px`;
      }
    });
  };
  const queue = () => { frame ||= requestAnimationFrame(update); };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const el = e.target as HTMLElement;
      if (e.isIntersecting) visible.add(el);
      else visible.delete(el);
    }
    queue();
  }, { rootMargin: "80px 0px" });
  const seen = new WeakSet<Element>();
  let scanFrame = 0;
  const scan = () => {
    scanFrame = 0;
    document.querySelectorAll<HTMLElement>(PARALLAX).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      el.classList.add("parallax");
      io.observe(el);
    });
    visible.forEach((el) => { if (!el.isConnected) visible.delete(el); });
  };
  scan();
  const mo = new MutationObserver(() => { scanFrame ||= requestAnimationFrame(scan); });
  mo.observe(document.body, { childList: true, subtree: true });
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue, { passive: true });
  return () => {
    io.disconnect(); mo.disconnect();
    cancelAnimationFrame(frame); cancelAnimationFrame(scanFrame);
    removeEventListener("scroll", queue); removeEventListener("resize", queue);
  };
}

/** Mount once (in App): swipe navigation, press ripples and photo parallax. */
export function useGlobalGestures() {
  useEffect(() => {
    const cleanups = [setupRipples(), setupParallax()];
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) cleanups.push(setupSwipe());
    return () => cleanups.forEach((c) => c());
  }, []);
}
