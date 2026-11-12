// Map icon set (style B, "engineering shapes"): the outline shape shows the asset family,
// the symbol inside shows the type, colour shows fuel / asset family.
//   circle = generation · hexagon = storage · square = substation / network
//   diamond = gas network · triangle = demand
// Used by the map (MapVisualization) and the legend (Help > Asset legend).

export type IconFamily = 'gen' | 'store' | 'net' | 'gasnet' | 'demand' | 'event';

// Symbols on a 24x24 grid. "#0f172a" marks cut-outs drawn in the background colour.
export const GLYPHS: Record<string, string> = {
  nuclear:  '<circle cx="12" cy="12" r="2.2"/><path d="M12 9.8 9.3 5.2a7.6 7.6 0 0 1 5.4 0zM10.1 13.1l-5.3.1a7.6 7.6 0 0 0 2.7 4.7zM13.9 13.1l5.3.1a7.6 7.6 0 0 1-2.7 4.7z"/>',
  gas:      '<path d="M12 3.5c3 3.6 5 6.3 5 9.3a5 5 0 0 1-10 0c0-1.9.8-3.4 2-4.8.2 1.6 1 2.7 2.2 3 0-2.8-.1-4.8.8-7.5z"/>',
  coal:     '<path d="M4 19V10l4 2.5V10l4 2.5V10l4 2.5V5h3v14z"/>',
  biomass:  '<path d="M18.5 4.5C10 4.5 5.5 9 5.5 15.2c0 1.2.2 2.3.6 3.3l1.6-1.7c2-4.2 4.7-6.7 8.3-8.1-2.9 2-5.1 4.6-6.5 7.9 6.2.3 9-4.1 9-12.1z"/>',
  windOff:  '<path d="M11.2 11 12 3l.8 8zM12.7 12.6l6.6 4.6-7.3-3.3zM11.3 12.6l-6.6 4.6 7.3-3.3z"/><circle cx="12" cy="12" r="1.4"/><path d="M11.4 13.4h1.2v4.4h-1.2z"/><path d="M5 20.5c1.2-.9 2.3-.9 3.5 0s2.3.9 3.5 0 2.3-.9 3.5 0 2.3.9 3.5 0" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  windOn:   '<path d="M11.2 11 12 3l.8 8zM12.7 12.6l6.6 4.6-7.3-3.3zM11.3 12.6l-6.6 4.6 7.3-3.3z"/><circle cx="12" cy="12" r="1.4"/><path d="M11.4 13.4h1.2V21h-1.2z"/>',
  solar:    '<path d="M3.5 17.5 6 8h12l2.5 9.5z" /><path d="M9.6 8 8.8 17.5M14.4 8l.8 9.5M4.8 12.7h14.4" stroke="#0f172a" stroke-width="1" fill="none"/>',
  battery:  '<rect x="5" y="7" width="13" height="10" rx="1.5"/><rect x="18.5" y="10" width="1.8" height="4" rx=".5"/><path d="M11.8 8.5 8.6 12.6h2.6l-.9 3.6 3.3-4.3H11z" fill="#0f172a"/>',
  pumped:   '<path d="M3 15c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0v5H3z"/><path d="M12 3v8m0 0-3-3m3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  hydro:    '<path d="M12 3.5c3.5 4.6 5.5 7.6 5.5 10.4a5.5 5.5 0 0 1-11 0c0-2.8 2-5.8 5.5-10.4z"/>',
  substation:'<path d="M12 3 4 7.5v9L12 21l8-4.5v-9z"/><path d="M12.9 6.5 9.2 12.7h2.6l-.9 4.8 4-6.8h-2.6z" fill="#0f172a"/>',
  primary:  '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M12.8 7.5 9.6 12.6h2.3l-.8 3.9 3.4-5.6h-2.3z" fill="#0f172a"/>',
  converter:'<rect x="4" y="6" width="16" height="12" rx="1.5"/><path d="M7 14.5c1-2.6 2-2.6 3 0s2 2.6 3 0M14.5 10.5h3M14.5 13.5h3" fill="none" stroke="#0f172a" stroke-width="1.4"/>',
  gasTerm:  '<path d="M4 20V11l5-3v3l5-3v3l6-3v12z"/><path d="M15.5 3.5c1.4 1.6 2.2 2.8 2.2 4a2.2 2.2 0 0 1-4.4 0c0-1.2.8-2.4 2.2-4z"/>',
  compressor:'<circle cx="12" cy="12" r="7.5"/><path d="M12 12 8.6 6.6M12 12l6.3.5M12 12l-3 5.5" stroke="#0f172a" stroke-width="1.6" fill="none"/>',
  storage:  '<ellipse cx="12" cy="6.5" rx="7" ry="2.5"/><path d="M5 6.5v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-11c0 1.4-3.1 2.5-7 2.5S5 7.9 5 6.5z"/>',
  datacentre:'<rect x="5" y="4" width="14" height="4.5" rx="1"/><rect x="5" y="9.75" width="14" height="4.5" rx="1"/><rect x="5" y="15.5" width="14" height="4.5" rx="1"/><circle cx="8" cy="6.25" r=".8" fill="#0f172a"/><circle cx="8" cy="12" r=".8" fill="#0f172a"/><circle cx="8" cy="17.75" r=".8" fill="#0f172a"/>',
  powercut: '<path d="M13.5 2.5 5.5 13.5h5.5L9.5 21.5l9-12h-5.6z"/><path d="M4 4l16 16" stroke="#0f172a" stroke-width="2.4"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="1.2"/>',
};

