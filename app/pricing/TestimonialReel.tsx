"use client";

import { useEffect, useRef, useState } from "react";
import { vimeoEmbedUrl } from "@/lib/calls/vimeo";
import styles from "./pricing.module.css";

const AUTOPLAYED_KEY = "testimonial-reel-autoplayed";

// The iframe isn't mounted (so nothing autoplays) until the reel scrolls
// into view, at which point it mounts with autoplay=1 and no muted param.
// Browsers still gate unmuted autoplay behind their own media-engagement
// policy, so a first-time visitor's browser may hold it paused (or fall
// back to muted) until they interact with the page — that's a browser
// policy, not something controllable from the embed URL.
//
// Autoplay only ever fires once per browser tab session (tracked in
// sessionStorage). `shouldAutoplay` is decided once at mount and never
// changes afterward, so the iframe's src never churns mid-play — a
// viewer who paused it, then scrolls away and back (or refreshes),
// never gets restarted.
export function TestimonialReel({ url }: { url: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [shouldAutoplay] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(AUTOPLAYED_KEY) !== "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const node = frameRef.current;
    if (!node || inView) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView || !shouldAutoplay) return;
    try {
      sessionStorage.setItem(AUTOPLAYED_KEY, "1");
    } catch {
      // ignore — worst case it autoplays again next time
    }
  }, [inView, shouldAutoplay]);

  const base = vimeoEmbedUrl(url);
  let embedUrl: string | null = null;
  if (base && inView) {
    const withParams = new URL(base);
    if (shouldAutoplay) withParams.searchParams.set("autoplay", "1");
    withParams.searchParams.set("title", "0");
    withParams.searchParams.set("byline", "0");
    withParams.searchParams.set("portrait", "0");
    embedUrl = withParams.toString();
  }

  return (
    <div className={styles.testimonialReel}>
      <div className={styles.testimonialReelFrame} ref={frameRef}>
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title="1500 Blueprint student testimonials"
            allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-fullscreen"
          />
        ) : null}
      </div>
    </div>
  );
}
