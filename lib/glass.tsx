'use client';

import { useSyncExternalStore } from 'react';
import { Glass } from '@samasante/liquid-glass';

// EXPERIMENT: liquid glass property info card (search, toggle and tooltips stay on the original frost).
// Pick which card style to show:
//   'original' — the frosted card from before the experiments
//   'sohum'    — @sohumsuthar/liquid-glass (https://sohumsuthar.github.io/liquid-glass/)
//   'sama'     — @samasante/liquid-glass (https://github.com/samasante/liquid-glass)
// Per-visit override without editing: ?glass=original | sohum | sama  (?glass=off = original)
export type GlassStyle = 'original' | 'sohum' | 'sama';
const GLASS_STYLE: GlassStyle = 'sama';

function glassStyleFromUrl(): GlassStyle {
  const param = new URLSearchParams(window.location.search).get('glass');
  if (param === 'off') return 'original';
  if (param === 'original' || param === 'sohum' || param === 'sama') return param;
  return GLASS_STYLE;
}

const subscribe = () => () => {};

// Server render uses the default; the URL override applies once hydrated (no mismatch)
export function useGlassStyle(): GlassStyle {
  return useSyncExternalStore(subscribe, glassStyleFromUrl, () => GLASS_STYLE);
}

// Module-level so the lens isn't rebuilt on every render (the package memoizes on identity)
const GLASS_OPTICS = {
  frost: 28,     // backdrop blur in px (package default 6)
  specular: 0.6, // edge hairline + top highlight brightness (default 1)
  sheen: 0.2,    // directional rim gloss (default 0.32)
};
const GLASS_TINT = 'rgba(40,40,40,0.3)';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Layout classes shared by both looks (position, size, radius, padding…) */
  className: string;
  /** The pre-experiment surface classes (tint, blur, border), used when glass is off */
  originalClassName: string;
  /** The glass wrapper sets display inline, overriding a `flex` class — restate it here */
  display?: React.CSSProperties['display'];
}

/** A surface that renders as liquid glass in 'sama' mode and as the original frosted look otherwise. */
export function GlassPanel({ className, originalClassName, display = 'block', style, children, ...rest }: GlassPanelProps) {
  const glassStyle = useGlassStyle();

  if (glassStyle === 'sama') {
    return (
      <Glass
        {...rest}
        className={className}
        optics={GLASS_OPTICS}
        style={{ background: GLASS_TINT, display, ...style }}
      >
        {children}
      </Glass>
    );
  }

  return (
    <div {...rest} className={`${className} ${originalClassName}`} style={style}>
      {children}
    </div>
  );
}
