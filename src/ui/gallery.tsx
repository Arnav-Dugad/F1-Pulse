import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import type { GalleryImage } from "../lib/media";
import { Img, cx } from "./core";
import "./gallery.css";

/**
 * Photo grid + full-screen lightbox (swipe, arrow keys, Esc). Renders nothing for an empty list.
 * The lightbox carries `data-swipe-ignore` so global swipe navigation leaves it alone.
 */
export function Gallery({ images, label, className }: { images: GalleryImage[]; label: string; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length) return null;
  const shown = images.slice(0, 9);
  return (
    <>
      <ul className={cx("gal", `n${Math.min(shown.length, 5)}`, className)} aria-label={label}>
        {shown.map((img, i) => (
          <li key={img.src} className="gal-cell reveal" style={{ "--i": i } as CSSProperties}>
          <button type="button" className="gal-tile" onClick={() => setOpen(i)}
            aria-label={`Open photo ${i + 1} of ${images.length}${img.caption ? `: ${img.caption}` : ""}`}>
            <Img src={img.src} alt={img.caption || `${label} — photo ${i + 1}`} />
            <span className="gal-tile-shade" aria-hidden />
            {img.caption && <span className="gal-tile-cap">{img.caption}</span>}
            <span className="gal-tile-zoom" aria-hidden><Expand size={14} /></span>
          </button>
          </li>
        ))}
      </ul>
      {images.length > shown.length && (
        <button type="button" className="btn sm gal-more" onClick={() => setOpen(shown.length)}>View all {images.length} photos</button>
      )}
      {createPortal(
        <AnimatePresence>{open !== null && <Lightbox key="gal-lb" images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} label={label} />}</AnimatePresence>,
        document.body,
      )}
    </>
  );
}

function Lightbox({ images, index, onIndex, onClose, label }: { images: GalleryImage[]; index: number; onIndex: (i: number) => void; onClose: () => void; label: string }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const [dir, setDir] = useState(0);
  const [drag, setDrag] = useState(0);
  const n = images.length;
  const go = (d: number) => { setDir(d); onIndex((index + d + n) % n); };
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") goRef.current(1);
      else if (e.key === "ArrowLeft") goRef.current(-1);
      else if (e.key === "Tab" && root.current) {
        // Keep focus inside the dialog.
        const f = [...root.current.querySelectorAll<HTMLElement>("button")];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    // Stop swipe gestures here from reaching any page-level swipe navigation.
    const el = root.current;
    const stop = (e: Event) => e.stopPropagation();
    const kinds = ["touchstart", "touchmove", "touchend", "pointerdown", "pointerup"] as const;
    kinds.forEach((k) => el?.addEventListener(k, stop));
    return () => {
      document.removeEventListener("keydown", key);
      kinds.forEach((k) => el?.removeEventListener(k, stop));
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const down = (e: ReactPointerEvent) => { start.current = { x: e.clientX, y: e.clientY, t: Date.now() }; };
  const move = (e: ReactPointerEvent) => { if (start.current && n > 1) setDrag(e.clientX - start.current.x); };
  const up = (e: ReactPointerEvent) => {
    const s = start.current;
    start.current = null;
    setDrag(0);
    if (!s || n < 2) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    const fast = Math.abs(dx) / Math.max(1, Date.now() - s.t) > 0.45;
    if (Math.abs(dx) > Math.abs(dy) && (Math.abs(dx) > 60 || (fast && Math.abs(dx) > 24))) go(dx < 0 ? 1 : -1);
  };

  const img = images[index];
  return (
    <>
      <motion.div className="backdrop gal-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
      <motion.div ref={root} className="gal-lb" role="dialog" aria-modal="true" aria-label={`${label} — photo viewer`} data-swipe-ignore
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: "spring", stiffness: 360, damping: 34 }}>
        <div className="gal-lb-head">
          <span className="gal-lb-count" aria-live="polite">{index + 1} / {n}</span>
          <button type="button" ref={closeRef} className="icon-btn gal-lb-close" onClick={onClose} aria-label="Close photo viewer"><X /></button>
        </div>
        <div className="gal-lb-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setDrag(0); }}>
          <AnimatePresence initial={false} custom={dir} mode="popLayout">
            <motion.img
              key={img.src}
              src={img.src}
              alt={img.caption || `${label} — photo ${index + 1}`}
              draggable={false}
              custom={dir}
              initial={{ opacity: 0, x: dir * 80 }}
              animate={{ opacity: 1, x: drag }}
              exit={{ opacity: 0, x: dir * -80 }}
              transition={drag ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 32 }}
            />
          </AnimatePresence>
          {n > 1 && (
            <>
              <button type="button" className="gal-lb-nav prev" onClick={() => go(-1)} aria-label="Previous photo"><ChevronLeft /></button>
              <button type="button" className="gal-lb-nav next" onClick={() => go(1)} aria-label="Next photo"><ChevronRight /></button>
            </>
          )}
        </div>
        {(img.caption || img.credit) && (
          <p className="gal-lb-cap">
            {img.caption && <span>{img.caption}</span>}
            {img.credit && <small>{img.credit}</small>}
          </p>
        )}
        {n > 1 && (
          <div className="gal-lb-dots" aria-hidden>
            {images.map((x, i) => <i key={x.src} className={cx(i === index && "on")} />)}
          </div>
        )}
      </motion.div>
    </>
  );
}
