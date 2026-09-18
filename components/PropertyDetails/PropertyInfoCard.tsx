'use client';

import { useEffect, useState } from 'react';
import type { Property } from '@/lib/types';
import { toTitleCase, formatCurrency } from '@/lib/mapUtils';

interface PropertyInfoCardProps {
  property: Property;
  onClose: () => void;
}

const CONFIDENCE_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
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
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <circle cx="6" cy="6" r="4.5" stroke="white" strokeWidth="1.3" />
        <path d="M6 4v2.5M6 8.5h.01" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  suspected: {
    label: 'Suspected',
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

export default function PropertyInfoCard({ property, onClose }: PropertyInfoCardProps) {
  const [imgState, setImgState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => { setImgState('loading'); }, [property.id]);

  const confidence = property.ownership.confidence ?? 'confirmed';
  const conf = CONFIDENCE_CONFIG[confidence] ?? CONFIDENCE_CONFIG.confirmed;
  const listedOwner = toTitleCase(property.assessorData?.ownerName || property.ownership.entity);
  const landValue = formatCurrency(property.assessorData?.landValue);
  const dataSource = property.assessorData?.dataSource || property.sources[0] || null;
  const title = toTitleCase(property.buildingName || property.address);

  // Manually supplied photo (public/images/properties) takes precedence over Street View —
  // used where Street View has no coverage or returns a bad angle
  const manualPhoto = property.photos?.[0];
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const streetViewUrl = mapsKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=736x370&location=${property.coordinates.lat},${property.coordinates.lng}&key=${mapsKey}&return_error_codes=true`
    : null;
  const imageUrl = manualPhoto || streetViewUrl;

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${property.coordinates.lat},${property.coordinates.lng}`;

  const anim = (delay: number): React.CSSProperties => ({
    animation: `section-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both`,
    animationDelay: `${delay}ms`,
  });

  return (
    <div
      className="absolute bottom-5 right-5 z-10 w-[400px] bg-[rgba(47,47,47,0.56)] backdrop-blur-[50px] border border-white/[0.17] rounded-2xl shadow-[0px_0px_10.7px_0px_rgba(0,0,0,0.1)]"
      style={{ maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto', animation: 'card-in 400ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
    >
      <div className="p-4">
        {/* Street view image */}
        <div style={anim(0)}>
          {imageUrl ? (
            <div className="rounded-xl border border-white/[0.24] h-[185px] overflow-hidden mb-4">
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
            <div className="rounded-xl border border-white/[0.24] h-[185px] mb-4 flex items-center justify-center text-xs text-white/40">
              Street view unavailable
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className="text-white text-[16px] leading-snug mb-[15px]" style={{ ...serifStyle, ...anim(60) }}>
          {title}
        </h2>

        {/* Confidence pill */}
        <div className="inline-flex items-center gap-2 border border-white/20 rounded-full px-3 py-[5px] mb-8" style={anim(100)}>
          {conf.icon}
          <span className="text-white text-[12px] leading-none">{conf.label}</span>
        </div>

        {/* Data fields */}
        <div className="space-y-6" style={anim(150)}>
          <div>
            <p className="text-white/50 text-[12px] mb-1">Listed owner</p>
            <p className="text-white text-[13px] leading-snug">{listedOwner}</p>
          </div>

          {landValue && (
            <div>
              <p className="text-white/50 text-[12px] mb-1">Estimated land value</p>
              <p className="text-white text-[13px]">{landValue}</p>
            </div>
          )}

          <div>
            <p className="text-white/50 text-[12px] mb-1">Property type</p>
            <p className="text-white text-[13px]">{CATEGORY_LABELS[property.category] ?? property.category}</p>
          </div>

          {dataSource && (
            <div>
              <p className="text-white/50 text-[12px] mb-1">Source</p>
              {SOURCE_URLS[dataSource] ? (
                <a
                  href={SOURCE_URLS[dataSource]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white text-[13px] underline underline-offset-2 decoration-white/40 hover:decoration-white/80 transition-colors"
                >
                  {dataSource}
                </a>
              ) : (
                <p className="text-white text-[13px]">{dataSource}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Google Maps button */}
      <div className="px-4 pb-4 mt-3" style={anim(200)}>
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
          <span className="text-white text-[13px]">See on Google Maps</span>
        </a>
      </div>
    </div>
  );
}
