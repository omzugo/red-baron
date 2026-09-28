'use client';

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import PropertyMap from '@/components/Map/PropertyMap';
import PropertyInfoCard from '@/components/PropertyDetails/PropertyInfoCard';
import LoadingScreen from '@/components/LoadingScreen';
import type { Property, PropertyFilters, PropertyCategory, EntityType } from '@/lib/types';

type Institution = 'mit' | 'harvard';

const AVAILABLE_YEARS = [2026, 2024] as const;
type Year = typeof AVAILABLE_YEARS[number];

const YEAR_LABELS: Record<Year, string> = {
  2024: '2023',
  2026: '2025',
};

const INSTITUTION_NAMES: Record<Institution, string> = {
  mit: 'Massachusetts Institute of Technology',
  harvard: 'Harvard University',
};

const CATEGORIES: { value: PropertyCategory; label: string; color: string }[] = [
  { value: 'academic', label: 'Academic', color: '#ff4800' },
  { value: 'residential', label: 'Residential', color: '#9500ff' },
  { value: 'corporate', label: 'Corporate', color: '#008cff' },
];

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'direct', label: 'Direct' },
  { value: 'shell', label: 'Subsidiary' },
];

function formatUse(use?: string) {
  if (!use) return '';
  return use.replace(/[-_]/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function isShellEntity(entity: string): boolean {
  const u = entity.toUpperCase();
  return u.includes('LLC') || u.includes(' SPE') || u.includes(' INC') || u.includes('CORP') || u.includes('HOLDING');
}

function ToggleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="white" viewBox="0 0 256 256" aria-hidden>
      <path d="M240,56V200a8,8,0,0,1-8,8H160a24,24,0,0,0-24,23.94,7.9,7.9,0,0,1-5.12,7.55A8,8,0,0,1,120,232a24,24,0,0,0-24-24H24a8,8,0,0,1-8-8V56a8,8,0,0,1,8-8H88a32,32,0,0,1,32,32v87.73a8.17,8.17,0,0,0,7.47,8.25,8,8,0,0,0,8.53-8V80a32,32,0,0,1,32-32h64A8,8,0,0,1,240,56Z" />
    </svg>
  );
}