const SHAPES: Record<IconFamily, (c: string) => string> = {
    gen: c => `<circle cx="22" cy="22" r="18" fill="#0b1120" stroke="${c}" stroke-width="2.5"/>`,
    store: c => `<path d="M22 4 37.6 13v18L22 40 6.4 31V13z" fill="#0b1120" stroke="${c}" stroke-width="2.5"/>`,
    net: c => `<rect x="5" y="5" width="34" height="34" rx="4" fill="#0b1120" stroke="${c}" stroke-width="2.5"/>`,
    gasnet: c => `<path d="M22 4 40 22 22 40 4 22z" fill="#0b1120" stroke="${c}" stroke-width="2.5"/>`,
    demand: c => `<path d="M22 5 39 37H5z" fill="#0b1120" stroke="${c}" stroke-width="2.5"/>`,
    event: c => `<circle cx="22" cy="22" r="18" fill="${c}" stroke="#fff" stroke-width="2.5"/>`,
};

// Asset type id (constants.ts ASSET_TYPES) -> symbol and family
export const ASSET_ICON: Record<string, { glyph: string, family: IconFamily }> = {
    nuclear: { glyph: 'nuclear', family: 'gen' },
    wind_offshore: { glyph: 'windOff', family: 'gen' },
    wind_onshore: { glyph: 'windOn', family: 'gen' },
    solar: { glyph: 'solar', family: 'gen' },
    gas: { glyph: 'gas', family: 'gen' },
    coal: { glyph: 'coal', family: 'gen' },
    biomass: { glyph: 'biomass', family: 'gen' },
    hydro: { glyph: 'hydro', family: 'gen' },
    pumped_storage: { glyph: 'pumped', family: 'store' },
    storage: { glyph: 'battery', family: 'store' },
    substation: { glyph: 'substation', family: 'net' },
    ukpn_gsp: { glyph: 'substation', family: 'net' },
    spen_gsp: { glyph: 'substation', family: 'net' },
    ukpn_bsp: { glyph: 'primary', family: 'net' },
    spen_bsp: { glyph: 'primary', family: 'net' },
    ukpn_primary: { glyph: 'primary', family: 'net' },
    spen_primary: { glyph: 'primary', family: 'net' },
    interconnector: { glyph: 'converter', family: 'net' },
    compressor: { glyph: 'compressor', family: 'gasnet' },
    gas_terminal: { glyph: 'gasTerm', family: 'gasnet' },
    gas_storage: { glyph: 'storage', family: 'gasnet' },
    datacentre: { glyph: 'datacentre', family: 'demand' },
    custom_search: { glyph: 'primary', family: 'demand' },
};

