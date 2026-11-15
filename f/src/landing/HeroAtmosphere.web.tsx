import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import "./hero-atmosphere.css";

function Cloud({ className }: { className: string }) {
  return (
    <div className={`hero-sky-cloud ${className}`}>
      <svg viewBox="0 0 210 120" fill="none" focusable="false">
        <path d="M43 91C8 91 7 47 39 43 40 15 75 5 94 26c20-17 55-3 55 24 36-7 51 40 15 41H43Z" transform="translate(4 7)" fill="var(--cloud-edge)" fillOpacity=".2" />
        <path d="M43 91C8 91 7 47 39 43 40 15 75 5 94 26c20-17 55-3 55 24 36-7 51 40 15 41H43Z" fill="currentColor" stroke="var(--cloud-edge)" strokeOpacity=".32" strokeWidth="1.5" />
        <path d="M39 43c11-2 20 2 25 9m85-2c-8 0-16 4-20 10" stroke="var(--cloud-edge)" strokeOpacity=".3" strokeWidth="2" strokeLinecap="round" />
        <path d="M52 34c6-10 18-13 26-8" stroke="var(--ankelba-card)" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function HeroAtmosphere() {
  const reduce = useReducedMotion();
  const sky = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const playing = !reduce && !paused && visible && tabVisible;

  useEffect(() => {
    const node = sky.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(node);
    const onVisibility = () => setTabVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  return (
    <>
      <div ref={sky} className="hero-sky" aria-hidden="true" data-playing={playing}>
        <div className="hero-sky-sun">
          <svg viewBox="0 0 140 140" fill="none" focusable="false">
            <g className="hero-sky-rays" stroke="var(--pastel-yellow-text)" strokeWidth="5" strokeLinecap="round">
              <path d="M70 10v12m0 96v12M10 70h12m96 0h12M28 28l9 9m66 66 9 9M28 112l9-9m66-66 9-9M47 15l5 12m36 86 5 12M15 93l12-5m86-36 12-5M15 47l12 5m86 36 12 5M47 125l5-12m36-86 5-12" />
            </g>
            <circle cx="70" cy="70" r="34" fill="var(--ankelba-gold)" fillOpacity=".9" />
            <circle cx="70" cy="70" r="25" fill="var(--pastel-yellow)" />
          </svg>
        </div>
        <Cloud className="cloud-near-left" />
        <Cloud className="cloud-near-right" />
        <Cloud className="cloud-far-left" />
        <Cloud className="cloud-far-right" />
        <Cloud className="cloud-low-right" />
        <Cloud className="cloud-upper-left" />
        <Cloud className="cloud-upper-right" />
        <Cloud className="cloud-low-left" />

        <svg className="hero-sky-toy hero-sky-kite" viewBox="0 0 110 200" fill="none" focusable="false">
          <path className="hero-sky-kite-tail" d="M55 102c26 29-26 24-7 49s-5 25-8 38" stroke="var(--pastel-purple-text)" strokeWidth="2" strokeLinecap="round" />
          <path d="m55 10 40 43-40 50L15 53Z" fill="var(--pastel-purple)" stroke="var(--pastel-purple-text)" strokeOpacity=".55" strokeWidth="2" strokeLinejoin="round" />
          <path d="M55 10v93L15 53h80" stroke="var(--pastel-purple-text)" strokeOpacity=".3" strokeWidth="1.5" />
          <path d="m55 10 40 43H55Z" fill="var(--pastel-pink)" />
          <path d="m55 103-40-50h40Z" fill="var(--pastel-cyan)" />
          <path d="m46 139-9-8v14Zm3 0 10-7v14Z" fill="var(--pastel-purple-text)" fillOpacity=".5" />
          <path d="m47 172-9-8v14Zm3 0 10-7v14Z" fill="var(--pastel-pink-text)" fillOpacity=".4" />
        </svg>

        <div className="hero-sky-rainbow">
          <svg viewBox="0 0 160 115" fill="none" focusable="false">
            <path d="M15 98a65 65 0 0 1 130 0" stroke="var(--ankelba-coral)" strokeWidth="12" strokeLinecap="round" strokeOpacity=".85" />
            <path d="M34 98a46 46 0 0 1 92 0" stroke="var(--ankelba-gold)" strokeWidth="11" strokeLinecap="round" strokeOpacity=".9" />
            <path d="M52 98a28 28 0 0 1 56 0" stroke="var(--ankelba-green)" strokeWidth="10" strokeLinecap="round" strokeOpacity=".75" />
          </svg>
        </div>

        <svg className="hero-sky-toy hero-sky-balloon" viewBox="0 0 100 190" fill="none" focusable="false">
          <path d="M50 101c-20 29 20 42 0 77" stroke="var(--pastel-peach-text)" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="50" cy="52" rx="34" ry="43" fill="var(--pastel-pink)" stroke="var(--pastel-pink-text)" strokeOpacity=".3" strokeWidth="2" />
          <path d="M50 10C33 30 33 72 50 94c17-22 17-64 0-84Z" fill="var(--pastel-peach)" />
          <path d="m50 94-7 10h14Z" fill="var(--pastel-pink-text)" fillOpacity=".45" />
          <path d="M33 27c-5 5-8 13-8 20" stroke="var(--ankelba-card)" strokeWidth="5" strokeLinecap="round" />
        </svg>

        <svg className="hero-sky-toy hero-sky-ball" viewBox="0 0 100 110" fill="none" focusable="false">
          <ellipse cx="50" cy="101" rx="29" ry="5" fill="var(--pastel-cyan-text)" fillOpacity=".12" />
          <g className="hero-sky-ball-spin">
            <circle cx="50" cy="48" r="38" fill="var(--pastel-cyan)" stroke="var(--pastel-cyan-text)" strokeOpacity=".65" strokeWidth="2" />
            <path d="M50 10c-24 20-24 56 0 76 24-20 24-56 0-76Z" fill="var(--ankelba-gold)" fillOpacity=".8" />
            <path d="M13 48h74" stroke="var(--pastel-cyan-text)" strokeOpacity=".45" strokeWidth="2" />
            <path d="M28 27c-4 4-7 10-7 15" stroke="var(--ankelba-card)" strokeWidth="5" strokeLinecap="round" />
          </g>
        </svg>

        <svg className="hero-sky-toy hero-sky-crayons" viewBox="0 0 120 150" fill="none" focusable="false">
          <g transform="rotate(-18 45 80)">
            <path d="m31 36 14-23 14 23v94a6 6 0 0 1-6 6H37a6 6 0 0 1-6-6Z" fill="var(--pastel-purple)" stroke="var(--pastel-purple-text)" strokeWidth="2" strokeLinejoin="round" />
            <path d="m37 26 8-13 8 13Z" fill="var(--pastel-purple-text)" />
            <path d="M32 51h26v54H32Z" fill="var(--pastel-purple-text)" fillOpacity=".7" />
            <path d="M39 61v34" stroke="var(--ankelba-card)" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g transform="rotate(16 82 84)">
            <path d="m69 43 13-22 13 22v87a6 6 0 0 1-6 6H75a6 6 0 0 1-6-6Z" fill="var(--pastel-peach)" stroke="var(--ankelba-coral)" strokeWidth="2" strokeLinejoin="round" />
            <path d="m75 32 7-11 7 11Z" fill="var(--ankelba-coral)" />
            <path d="M70 56h24v50H70Z" fill="var(--ankelba-coral)" fillOpacity=".8" />
            <path d="M77 65v30" stroke="var(--ankelba-card)" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" />
          </g>
        </svg>

        <svg className="hero-sky-toy hero-sky-blocks" viewBox="0 0 135 150" fill="none" focusable="false">
          <g className="hero-sky-block-top"><path d="m48 62 27-44a6 6 0 0 1 10 0l27 44Z" fill="var(--pastel-pink)" stroke="var(--pastel-pink-text)" strokeOpacity=".4" strokeWidth="2" strokeLinejoin="round" /><circle cx="80" cy="45" r="5" fill="var(--pastel-pink-text)" fillOpacity=".3" /></g>
          <rect x="15" y="73" width="54" height="54" rx="13" fill="var(--pastel-cyan)" stroke="var(--pastel-cyan-text)" strokeOpacity=".5" strokeWidth="2" />
          <rect x="70" y="73" width="54" height="54" rx="13" fill="var(--pastel-yellow)" stroke="var(--pastel-yellow-text)" strokeOpacity=".5" strokeWidth="2" />
          <path d="m42 87 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z" fill="var(--pastel-cyan-text)" fillOpacity=".3" />
          <circle cx="97" cy="100" r="13" stroke="var(--pastel-yellow-text)" strokeWidth="3" strokeOpacity=".35" />
        </svg>

        <svg className="hero-sky-toy hero-sky-plane" viewBox="0 0 190 105" fill="none" focusable="false">
          <path d="M5 88c48 0 16-46 51-43 28 2 9 41-14 15" stroke="var(--pastel-cyan-text)" strokeOpacity=".45" strokeWidth="2" strokeDasharray="4 6" strokeLinecap="round" />
          <g className="hero-sky-plane-body"><path d="m78 43 94-30-36 68-17-27Z" fill="var(--ankelba-card)" stroke="var(--pastel-cyan-text)" strokeOpacity=".55" strokeWidth="2" strokeLinejoin="round" /><path d="m119 54 53-41-43 52-10 15V54Z" fill="var(--pastel-cyan)" stroke="var(--pastel-cyan-text)" strokeOpacity=".3" strokeLinejoin="round" /></g>
        </svg>

        <svg className="hero-sky-toy hero-sky-flower" viewBox="0 0 100 150" fill="none" focusable="false">
          <path d="M50 76v61m0-24c-23 0-29-14-29-14 24-3 29 14 29 14Zm0 10c22 0 29-14 29-14-23-3-29 14-29 14Z" stroke="var(--ankelba-green)" strokeOpacity=".5" strokeWidth="2" fill="var(--pastel-green)" strokeLinecap="round" />
          <g className="hero-sky-petals" fill="var(--pastel-peach)" stroke="var(--pastel-pink-text)" strokeOpacity=".25" strokeWidth="1.5"><ellipse cx="50" cy="35" rx="13" ry="21" /><ellipse cx="50" cy="71" rx="13" ry="21" /><ellipse cx="32" cy="53" rx="21" ry="13" /><ellipse cx="68" cy="53" rx="21" ry="13" /></g>
          <circle cx="50" cy="53" r="13" fill="var(--ankelba-gold)" fillOpacity=".65" />
        </svg>

        {["one", "two", "three"].map(name => <svg key={name} className={`hero-sky-spark spark-${name}`} viewBox="0 0 40 40" fill="none" focusable="false"><path d="m20 3 4 13 13 4-13 4-4 13-4-13-13-4 13-4Z" fill="currentColor" /></svg>)}
        <span className="hero-sky-dot dot-one" />
        <span className="hero-sky-dot dot-two" />
        <span className="hero-sky-dot dot-three" />
      </div>
      {!reduce && <button type="button" className="hero-sky-control" aria-label={paused ? "Play background animation" : "Pause background animation"} aria-pressed={paused} onClick={() => setPaused(value => !value)}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">{paused ? <path d="m7 4 9 6-9 6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /> : <path d="M7 5v10m6-10v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}</svg>
      </button>}
    </>
  );
}
