import React, { useEffect, useRef } from 'react';

/**
 * LottieVerified component
 * Renders an official Lottie verified/payment received animation using lottie-web.
 * Gracefully provides an animated SVG fallback in test environments or before lottie-web initializes.
 */
export default function LottieVerified({ size = 120 }: { size?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<any>(null);

  useEffect(() => {
    let active = true;
    if (typeof window === 'undefined' || !containerRef.current) return;

    // Self-contained verified Lottie JSON payload (Green animated checkmark & pulse rings)
    const verifiedLottieData = {
      v: '5.7.4',
      fr: 60,
      ip: 0,
      op: 60,
      w: 120,
      h: 120,
      nm: 'Payment Verified',
      ddd: 0,
      assets: [],
      layers: [
        {
          ddd: 0,
          ind: 1,
          ty: 4,
          nm: 'Checkmark',
          sr: 1,
          ks: {
            o: { a: 0, k: 100 },
            r: { a: 0, k: 0 },
            p: { a: 0, k: [60, 60, 0] },
            a: { a: 0, k: [0, 0, 0] },
            s: {
              a: 1,
              k: [
                { i: { x: [0.16, 0.16, 0.16], y: [1, 1, 1] }, o: { x: [0.3, 0.3, 0.3], y: [0, 0, 0] }, t: 15, s: [0, 0, 100] },
                { i: { x: [0.16, 0.16, 0.16], y: [1, 1, 1] }, o: { x: [0.3, 0.3, 0.3], y: [0, 0, 0] }, t: 30, s: [115, 115, 100] },
                { t: 40, s: [100, 100, 100] },
              ],
            },
          },
          shapes: [
            {
              ty: 'gr',
              it: [
                {
                  ind: 0,
                  ty: 'sh',
                  ks: {
                    a: 0,
                    k: {
                      i: [[0, 0], [0, 0], [0, 0]],
                      o: [[0, 0], [0, 0], [0, 0]],
                      v: [[-18, 2], [-6, 14], [18, -12]],
                      c: false,
                    },
                  },
                },
                {
                  ty: 'st',
                  c: { a: 0, k: [0.176, 0.478, 0.345, 1] },
                  o: { a: 0, k: 100 },
                  w: { a: 0, k: 5 },
                  lc: 2,
                  lj: 2,
                },
                {
                  ty: 'tr',
                  p: { a: 0, k: [0, 0] },
                  a: { a: 0, k: [0, 0] },
                  s: { a: 0, k: [100, 100] },
                  r: { a: 0, k: 0 },
                  o: { a: 0, k: 100 },
                },
              ],
            },
          ],
        },
        {
          ddd: 0,
          ind: 2,
          ty: 4,
          nm: 'Circle Ring',
          sr: 1,
          ks: {
            o: { a: 0, k: 100 },
            r: { a: 0, k: 0 },
            p: { a: 0, k: [60, 60, 0] },
            a: { a: 0, k: [0, 0, 0] },
            s: {
              a: 1,
              k: [
                { i: { x: [0.16, 0.16, 0.16], y: [1, 1, 1] }, o: { x: [0.3, 0.3, 0.3], y: [0, 0, 0] }, t: 0, s: [0, 0, 100] },
                { t: 25, s: [100, 100, 100] },
              ],
            },
          },
          shapes: [
            {
              ty: 'el',
              p: { a: 0, k: [0, 0] },
              s: { a: 0, k: [88, 88] },
            },
            {
              ty: 'st',
              c: { a: 0, k: [0.176, 0.478, 0.345, 1] },
              o: { a: 0, k: 100 },
              w: { a: 0, k: 4 },
            },
            {
              ty: 'fl',
              c: { a: 0, k: [0.929, 0.969, 0.929, 1] },
              o: { a: 0, k: 100 },
            },
          ],
        },
      ],
    };

    // Dynamically load lottie-web
    import('lottie-web')
      .then(module => {
        if (!active || !containerRef.current) return;
        const lottie = (module as any).default || module;
        if (typeof lottie?.loadAnimation === 'function') {
          containerRef.current.innerHTML = '';
          animRef.current = lottie.loadAnimation({
            container: containerRef.current,
            renderer: 'svg',
            loop: false,
            autoplay: true,
            animationData: verifiedLottieData,
          });
        }
      })
      .catch(() => {
        // Fallback is already present in markup
      });

    return () => {
      active = false;
      if (animRef.current && typeof animRef.current.destroy === 'function') {
        animRef.current.destroy();
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="lottie-verified-wrapper"
      style={{
        width: size,
        height: size,
        margin: '0 auto',
        display: 'grid',
        placeItems: 'center',
      }}
      aria-label="Payment Verified Animation"
    >
      {/* High-fidelity CSS animated SVG fallback rendered before/if lottie-web initializes */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="lottie-fallback-svg"
      >
        <circle
          cx="60"
          cy="60"
          r="44"
          fill="#EDF7ED"
          stroke="#2D7A58"
          strokeWidth="4"
          className="svg-anim-circle"
        />
        <path
          d="M42 62L54 74L78 48"
          stroke="#2D7A58"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="svg-anim-check"
        />
      </svg>
    </div>
  );
}