/** Full icon as an SVG string (size in px). */
export const iconSvg = (typeId: string, colour: string, size = 30, highlight?: string) => {
    const def = ASSET_ICON[typeId] || { glyph: 'primary', family: 'net' as IconFamily };
    const glyphColour = def.family === 'event' ? '#fff' : colour;
    const dy = def.family === 'demand' ? 13 : 11;
    const ring = highlight ? `<circle cx="22" cy="22" r="21" fill="none" stroke="${highlight}" stroke-width="3"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 44 44">${ring}${SHAPES[def.family](colour)}<g transform="translate(11 ${dy}) scale(0.92)" fill="${glyphColour}" color="${glyphColour}">${GLYPHS[def.glyph] || ''}</g></svg>`;
};

/** Small family shape only (for zoomed-out views, where symbols would be unreadable). */
export const dotSvg = (typeId: string, colour: string, size = 12, highlight?: string) => {
    const fam = (ASSET_ICON[typeId] || { family: 'net' }).family;
    const stroke = highlight || '#0b1120';
    const sw = highlight ? 5 : 3.5;
    const shape: Record<IconFamily, string> = {
        gen: `<circle cx="22" cy="22" r="17" fill="${colour}" stroke="${stroke}" stroke-width="${sw}"/>`,
        store: `<path d="M22 5 36.7 13.5v17L22 39 7.3 30.5v-17z" fill="${colour}" stroke="${stroke}" stroke-width="${sw}"/>`,
        net: `<rect x="6" y="6" width="32" height="32" rx="4" fill="${colour}" stroke="${stroke}" stroke-width="${sw}"/>`,
        gasnet: `<path d="M22 4 40 22 22 40 4 22z" fill="${colour}" stroke="${stroke}" stroke-width="${sw}"/>`,
        demand: `<path d="M22 5 39 37H5z" fill="${colour}" stroke="${stroke}" stroke-width="${sw}"/>`,
        event: `<circle cx="22" cy="22" r="17" fill="${colour}" stroke="#fff" stroke-width="${sw}"/>`,
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 44 44">${shape[fam]}</svg>`;
};

/** Power cut marker. Unplanned cuts get a pulsing ring (see .powercut-pulse in index.css). */
export const powerCutSvg = (size = 22) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="#ef4444" stroke="#fff" stroke-width="2.5"/><g transform="translate(11 11) scale(0.92)" fill="#fff" color="#fff">${GLYPHS.powercut.replace(/#0f172a/g, '#ef4444')}</g></svg>`;

// ---------- Line styles (shared legend) ----------
// Colour = voltage (OpenInfraMap-style); dashed = underground / subsea; dotted = gas pipeline.
export const VOLTAGE_BANDS = [
    { min: 380000, colour: '#a855f7', label: '400 kV' },
    { min: 220000, colour: '#ec4899', label: '275 kV' },
    { min: 100000, colour: '#0ea5e9', label: '132 kV' },
    { min: 25000, colour: '#16a34a', label: '33-66 kV' },
    { min: 0, colour: '#f59e0b', label: '11 kV and below' },
];

export const voltageColour = (voltageTag: any): string | null => {
    if (voltageTag === undefined || voltageTag === null || voltageTag === '') return null;
    // OSM voltage may list several circuits ("400000;275000") - use the highest
    const vs = String(voltageTag).split(/[;,]/).map(v => parseInt(v.replace(/[^0-9]/g, ''), 10)).filter(n => !isNaN(n));
    if (!vs.length) return null;
    let v = Math.max(...vs);
    if (v < 1000) v *= 1000; // values given in kV
    return (VOLTAGE_BANDS.find(b => v >= b.min) || VOLTAGE_BANDS[VOLTAGE_BANDS.length - 1]).colour;
};

export const LINE_LEGEND = [
    ...VOLTAGE_BANDS.map(b => ({ colour: b.colour, dash: '', width: 2.5, label: b.label })),
    { colour: '#ec4899', dash: '8 5', width: 2.5, label: 'HVDC / subsea cable' },
    { colour: '#0ea5e9', dash: '5 4', width: 2, label: 'Underground cable' },
    { colour: '#a8a29e', dash: '2 4', width: 2, label: 'Gas pipeline' },
];
