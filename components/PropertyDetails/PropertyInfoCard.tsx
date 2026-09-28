'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Property } from '@/lib/types';
import { toTitleCase, formatCurrency } from '@/lib/mapUtils';
import LiquidGlass from '@sohumsuthar/liquid-glass/components/LiquidGlass.jsx';
import '@sohumsuthar/liquid-glass/css/liquid-glass-core.css';
import { GlassPanel, useGlassStyle } from '@/lib/glass';

interface PropertyInfoCardProps {
  property: Property;
  onClose: () => void;
}

// Confirmed parcels show no pill — only the less-certain levels are flagged
const CONFIDENCE_CONFIG: Record<string, { label: string; icon: React.ReactNode; tooltip?: string }> = {
  confirmed: {
    label: 'Confirmed',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  probable: {
    label: 'Probable',
    tooltip: 'Owned through a university-named subsidiary or LLC, not directly by the university.',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <circle cx="6" cy="6" r="4.5" stroke="white" strokeWidth="1.3" />
        <path d="M6 4v2.5M6 8.5h.01" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  suspected: {
    label: 'Suspected',
    tooltip: 'Owner shares a mailing address with Harvard Real Estate.',
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <circle cx="6" cy="6" r="4.5" stroke="white" strokeWidth="1.3" />
        <path d="M6 4v2.5M6 8.5h.01" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  academic: 'Academic',
  residential: 'Residential',
  corporate: 'Corporate',
};

const SOURCE_URLS: Record<string, string> = {
  'Cambridge FY2026 Assessor':
    'https://github.com/cambridgegis/cambridgegis_data/tree/main/Assessing/FY2026/FY2026_Parcels',
  'Cambridge FY2026 Assessor + MIT 2023 990 Schedule R':
    'https://github.com/cambridgegis/cambridgegis_data/tree/main/Assessing/FY2026/FY2026_Parcels',
  'Boston FY2024 Assessor':
    'https://data.boston.gov/dataset/property-assessment/resource/062fc6fa-b5ff-4270-86cf-202225e40858',
  'Boston FY2026 Assessor (gisportal.boston.gov)':
    'https://gisportal.boston.gov/arcgis/rest/services/Assessing/PROPERTY_ASSESSMENT_PARCEL_JOIN_FY26/FeatureServer/0?f=html',
};

const serifStyle: React.CSSProperties = {
  fontFamily: 'var(--font-hedvig-serif), "Hedvig Letters Serif", serif',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 border-b border-white/[0.08]">
      <dt className="shrink-0 text-white/50">{label}</dt>
      <dd className="min-w-0 text-right text-white leading-snug">{children}</dd>
    </div>
  );
}

export default function PropertyInfoCard({ property, onClose }: PropertyInfoCardProps) {
  const [imgState, setImgState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => { setImgState('loading'); }, [property.id]);

  const glassStyle = useGlassStyle();
  // @sohumsuthar/liquid-glass keys its dark tint off html.dark; without it the white light-mode tint washes out our white text
  useEffect(() => {
    if (glassStyle !== 'sohum') return;
    document.documentElement.classList.add('dark');
    return () => document.documentElement.classList.remove('dark');
  }, [glassStyle]);

  // The confidence tooltip is portalled to <body>: inside the card, the card's own
  // backdrop-filter would stop it frosting anything but the card's contents
  const pillRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);
  const [tipVisible, setTipVisible] = useState(false);
  const showTip = () => {
    const r = pillRef.current?.getBoundingClientRect();
    if (!r) return;
    setTipPos({ left: r.left, top: r.top });
    setTipVisible(true);
  };
  const hideTip = () => setTipVisible(false);

  const confidence = property.ownership.confidence ?? 'confirmed';
  const conf = confidence === 'confirmed' ? null : CONFIDENCE_CONFIG[confidence] ?? null;
  const listedOwner = toTitleCase(property.assessorData?.ownerName || property.ownership.entity);
  const landValue = formatCurrency(property.assessorData?.landValue);
  const dataSource = property.assessorData?.dataSource || property.sources[0] || null;
  const title = toTitleCase(property.buildingName || property.address);

  // Manually supplied photo (public/images/properties) takes precedence over Street View —
  // used where Street View has no coverage or returns a bad angle
  const manualPhoto = property.photos?.[0];
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const streetViewUrl = mapsKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=656x370&location=${property.coordinates.lat},${property.coordinates.lng}&key=${mapsKey}&return_error_codes=true`
    : null;
  const imageUrl = manualPhoto || streetViewUrl;

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${property.coordinates.lat},${property.coordinates.lng}`;

  const anim = (delay: number): React.CSSProperties => ({
    animation: `section-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both`,
    animationDelay: `${delay}ms`,
  });

  const content = (
    <>
      <div className="p-4">
        {/* Street view image */}
        <div className="relative mb-4" style={anim(0)}>
          {imageUrl ? (
            <div className="rounded-xl border border-white/[0.24] h-[185px] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={imageUrl}
                src={imageUrl}
                alt={`${manualPhoto ? 'Photo' : 'Street view'} of ${title}`}
                className={`w-full h-full object-cover transition-opacity duration-300 ${imgState === 'ok' ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setImgState('ok')}
                onError={() => setImgState('error')}
              />
              {imgState === 'error' && (
                <div className="flex items-center justify-center h-full text-xs text-white/40">
                  {manualPhoto ? 'Photo unavailable' : 'Street view unavailable'}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.24] h-[185px] flex items-center justify-center text-xs text-white/40">
              Street view unavailable
            </div>
          )}

          <button
            onClick={onClose}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/25 backdrop-blur-md border border-white/[0.15] flex items-center justify-center text-white/80 hover:text-white hover:bg-black/40 transition-colors"
            aria-label="Close"
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Title */}
        <h2 className="text-white text-[16px] leading-snug mb-[15px]" style={{ ...serifStyle, ...anim(60) }}>
          {title}
        </h2>

        {/* Confidence pill */}
        {conf && (
          <div
            ref={pillRef}
            className="relative inline-flex items-center gap-2 border border-white/20 rounded-full px-3 py-[5px] mb-4 outline-none"
            style={anim(100)}
            tabIndex={conf.tooltip ? 0 : undefined}
            aria-describedby={conf.tooltip ? 'confidence-tooltip' : undefined}
            onMouseEnter={conf.tooltip ? showTip : undefined}
            onMouseLeave={conf.tooltip ? hideTip : undefined}
            onFocus={conf.tooltip ? e => { if (e.currentTarget.matches(':focus-visible')) showTip(); } : undefined}
            onBlur={conf.tooltip ? hideTip : undefined}
          >
            {conf.icon}
            <span className="text-white text-[12px] leading-none">{conf.label}</span>
          </div>
        )}
        {conf?.tooltip && tipPos && createPortal(
          // Same frosted style as the map's hover tooltip
          <div
            id="confidence-tooltip"
            role="tooltip"
            className="fixed z-30 pointer-events-none w-[220px] rounded-xl bg-black/10 backdrop-blur-[50px] border border-white/[0.07] px-3 py-2 text-white text-[12px] leading-snug transition-[opacity,transform] duration-150"
            style={{
              left: tipPos.left,
              top: tipPos.top - 8,
              opacity: tipVisible ? 1 : 0,
              transform: `translateY(calc(-100% + ${tipVisible ? 0 : 4}px))`,
            }}
          >
            {conf.tooltip}
          </div>,
          document.body,
        )}

        {/* Data fields — label left, value right, faint rules between */}
        <dl className="border-t border-white/[0.08] text-[12px]" style={anim(150)}>
          <Row label="Listed owner">{listedOwner}</Row>

          {landValue && <Row label="Estimated land value">{landValue}</Row>}

          <Row label="Property type">{CATEGORY_LABELS[property.category] ?? property.category}</Row>

          {dataSource && (
            <Row label="Source">
              {SOURCE_URLS[dataSource] ? (
                <a
                  href={SOURCE_URLS[dataSource]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 decoration-white/40 hover:decoration-white/80 transition-colors"
                >
                  {dataSource}
                </a>
              ) : (
                dataSource
              )}
            </Row>
          )}
        </dl>
      </div>

      {/* Google Maps button */}
      <div className="px-4 pb-4 mt-2" style={anim(200)}>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full h-[47px] bg-[rgba(217,217,217,0.12)] rounded-xl hover:bg-[rgba(217,217,217,0.18)] transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <path d="M6.5 1C4.29 1 2.5 2.79 2.5 5c0 2.85 4 7 4 7s4-4.15 4-7c0-2.21-1.79-4-4-4z" stroke="white" strokeWidth="1.2" fill="none" />
            <circle cx="6.5" cy="5" r="1.3" stroke="white" strokeWidth="1.2" />
          </svg>
          <span className="text-white text-[12px]">See on Google Maps</span>
        </a>
      </div>
    </>
  );

  if (glassStyle === 'sohum') {
    return (
      <div className="absolute bottom-5 right-5 z-10 w-[360px]">
        <LiquidGlass
          lens
          dimmed
          style={{
            '--lg-radius': '16px',
            // `backwards`, not `both`: a retained transform/filter on the glass would
            // make it a backdrop root and silently switch the refraction off
            animation: 'card-in 400ms cubic-bezier(0.16, 1, 0.3, 1) backwards',
          } as React.CSSProperties}
          contentStyle={{ maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto' }}
        >
          {content}
        </LiquidGlass>
      </div>
    );
  }

  return (
    <GlassPanel
      className="absolute bottom-5 right-5 z-10 w-[360px] rounded-2xl"
      originalClassName="bg-[rgba(47,47,47,0.56)] backdrop-blur-[50px] border border-white/[0.17] shadow-[0px_0px_10.7px_0px_rgba(0,0,0,0.1)]"
      style={{ maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto', animation: 'card-in 400ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
    >
      {content}
    </GlassPanel>
  );
}