export default function Home() {
  const [institution, setInstitution] = useState<Institution>('harvard');
  const harvardTextRef = useRef<HTMLSpanElement>(null);
  const mitTextRef = useRef<HTMLSpanElement>(null);
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const ICON_GAP = 24; // 14px icon + 10px margin-right
    const BTN_PAD = 32;  // px-4 = 16px each side
    const INSET = 2;     // container px-0.5

    const hw = (harvardTextRef.current?.offsetWidth ?? 0) + BTN_PAD;
    const mw = (mitTextRef.current?.offsetWidth ?? 0) + BTN_PAD;

    setPillStyle(
      institution === 'harvard'
        ? { left: INSET, width: hw + ICON_GAP }
        : { left: INSET + hw, width: mw + ICON_GAP }
    );
  }, [institution]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [year, setYear] = useState<Year>(2026);
  // Both institutions are loaded so search can span them regardless of the toggle
  const [allProperties, setAllProperties] = useState<Record<Institution, Property[]>>({ mit: [], harvard: [] });
  const properties = allProperties[institution];
  const [dataReady, setDataReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const load = (key: Institution) =>
      fetch(`/data/${key}_fy${year}.json`).then(r => r.json() as Promise<Property[]>);
    Promise.all([load('mit'), load('harvard')]).then(([mit, harvard]) => {
      setAllProperties({ mit, harvard });
      setDataReady(true);
    });
  }, [year]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    // Current institution's matches first, then the other's
    const other: Institution = institution === 'mit' ? 'harvard' : 'mit';
    return [institution, other]
      .flatMap(key => allProperties[key].map(p => ({ property: p, institution: key })))
      .filter(({ property: p }) =>
        p.address.toLowerCase().includes(q) ||
        (p.buildingName?.toLowerCase().includes(q)) ||
        p.aliases?.some(alias => alias.toLowerCase().includes(q)) ||
        p.currentUse?.toLowerCase().includes(q) ||
        p.ownership.entity.toLowerCase().includes(q) ||
        p.assessorData?.ownerName?.toLowerCase().includes(q)
      )
      .slice(0, 7);
  }, [searchQuery, allProperties, institution]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!searchWrapperRef.current?.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [searchOpen]);

  const [filters, setFilters] = useState<PropertyFilters>({
    ownership: [],
    categories: [],
    entityTypes: [],
    searchQuery: '',
  });

  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [focusedPropertyId, setFocusedPropertyId] = useState<string | null>(null);
  const [isAtDefaultView, setIsAtDefaultView] = useState(true);
  const [resetViewKey, setResetViewKey] = useState(0);

  const toggleCategory = (cat: PropertyCategory) =>
    setFilters(f => ({
      ...f,
      categories: f.categories.length === 1 && f.categories[0] === cat ? [] : [cat],
    }));

  const toggleEntityType = (type: EntityType) =>
    setFilters(f => ({
      ...f,
      entityTypes: f.entityTypes.length === 1 && f.entityTypes[0] === type ? [] : [type],
    }));

  const handlePropertySelect = (property: Property) => {
    setSelectedProperty(property);
    setFocusedPropertyId(property.id);
    setIsAtDefaultView(false);
    setTimeout(() => setFocusedPropertyId(null), 100);
  };

  const switchInstitution = (key: Institution) => {
    setInstitution(key);
    setSelectedProperty(null);
    setIsAtDefaultView(true);
    setFilters(f => ({ ...f, categories: [], entityTypes: [] }));
  };

  const selectSearchResult = (property: Property, key: Institution) => {
    if (key !== institution) switchInstitution(key);
    handlePropertySelect(property);
    setSearchOpen(false);
    setSearchQuery('');
  };

  const resetToDefaultView = () => {
    setResetViewKey(k => k + 1);
    setIsAtDefaultView(true);
  };

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      {/* Fullscreen map */}
      <PropertyMap
        properties={properties}
        filters={filters}
        selectedProperty={selectedProperty}
        onPropertySelect={handlePropertySelect}
        focusedPropertyId={focusedPropertyId}
        institution={institution}
        resetViewTrigger={resetViewKey}
        onUserMove={() => setIsAtDefaultView(false)}
        onDeselect={() => setSelectedProperty(null)}
        onReady={() => setMapReady(true)}
      />

      <LoadingScreen loaded={mapReady && dataReady} />

      {/* Search — top left */}
      <div ref={searchWrapperRef} className="absolute top-5 left-5 z-20">
        {/* Expanding pill */}
        <div
          className="relative h-11 rounded-full flex items-center overflow-hidden bg-black/10 backdrop-blur-[50px] border border-white/[0.07]"
          style={{
            width: searchOpen ? 272 : 44,
            transition: 'width 350ms ease-in-out',
          }}
        >
          <button
            onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 40); }}
            className="w-11 h-11 shrink-0 flex items-center justify-center"
            aria-label="Search"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="4.5" stroke="white" strokeWidth="1.4" strokeOpacity="0.8" />
              <path d="M10.5 10.5L13.5 13.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.8" />
            </svg>
          </button>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search properties…"
            className="flex-1 min-w-0 bg-transparent outline-none text-white text-[12px] placeholder:text-white/35 pr-2"
            style={{
              opacity: searchOpen ? 1 : 0,
              pointerEvents: searchOpen ? 'auto' : 'none',
              transition: 'opacity 200ms ease-in-out',
            }}
          />
          {searchOpen && searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="w-8 h-8 shrink-0 mr-1.5 flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
              aria-label="Clear"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Results dropdown */}
        {searchOpen && searchResults.length > 0 && (
          <div
            className="mt-2 rounded-2xl overflow-hidden bg-black/10 backdrop-blur-[50px] border border-white/[0.07]"
            style={{ animation: 'search-results-in 200ms ease-out' }}
          >
            {searchResults.map(({ property: p, institution: key }, i) => (
              <button
                key={p.id}
                onClick={() => selectSearchResult(p, key)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors text-left ${i > 0 ? 'border-t border-white/[0.06]' : ''}`}
              >
                <span className="flex-1 min-w-0 flex flex-col items-start gap-0.5">
                  <span className="text-white text-[12px] leading-tight">{p.buildingName || p.address}</span>
                  <span className="text-white/45 text-[11px] leading-tight">
                    {p.buildingName ? p.address : (formatUse(p.currentUse) || p.category)}
                  </span>
                </span>
                {key !== institution && (
                  <span className="shrink-0 text-white/40 text-[10px] leading-none">
                    {key === 'mit' ? 'MIT' : 'Harvard'}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* No results */}
        {searchOpen && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
          <div
            className="mt-2 rounded-2xl px-4 py-3 bg-black/10 backdrop-blur-[50px] border border-white/[0.07]"
            style={{ animation: 'search-results-in 200ms ease-out' }}
          >
            <span className="text-white/40 text-[12px]">No results</span>
          </div>
        )}
      </div>

      {/* Reset-view button — top right */}
      <button
        onClick={resetToDefaultView}
        className={`absolute top-5 right-5 z-10 w-11 h-11 flex items-center justify-center transition-opacity ${isAtDefaultView ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}
        aria-label="Reset to default view"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M2 6V2h4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8"/>
          <path d="M14 6V2h-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8"/>
          <path d="M2 10v4h4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8"/>
          <path d="M14 10v4h-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.8"/>
        </svg>
      </button>

      {/* Institution toggle — top center */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10">
        <div
          className="relative flex items-center h-11 rounded-full px-0.5 overflow-hidden bg-black/10 backdrop-blur-[50px]"
        >
          {/* Sliding pill */}
          {pillStyle && (
            <div
              className="absolute top-0.5 bottom-0.5 rounded-full bg-[rgba(109,109,109,0.2)] pointer-events-none"
              style={{
                left: pillStyle.left,
                width: pillStyle.width,
                transition: 'left 350ms ease-in-out, width 350ms ease-in-out',
              }}
            />
          )}
          {/* Harvard — left */}
          <button
            onClick={() => switchInstitution('harvard')}
            className="relative z-10 flex items-center h-10 px-4"
          >
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              maxWidth: institution === 'harvard' ? '14px' : '0px',
              marginRight: institution === 'harvard' ? '10px' : '0px',
              overflow: 'hidden',
              opacity: institution === 'harvard' ? 1 : 0,
              filter: institution === 'harvard' ? 'blur(0px)' : 'blur(4px)',
              flexShrink: 0,
              transition: 'max-width 350ms ease-in-out, margin-right 350ms ease-in-out, opacity 350ms ease-in-out, filter 350ms ease-in-out',
            }}>
              <ToggleIcon />
            </span>
            <span
              ref={harvardTextRef}
              className="text-[12px] text-white whitespace-nowrap leading-none"
              style={{
                opacity: institution === 'harvard' ? 1 : 0.55,
                transition: 'opacity 350ms ease-in-out',
              }}
            >
              {INSTITUTION_NAMES.harvard}
            </span>
          </button>
          {/* MIT — right */}
          <button
            onClick={() => switchInstitution('mit')}
            className="relative z-10 flex items-center h-10 px-4"
          >
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              maxWidth: institution === 'mit' ? '14px' : '0px',
              marginRight: institution === 'mit' ? '10px' : '0px',
              overflow: 'hidden',
              opacity: institution === 'mit' ? 1 : 0,
              filter: institution === 'mit' ? 'blur(0px)' : 'blur(4px)',
              flexShrink: 0,
              transition: 'max-width 350ms ease-in-out, margin-right 350ms ease-in-out, opacity 350ms ease-in-out, filter 350ms ease-in-out',
            }}>
              <ToggleIcon />
            </span>
            <span
              ref={mitTextRef}
              className="text-[12px] text-white whitespace-nowrap leading-none"
              style={{
                opacity: institution === 'mit' ? 1 : 0.55,
                transition: 'opacity 350ms ease-in-out',
              }}
            >
              {INSTITUTION_NAMES.mit}
            </span>
          </button>
        </div>
      </div>

      {/* Legend / filter panel — bottom left */}
      <div className="absolute bottom-5 left-5 z-10 select-none">
        {/* Year filter */}
        <p className="text-white/80 text-[12px] mb-3 tracking-wide">Year</p>
        <div className="flex flex-col gap-3 mb-[38px]">
          {AVAILABLE_YEARS.map(y => {
            const active = y === year;
            return (
              <button
                key={y}
                onClick={() => { if (!active) { setYear(y); setSelectedProperty(null); } }}
                className="flex items-center gap-4 p-0 leading-none"
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${active ? 'bg-white' : 'bg-white/30'}`} />
                <span
                  className={`text-white text-[12px] leading-none transition-opacity ${active ? 'opacity-100' : 'opacity-40'}`}
                  style={{ fontFamily: 'var(--font-hedvig-serif), "Hedvig Letters Serif", serif' }}
                >
                  {YEAR_LABELS[y]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Property types */}
        <p className="text-white/80 text-[12px] mb-3 tracking-wide">Property</p>
        <div className="flex flex-col gap-3 mb-[38px]">
          {CATEGORIES.map(({ value, label, color }) => {
            const count = properties.filter(p => p.category === value).length;
            const isActive = filters.categories.length === 0 || filters.categories.includes(value);
            return (
              <button
                key={value}
                onClick={() => toggleCategory(value)}
                className={`flex items-center gap-4 transition-opacity ${isActive ? 'opacity-100' : 'opacity-40'}`}
              >
                <div className="w-2 h-2 shrink-0" style={{ backgroundColor: color }} />
                <span
                  className="text-white text-[12px] leading-none"
                  style={{ fontFamily: 'var(--font-hedvig-serif), "Hedvig Letters Serif", serif' }}
                >
                  {label}
                  <sup className="text-[8px] ml-0.5" style={{ fontFamily: 'var(--font-hedvig-sans), "Hedvig Letters Sans", sans-serif' }}>{count}</sup>
                </span>
              </button>
            );
          })}
        </div>

        {/* Ownership types */}
        <p className="text-white/80 text-[12px] mb-3 tracking-wide">Ownership</p>
        <div className="flex flex-col gap-3">
          {ENTITY_TYPES.map(({ value, label }) => {
            const count = properties.filter(p => {
              const shell = isShellEntity(p.ownership.entity);
              return value === 'shell' ? shell : !shell;
            }).length;
            const isActive = filters.entityTypes.length === 0 || filters.entityTypes.includes(value);
            return (
              <button
                key={value}
                onClick={() => toggleEntityType(value)}
                className="flex items-center gap-4"
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${isActive ? 'bg-white' : 'bg-white/30'}`} />
                <span
                  className={`text-white text-[12px] leading-none transition-opacity ${isActive ? 'opacity-100' : 'opacity-40'}`}
                  style={{ fontFamily: 'var(--font-hedvig-serif), "Hedvig Letters Serif", serif' }}
                >
                  {label}
                  <sup className="text-[8px] ml-0.5" style={{ fontFamily: 'var(--font-hedvig-sans), "Hedvig Letters Sans", sans-serif' }}>{count}</sup>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Property info card — right side */}
      {selectedProperty && (
        <PropertyInfoCard
          key={selectedProperty.id}
          property={selectedProperty}
          onClose={() => setSelectedProperty(null)}
        />
      )}
    </div>
  );
}
