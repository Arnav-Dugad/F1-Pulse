import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp } from "lucide-react";
import { cx, prefersReducedMotion } from "./core";

type Chip = { id: string; label: string };

const NAV_OFFSET = 136; // floating nav + this bar + breathing room

function readSections(main: HTMLElement): Chip[] {
  const out: Chip[] = [];
  const seen = new Set<string>();
  main.querySelectorAll<HTMLElement>(".section[id]").forEach((el) => {
    const heading = el.querySelector(":scope > .section-head h2") || el.querySelector("h2");
    const label = heading?.textContent?.replace(/\s+/g, " ").trim();
    if (!label || !el.id || seen.has(el.id) || el.offsetParent === null) return;
    seen.add(el.id);
    out.push({ id: el.id, label: label.length > 34 ? label.slice(0, 32).trimEnd() + "…" : label });
  });
  return out;
}

const scrollToY = (top: number) => window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });

/**
 * Sticky mini-header: once the page hero scrolls away, a compact glass bar slides in under the
 * nav with the page title and a jump chip for every `<Section id=… title=…>`. Scroll-spy keeps
 * the current section highlighted. Hidden on pages with fewer than three titled sections.
 */
export function SectionNav({ path }: { path: string }) {
  const [chips, setChips] = useState<Chip[]>([]);
  const [title, setTitle] = useState("");
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const rail = useRef<HTMLDivElement>(null);

  // Build chips from the page's sections; rebuild as lazy sections and data arrive.
  useEffect(() => {
    setChips([]); setShown(false); setActive(null);
    let frame = 0, mo: MutationObserver | null = null, poll = 0;
    const build = () => {
      frame = 0;
      const main = document.getElementById("main");
      if (!main) return;
      const next = readSections(main);
      setChips((old) => (old.length === next.length && old.every((c, i) => c.id === next[i].id && c.label === next[i].label) ? old : next));
      setTitle((main.querySelector("h1")?.textContent || "").replace(/\s+/g, " ").trim());
    };
    const attach = () => {
      const main = document.getElementById("main");
      if (!main) return false;
      build();
      mo = new MutationObserver(() => { frame ||= requestAnimationFrame(build); });
      mo.observe(main, { childList: true, subtree: true, characterData: true });
      return true;
    };
    // <main> mounts after the lazy page chunk resolves.
    if (!attach()) poll = window.setInterval(() => { if (attach()) clearInterval(poll); }, 250);
    return () => { mo?.disconnect(); cancelAnimationFrame(frame); clearInterval(poll); };
  }, [path]);

  // Visibility (hero scrolled away) + scroll-spy.
  useEffect(() => {
    if (chips.length < 3) { setShown(false); return; }
    let frame = 0;
    const update = () => {
      frame = 0;
      const main = document.getElementById("main");
      const hero = main?.firstElementChild as HTMLElement | null;
      const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;
      setShown(heroBottom < 90 && scrollY > 120);
      const line = innerHeight * 0.32;
      let current: string | null = null;
      for (const c of chips) {
        const el = document.getElementById(c.id);
        if (el && el.getBoundingClientRect().top - line <= 0) current = c.id;
      }
      // At the very bottom the last short section can never reach the line.
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) current = chips[chips.length - 1].id;
      setActive(current);
    };
    const queue = () => { frame ||= requestAnimationFrame(update); };
    update();
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue, { passive: true });
    return () => { removeEventListener("scroll", queue); removeEventListener("resize", queue); cancelAnimationFrame(frame); };
  }, [chips]);

  // Let other floating UI (the live pill) step aside while the bar is visible.
  useEffect(() => {
    const root = document.documentElement;
    if (shown) root.dataset.sectionNav = "on";
    else delete root.dataset.sectionNav;
    return () => { delete root.dataset.sectionNav; };
  }, [shown]);

  // Keep the active chip in view inside the horizontal rail (without scrolling the page).
  useEffect(() => {
    const el = rail.current?.querySelector<HTMLElement>(`[data-chip="${CSS.escape(active || "")}"]`);
    const box = rail.current;
    if (!el || !box) return;
    const left = el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2;
    box.scrollTo({ left, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [active, shown]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    scrollToY(el.getBoundingClientRect().top + scrollY - NAV_OFFSET + 24);
    const focusable = el.querySelector<HTMLElement>("h2, h3");
    if (focusable) { focusable.setAttribute("tabindex", "-1"); focusable.focus({ preventScroll: true }); }
  };

  return (
    <AnimatePresence>
      {shown && chips.length >= 3 && (
        <motion.nav
          className="snav glass glass-strong"
          aria-label="On this page"
          initial={{ opacity: 0, y: -18, scale: 0.97, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -14, scale: 0.98, filter: "blur(4px)" }}
          transition={{ type: "spring", stiffness: 460, damping: 36 }}
        >
          <button type="button" className="snav-title" onClick={() => scrollToY(0)} aria-label={`Back to top${title ? ` of ${title}` : ""}`}>
            <ArrowUp size={14} />
            <span className="ellipsis">{title || "Top"}</span>
          </button>
          <div className="snav-chips" ref={rail}>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                data-chip={c.id}
                className={cx("snav-chip", active === c.id && "active")}
                aria-current={active === c.id ? "location" : undefined}
                onClick={() => jump(c.id)}
              >
                {active === c.id && <motion.span layoutId="snav-pill" className="snav-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                {c.label}
              </button>
            ))}
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}
