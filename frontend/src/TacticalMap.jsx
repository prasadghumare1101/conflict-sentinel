import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// leaflet must be imported before react-leaflet to avoid TDZ in bundled output
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Circle, CircleMarker, Popup, useMap, Tooltip, Marker, GeoJSON, ImageOverlay } from 'react-leaflet';

/* ─── Global CSS ─────────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
@keyframes pulse-ring    { 0%{transform:scale(.4);opacity:1} 100%{transform:scale(3.5);opacity:0} }
@keyframes pulse-ring2   { 0%{transform:scale(.4);opacity:.8} 100%{transform:scale(3.5);opacity:0} }
@keyframes scan-sweep    { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
@keyframes blink         { 0%,100%{opacity:1} 50%{opacity:.2} }
@keyframes ticker-scroll { 0%{transform:translateX(100%)} 100%{transform:translateX(-100%)} }
@keyframes fade-in       { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
@keyframes rotor-spin    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes engine-glow   { 0%,100%{opacity:.9;r:3} 50%{opacity:.4;r:2} }
@keyframes explosion-pop { 0%{transform:scale(0);opacity:1} 60%{transform:scale(1.3);opacity:.9} 100%{transform:scale(2);opacity:0} }
@keyframes explosion-ray { 0%{opacity:.9;stroke-dashoffset:20} 100%{opacity:0;stroke-dashoffset:0} }
@keyframes missile-fly   { 0%{opacity:0} 10%{opacity:1} 90%{opacity:1} 100%{opacity:0} }
@keyframes exhaust-puff  { 0%{transform:scale(1);opacity:.8} 100%{transform:scale(2.5);opacity:0} }
@keyframes impact-flash  { 0%{opacity:0;transform:scale(.2)} 20%{opacity:1;transform:scale(1.4)} 60%{opacity:.7;transform:scale(1)} 100%{opacity:0;transform:scale(1.8)} }
@keyframes crater-appear { 0%{opacity:0;transform:scale(0)} 40%{transform:scale(1.2)} 100%{opacity:1;transform:scale(1)} }
/* drone hover float */
@keyframes drone-float   { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-4px)} }
/* cyber attack animations */
@keyframes apt-pulse     { 0%,100%{opacity:.7;transform:scale(1)} 50%{opacity:.15;transform:scale(1.5)} }
@keyframes apt-internal  { 0%{box-shadow:0 0 0 0 rgba(16,185,129,.7)} 70%{box-shadow:0 0 0 10px rgba(16,185,129,0)} 100%{box-shadow:0 0 0 0 rgba(16,185,129,0)} }
/* warship wake pulse */
@keyframes wake-pulse    { 0%{opacity:.7} 50%{opacity:.2} 100%{opacity:.7} }
/* diplomacy channel ping */
@keyframes diplo-ping    { 0%{transform:scale(0);opacity:1} 100%{transform:scale(2.8);opacity:0} }
.sentinel-scroll::-webkit-scrollbar{width:4px}
.sentinel-scroll::-webkit-scrollbar-track{background:rgba(255,255,255,.03)}
.sentinel-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:4px}
/* Drone SVG rotor animation */
.rotor-anim { animation:rotor-spin .25s linear infinite; transform-origin:50% 50%; }
.drone-float-wrap { animation:drone-float 2.4s ease-in-out infinite; }
`;

/* ─── SVG symbol assets (top-down military icons) ───────────────────────── */

/** FPV drone — top-down X-frame quadcopter with camera pod */
function fpvDroneSvg(rotation = 0, color = '#00ffff') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="44" height="44"
    style="transform:rotate(${rotation}deg);transform-origin:50% 50%;filter:drop-shadow(0 0 5px ${color})">
  <!-- X-frame arms -->
  <line x1="12" y1="12" x2="36" y2="36" stroke="${color}" stroke-width="2.5" opacity=".9"/>
  <line x1="36" y1="12" x2="12" y2="36" stroke="${color}" stroke-width="2.5" opacity=".9"/>
  <!-- Center body -->
  <rect x="19" y="19" width="10" height="10" rx="2" fill="${color}" opacity=".95"/>
  <!-- Camera pod (front) -->
  <circle cx="24" cy="15" r="3" fill="#001a22" stroke="${color}" stroke-width="1.2"/>
  <circle cx="24" cy="15" r="1.5" fill="${color}" opacity=".4"/>
  <!-- Prop discs at each arm end -->
  <circle cx="10" cy="10" r="6" fill="none" stroke="${color}" stroke-width="1.2" opacity=".5" class="rotor-anim" style="transform-origin:10px 10px"/>
  <circle cx="38" cy="10" r="6" fill="none" stroke="${color}" stroke-width="1.2" opacity=".5" class="rotor-anim" style="transform-origin:38px 10px;animation-delay:-.08s"/>
  <circle cx="10" cy="38" r="6" fill="none" stroke="${color}" stroke-width="1.2" opacity=".5" class="rotor-anim" style="transform-origin:10px 38px;animation-delay:-.16s"/>
  <circle cx="38" cy="38" r="6" fill="none" stroke="${color}" stroke-width="1.2" opacity=".5" class="rotor-anim" style="transform-origin:38px 38px;animation-delay:-.24s"/>
  <!-- Prop blades -->
  <line x1="5"  y1="10" x2="15" y2="10" stroke="${color}" stroke-width="1.8" opacity=".8" class="rotor-anim" style="transform-origin:10px 10px"/>
  <line x1="33" y1="10" x2="43" y2="10" stroke="${color}" stroke-width="1.8" opacity=".8" class="rotor-anim" style="transform-origin:38px 10px;animation-delay:-.08s"/>
  <line x1="5"  y1="38" x2="15" y2="38" stroke="${color}" stroke-width="1.8" opacity=".8" class="rotor-anim" style="transform-origin:10px 38px;animation-delay:-.16s"/>
  <line x1="33" y1="38" x2="43" y2="38" stroke="${color}" stroke-width="1.8" opacity=".8" class="rotor-anim" style="transform-origin:38px 38px;animation-delay:-.24s"/>
  <!-- Direction indicator -->
  <polygon points="24,8 21,14 27,14" fill="${color}" opacity=".9"/>
</svg>`;
}

/** Fixed-wing aircraft — top-down silhouette */
function planeSvg(rotation = 0, color = '#00ff88') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="52" height="52"
    style="transform:rotate(${rotation}deg);transform-origin:50% 50%;filter:drop-shadow(0 0 5px ${color})">
  <!-- Fuselage -->
  <ellipse cx="30" cy="30" rx="5" ry="22" fill="${color}" opacity=".95"/>
  <!-- Nose -->
  <polygon points="30,6 27,14 33,14" fill="${color}"/>
  <!-- Main wings -->
  <polygon points="30,24 4,34 8,36 30,28 52,36 56,34" fill="${color}" opacity=".85"/>
  <!-- Tail fins (horizontal) -->
  <polygon points="30,46 14,52 16,54 30,49 44,54 46,52" fill="${color}" opacity=".75"/>
  <!-- Tail fin (vertical) -->
  <polygon points="30,44 28,54 32,54" fill="${color}" opacity=".9"/>
  <!-- Engine pods under wings -->
  <ellipse cx="18" cy="32" rx="4" ry="2" fill="${color}" opacity=".6"/>
  <ellipse cx="42" cy="32" rx="4" ry="2" fill="${color}" opacity=".6"/>
  <!-- Engine exhaust glow -->
  <circle cx="18" cy="34" r="2.5" fill="#ff6600" opacity=".8" style="animation:blink .4s ease-in-out infinite"/>
  <circle cx="42" cy="34" r="2.5" fill="#ff6600" opacity=".8" style="animation:blink .4s ease-in-out infinite .2s"/>
  <!-- Cockpit -->
  <ellipse cx="30" cy="14" rx="2.5" ry="4" fill="#001a0a" opacity=".9"/>
  <ellipse cx="30" cy="14" rx="1.2" ry="2" fill="${color}" opacity=".2"/>
</svg>`;
}

/** Cruise missile — side-view profile symbol */
function missileSvg(rotation = -45) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 52" width="13" height="42"
    style="transform:rotate(${rotation}deg);transform-origin:50% 50%;filter:drop-shadow(0 0 5px #ef4444)">
  <!-- Warhead cone -->
  <polygon points="8,0 13,9 3,9" fill="#ef4444"/>
  <!-- Body -->
  <rect x="5" y="9" width="6" height="26" rx="1" fill="#9ca3af"/>
  <!-- Guidance seeker band -->
  <rect x="5" y="11" width="6" height="2.5" fill="#60a5fa" opacity=".9"/>
  <!-- Mid-body stripe -->
  <rect x="5" y="20" width="6" height="1.5" fill="#374151"/>
  <!-- Rear fins (delta) -->
  <polygon points="5,32 0,44 5,38" fill="#6b7280"/>
  <polygon points="11,32 16,44 11,38" fill="#6b7280"/>
  <polygon points="5,35 5,44 8,40" fill="#4b5563"/>
  <polygon points="11,35 11,44 8,40" fill="#4b5563"/>
  <!-- Exhaust nozzle -->
  <ellipse cx="8" cy="36" rx="3.5" ry="2" fill="#111827"/>
  <!-- Plume -->
  <ellipse cx="8" cy="39" rx="3" ry="2.5" fill="#f97316" opacity=".9" style="animation:blink .18s linear infinite"/>
  <ellipse cx="8" cy="43" rx="3.5" ry="3" fill="#fbbf24" opacity=".55" style="animation:exhaust-puff .35s ease-out infinite"/>
  <ellipse cx="8" cy="48" rx="2.5" ry="2.5" fill="#ff4500" opacity=".3" style="animation:exhaust-puff .35s ease-out infinite .18s"/>
</svg>`;
}

function explosionSvg(size = 52) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="${size}" height="${size}">
  <!-- Outer shock rings -->
  <circle cx="30" cy="30" r="27" fill="none" stroke="#ff4500" stroke-width="1.5" opacity=".4"
          style="animation:explosion-pop 1.6s ease-out infinite"/>
  <circle cx="30" cy="30" r="27" fill="none" stroke="#ffd700" stroke-width="1" opacity=".25"
          style="animation:explosion-pop 1.6s ease-out infinite .5s"/>
  <!-- Rays -->
  <g stroke="#ff6a00" stroke-width="1.5" stroke-dasharray="5 3" opacity=".7"
     style="animation:explosion-ray 1.6s ease-out infinite">
    <line x1="30" y1="3"  x2="30" y2="14"/>
    <line x1="30" y1="46" x2="30" y2="57"/>
    <line x1="3"  y1="30" x2="14" y2="30"/>
    <line x1="46" y1="30" x2="57" y2="30"/>
    <line x1="9"  y1="9"  x2="17" y2="17"/>
    <line x1="43" y1="43" x2="51" y2="51"/>
    <line x1="51" y1="9"  x2="43" y2="17"/>
    <line x1="17" y1="43" x2="9"  y2="51"/>
  </g>
  <!-- Fill glow -->
  <circle cx="30" cy="30" r="16" fill="#ff4500" opacity=".55"
          style="animation:explosion-pop 1.6s ease-out infinite .15s"/>
  <!-- Core -->
  <circle cx="30" cy="30" r="9"  fill="#ffd700" opacity=".95"/>
  <circle cx="30" cy="30" r="5"  fill="#ff4500"/>
  <circle cx="30" cy="30" r="2.5" fill="#ffffff"/>
  <!-- Impact label -->
  <text x="30" y="52" text-anchor="middle" font-size="6" fill="#ff6a00"
        font-family="monospace" letter-spacing="1" opacity=".85">STRIKE</text>
</svg>`;
}

function craterSvg() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" width="28" height="28"
     style="animation:crater-appear .6s ease-out forwards;filter:drop-shadow(0 0 4px #ff4500)">
  <circle cx="15" cy="15" r="12" fill="#1a0a00" opacity=".9"/>
  <circle cx="15" cy="15" r="9"  fill="#2d1000" opacity=".8"/>
  <circle cx="15" cy="15" r="5"  fill="#0a0500" opacity=".95"/>
  <circle cx="12" cy="12" r="1.5" fill="#ff4500" opacity=".6"/>
  <circle cx="18" cy="17" r="1"   fill="#f97316" opacity=".5"/>
</svg>`;
}

/* ─── Static datasets ────────────────────────────────────────────────────── */
const MILITARY_BASES = [
  { id:'mb-01', name:'Camp Lejeune',   lat:34.67, lng:-77.35, operator:'US',    type:'Army',  size:'large' },
  { id:'mb-02', name:'RAF Lakenheath', lat:52.41, lng: 0.56,  operator:'US/UK', type:'Air',   size:'large' },
  { id:'mb-03', name:'Kadena AB',      lat:26.36, lng:127.77, operator:'US',    type:'Air',   size:'large' },
  { id:'mb-04', name:'Camp Humphreys', lat:36.97, lng:127.03, operator:'US',    type:'Army',  size:'large' },
  { id:'mb-05', name:'Incirlik AB',    lat:37.00, lng:35.43,  operator:'NATO',  type:'Air',   size:'medium' },
  { id:'mb-06', name:'Tartus Base',    lat:34.89, lng:35.88,  operator:'Russia',type:'Naval', size:'medium' },
  { id:'mb-07', name:'Hmeimim AB',     lat:35.40, lng:35.95,  operator:'Russia',type:'Air',   size:'large' },
  { id:'mb-08', name:'Sanya Base',     lat:18.23, lng:109.57, operator:'China', type:'Naval', size:'large' },
  { id:'mb-09', name:'Djibouti (Camp Lemonnier)', lat:11.55, lng:43.15, operator:'US', type:'Joint', size:'large' },
  { id:'mb-10', name:'Al Udeid AB',    lat:25.12, lng:51.31,  operator:'US',    type:'Air',   size:'large' },
  { id:'mb-11', name:'Bagram AB',      lat:34.94, lng:69.26,  operator:'US/Defunct',type:'Air',size:'large' },
  { id:'mb-12', name:'Camp Bondsteel', lat:42.36, lng:21.26,  operator:'US/NATO',type:'Army', size:'medium' },
  { id:'mb-13', name:'Diego Garcia',   lat:-7.31, lng:72.42,  operator:'US/UK', type:'Joint', size:'large' },
  { id:'mb-14', name:'Yokosuka Naval', lat:35.28, lng:139.67, operator:'US',    type:'Naval', size:'large' },
  { id:'mb-15', name:'Guantanamo',     lat:19.90, lng:-75.10, operator:'US',    type:'Joint', size:'medium' },
];
const OPERATOR_COLOR = { US:'#3b82f6', 'US/UK':'#6366f1', NATO:'#22c55e', Russia:'#ef4444', China:'#f97316', 'US/NATO':'#06b6d4', 'US/Defunct':'#6b7280', default:'#9ca3af' };

const NUCLEAR_SITES = [
  { id:'nk-01', name:'Yongbyon Complex',  lat:39.79, lng:125.75, country:'North Korea', type:'Weapons' },
  { id:'nk-02', name:'Zaporizhzhia NPP',  lat:47.51, lng:34.59,  country:'Ukraine',     type:'Power Plant' },
  { id:'nk-03', name:'Bushehr NPP',       lat:28.83, lng:50.89,  country:'Iran',        type:'Power Plant' },
  { id:'nk-04', name:'Natanz Enrichment', lat:33.72, lng:51.73,  country:'Iran',        type:'Enrichment' },
  { id:'nk-05', name:'Dimona',            lat:31.00, lng:35.14,  country:'Israel',      type:'Weapons (est.)' },
  { id:'nk-06', name:'Khushab Reactor',   lat:32.05, lng:72.24,  country:'Pakistan',    type:'Weapons' },
  { id:'nk-07', name:'Kudankulam NPP',    lat:8.17,  lng:77.71,  country:'India',       type:'Power Plant' },
  { id:'nk-08', name:'Tarapur NPP',       lat:19.83, lng:72.65,  country:'India',       type:'Power Plant' },
  { id:'nk-09', name:'Tianwan NPP',       lat:34.69, lng:119.46, country:'China',       type:'Power Plant' },
  { id:'nk-10', name:'Leningrad NPP',     lat:59.88, lng:29.07,  country:'Russia',      type:'Power Plant' },
];

const STRATEGIC_WATERWAYS = [
  { id:'sw-01', name:'Strait of Hormuz',    lat:26.56, lng:56.25, width_nm:21,  daily_mbpd:21,  risk:'HIGH' },
  { id:'sw-02', name:'Suez Canal',          lat:30.42, lng:32.35, width_nm:0.3, daily_mbpd:9,   risk:'ELEVATED' },
  { id:'sw-03', name:'Strait of Malacca',   lat:2.50,  lng:101.4, width_nm:38,  daily_mbpd:16,  risk:'MODERATE' },
  { id:'sw-04', name:'Bab-el-Mandeb',       lat:12.58, lng:43.42, width_nm:18,  daily_mbpd:6.2, risk:'CRITICAL' },
  { id:'sw-05', name:'Panama Canal',        lat:9.08,  lng:-79.68,width_nm:0.1, daily_mbpd:1.5, risk:'LOW' },
  { id:'sw-06', name:'Turkish Straits',     lat:41.01, lng:29.02, width_nm:0.8, daily_mbpd:2.4, risk:'MODERATE' },
  { id:'sw-07', name:'Lombok Strait',       lat:-8.40, lng:115.8, width_nm:15,  daily_mbpd:4,   risk:'LOW' },
];
const WATERWAY_RISK_COLOR = { CRITICAL:'#ef4444', HIGH:'#f97316', ELEVATED:'#f59e0b', MODERATE:'#3b82f6', LOW:'#10b981' };

const INTEL_HOTSPOTS = [
  { id:'hs-01', name:'Ukraine Front',       lat:48.5, lng:37.5, escalation:5, trend:'escalating',  summary:'Active frontline combat across Donetsk and Zaporizhzhia oblasts' },
  { id:'hs-02', name:'Gaza Strip',          lat:31.4, lng:34.4, escalation:5, trend:'escalating',  summary:'Ongoing IDF operations; acute humanitarian crisis' },
  { id:'hs-03', name:'Sudan Civil War',     lat:15.5, lng:32.5, escalation:4, trend:'escalating',  summary:'RSF-SAF conflict; mass atrocities reported in Darfur' },
  { id:'hs-04', name:'Taiwan Strait',       lat:24.0, lng:120.5,escalation:3, trend:'stable',      summary:'PLA exercises; elevated cross-strait tensions' },
  { id:'hs-05', name:'South China Sea',     lat:12.0, lng:114.0,escalation:3, trend:'escalating',  summary:'Filipino-Chinese vessel confrontations at Scarborough Shoal' },
  { id:'hs-06', name:'Iran Nuclear',        lat:32.4, lng:53.7, escalation:4, trend:'escalating',  summary:'93% enrichment levels; IAEA access restricted' },
  { id:'hs-07', name:'North Korea',         lat:39.0, lng:127.5,escalation:4, trend:'stable',      summary:'ICBM tests; troop deployment to Russia confirmed' },
  { id:'hs-08', name:'Yemen/Red Sea',       lat:13.5, lng:45.0, escalation:4, trend:'stable',      summary:'Houthi missile/drone attacks on commercial shipping' },
  { id:'hs-09', name:'Myanmar',             lat:19.7, lng:96.1, escalation:3, trend:'escalating',  summary:'Resistance forces gaining territory; junta air strikes' },
  { id:'hs-10', name:'Sahel Region',        lat:14.5, lng:-2.0, escalation:3, trend:'escalating',  summary:'JNIM/IS-Sahel expanding; Wagner successor operations' },
  { id:'hs-11', name:'Lebanon/Hezbollah',   lat:33.5, lng:35.9, escalation:4, trend:'de-escalating',summary:'Ceasefire fragile; IDF maintains southern operations' },
  { id:'hs-12', name:'Pakistan-India LOC',  lat:34.5, lng:74.0, escalation:2, trend:'stable',      summary:'Periodic skirmishes; diplomatic channels open' },
  { id:'hs-13', name:'Manipur (India)',     lat:24.7, lng:93.9, escalation:3, trend:'escalating',  summary:'Ethnic conflict; AFSPA zones; displacement 68k+ civilians' },
  { id:'hs-14', name:'Nagaland (NSCN)',     lat:26.2, lng:94.6, escalation:2, trend:'stable',      summary:'Peace talks stalled; NSCN-IM ceasefire holding tenuously' },
  { id:'hs-15', name:'Arunachal Standoff',  lat:28.2, lng:94.7, escalation:3, trend:'escalating',  summary:'China LAC incursions; PLA infrastructure buildup; India counter-deployment' },
  { id:'hs-16', name:'Assam-Meghalaya',     lat:25.5, lng:91.4, escalation:2, trend:'stable',      summary:'Interstate border dispute; IDP camps; security operations' },
  { id:'hs-17', name:'Mizoram-Myanmar',     lat:23.2, lng:93.0, escalation:3, trend:'escalating',  summary:'Myanmar refugee influx 35k+; border fencing tensions; drug trafficking routes' },
];
const ESCALATION_COLOR = { 5:'#ef4444', 4:'#f97316', 3:'#f59e0b', 2:'#3b82f6', 1:'#10b981' };

const EONET_ICONS = { Wildfires:'🔥', Volcanoes:'🌋', 'Severe Storms':'⛈️', Floods:'🌊', Earthquakes:'🫨', Drought:'☀️', 'Dust and Haze':'💨', Snow:'❄️', default:'🌐' };

const MUNITION_COLOR = {
  'Ballistic Missile':'#ef4444','Cruise Missile':'#f97316','MLRS':'#f59e0b',
  'Artillery':'#eab308','Loitering Munition':'#00ffff','Thermobaric':'#ff6600',
  'IED':'#dc2626','Glide Bomb':'#f97316','Precision Guided':'#3b82f6','Cluster':'#f59e0b',
};

const EXPLOSIVE_TYPES = {
  airstrike:[
    { name:'Kh-101', category:'Cruise Missile', yield:'450 kg HE', delivery:'Tu-95MS/Tu-160', notes:'GPS+terrain-following, ~5500km range' },
    { name:'Kalibr (3M14)', category:'Cruise Missile', yield:'450 kg HE', delivery:'Ship/Submarine', notes:'Sea-based, used in Black Sea theatre' },
    { name:'FAB-500M62 (UMPK)', category:'Glide Bomb', yield:'500 kg HE', delivery:'Su-34 with glide kit', notes:'Converted Soviet iron bomb, 60km glide range' },
    { name:'Storm Shadow/SCALP', category:'Cruise Missile', yield:'450 kg BROACH', delivery:'Typhoon/Rafale', notes:'Anglo-French deep strike ~250km' },
    { name:'GBU-39 SDB', category:'Precision Guided', yield:'250 lb', delivery:'F-15/F-16 aircraft', notes:'INS+GPS small diameter bomb' },
  ],
  missile:[
    { name:'Iskander-M (9M723)', category:'Ballistic Missile', yield:'480 kg HE/Cluster/EMP', delivery:'Road-mobile TEL', notes:'Quasi-ballistic, ~500km, GNSS+optical' },
    { name:'Shahab-3/Emad', category:'Ballistic Missile', yield:'750–1000 kg HE', delivery:'Road-mobile TEL', notes:'Iranian MRBM, used by Houthi proxies' },
    { name:'Kh-22/Kh-32', category:'Cruise Missile', yield:'900 kg HE', delivery:'Tu-22M3 Backfire', notes:'Anti-ship/land, supersonic, ~600km' },
    { name:'Ghadr-110', category:'Ballistic Missile', yield:'750 kg HE', delivery:'Road-mobile', notes:'Iranian MRBM, direct strikes on Israel 2024' },
    { name:'Scud-D (OTR-23)', category:'Ballistic Missile', yield:'985 kg HE', delivery:'Road TEL', notes:'Legacy platform still in active use' },
  ],
  drone:[
    { name:'Shahed-136 (Geran-2)', category:'Loitering Munition', yield:'40–50 kg HE', delivery:'Ground catapult launcher', notes:'Delta-wing, 2000km+ range, ~$20k unit cost' },
    { name:'Lancet-3', category:'Loitering Munition', yield:'3 kg shaped charge', delivery:'Pneumatic launcher', notes:'Russian EO seeker, anti-armor precision' },
    { name:'Bayraktar TB2', category:'Precision Guided', yield:'MAM-L laser-guided', delivery:'Short runway UCAV', notes:'Turkish, used Ukraine/Nagorno-Karabakh' },
    { name:'Heron TP/Hermes 900', category:'Precision Guided', yield:'Hellfire/SPICE payload', delivery:'Fixed runway', notes:'Israeli ISR+strike platform' },
  ],
  explosion:[
    { name:'IED (VOIED)', category:'IED', yield:'5–100 kg TNT equiv', delivery:'Pressure plate/remote', notes:'Victim-operated, roadside placement' },
    { name:'VBIED', category:'IED', yield:'50–500 kg TNT equiv', delivery:'Suicide vehicle', notes:'Vehicle-borne, high civilian casualty' },
    { name:'EFP (Shaped Charge)', category:'IED', yield:'Directional blast', delivery:'Roadside placement', notes:'Explosively formed penetrator, defeats ERA' },
  ],
  battle:[
    { name:'152mm HE (2A65)', category:'Artillery', yield:'7.5 kg HE frag', delivery:'2S19 MSTA-S SPH', notes:'Standard Russian heavy artillery' },
    { name:'BM-21 Grad (122mm)', category:'MLRS', yield:'6.4 kg HE/Cluster per rocket', delivery:'40-tube truck MLRS', notes:'40 rounds/salvo, 20km range' },
    { name:'BM-30 Smerch (300mm)', category:'MLRS', yield:'70 kg HE/Cluster/Thermobaric', delivery:'12-tube heavy MLRS', notes:'90km range, 6.7 km² coverage/salvo' },
    { name:'TOS-1A Solntsepyok', category:'Thermobaric', yield:'220mm thermobaric warhead', delivery:'T-72 chassis, 24-tube', notes:'Fuel-air explosive, ~3500°C, 6km range' },
    { name:'M777 155mm (Excalibur)', category:'Precision Guided', yield:'11 kg HE', delivery:'M777 towed howitzer', notes:'GPS-guided, 40km range, CEP <2m' },
  ],
  'one-sided':[
    { name:'RPG-7 (PG-7VL)', category:'IED', yield:'HEAT 1 kg warhead', delivery:'Shoulder-fired', notes:'Anti-armor/personnel, range <300m' },
    { name:'PBIED (Suicide Vest)', category:'IED', yield:'5–20 kg HE', delivery:'Person-borne', notes:'Highest civilian casualty events' },
    { name:'120mm Mortar (2B11)', category:'Artillery', yield:'3.2 kg HE', delivery:'Baseplate, man-portable', notes:'Urban area indirect fire, 8km range' },
  ],
};

const APT_ATTACKS = [
  { id:'apt-01', name:'Sandworm (GRU)', origin:{lat:55.75,lng:37.62}, country:'Russia', targetBaseId:'mb-02', type:'external', attackType:'SCADA/ICS', severity:5, color:'#ef4444', description:'Power grid attack, BlackEnergy/Industroyer malware on ICS' },
  { id:'apt-02', name:'Fancy Bear (APT28)', origin:{lat:55.75,lng:37.62}, country:'Russia', targetBaseId:'mb-12', type:'external', attackType:'Espionage', severity:4, color:'#ef4444', description:'Credential harvesting via spear-phishing + VPN exploitation' },
  { id:'apt-03', name:'Lazarus Group', origin:{lat:39.02,lng:125.75}, country:'N.Korea', targetBaseId:'mb-14', type:'external', attackType:'Ransomware', severity:4, color:'#a855f7', description:'WannaCry successor variant, financial system disruption' },
  { id:'apt-04', name:'APT41 (Double Dragon)', origin:{lat:39.90,lng:116.40}, country:'China', targetBaseId:'mb-03', type:'external', attackType:'Supply Chain', severity:5, color:'#f97316', description:'Software supply chain compromise, SolarWinds-style infiltration' },
  { id:'apt-05', name:'Charming Kitten', origin:{lat:35.69,lng:51.39}, country:'Iran', targetBaseId:'mb-10', type:'external', attackType:'Zero-day', severity:3, color:'#f59e0b', description:'Social engineering + zero-day browser exploit chain' },
  { id:'apt-06', name:'APT40 (Bronze Mohawk)', origin:{lat:22.27,lng:114.16}, country:'China', targetBaseId:'mb-09', type:'external', attackType:'Espionage', severity:4, color:'#f97316', description:'Maritime intelligence collection, critical infrastructure recon' },
  { id:'apt-07', name:'GRU Unit 74455', origin:{lat:55.75,lng:37.62}, country:'Russia', targetBaseId:'mb-07', type:'external', attackType:'EW/Jamming', severity:5, color:'#ef4444', description:'GPS spoofing + EW coordination targeting NATO airspace' },
  { id:'apt-08', name:'PLA Unit 61398', origin:{lat:31.23,lng:121.47}, country:'China', targetBaseId:'mb-04', type:'external', attackType:'DDoS', severity:3, color:'#f97316', description:'C2 infrastructure flooding, logistics disruption ops' },
  { id:'apt-09', name:'Insider Threat Alpha', origin:null, targetBaseId:'mb-01', type:'internal', attackType:'Data Exfil', severity:3, color:'#10b981', description:'Unauthorized exfiltration via removable media, contractor access' },
  { id:'apt-10', name:'Insider Threat Bravo', origin:null, targetBaseId:'mb-05', type:'internal', attackType:'Sabotage', severity:4, color:'#f59e0b', description:'Physical sabotage of network infrastructure, suspected foreign asset' },
];

const ATTACK_TYPE_COLOR = { 'SCADA/ICS':'#ef4444','Espionage':'#3b82f6','Ransomware':'#a855f7','Supply Chain':'#f97316','Zero-day':'#f59e0b','EW/Jamming':'#00ffff','DDoS':'#f87171','Data Exfil':'#10b981','Sabotage':'#f59e0b' };

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function getEventStyle(type) {
  const m = { airstrike:{color:'#ff4500',fill:'#ff6a00',icon:'💥',label:'AIRSTRIKE'}, missile:{color:'#ff0000',fill:'#ff3333',icon:'🚀',label:'MISSILE'}, drone:{color:'#00ffff',fill:'#00cccc',icon:'✈',label:'DRONE'}, battle:{color:'#f59e0b',fill:'#fbbf24',icon:'⚔️',label:'BATTLE'}, explosion:{color:'#ff4500',fill:'#ff6a00',icon:'💣',label:'EXPLOSION'}, 'one-sided':{color:'#eab308',fill:'#facc15',icon:'⚠️',label:'CIVILIAN'} };
  return m[type] || { color:'#ef4444', fill:'#f87171', icon:'🔴', label:'CONFLICT' };
}

/* ─── Map helpers (hooks must be inside MapContainer) ───────────────────── */
function MapFlyer({ coords }) {
  const map = useMap();
  useEffect(() => { if (coords?.lat && coords?.lng) map.flyTo([coords.lat, coords.lng], 9, { animate:true, duration:2.5 }); }, [coords, map]);
  return null;
}

// Dedicated flyer for map search result — flies to boundary lat/lng at closer zoom
function MapSearchFlyer({ target }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (!target?.lat || !target?.lng) return;
    const key = `${target.lat},${target.lng}`;
    if (prev.current === key) return;
    prev.current = key;
    map.flyTo([target.lat, target.lng], target.zoom || 10, { animate: true, duration: 2.0 });
  }, [target, map]);
  return null;
}
/* ─── Bearing between two coords ────────────────────────────────────────── */
function bearing(lat1, lng1, lat2, lng2) {
  const dL = (lng2 - lng1) * Math.PI / 180;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  return (Math.atan2(Math.sin(dL) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dL)) * 180 / Math.PI + 360) % 360;
}

/* ─── Animated flying drones/planes (move between conflict waypoints) ───── */
// 3 craft types: FPV quad, fixed-wing plane, second FPV (different color)
const DRONE_CONFIGS = [
  { type:'fpv',    color:'#00ffff', size:44 },
  { type:'plane',  color:'#00ff88', size:52 },
  { type:'shahed', color:'#ff6b35', size:44 },
  { type:'uav',    color:'#ffcc00', size:44 },
];

function makeDroneHtml(type, rotation, color, size) {
  const src = type === 'plane' ? '/airplane.png'
            : type === 'shahed' ? '/Shahed.png'
            : type === 'uav'    ? '/UAV.png'
            : '/drone.png';
  return `<div class="drone-float-wrap" style="display:inline-block;line-height:0;position:relative;width:${size}px;height:${size}px">
    <img src="${src}" width="${size}" height="${size}"
      style="transform:rotate(${rotation}deg);transform-origin:50% 50%;filter:drop-shadow(0 0 5px ${color}) brightness(1.1);display:block;position:absolute"
      onerror="this.style.display='none';this.nextSibling.style.display='block'"/>
    <div style="display:none;width:${size}px;height:${size}px;border-radius:50%;background:${color};opacity:0.85;box-shadow:0 0 6px ${color}"></div>
  </div>`;
}

function AnimatedDronesLayer({ waypoints }) {
  const map = useMap();
  const state = useRef([]);
  const rafId = useRef(null);

  useEffect(() => {
    if (!waypoints?.length) return;
    const droneCount = Math.min(2, Math.floor(waypoints.length / 2));
    const drones = [];

    for (let d = 0; d < droneCount; d++) {
      const startIdx = (d * 3) % waypoints.length;
      const wp = [...waypoints.slice(startIdx), ...waypoints.slice(0, startIdx)];
      const cfg = DRONE_CONFIGS[d];
      const s = cfg.size;

      const icon = L.divIcon({
        className: '',
        html: makeDroneHtml(cfg.type, 0, cfg.color, s),
        iconSize: [s, s], iconAnchor: [s/2, s/2],
      });
      const marker = L.marker([wp[0].lat, wp[0].lng], { icon, interactive: false, zIndexOffset: 900 }).addTo(map);
      const trail = L.polyline([[wp[0].lat, wp[0].lng]], {
        color: cfg.color, weight: 1.5, opacity: 0.5, dashArray: '4 6',
      }).addTo(map);

      drones.push({ marker, trail, wp, idx:0, progress:0, trailPts:[{lat:wp[0].lat,lng:wp[0].lng}], cfg });
    }
    state.current = drones;

    let last = 0;
    function step(ts) {
      const dt = Math.min(ts - last, 80);
      last = ts;
      state.current.forEach(dr => {
        const src = dr.wp[dr.idx];
        const dst = dr.wp[(dr.idx + 1) % dr.wp.length];
        dr.progress += dt * 0.00012;
        if (dr.progress >= 1) {
          dr.progress = 0;
          dr.idx = (dr.idx + 1) % dr.wp.length;
          dr.trailPts = dr.trailPts.slice(-8);
          return;
        }
        const lat = src.lat + (dst.lat - src.lat) * dr.progress;
        const lng = src.lng + (dst.lng - src.lng) * dr.progress;
        const brg = bearing(src.lat, src.lng, dst.lat, dst.lng);
        const { cfg } = dr;
        const html = makeDroneHtml(cfg.type, brg - 90, cfg.color, cfg.size);
        const s = cfg.size;
        dr.marker.setIcon(L.divIcon({ className:'', html, iconSize:[s,s], iconAnchor:[s/2,s/2] }));
        dr.marker.setLatLng([lat, lng]);
        dr.trailPts.push({ lat, lng });
        dr.trail.setLatLngs(dr.trailPts.map(p => [p.lat, p.lng]));
      });
      rafId.current = requestAnimationFrame(step);
    }
    rafId.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId.current);
      state.current.forEach(dr => { dr.marker.remove(); dr.trail.remove(); });
      state.current = [];
    };
  }, [map, waypoints]);

  return null;
}

/* ─── Airstrike explosion markers ───────────────────────────────────────── */
function AirstrikeEffectsLayer({ events }) {
  const map = useMap();
  const markersRef = useRef([]);

  useEffect(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (!events?.length) return;

    events.forEach((e, i) => {
      // Explosion burst icon (random phase offset per marker)
      const delay = (i * 0.37) % 1.6;
      const icon = L.divIcon({
        className: '',
        html: `<div style="animation:none;position:relative;width:52px;height:52px">
          ${explosionSvg(52).replace('1.6s ease-out infinite', `1.6s ease-out ${delay}s infinite`)}
        </div>`,
        iconSize: [52, 52], iconAnchor: [26, 26],
      });
      const m = L.marker([e.lat, e.lng], { icon, interactive: false, zIndexOffset: 800 }).addTo(map);
      markersRef.current.push(m);
    });

    return () => { markersRef.current.forEach(m => m.remove()); markersRef.current = []; };
  }, [map, events]);

  return null;
}

/* ─── Missile trails (military base → airstrike target) ─────────────────── */
function MissileTrailsLayer({ bases, targets }) {
  const map = useMap();
  const state = useRef([]);
  const rafId = useRef(null);

  useEffect(() => {
    state.current.forEach(s => { s.marker?.remove(); s.line?.remove(); s.crater?.remove(); });
    state.current = [];
    cancelAnimationFrame(rafId.current);
    if (!bases?.length || !targets?.length) return;

    // pick 4 random base→target pairs
    const pairs = targets.slice(0, 4).map((tgt, i) => {
      const base = bases[i % bases.length];
      return { src: { lat: base.lat, lng: base.lng, name: base.name }, dst: { lat: tgt.lat, lng: tgt.lng, desc: tgt.description } };
    });

    pairs.forEach((pair, idx) => {
      const delay = idx * 3500; // stagger launches
      const brg = bearing(pair.src.lat, pair.src.lng, pair.dst.lat, pair.dst.lng);
      const missileHtml = `<div style="position:relative;width:18px;height:36px"><img src="/missile.png" width="18" height="36" style="transform:rotate(${brg - 45}deg);transform-origin:50% 50%;filter:drop-shadow(0 0 5px #ef4444);display:block;position:absolute" onerror="this.style.display='none';this.nextSibling.style.display='block'"/><div style="display:none;width:10px;height:20px;margin:8px 4px;background:#ef4444;border-radius:2px 2px 50% 50%;box-shadow:0 0 6px #ef4444"></div></div>`;
      const missileIcon = L.divIcon({ className:'', html: missileHtml, iconSize:[18,36], iconAnchor:[9,18] });
      const craterIcon  = L.divIcon({ className: '', html: craterSvg(), iconSize: [28, 28], iconAnchor: [14, 14] });
      const line = L.polyline([[pair.src.lat, pair.src.lng]], { color: '#ef4444', weight: 1.5, opacity: 0.6, dashArray: '5 4' }).addTo(map);
      const missileMarker = L.marker([pair.src.lat, pair.src.lng], { icon: missileIcon, interactive: false, zIndexOffset: 950 });
      let craterMarker = null;
      let progress = 0;
      let launched = false;
      let impacted = false;

      const obj = { marker: missileMarker, line, crater: null };
      state.current.push(obj);

      setTimeout(() => {
        missileMarker.addTo(map);
        launched = true;

        let last = 0;
        function fly(ts) {
          if (!launched || impacted) return;
          const dt = Math.min(ts - last, 80);
          last = ts;
          progress += dt * 0.00025;
          if (progress >= 1) {
            impacted = true;
            missileMarker.remove();
            line.remove();
            craterMarker = L.marker([pair.dst.lat, pair.dst.lng], { icon: craterIcon, interactive: false, zIndexOffset: 700 }).addTo(map);
            obj.crater = craterMarker;
            setTimeout(() => { craterMarker?.remove(); obj.crater = null; }, 8000);
            return;
          }
          const t = Math.min(progress, 1);
          const lat = pair.src.lat + (pair.dst.lat - pair.src.lat) * t;
          const lng = pair.src.lng + (pair.dst.lng - pair.src.lng) * t;
          missileMarker.setLatLng([lat, lng]);
          line.setLatLngs([[pair.src.lat, pair.src.lng], [lat, lng]]);
          requestAnimationFrame(fly);
        }
        requestAnimationFrame(fly);
      }, delay);
    });

    return () => {
      state.current.forEach(s => { s.marker?.remove(); s.line?.remove(); s.crater?.remove(); });
      state.current = [];
    };
  }, [map, bases, targets]);

  return null;
}

/* ─── Cyber attack layer (APT external packets + internal IoC rings) ────── */
function CyberAttackLayer({ attacks, bases, active }) {
  const map = useMap();
  const state = useRef([]);
  const rafId = useRef(null);

  useEffect(() => {
    cancelAnimationFrame(rafId.current);
    state.current.forEach(s => { s.packets?.forEach(p => p.marker?.remove()); s.line?.remove(); s.ring?.remove(); });
    state.current = [];
    if (!active || !attacks?.length || !bases?.length) return;

    const baseMap = {};
    bases.forEach(b => { baseMap[b.id] = b; });

    attacks.forEach((apt) => {
      const base = baseMap[apt.targetBaseId];
      if (!base) return;

      if (apt.type === 'external' && apt.origin) {
        const line = L.polyline(
          [[apt.origin.lat, apt.origin.lng], [base.lat, base.lng]],
          { color: apt.color, weight: 1.2, opacity: 0.3, dashArray: '6 8' }
        ).addTo(map);

        const packets = [0, 0.33, 0.67].map(offset => {
          const m = L.marker([apt.origin.lat, apt.origin.lng], {
            icon: L.divIcon({
              className: '',
              html: `<div style="width:7px;height:7px;border-radius:50%;background:${apt.color};box-shadow:0 0 8px ${apt.color};"></div>`,
              iconSize: [7, 7], iconAnchor: [3, 3],
            }),
            interactive: false, zIndexOffset: 850,
          }).addTo(map);
          return { marker: m, progress: offset };
        });

        // Tooltip on line
        line.bindTooltip(`<div style="font-family:monospace;font-size:10px"><b style="color:${apt.color}">${apt.name}</b><br/>${apt.country} → ${base.name}<br/><span style="color:#9ca3af">${apt.attackType}</span></div>`, { sticky: true, opacity: 0.95 });
        state.current.push({ line, packets, ring: null, apt, base });

      } else if (apt.type === 'internal') {
        const ring = L.circleMarker([base.lat, base.lng], {
          radius: 16, color: apt.color, weight: 2.5, opacity: 0.8,
          fillColor: apt.color, fillOpacity: 0.06, dashArray: '4 5',
        }).addTo(map);
        ring.bindTooltip(`<div style="font-family:monospace;font-size:10px"><b style="color:${apt.color}">🔓 ${apt.name}</b><br/>Target: ${base.name}<br/><span style="color:#9ca3af">${apt.attackType} · Severity ${apt.severity}/5</span></div>`, { sticky: true, opacity: 0.95 });
        state.current.push({ line: null, packets: [], ring, apt, base });
      }
    });

    let last = 0;
    function step(ts) {
      const dt = Math.min(ts - last, 80);
      last = ts;
      state.current.forEach(obj => {
        if (!obj.packets?.length || !obj.apt.origin) return;
        obj.packets.forEach(p => {
          p.progress += dt * 0.00015;
          if (p.progress >= 1) p.progress = 0;
          const t = p.progress;
          const lat = obj.apt.origin.lat + (obj.base.lat - obj.apt.origin.lat) * t;
          const lng = obj.apt.origin.lng + (obj.base.lng - obj.apt.origin.lng) * t;
          const opacity = t < 0.08 ? t / 0.08 : t > 0.92 ? (1 - t) / 0.08 : 1;
          p.marker.setLatLng([lat, lng]);
          p.marker.setIcon(L.divIcon({
            className: '',
            html: `<div style="width:7px;height:7px;border-radius:50%;background:${obj.apt.color};box-shadow:0 0 8px ${obj.apt.color};opacity:${opacity.toFixed(2)}"></div>`,
            iconSize: [7, 7], iconAnchor: [3, 3],
          }));
        });
      });
      rafId.current = requestAnimationFrame(step);
    }
    rafId.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId.current);
      state.current.forEach(s => { s.packets?.forEach(p => p.marker?.remove()); s.line?.remove(); s.ring?.remove(); });
      state.current = [];
    };
  }, [map, attacks, bases, active]);

  return null;
}

/* ─── Reusable UI atoms ──────────────────────────────────────────────────── */
function Pill({ children, color='#6b7280', bg }) {
  return <span style={{ fontSize:9, fontFamily:'monospace', padding:'2px 7px', borderRadius:4, background:bg||`${color}18`, border:`1px solid ${color}44`, color, letterSpacing:'0.06em' }}>{children}</span>;
}
function SectionHeader({ children, color='#6b7280' }) {
  return <div style={{ fontSize:9, fontFamily:'monospace', letterSpacing:'0.16em', color, marginBottom:6, display:'flex', alignItems:'center', gap:6 }}><span style={{ display:'inline-block', width:10, height:1, background:color }} />{children}<span style={{ flex:1, display:'inline-block', height:1, background:`${color}33` }} /></div>;
}
function StatBox({ label, value, color='#6b7280', blink }) {
  return (
    <div style={{ textAlign:'center', background:'rgba(255,255,255,0.03)', border:`1px solid ${color}33`, borderRadius:6, padding:'7px 5px' }}>
      <div style={{ fontSize:17, fontWeight:700, color, fontFamily:'monospace', animation:blink?'blink 1.4s ease-in-out infinite':undefined }}>{value}</div>
      <div style={{ fontSize:8, color:'#4b5563', fontFamily:'monospace', letterSpacing:'0.08em', marginTop:1 }}>{label}</div>
    </div>
  );
}

/* ─── Panel components ───────────────────────────────────────────────────── */
function HotspotsPanel({ hotspots, onSelect }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <SectionHeader color="#ef4444">INTEL HOTSPOTS</SectionHeader>
      {hotspots.map(h => (
        <div key={h.id} onClick={() => onSelect(h)} style={{ background:`${ESCALATION_COLOR[h.escalation]}0d`, border:`1px solid ${ESCALATION_COLOR[h.escalation]}44`, borderRadius:6, padding:'7px 10px', cursor:'pointer', transition:'border-color .15s', animation:'fade-in .3s ease' }}
          onMouseEnter={e=>e.currentTarget.style.borderColor=ESCALATION_COLOR[h.escalation]}
          onMouseLeave={e=>e.currentTarget.style.borderColor=`${ESCALATION_COLOR[h.escalation]}44`}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3 }}>
            <span style={{ fontSize:11, fontWeight:600, color:'#f9fafb' }}>{h.name}</span>
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              <Pill color={ESCALATION_COLOR[h.escalation]}>L{h.escalation}</Pill>
              <span style={{ fontSize:9, color: h.trend==='escalating'?'#ef4444':h.trend==='de-escalating'?'#10b981':'#f59e0b' }}>
                {h.trend==='escalating'?'↑ ESC':h.trend==='de-escalating'?'↓ DE-ESC':'→ STABLE'}
              </span>
            </div>
          </div>
          <div style={{ fontSize:10, color:'#9ca3af', lineHeight:1.4 }}>{h.summary}</div>
        </div>
      ))}
    </div>
  );
}

function MilitaryPanel({ bases }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <SectionHeader color="#3b82f6">MILITARY BASES</SectionHeader>
      {bases.map(b => {
        const c = OPERATOR_COLOR[b.operator] || OPERATOR_COLOR.default;
        return (
          <div key={b.id} style={{ display:'flex', gap:8, alignItems:'center', padding:'5px 8px', background:`${c}0a`, border:`1px solid ${c}22`, borderRadius:5 }}>
            <span style={{ fontSize:13 }}>{b.type==='Naval'?'⚓':b.type==='Air'?'✈️':'🏭'}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:'#f9fafb' }}>{b.name}</div>
              <div style={{ fontSize:9, color:'#6b7280' }}>{b.operator} · {b.type}</div>
            </div>
            <Pill color={c}>{b.size}</Pill>
          </div>
        );
      })}
    </div>
  );
}

function NuclearPanel({ sites }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <SectionHeader color="#a855f7">NUCLEAR FACILITIES</SectionHeader>
      {sites.map(s => (
        <div key={s.id} style={{ display:'flex', gap:8, alignItems:'center', padding:'5px 8px', background:'rgba(168,85,247,0.05)', border:'1px solid rgba(168,85,247,0.2)', borderRadius:5 }}>
          <span style={{ fontSize:14 }}>☢️</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:'#f9fafb' }}>{s.name}</div>
            <div style={{ fontSize:9, color:'#6b7280' }}>{s.country} · {s.type}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WaterwaysPanel({ waterways }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <SectionHeader color="#06b6d4">STRATEGIC WATERWAYS</SectionHeader>
      {waterways.map(w => {
        const c = WATERWAY_RISK_COLOR[w.risk];
        return (
          <div key={w.id} style={{ padding:'6px 9px', background:`${c}0a`, border:`1px solid ${c}33`, borderRadius:5 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
              <span style={{ fontSize:10, color:'#f9fafb', fontWeight:600 }}>{w.name}</span>
              <Pill color={c}>{w.risk}</Pill>
            </div>
            <div style={{ fontSize:9, color:'#6b7280' }}>{w.daily_mbpd}M bbl/day · {w.width_nm}nm wide</div>
          </div>
        );
      })}
    </div>
  );
}

function EarthquakesPanel({ quakes }) {
  if (!quakes?.length) return <div style={{ fontSize:10, color:'#4b5563' }}>Loading earthquakes…</div>;
  const sorted = [...quakes].sort((a,b)=>b.mag-a.mag).slice(0,10);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <SectionHeader color="#f59e0b">EARTHQUAKES M4.5+</SectionHeader>
      {sorted.map(q => {
        const c = q.mag>=7?'#ef4444':q.mag>=6?'#f97316':q.mag>=5?'#f59e0b':'#eab308';
        return (
          <div key={q.id} style={{ display:'flex', gap:8, padding:'5px 8px', background:`${c}0a`, border:`1px solid ${c}22`, borderRadius:5 }}>
            <div style={{ fontSize:14, fontWeight:700, color:c, fontFamily:'monospace', minWidth:28 }}>M{q.mag}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, color:'#f9fafb', lineHeight:1.4 }}>{q.place?.slice(0,50)}</div>
              <div style={{ fontSize:9, color:'#6b7280' }}>{q.time?.slice(0,10)} · depth {q.depth}km {q.tsunami?'⚠️TSUNAMI':''}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NaturalEventsPanel({ events }) {
  if (!events?.length) return <div style={{ fontSize:10, color:'#4b5563' }}>Loading natural events…</div>;
  const cats = [...new Set(events.map(e=>e.category))];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <SectionHeader color="#10b981">NATURAL EVENTS (NASA EONET)</SectionHeader>
      <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:6 }}>
        {cats.map(c => <Pill key={c} color="#10b981">{EONET_ICONS[c]||'🌐'} {c} ({events.filter(e=>e.category===c).length})</Pill>)}
      </div>
      {events.slice(0,12).map(e => (
        <div key={e.id} style={{ display:'flex', gap:8, alignItems:'center', padding:'4px 8px', background:'rgba(16,185,129,0.04)', border:'1px solid rgba(16,185,129,0.15)', borderRadius:5 }}>
          <span style={{ fontSize:14 }}>{EONET_ICONS[e.category]||'🌐'}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:'#d1d5db' }}>{e.title}</div>
            <div style={{ fontSize:9, color:'#6b7280' }}>{e.date?.slice(0,10)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CyberPanel({ threats, aptAttacks }) {
  const [cyberTab, setCyberTab] = useState('apt');
  const external = (aptAttacks||[]).filter(a=>a.type==='external');
  const internal = (aptAttacks||[]).filter(a=>a.type==='internal');
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <SectionHeader color="#a855f7">CYBER OPERATIONS INTEL</SectionHeader>
      {/* Sub-tabs */}
      <div style={{ display:'flex', gap:3, marginBottom:6 }}>
        {[['apt','🌐 APT GROUPS'],['c2','💀 C2 SERVERS'],['insider','🔓 INSIDER']].map(([t,lbl])=>(
          <button key={t} onClick={()=>setCyberTab(t)}
            style={{ flex:1, fontSize:8, padding:'4px 2px', border:`1px solid ${cyberTab===t?'#a855f7':'rgba(168,85,247,0.2)'}`, borderRadius:4, background:cyberTab===t?'rgba(168,85,247,0.15)':'transparent', color:cyberTab===t?'#a855f7':'#6b7280', cursor:'pointer' }}>
            {lbl}
          </button>
        ))}
      </div>

      {cyberTab==='apt' && (
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          <div style={{ fontSize:9, color:'#6b7280', marginBottom:2 }}>{external.length} active APT groups targeting allied bases</div>
          {external.map(apt=>{
            const ac = ATTACK_TYPE_COLOR[apt.attackType]||'#9ca3af';
            const base = MILITARY_BASES.find(b=>b.id===apt.targetBaseId);
            return (
              <div key={apt.id} style={{ padding:'7px 9px', background:`${apt.color}0d`, border:`1px solid ${apt.color}33`, borderRadius:5 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:10, fontWeight:600, color:'#f9fafb' }}>{apt.name}</span>
                  <Pill color={ac}>{apt.attackType}</Pill>
                </div>
                <div style={{ fontSize:9, color:'#6b7280', marginBottom:3 }}>{apt.country} → {base?.name||apt.targetBaseId}</div>
                <div style={{ fontSize:9, color:'#9ca3af', lineHeight:1.5 }}>{apt.description}</div>
                <div style={{ marginTop:5, display:'flex', gap:3 }}>
                  {Array.from({length:5}).map((_,i)=>(
                    <div key={i} style={{ flex:1, height:4, background:i<apt.severity?apt.color:'rgba(255,255,255,0.06)', borderRadius:2 }} />
                  ))}
                </div>
                <div style={{ fontSize:8, color:'#4b5563', marginTop:2 }}>SEVERITY {apt.severity}/5</div>
              </div>
            );
          })}
        </div>
      )}

      {cyberTab==='c2' && (
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <div style={{ fontSize:10, color:'#9ca3af', marginBottom:4 }}>{threats?.length||0} malicious C2 IPs geolocated (Feodo Tracker)</div>
          {(() => {
            const byCo = {};
            (threats||[]).forEach(t=>{ byCo[t.country]=(byCo[t.country]||0)+1; });
            return Object.entries(byCo).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([co,n])=>(
              <div key={co} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 9px', background:'rgba(168,85,247,0.05)', border:'1px solid rgba(168,85,247,0.15)', borderRadius:5 }}>
                <span style={{ fontSize:10, color:'#d1d5db' }}>{co}</span>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <div style={{ width:Math.min(n*8,80), height:4, background:'#a855f7', borderRadius:2, opacity:0.7 }} />
                  <span style={{ fontSize:10, color:'#a855f7', minWidth:18, textAlign:'right' }}>{n}</span>
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {cyberTab==='insider' && (
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          <div style={{ fontSize:9, color:'#f59e0b', marginBottom:2 }}>⚠️ {internal.length} ACTIVE INSIDER THREAT INDICATORS</div>
          {internal.map(apt=>{
            const ac = ATTACK_TYPE_COLOR[apt.attackType]||'#9ca3af';
            const base = MILITARY_BASES.find(b=>b.id===apt.targetBaseId);
            return (
              <div key={apt.id} style={{ padding:'7px 9px', background:`${apt.color}0d`, border:`1px solid ${apt.color}33`, borderRadius:5 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:10, fontWeight:600, color:'#f9fafb' }}>{apt.name}</span>
                  <Pill color={ac}>{apt.attackType}</Pill>
                </div>
                {base&&<div style={{ fontSize:9, color:'#6b7280', marginBottom:3 }}>Target: {base.name} · {base.operator}</div>}
                <div style={{ fontSize:9, color:'#9ca3af', lineHeight:1.5 }}>{apt.description}</div>
                <div style={{ marginTop:5, display:'flex', gap:3 }}>
                  {Array.from({length:5}).map((_,i)=>(
                    <div key={i} style={{ flex:1, height:4, background:i<apt.severity?apt.color:'rgba(255,255,255,0.06)', borderRadius:2 }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExplosivesPanel({ conflictEvents }) {
  const [filter, setFilter] = useState(null);
  const types = [...new Set(conflictEvents.map(e=>e.type).filter(t=>EXPLOSIVE_TYPES[t]))];
  const activeTypes = filter ? [filter] : types;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <SectionHeader color="#ff4500">MUNITIONS & EXPLOSIVES IN USE</SectionHeader>
      <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:4 }}>
        <button onClick={()=>setFilter(null)} style={{ fontSize:8, padding:'3px 7px', border:`1px solid ${!filter?'#ff4500':'rgba(255,69,0,0.2)'}`, borderRadius:4, background:!filter?'rgba(255,69,0,0.15)':'transparent', color:!filter?'#ff4500':'#6b7280', cursor:'pointer' }}>ALL</button>
        {types.map(t=>{
          const s=getEventStyle(t);
          return (
            <button key={t} onClick={()=>setFilter(filter===t?null:t)}
              style={{ fontSize:8, padding:'3px 7px', border:`1px solid ${filter===t?s.color:s.color+'30'}`, borderRadius:4, background:filter===t?`${s.color}20`:'transparent', color:filter===t?s.color:'#6b7280', cursor:'pointer' }}>
              {s.icon} {t.toUpperCase()}
            </button>
          );
        })}
      </div>
      {activeTypes.map(type=>{
        const munitions = EXPLOSIVE_TYPES[type]||[];
        if (!munitions.length) return null;
        const s = getEventStyle(type);
        return (
          <div key={type}>
            <div style={{ fontSize:9, color:s.fill, letterSpacing:'0.1em', marginBottom:4, display:'flex', alignItems:'center', gap:6 }}>
              <span>{s.icon}</span> {type.toUpperCase()} MUNITIONS
              <span style={{ fontSize:8, color:'#4b5563' }}>({conflictEvents.filter(e=>e.type===type).length} events)</span>
            </div>
            {munitions.map((ex,i)=>{
              const mc = MUNITION_COLOR[ex.category]||'#9ca3af';
              return (
                <div key={i} style={{ marginBottom:5, padding:'7px 10px', background:`${mc}0a`, border:`1px solid ${mc}25`, borderRadius:6, animation:'fade-in .3s ease' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <span style={{ fontSize:10, fontWeight:700, color:'#f9fafb' }}>{ex.name}</span>
                    <Pill color={mc}>{ex.category}</Pill>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, fontSize:9, color:'#6b7280' }}>
                    <div>💣 Yield: <span style={{ color:'#fbbf24' }}>{ex.yield}</span></div>
                    <div>✈ Platform: <span style={{ color:'#d1d5db' }}>{ex.delivery}</span></div>
                  </div>
                  {ex.notes&&<div style={{ fontSize:9, color:'#6b7280', marginTop:4, borderTop:'1px solid rgba(255,255,255,0.05)', paddingTop:4 }}>{ex.notes}</div>}
                </div>
              );
            })}
          </div>
        );
      })}
      {activeTypes.length===0 && <div style={{ fontSize:10, color:'#4b5563' }}>No conflict events loaded yet. Data populates from live feeds.</div>}
    </div>
  );
}

function HumanitarianPanel({ crises }) {
  if (!crises?.length) return <div style={{ fontSize:10, color:'#4b5563' }}>Loading…</div>;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <SectionHeader color="#f97316">HUMANITARIAN CRISES (UNHCR)</SectionHeader>
      {crises.map((c,i) => {
        const sc = c.severity==='critical'?'#ef4444':c.severity==='high'?'#f97316':'#f59e0b';
        return (
          <div key={i} style={{ padding:'6px 9px', background:`${sc}0a`, border:`1px solid ${sc}22`, borderRadius:5 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:11, fontWeight:600, color:'#f9fafb' }}>{c.country}</span>
              <Pill color={sc}>{c.severity.toUpperCase()}</Pill>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:2, fontSize:9, color:'#9ca3af' }}>
              <span>IDP: <b style={{ color:'#fb923c' }}>{(c.displaced/1e6).toFixed(1)}M</b></span>
              <span>Refugees: <b style={{ color:'#f87171' }}>{(c.refugees/1e6).toFixed(1)}M</b></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NewsPanel({ articles, loading, onRefresh }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
        <SectionHeader color="#60a5fa">GDELT LIVE FEED</SectionHeader>
        <button onClick={onRefresh} style={{ fontSize:9, color:'#10b981', background:'none', border:'none', cursor:'pointer', padding:0 }}>↻ Refresh</button>
      </div>
      {loading && <div style={{ fontSize:10, color:'#4b5563' }}>Fetching GDELT…</div>}
      {articles.map((a,i) => {
        const isX=a.url?.includes('twitter.com')||a.url?.includes('x.com');
        const isR=a.url?.includes('reddit.com');
        const c=isX?'#1d9bf0':isR?'#ff4500':'#60a5fa';
        const icon=isX?'🐦':isR?'🔴':'📰';
        return (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
            style={{ display:'block', textDecoration:'none', background:'rgba(255,255,255,0.02)', border:`1px solid ${c}18`, borderRadius:6, padding:'7px 9px' }}>
            <div style={{ display:'flex', gap:5, alignItems:'center', marginBottom:3 }}>
              <span style={{ fontSize:11 }}>{icon}</span>
              <span style={{ fontSize:9, fontFamily:'monospace', color:c }}>{a.source||'news'}</span>
              <span style={{ fontSize:9, color:'#4b5563', marginLeft:'auto' }}>{String(a.date||'').slice(0,8)}</span>
            </div>
            <div style={{ fontSize:10, color:'#d1d5db', lineHeight:1.5 }}>{a.title}</div>
          </a>
        );
      })}
    </div>
  );
}

/* ─── Agent swarm system ─────────────────────────────────────────────────── */
const AGENT_HQS = [
  { id:'osint',    label:'OSINT HQ',    lat:38.95,  lng:-77.15,  color:'#3b82f6', swarmColor:'#60a5fa' },
  { id:'threat',   label:'THREAT HQ',   lat:39.11,  lng:-76.77,  color:'#f59e0b', swarmColor:'#fbbf24' },
  { id:'scenario', label:'WARGAMES HQ', lat:38.87,  lng:-77.06,  color:'#a855f7', swarmColor:'#c084fc' },
  { id:'civilian', label:'CIVIL HQ',    lat:40.75,  lng:-73.97,  color:'#c2773a', swarmColor:'#fb923c' },
  { id:'brief',    label:'CMD HQ',      lat:50.88,  lng:4.43,    color:'#10b981', swarmColor:'#34d399' },
];

// Swarm drone SVG (20px — visible at world zoom)
function swarmDroneSvg(color='#00ffff') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20"
    style="filter:drop-shadow(0 0 4px ${color})">
    <line x1="4" y1="4" x2="16" y2="16" stroke="${color}" stroke-width="1.8"/>
    <line x1="16" y1="4" x2="4" y2="16" stroke="${color}" stroke-width="1.8"/>
    <rect x="7" y="7" width="6" height="6" rx="1" fill="${color}" opacity=".95"/>
    <circle cx="3" cy="3" r="2.5" fill="none" stroke="${color}" stroke-width="1" opacity=".7"/>
    <circle cx="17" cy="3" r="2.5" fill="none" stroke="${color}" stroke-width="1" opacity=".7"/>
    <circle cx="3" cy="17" r="2.5" fill="none" stroke="${color}" stroke-width="1" opacity=".7"/>
    <circle cx="17" cy="17" r="2.5" fill="none" stroke="${color}" stroke-width="1" opacity=".7"/>
    <polygon points="10,2 8,7 12,7" fill="${color}" opacity=".9"/>
  </svg>`;
}

function AgentSwarmLayer({ agentIntel, conflictHotspots, active }) {
  const map = useMap();
  const state = useRef([]);
  const rafId = useRef(null);

  useEffect(() => {
    // cleanup previous
    state.current.forEach(s => { s.markers?.forEach(m => m.remove()); s.trails?.forEach(t => t.remove()); s.hqMarker?.remove(); });
    state.current = [];
    cancelAnimationFrame(rafId.current);

    if (!active || !conflictHotspots?.length) return;

    const targets = conflictHotspots.slice(0, 15);
    // When agent analysis is active, swarms move faster and HQ glows brighter
    const analysisActive = !!agentIntel;
    const baseSpeed = analysisActive ? 0.00009 : 0.00005;

    AGENT_HQS.forEach((hq, agentIdx) => {
      const swarmCount = 10;
      const markers = [];
      const trails = [];
      const agentActive = analysisActive && (
        agentIntel?.osint && hq.id === 'osint' ||
        agentIntel?.threat && hq.id === 'threat' ||
        agentIntel?.scenarios && hq.id === 'scenario' ||
        agentIntel?.civilian && hq.id === 'civilian' ||
        agentIntel?.brief && hq.id === 'brief'
      );
      const hqGlow = agentActive ? `0 0 20px ${hq.color}, 0 0 40px ${hq.color}66` : `0 0 10px ${hq.color}`;

      // HQ marker — large pulsing ring + label
      const hqSize = agentActive ? 18 : 14;
      const hqIcon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:${hqSize}px;height:${hqSize}px">
          <div style="position:absolute;inset:0;border-radius:50%;background:${hq.color};box-shadow:${hqGlow};animation:apt-pulse ${agentActive?1:2}s ease-in-out infinite"></div>
          <div style="position:absolute;inset:-6px;border-radius:50%;border:1.5px solid ${hq.color};opacity:0.5;animation:diplo-ping 2s ease-out infinite"></div>
          <div style="position:absolute;top:${hqSize+3}px;left:50%;transform:translateX(-50%);white-space:nowrap;font-family:monospace;font-size:8px;color:${hq.swarmColor};letter-spacing:0.06em;text-shadow:0 0 4px ${hq.color}">${hq.label}</div>
        </div>`,
        iconSize: [hqSize, hqSize], iconAnchor: [hqSize/2, hqSize/2],
      });
      const hqMarker = L.marker([hq.lat, hq.lng], { icon: hqIcon, interactive: false, zIndexOffset: 800 }).addTo(map);

      const swarms = [];
      for (let i = 0; i < swarmCount; i++) {
        // Distribute swarms evenly across targets, with slight randomization
        const targetIdx = (agentIdx * swarmCount + i) % targets.length;
        const target = targets[targetIdx];
        // Add slight positional jitter to avoid all drones stacking
        const jitterLat = (Math.random() - 0.5) * 1.5;
        const jitterLng = (Math.random() - 0.5) * 1.5;
        const icon = L.divIcon({ className:'', html: swarmDroneSvg(hq.swarmColor), iconSize:[20,20], iconAnchor:[10,10] });
        const startLat = hq.lat + jitterLat * 0.3;
        const startLng = hq.lng + jitterLng * 0.3;
        const m = L.marker([startLat, startLng], { icon, interactive: false, zIndexOffset: 700 }).addTo(map);
        const trail = L.polyline([[startLat, startLng]], {
          color: hq.swarmColor, weight: agentActive ? 2 : 1.5, opacity: agentActive ? 0.85 : 0.65, dashArray: '3 5',
        }).addTo(map);
        markers.push(m);
        trails.push(trail);
        swarms.push({
          m, trail,
          src: { lat: startLat, lng: startLng },
          dst: { lat: target.lat + jitterLat * 0.1, lng: target.lng + jitterLng * 0.1 },
          progress: (i / swarmCount), // stagger start positions
          returning: false,
          trailPts: [{ lat: startLat, lng: startLng }],
          speed: baseSpeed + Math.random() * 0.00003,
          jitterLat, jitterLng,
          targetIdx,
        });
      }
      state.current.push({ markers, trails, hqMarker, swarms, hq, agentActive });
    });

    let last = 0;
    function step(ts) {
      const dt = Math.min(ts - last, 80);
      last = ts;
      state.current.forEach(agent => {
        agent.swarms.forEach(sw => {
          sw.progress += dt * sw.speed;
          if (sw.progress >= 1) {
            sw.progress = 0;
            sw.returning = !sw.returning;
            const tmp = sw.src;
            sw.src = sw.dst;
            sw.dst = tmp;
            // on return trip, slightly vary the route for realism
            if (!sw.returning) {
              const next = targets[(sw.targetIdx + 1) % targets.length];
              sw.dst = { lat: next.lat + sw.jitterLat * 0.1, lng: next.lng + sw.jitterLng * 0.1 };
              sw.targetIdx = (sw.targetIdx + 1) % targets.length;
            }
            sw.trailPts = [{ lat: sw.src.lat, lng: sw.src.lng }];
          }
          const lat = sw.src.lat + (sw.dst.lat - sw.src.lat) * sw.progress;
          const lng = sw.src.lng + (sw.dst.lng - sw.src.lng) * sw.progress;
          sw.m.setLatLng([lat, lng]);
          sw.trailPts.push({ lat, lng });
          if (sw.trailPts.length > 20) sw.trailPts = sw.trailPts.slice(-20);
          sw.trail.setLatLngs(sw.trailPts.map(p => [p.lat, p.lng]));
        });
      });
      rafId.current = requestAnimationFrame(step);
    }
    rafId.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId.current);
      state.current.forEach(s => {
        s.markers?.forEach(m => m.remove());
        s.trails?.forEach(t => t.remove());
        s.hqMarker?.remove();
      });
      state.current = [];
    };
  }, [map, active, conflictHotspots, agentIntel]);

  return null;
}

/* ─── Layer toggle bar ───────────────────────────────────────────────────── */
const ALL_LAYERS = [
  { id:'conflict',     label:'Conflict',     icon:'💥', color:'#ef4444' },
  { id:'hotspots',     label:'Hotspots',     icon:'🎯', color:'#f97316' },
  { id:'military',     label:'Military',     icon:'🏭', color:'#3b82f6' },
  { id:'nuclear',      label:'Nuclear',      icon:'☢️', color:'#a855f7' },
  { id:'waterways',    label:'Waterways',    icon:'⚓', color:'#06b6d4' },
  { id:'earthquakes',  label:'Earthquakes',  icon:'🫨', color:'#f59e0b' },
  { id:'natural',      label:'Natural',      icon:'🌋', color:'#10b981' },
  { id:'cyber',        label:'Cyber C2',     icon:'💻', color:'#a855f7' },
  { id:'cyberattacks', label:'APT Attacks',  icon:'🔴', color:'#ef4444' },
  { id:'humanitarian', label:'Humanitarian', icon:'🏥', color:'#f97316' },
  { id:'satellite',    label:'Satellite',    icon:'🛰️', color:'#10b981' },
  { id:'agentswarms',  label:'Agent Swarms', icon:'⬡', color:'#3b82f6' },
  { id:'movement',     label:'Population',  icon:'🚶', color:'#f97316' },
  { id:'dangerzone',   label:'Danger Zones', icon:'⚠', color:'#ef4444' },
];

/* ─── Tactical graph sub-components ─────────────────────────────────────── */
const AGENT_COLORS = { 'OSINT-AGENT':'#3b82f6','THREAT-AGENT':'#f59e0b','SCENARIO-ENGINE':'#a855f7','CIVILIAN-MODEL':'#fb923c','BRIEF-SYNTHESIS':'#10b981','SYSTEM':'#4b5563','COMMANDER':'#ffd700','ALL-AGENTS':'#10b981' };

// Semicircular escalation gauge
function EscalationGauge({ score = 0, level = 'MODERATE' }) {
  const r = 36, cx = 50, cy = 46;
  const circ = Math.PI * r;
  const clampedScore = Math.max(0, Math.min(100, score));
  const filled = circ * (clampedScore / 100);
  const color = clampedScore >= 75 ? '#ef4444' : clampedScore >= 50 ? '#f59e0b' : clampedScore >= 25 ? '#3b82f6' : '#10b981';
  // needle angle: -180deg (0) to 0deg (100), rotated from center-bottom
  const needleAngle = -180 + (clampedScore / 100) * 180;
  const rad = (needleAngle * Math.PI) / 180;
  const nx = cx + r * 0.75 * Math.cos(rad);
  const ny = cy + r * 0.75 * Math.sin(rad);
  return (
    <svg viewBox="0 0 100 56" width="110" height="62" style={{ overflow:'visible' }}>
      {/* Track arc */}
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
        fill="none" stroke="#1f2937" strokeWidth="7" strokeLinecap="round"/>
      {/* Filled arc */}
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
        fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`}
        style={{ transition:'stroke-dasharray 1s ease, stroke 0.5s ease' }}/>
      {/* Segment ticks */}
      {[0,25,50,75,100].map(v => {
        const a = (-180 + (v/100)*180) * Math.PI / 180;
        const x1 = cx + (r-8)*Math.cos(a), y1 = cy + (r-8)*Math.sin(a);
        const x2 = cx + (r+1)*Math.cos(a), y2 = cy + (r+1)*Math.sin(a);
        return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#374151" strokeWidth="1.5"/>;
      })}
      {/* Needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny}
        stroke={color} strokeWidth="2.5" strokeLinecap="round"
        style={{ transition:'x2 1s ease, y2 1s ease' }}/>
      <circle cx={cx} cy={cy} r="3.5" fill={color}/>
      {/* Score text */}
      <text x={cx} y={cy-6} textAnchor="middle" fontSize="16" fontWeight="700"
        fill={color} fontFamily="monospace">{clampedScore}</text>
      <text x={cx} y={cy+14} textAnchor="middle" fontSize="6.5"
        fill="#6b7280" fontFamily="monospace" letterSpacing="0.1em">{level}</text>
      <text x={cx-r+2} y={cy+12} fontSize="6" fill="#374151" fontFamily="monospace">0</text>
      <text x={cx+r-8} y={cy+12} fontSize="6" fill="#374151" fontFamily="monospace">100</text>
    </svg>
  );
}

// Horizontal scenario probability bars
function ScenarioBars({ scenarios = [] }) {
  const COLORS = ['#10b981','#f59e0b','#ef4444'];
  const LABELS = ['DEESC','CTRL','ESCL'];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5, flex:1 }}>
      {scenarios.slice(0,3).map((sc, i) => {
        const pct = Math.min(100, Math.max(0, sc.probability || 0));
        return (
          <div key={i}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:8, fontFamily:'monospace', color: COLORS[i], letterSpacing:'0.06em' }}>
                {LABELS[i]} · {sc.name?.split(' ').slice(-1)[0]?.slice(0,12)}
              </span>
              <span style={{ fontSize:8, fontFamily:'monospace', color:'#f9fafb', fontWeight:600 }}>{pct}%</span>
            </div>
            <div style={{ height:8, background:'#1f2937', borderRadius:4, overflow:'hidden', position:'relative' }}>
              <div style={{
                height:'100%', width:`${pct}%`, background: COLORS[i],
                borderRadius:4, transition:'width 1.2s cubic-bezier(.4,0,.2,1)',
                boxShadow:`0 0 6px ${COLORS[i]}88`,
                position:'relative',
              }}>
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,transparent 70%,rgba(255,255,255,0.15))' }}/>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Threat pattern radar (simple radial bars)
function ThreatPatternRadar({ patterns = [] }) {
  if (!patterns.length) return null;
  const count = Math.min(patterns.length, 6);
  const r = 30, cx = 40, cy = 40;
  const bars = patterns.slice(0, count).map((p, i) => {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    const len = r * (0.4 + 0.6 * Math.random()); // visual weight
    return { angle, len, label: p };
  });
  return (
    <svg viewBox="0 0 80 80" width="80" height="80">
      {/* Grid circles */}
      {[0.33, 0.66, 1].map((f, i) => (
        <circle key={i} cx={cx} cy={cy} r={r*f} fill="none" stroke="#1f2937" strokeWidth="0.5"/>
      ))}
      {/* Spokes */}
      {bars.map((b, i) => (
        <line key={i}
          x1={cx} y1={cy}
          x2={cx + r * Math.cos(b.angle)} y2={cy + r * Math.sin(b.angle)}
          stroke="#374151" strokeWidth="0.5"/>
      ))}
      {/* Fill polygon */}
      <polygon
        points={bars.map(b => `${cx + b.len * Math.cos(b.angle)},${cy + b.len * Math.sin(b.angle)}`).join(' ')}
        fill="rgba(239,68,68,0.15)" stroke="#ef4444" strokeWidth="1.2"/>
      {/* Dots */}
      {bars.map((b, i) => (
        <circle key={i} cx={cx + b.len * Math.cos(b.angle)} cy={cy + b.len * Math.sin(b.angle)}
          r="2" fill="#ef4444"/>
      ))}
      <circle cx={cx} cy={cy} r="2.5" fill="#f97316"/>
    </svg>
  );
}

/* ─── Movement Layer — civilian IDP flows + military vehicles ───────────── */

// Helper: compute bearing in degrees from (lat1,lng1) to (lat2,lng2)
function flowBearing(lat1, lng1, lat2, lng2) {
  const dL = (lng2 - lng1) * Math.PI / 180;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  return (Math.atan2(Math.sin(dL)*Math.cos(φ2), Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(dL)) * 180 / Math.PI + 360) % 360;
}

// Civilian IDP / refugee flows (orange/amber = conflict displacement)
const CIVILIAN_FLOWS = [
  { id:'cf-01', from:[31.50,34.40], to:[31.90,35.20], label:'Gaza → West Bank',       count:'2.2M',  color:'#f97316' },
  { id:'cf-02', from:[48.00,37.80], to:[50.40,30.50], label:'Donetsk → Kyiv',         count:'4.1M',  color:'#ef4444' },
  { id:'cf-03', from:[15.55,32.53], to:[12.10,15.03], label:'Khartoum → Chad',        count:'7.7M',  color:'#f59e0b' },
  { id:'cf-04', from:[19.70,96.10], to:[18.80,98.98], label:'Myanmar → Thailand',     count:'900k',  color:'#a855f7' },
  { id:'cf-05', from:[13.50,45.00], to:[12.10,43.10], label:'Yemen → Djibouti',       count:'4.3M',  color:'#3b82f6' },
  { id:'cf-06', from:[14.50,-2.00], to:[6.37,-2.42],  label:'Sahel → Côte d\'Ivoire', count:'3.5M',  color:'#10b981' },
  { id:'cf-07', from:[33.50,35.90], to:[33.87,35.50], label:'S. Lebanon → Beirut',    count:'1.2M',  color:'#f97316' },
  { id:'cf-08', from:[34.50,74.00], to:[31.55,74.34], label:'LoC → Punjab (Pak)',      count:'450k',  color:'#06b6d4' },
  // ── Northeast India ──────────────────────────────────────────────────────
  { id:'cf-09', from:[24.66,93.91], to:[26.20,92.94], label:'Manipur → Assam',        count:'68k',   color:'#f97316' },
  { id:'cf-10', from:[24.20,94.05], to:[24.66,93.91], label:'Myanmar border → Manipur',count:'35k',  color:'#a855f7' },
  { id:'cf-11', from:[26.15,94.56], to:[26.20,92.94], label:'Nagaland → Assam',       count:'28k',   color:'#f59e0b' },
  { id:'cf-12', from:[23.16,92.94], to:[23.94,91.99], label:'Mizoram → Tripura',      count:'18k',   color:'#06b6d4' },
  { id:'cf-13', from:[25.46,91.36], to:[26.20,92.94], label:'Meghalaya → Assam',      count:'12k',   color:'#10b981' },
  { id:'cf-14', from:[28.21,94.72], to:[27.10,93.61], label:'Arunachal border → Jorhat',count:'8k',  color:'#ef4444' },
  { id:'cf-15', from:[23.94,91.99], to:[23.72,90.41], label:'Tripura → Bangladesh',   count:'22k',   color:'#f97316' },
];

// Army truck convoys (olive green supply routes)
const TRUCK_ROUTES = [
  // ── Northeast India supply corridors ────────────────────────────────────
  { id:'tr-01', from:[26.72,88.43], to:[26.20,92.94], label:'Siliguri → Assam (Chicken\'s Neck)', color:'#4ade80' },
  { id:'tr-02', from:[26.20,92.94], to:[26.62,93.78], label:'Guwahati → Tezpur Depot',            color:'#4ade80' },
  { id:'tr-03', from:[26.62,93.78], to:[28.21,94.72], label:'Tezpur → Arunachal (NH13)',           color:'#4ade80' },
  { id:'tr-04', from:[25.67,93.73], to:[26.15,94.56], label:'Dimapur → Kohima (NH29)',             color:'#4ade80' },
  { id:'tr-05', from:[26.20,92.94], to:[24.66,93.91], label:'Assam → Imphal (NH2)',                color:'#4ade80' },
  { id:'tr-06', from:[24.66,93.91], to:[24.20,94.05], label:'Imphal → Moreh border (NH102)',       color:'#4ade80' },
  { id:'tr-07', from:[27.10,93.61], to:[28.21,94.72], label:'Jorhat → Arunachal depot',            color:'#4ade80' },
  // ── Global supply routes ─────────────────────────────────────────────────
  { id:'tr-08', from:[50.45,30.52], to:[49.90,36.23], label:'Kyiv → Kharkiv supply',       color:'#fbbf24' },
  { id:'tr-09', from:[49.00,31.50], to:[48.00,37.80], label:'Dnipro → Donetsk front',      color:'#fbbf24' },
  { id:'tr-10', from:[34.55,69.21], to:[34.94,69.26], label:'Kabul → Bagram remnants',     color:'#4ade80' },
  { id:'tr-11', from:[36.80,43.00], to:[35.40,35.95], label:'Mosul → Hmeimim logistics',  color:'#ef4444' },
  { id:'tr-12', from:[25.12,51.31], to:[15.35,44.21], label:'Al Udeid → Yemen ops',        color:'#3b82f6' },
  { id:'tr-13', from:[11.55,43.15], to:[12.50,43.50], label:'Djibouti → Eritrea border',   color:'#3b82f6' },
];

// Tank / armored vehicle movements (red = hostile, blue = friendly, yellow = contested)
const TANK_ROUTES = [
  // ── Northeast India / LoC armor ──────────────────────────────────────────
  { id:'tk-01', from:[32.07,75.99], to:[33.72,74.85], label:'Pathankot Armd → Jammu',     color:'#3b82f6' },
  { id:'tk-02', from:[33.72,74.85], to:[34.09,74.80], label:'Jammu → Srinagar armor',     color:'#3b82f6' },
  { id:'tk-03', from:[34.09,74.80], to:[34.53,74.07], label:'Srinagar → LoC forward',     color:'#3b82f6' },
  { id:'tk-04', from:[33.72,73.04], to:[34.53,74.07], label:'Rawalpindi → LoC (Pak)',      color:'#ef4444' },
  { id:'tk-05', from:[32.45,76.52], to:[33.18,78.00], label:'Manali → Ladakh armor',      color:'#3b82f6' },
  // ── Ukraine frontline ────────────────────────────────────────────────────
  { id:'tk-06', from:[49.99,36.23], to:[49.50,37.50], label:'Kharkiv UA armor →  front',  color:'#fbbf24' },
  { id:'tk-07', from:[51.67,33.90], to:[48.00,37.80], label:'Sumy → Donetsk thrust',      color:'#fbbf24' },
  { id:'tk-08', from:[48.70,44.50], to:[48.00,37.80], label:'RU Volgograd → Donetsk',     color:'#ef4444' },
  { id:'tk-09', from:[47.23,38.90], to:[47.51,34.59], label:'Mariupol → Zaporizhzhia',    color:'#ef4444' },
  // ── Gaza / Middle East ───────────────────────────────────────────────────
  { id:'tk-10', from:[31.54,34.89], to:[31.25,34.30], label:'IDF Armor → Gaza City',      color:'#6366f1' },
  { id:'tk-11', from:[31.36,34.50], to:[31.28,34.26], label:'IDF → Rafah',                color:'#6366f1' },
  // ── Taiwan Strait ────────────────────────────────────────────────────────
  { id:'tk-12', from:[25.05,121.53], to:[24.70,121.00], label:'ROCA armor → W. coast',    color:'#3b82f6' },
  { id:'tk-13', from:[28.70,120.67], to:[26.07,119.30], label:'PLA armor → Fuzhou',       color:'#ef4444' },
];

// Aircraft / air-force routes (fighter jets, transport, ISR)
const AIRCRAFT_ROUTES = [
  // ── Northeast India Air Force ────────────────────────────────────────────
  { id:'ac-01', from:[26.62,93.78], to:[28.21,94.72], label:'Tezpur AFB → Arunachal CAP', color:'#60a5fa', type:'fighter' },
  { id:'ac-02', from:[27.10,93.61], to:[26.15,94.56], label:'Jorhat AFB → Nagaland ISR',  color:'#60a5fa', type:'fighter' },
  { id:'ac-03', from:[24.76,93.90], to:[24.20,94.05], label:'Imphal AFB → Myanmar border',color:'#60a5fa', type:'fighter' },
  { id:'ac-04', from:[26.62,93.78], to:[33.50,78.20], label:'Tezpur → Ladakh (Su-30MKI)', color:'#60a5fa', type:'fighter' },
  { id:'ac-05', from:[26.72,88.43], to:[27.40,91.70], label:'Bagdogra → Bhutan border',   color:'#34d399', type:'transport' },
  { id:'ac-06', from:[26.20,92.94], to:[24.66,93.91], label:'Guwahati → Imphal lift',     color:'#34d399', type:'transport' },
  // ── Global air operations ────────────────────────────────────────────────
  { id:'ac-07', from:[37.00,35.43], to:[32.07,36.07], label:'Incirlik → Amman (USAF)',    color:'#3b82f6', type:'fighter' },
  { id:'ac-08', from:[26.36,127.77], to:[24.00,120.50], label:'Kadena → Taiwan Strait',   color:'#3b82f6', type:'fighter' },
  { id:'ac-09', from:[52.41,0.56],  to:[49.90,36.23], label:'Lakenheath → Kyiv (F-35)',   color:'#22c55e', type:'fighter' },
  { id:'ac-10', from:[35.40,35.95], to:[33.50,35.90], label:'Hmeimim → Beirut (RuAF)',    color:'#ef4444', type:'fighter' },
  { id:'ac-11', from:[35.40,35.95], to:[32.56,13.18], label:'Hmeimim → Tripoli (RuAF)',   color:'#ef4444', type:'fighter' },
  { id:'ac-12', from:[11.55,43.15], to:[13.50,45.00], label:'Djibouti P-8 → Red Sea ISR', color:'#3b82f6', type:'transport' },
  { id:'ac-13', from:[25.12,51.31], to:[26.17,50.61], label:'Al Udeid → Bahrain (NAVCENT)',color:'#3b82f6',type:'transport' },
  { id:'ac-14', from:[18.23,109.57], to:[12.00,114.00], label:'Sanya → SCS (PLAN J-15)', color:'#ef4444', type:'fighter' },
  { id:'ac-15', from:[48.00,37.80], to:[50.40,30.50], label:'UA Bayraktar → Kyiv RTB',    color:'#fbbf24', type:'uav' },
  // ── Shahed / Iranian drones ──────────────────────────────────────────────
  { id:'ac-16', from:[35.68,51.42], to:[31.50,34.47], label:'Iran Shahed-136 → Gaza',     color:'#ff6b35', type:'shahed' },
  { id:'ac-17', from:[33.34,44.40], to:[32.89,13.18], label:'Shahed swarm → Libya',       color:'#ff6b35', type:'shahed' },
  { id:'ac-18', from:[35.40,35.95], to:[48.00,37.80], label:'Shahed → Donetsk (via Syria)',color:'#ff4500', type:'shahed' },
  // ── Helicopters ──────────────────────────────────────────────────────────
  { id:'ac-19', from:[50.44,30.52], to:[49.50,32.00], label:'UA Mi-24 → Cherkasy CAS',    color:'#a78bfa', type:'helicopter' },
  { id:'ac-20', from:[31.54,34.89], to:[31.28,34.26], label:'IDF AH-64 → N. Gaza',        color:'#a78bfa', type:'helicopter' },
  { id:'ac-21', from:[15.50,32.56], to:[13.60,30.22], label:'SAF Mi-24 → Kordofan',       color:'#c084fc', type:'helicopter' },
  // ── UAVs / ISR ───────────────────────────────────────────────────────────
  { id:'ac-22', from:[11.55,43.15], to:[15.00,42.50], label:'MQ-9 Reaper → Yemen ISR',    color:'#fbbf24', type:'uav' },
  { id:'ac-23', from:[26.36,127.77], to:[26.00,123.00], label:'RQ-4 Global Hawk → SCS',   color:'#fde68a', type:'uav' },
  { id:'ac-24', from:[40.08,44.54], to:[39.50,47.00], label:'Bayraktar TB2 → Azerbaijan', color:'#fbbf24', type:'uav' },
];

// ── PNG icon builders for Leaflet DivIcon ────────────────────────────────
// All PNG files live in /public/ and are served as static assets.
// Rotation is applied via CSS transform on the img element.
// Color glow is preserved via drop-shadow filter.

function pngIcon(src, w, h, rot, color, fallbackShape='rect') {
  const radius = fallbackShape === 'circle' ? '50%' : '2px';
  const rotStyle = rot !== undefined ? `transform:rotate(${rot}deg);transform-origin:50% 50%;` : '';
  // Sibling-div fallback avoids all quote-escaping issues in onerror attribute.
  // onerror just hides the img and shows the pre-rendered sibling div.
  return `<div style="position:relative;width:${w}px;height:${h}px">
    <img src="${src}" width="${w}" height="${h}"
      style="${rotStyle}filter:drop-shadow(0 0 4px ${color}) brightness(1.15);display:block;position:absolute"
      onerror="this.style.display='none';this.nextSibling.style.display='block'"/>
    <div style="display:none;width:${w}px;height:${h}px;border-radius:${radius};background:${color};box-shadow:0 0 5px ${color}"></div>
  </div>`;
}

function truckSvgIcon(rot=0, color='#4ade80') {
  return pngIcon('/Tank.png', 24, 36, rot, color);
}

function tankSvgIcon(rot=0, color='#3b82f6') {
  return pngIcon('/Tank.png', 26, 34, rot, color);
}

function fighterSvgIcon(rot=0, color='#60a5fa') {
  return pngIcon('/fighter.png', 28, 32, rot, color);
}

function transportSvgIcon(rot=0, color='#34d399') {
  return pngIcon('/airplane.png', 30, 24, rot, color);
}

function shahedSvgIcon(rot=0, color='#ff6b35') {
  return pngIcon('/Shahed.png', 28, 28, rot, color);
}

function helicopterSvgIcon(rot=0, color='#a78bfa') {
  return pngIcon('/Helicopter.png', 30, 26, rot, color);
}

function uavSvgIcon(rot=0, color='#fbbf24') {
  return pngIcon('/UAV.png', 28, 28, rot, color);
}

function humanDotSvg(color='#f97316') {
  return pngIcon('/human.png', 16, 16, undefined, color, 'circle');
}

function HumanMovementLayer({ active }) {
  const map = useMap();
  const state = useRef([]);
  const rafId = useRef(null);

  useEffect(() => {
    state.current.forEach(s => {
      s.dot?.remove(); s.line?.remove(); s.originM?.remove(); s.labelM?.remove();
    });
    state.current = [];
    cancelAnimationFrame(rafId.current);
    if (!active) return;

    // Helper to spawn one animated flow
    function spawnFlow(flow, iconHtml, iconW, iconH, lineOpts, speed) {
      const [fLat,fLng] = flow.from, [tLat,tLng] = flow.to;
      const rot = flowBearing(fLat, fLng, tLat, tLng);

      const line = L.polyline([[fLat,fLng],[tLat,tLng]], lineOpts).addTo(map);

      // Origin pulse
      const originIcon = L.divIcon({
        className:'',
        html:`<div style="width:8px;height:8px;border-radius:50%;background:${lineOpts.color};box-shadow:0 0 6px ${lineOpts.color};animation:apt-pulse 1.8s ease-in-out infinite"></div>`,
        iconSize:[8,8], iconAnchor:[4,4],
      });
      const originM = L.marker([fLat,fLng], { icon:originIcon, interactive:false, zIndexOffset:400 }).addTo(map);

      // Moving icon (SVG with bearing rotation baked in)
      const actualHtml = typeof iconHtml === 'function' ? iconHtml(rot) : iconHtml;
      const dotIcon = L.divIcon({ className:'', html:actualHtml, iconSize:[iconW,iconH], iconAnchor:[iconW/2,iconH/2] });
      const dot = L.marker([fLat,fLng], { icon:dotIcon, interactive:false, zIndexOffset:650 }).addTo(map);

      // Midpoint label
      const midLat=(fLat+tLat)/2, midLng=(fLng+tLng)/2;
      const labelIcon = L.divIcon({
        className:'',
        html:`<div style="background:rgba(0,0,0,0.8);border:0.5px solid ${lineOpts.color}66;border-radius:3px;padding:1px 5px;font-family:monospace;font-size:7.5px;color:${lineOpts.color};white-space:nowrap;pointer-events:none">${flow.label}${flow.count?' · '+flow.count:''}</div>`,
        iconSize:[200,14], iconAnchor:[100,7],
      });
      const labelM = L.marker([midLat,midLng], { icon:labelIcon, interactive:false, zIndexOffset:450 }).addTo(map);

      state.current.push({ dot, line, originM, labelM, from:[fLat,fLng], to:[tLat,tLng], progress: Math.random(), speed, iconHtml, iconW, iconH });
    }

    // 1. Civilian IDP flows
    CIVILIAN_FLOWS.forEach(f => spawnFlow(f,
      (rot) => humanDotSvg(f.color), 16, 16,
      { color:f.color, weight:1.5, opacity:0.45, dashArray:'5 5' },
      0.00025 + Math.random()*0.00015
    ));

    // 2. Army truck convoys
    TRUCK_ROUTES.forEach(f => spawnFlow(f,
      (rot) => truckSvgIcon(rot, f.color), 24, 36,
      { color:f.color, weight:1.8, opacity:0.55, dashArray:'8 4' },
      0.00018 + Math.random()*0.00012
    ));

    // 3. Tank columns
    TANK_ROUTES.forEach(f => spawnFlow(f,
      (rot) => tankSvgIcon(rot, f.color), 26, 34,
      { color:f.color, weight:2, opacity:0.6, dashArray:'none' },
      0.00012 + Math.random()*0.00010
    ));

    // 4. Aircraft
    AIRCRAFT_ROUTES.forEach(f => {
      let iconFn, iconW = 30, iconH = 30;
      if (f.type === 'transport')   { iconFn = (rot) => transportSvgIcon(rot, f.color);   iconW=30; iconH=24; }
      else if (f.type === 'shahed') { iconFn = (rot) => shahedSvgIcon(rot, f.color);      iconW=28; iconH=28; }
      else if (f.type === 'helicopter') { iconFn = (rot) => helicopterSvgIcon(rot, f.color); iconW=30; iconH=26; }
      else if (f.type === 'uav')    { iconFn = (rot) => uavSvgIcon(rot, f.color);         iconW=28; iconH=28; }
      else                          { iconFn = (rot) => fighterSvgIcon(rot, f.color);     iconW=28; iconH=32; }
      spawnFlow(f,
        iconFn, iconW, iconH,
        { color:f.color, weight:1.2, opacity:0.5, dashArray:'4 8' },
        0.00035 + Math.random()*0.00025  // aircraft move fastest
      );
    });

    let last = 0;
    function step(ts) {
      const dt = Math.min(ts - last, 80);
      last = ts;
      state.current.forEach(s => {
        s.progress += dt * s.speed;
        if (s.progress > 1) s.progress = 0;
        const t = s.progress;
        const lat = s.from[0] + (s.to[0]-s.from[0]) * t;
        const lng = s.from[1] + (s.to[1]-s.from[1]) * t;
        s.dot.setLatLng([lat, lng]);
      });
      rafId.current = requestAnimationFrame(step);
    }
    rafId.current = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId.current);
      state.current.forEach(s => { s.dot?.remove(); s.line?.remove(); s.originM?.remove(); s.labelM?.remove(); });
      state.current = [];
    };
  }, [map, active]);
  return null;
}

/* ─── Hover Footage Mini-player ─────────────────────────────────────────── */
// Mapping hotspot names → best matching live stream
const HOTSPOT_FEEDS = {
  'Ukraine Front':     { id:'nU5gyDFyB28', name:'Al Jazeera' },
  'Gaza Strip':        { id:'nU5gyDFyB28', name:'Al Jazeera' },
  'Sudan Civil War':   { id:'nU5gyDFyB28', name:'Al Jazeera' },
  'Taiwan Strait':     { id:'phLMo_K5iMo', name:'DW News' },
  'South China Sea':   { id:'phLMo_K5iMo', name:'DW News' },
  'Iran Nuclear':      { id:'nU5gyDFyB28', name:'Al Jazeera' },
  'North Korea':       { id:'phLMo_K5iMo', name:'DW News' },
  'Yemen/Red Sea':     { id:'nU5gyDFyB28', name:'Al Jazeera' },
  'Myanmar':           { id:'l8PMl7tUDIE', name:'France 24' },
  'Sahel Region':      { id:'l8PMl7tUDIE', name:'France 24' },
  'Lebanon/Hezbollah': { id:'nU5gyDFyB28', name:'Al Jazeera' },
  'Pakistan-India LOC':{ id:'qHkqkpP3J0g', name:'NDTV India' },
  'Manipur (India)':   { id:'qHkqkpP3J0g', name:'NDTV India' },
  'Nagaland (NSCN)':   { id:'qHkqkpP3J0g', name:'NDTV India' },
  'Arunachal Standoff':{ id:'qHkqkpP3J0g', name:'NDTV India' },
  'Assam-Meghalaya':   { id:'qHkqkpP3J0g', name:'NDTV India' },
  'Mizoram-Myanmar':   { id:'qHkqkpP3J0g', name:'NDTV India' },
};

function HoverFootagePanel({ hotspot, news, position, onClose }) {
  if (!hotspot) return null;
  const feed = HOTSPOT_FEEDS[hotspot.name] || { id:'nU5gyDFyB28', name:'Al Jazeera' };
  const relatedNews = news.filter(a =>
    a.title?.toLowerCase().includes(hotspot.name.split(' ')[0].toLowerCase()) ||
    a.title?.toLowerCase().includes(hotspot.name.split('/')[0].toLowerCase())
  ).slice(0, 4);
  const threatColor = hotspot.escalation === 5 ? '#ef4444' : hotspot.escalation >= 4 ? '#f97316' : hotspot.escalation >= 3 ? '#f59e0b' : '#10b981';

  return (
    <div style={{
      position:'absolute', bottom:100, right:20,
      width:340, background:'rgba(4,8,16,0.97)',
      border:`1px solid ${threatColor}55`,
      borderRadius:10, zIndex:1400, overflow:'hidden',
      backdropFilter:'blur(20px)',
      boxShadow:`0 0 30px rgba(0,0,0,0.8), 0 0 15px ${threatColor}15`,
      animation:'fade-in .25s ease',
    }}>
      <div style={{ background:`${threatColor}12`, borderBottom:`1px solid ${threatColor}30`, padding:'7px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:9, fontFamily:'monospace', letterSpacing:'0.12em', color:threatColor }}>LIVE INTEL — {hotspot.name.toUpperCase()}</div>
          <div style={{ fontSize:8, color:'#6b7280', fontFamily:'monospace' }}>ESC L{hotspot.escalation} · {hotspot.trend.toUpperCase()} · {feed.name} LIVE</div>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', color:'#4b5563', cursor:'pointer', fontSize:12, lineHeight:1 }}>✕</button>
      </div>
      {/* Mini live player */}
      <div style={{ position:'relative', paddingBottom:'56.25%', height:0, overflow:'hidden' }}>
        <iframe
          key={hotspot.name}
          src={`https://www.youtube.com/embed/${feed.id}?autoplay=1&mute=1&rel=0&modestbranding=1&controls=1`}
          style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', border:'none' }}
          allow="autoplay; encrypted-media"
          allowFullScreen
          title={`Live: ${hotspot.name}`}
        />
      </div>
      {/* Related news */}
      {relatedNews.length > 0 && (
        <div style={{ padding:'6px 10px', borderTop:`1px solid ${threatColor}20` }}>
          <div style={{ fontSize:7, color:'#4b5563', fontFamily:'monospace', letterSpacing:'0.1em', marginBottom:5 }}>RELATED HEADLINES</div>
          {relatedNews.map((a,i) => (
            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
              style={{ display:'block', fontSize:9, color:'#9ca3af', lineHeight:1.4, marginBottom:3, textDecoration:'none' }}
              onMouseEnter={e=>e.currentTarget.style.color='#d1d5db'}
              onMouseLeave={e=>e.currentTarget.style.color='#9ca3af'}>
              ▸ {a.title?.slice(0,70)}{a.title?.length>70?'…':''}
            </a>
          ))}
        </div>
      )}
      {/* Hotspot summary */}
      <div style={{ padding:'5px 10px 7px', background:'rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize:9, color:'#9ca3af', lineHeight:1.4 }}>{hotspot.summary}</div>
      </div>
    </div>
  );
}

/* ─── 360° Tactical Overview Panel ──────────────────────────────────────── */
function TacticalOverview360Panel({ location, agentIntel, sarAutoOverlays, news, onClose }) {
  const [analysisAge, setAnalysisAge] = useState(null);
  useEffect(() => {
    if (!agentIntel?.timestamp) return;
    const ts = new Date(agentIntel.timestamp);
    const id = setInterval(() => {
      const diff = Math.floor((Date.now() - ts) / 1000);
      setAnalysisAge(diff < 60 ? `${diff}s ago` : `${Math.floor(diff/60)}m ago`);
    }, 1000);
    return () => clearInterval(id);
  }, [agentIntel?.timestamp]);

  if (!location) return null;

  const threat     = agentIntel?.threat;
  const scenarios  = agentIntel?.scenarios;
  const brief      = agentIntel?.brief;
  const locKey     = location.split(',')[0].toLowerCase().replace(/\s+/g, '');
  const sarItem    = (sarAutoOverlays || []).find(s => s.zone?.toLowerCase().replace(/\s+/g,'').includes(locKey) || locKey.includes(s.zone?.toLowerCase().replace(/\s+/g,'')));
  const relatedNews = (news || []).filter(a => a.title?.toLowerCase().includes(location.split(',')[0].toLowerCase().slice(0,5))).slice(0,4);
  const threatColor = threat?.level==='CRITICAL'?'#ef4444':threat?.level==='HIGH'?'#f97316':threat?.level==='MODERATE'?'#f59e0b':'#10b981';

  return (
    <div style={{
      position:'absolute', bottom:80, right:20,
      width:420, maxHeight:'65vh', overflow:'hidden',
      background:'rgba(4,8,16,0.97)',
      border:`1px solid rgba(16,185,129,0.35)`,
      borderRadius:10, zIndex:1500,
      backdropFilter:'blur(20px)',
      boxShadow:'0 0 50px rgba(0,0,0,0.85)',
      display:'flex', flexDirection:'column',
      animation:'fade-in .3s ease',
    }}>
      {/* Header */}
      <div style={{ background:'rgba(16,185,129,0.08)', borderBottom:'1px solid rgba(16,185,129,0.2)', padding:'8px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <div style={{ fontSize:7, color:'#6b7280', fontFamily:'monospace', letterSpacing:'0.16em' }}>◉ 360° TACTICAL OVERVIEW · 1-MIN BRIEF</div>
          <div style={{ fontSize:12, color:'#f9fafb', fontFamily:'monospace', fontWeight:700, letterSpacing:'0.04em' }}>{location.toUpperCase()}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {threat && <span style={{ fontSize:8, fontFamily:'monospace', color:threatColor, background:`${threatColor}18`, border:`0.5px solid ${threatColor}55`, borderRadius:4, padding:'2px 8px' }}>{threat.level} · {threat.score}/100</span>}
          {analysisAge && <span style={{ fontSize:7, color:'#4b5563', fontFamily:'monospace' }}>{analysisAge}</span>}
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#4b5563', cursor:'pointer', fontSize:13 }}>✕</button>
        </div>
      </div>

      <div style={{ overflowY:'auto', flex:1, padding:'10px 12px', display:'flex', flexDirection:'column', gap:8, scrollbarWidth:'thin', scrollbarColor:'rgba(16,185,129,0.15) transparent' }}>
        {/* SAR Satellite Image */}
        {sarItem?.previewUrl && (
          <div style={{ borderRadius:6, overflow:'hidden', border:'1px solid rgba(99,102,241,0.3)', flexShrink:0 }}>
            <img src={sarItem.previewUrl} alt="SAR" style={{ width:'100%', display:'block', maxHeight:160, objectFit:'cover' }} />
            <div style={{ padding:'3px 8px', background:'rgba(99,102,241,0.12)', fontSize:7, color:'#818cf8', fontFamily:'monospace', display:'flex', justifyContent:'space-between' }}>
              <span>🛸 SAR · {sarItem.sceneName}</span>
              <span>Sentinel-1 GRD · VV/VH</span>
            </div>
          </div>
        )}
        {sarItem && !sarItem.previewUrl && (
          <div style={{ padding:'6px 8px', background:'rgba(99,102,241,0.06)', border:'0.5px solid rgba(99,102,241,0.2)', borderRadius:5, fontSize:8, color:'#6366f1', fontFamily:'monospace' }}>
            🛸 SAR COVERAGE: {sarItem.sceneName} — preview loading or unavailable
          </div>
        )}

        {/* Graphs row: escalation gauge + scenario bars */}
        {(threat || scenarios?.scenarios?.length > 0) && (
          <div style={{ background:'rgba(255,255,255,0.02)', border:'0.5px solid rgba(255,255,255,0.07)', borderRadius:8, padding:'8px 10px' }}>
            <div style={{ fontSize:7, fontFamily:'monospace', color:'#6b7280', letterSpacing:'0.14em', marginBottom:6 }}>TACTICAL ASSESSMENT GRAPHS</div>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              {threat && <div style={{ flexShrink:0 }}><EscalationGauge score={threat.score} level={threat.level}/></div>}
              {scenarios?.scenarios?.length > 0 && (
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:7, color:'#6b7280', fontFamily:'monospace', marginBottom:5 }}>SCENARIO PROB.</div>
                  <ScenarioBars scenarios={scenarios.scenarios}/>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Next move prediction */}
        {scenarios?.nextMoveProjection && (
          <div style={{ background:'rgba(239,68,68,0.07)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:6, padding:'8px 10px', flexShrink:0 }}>
            <div style={{ fontSize:7, fontFamily:'monospace', color:'#ef4444', letterSpacing:'0.14em', marginBottom:4 }}>◈ NEXT MOVEMENT — 72H PREDICTION</div>
            <div style={{ fontSize:10, color:'#fca5a5', lineHeight:1.5 }}>{scenarios.nextMoveProjection}</div>
          </div>
        )}

        {/* Red team */}
        {scenarios?.redTeamDecision && (
          <div style={{ background:'rgba(168,85,247,0.06)', border:'0.5px solid rgba(168,85,247,0.2)', borderRadius:6, padding:'8px 10px', flexShrink:0 }}>
            <div style={{ fontSize:7, fontFamily:'monospace', color:'#a855f7', letterSpacing:'0.14em', marginBottom:4 }}>RED TEAM ADVERSARY DECISION</div>
            <div style={{ fontSize:10, color:'#c084fc', lineHeight:1.5 }}>{scenarios.redTeamDecision}</div>
          </div>
        )}

        {/* Threat patterns */}
        {threat?.patterns?.length > 0 && (
          <div style={{ flexShrink:0 }}>
            <div style={{ fontSize:7, color:'#6b7280', fontFamily:'monospace', letterSpacing:'0.1em', marginBottom:4 }}>ACTIVE THREAT PATTERNS</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {threat.patterns.map((p,i) => (
                <span key={i} style={{ fontSize:8, fontFamily:'monospace', color:'#f59e0b', background:'rgba(245,158,11,0.08)', border:'0.5px solid rgba(245,158,11,0.25)', padding:'2px 7px', borderRadius:3 }}>▲ {p}</span>
              ))}
            </div>
          </div>
        )}

        {/* Active tactics */}
        {scenarios?.activeTactics?.length > 0 && (
          <div style={{ flexShrink:0 }}>
            <div style={{ fontSize:7, color:'#6b7280', fontFamily:'monospace', letterSpacing:'0.1em', marginBottom:4 }}>ACTIVE WAR-GAME TACTICS</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {scenarios.activeTactics.map((t,i) => (
                <span key={i} style={{ fontSize:8, fontFamily:'monospace', color:'#c084fc', background:'rgba(168,85,247,0.08)', border:'0.5px solid rgba(168,85,247,0.2)', padding:'2px 7px', borderRadius:3 }}>{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Window of action */}
        {brief?.windowOfAction && (
          <div style={{ background:'rgba(245,158,11,0.07)', border:'0.5px solid rgba(245,158,11,0.25)', borderRadius:5, padding:'6px 10px', display:'flex', gap:8, alignItems:'flex-start', flexShrink:0 }}>
            <span style={{ color:'#f59e0b', fontSize:11, flexShrink:0 }}>⏱</span>
            <div>
              <div style={{ fontSize:7, fontFamily:'monospace', color:'#f59e0b', letterSpacing:'0.12em', marginBottom:2 }}>WINDOW OF ACTION</div>
              <div style={{ fontSize:10, color:'#fbbf24', lineHeight:1.4 }}>{brief.windowOfAction}</div>
            </div>
          </div>
        )}

        {/* Related news */}
        {relatedNews.length > 0 && (
          <div style={{ flexShrink:0 }}>
            <div style={{ fontSize:7, color:'#6b7280', fontFamily:'monospace', letterSpacing:'0.1em', marginBottom:5 }}>LIVE NEWS — {location.toUpperCase()}</div>
            {relatedNews.map((a,i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                style={{ display:'block', fontSize:9, color:'#9ca3af', lineHeight:1.4, marginBottom:4, textDecoration:'none', padding:'4px 6px', background:'rgba(255,255,255,0.02)', borderRadius:4, border:'0.5px solid rgba(255,255,255,0.05)' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(16,185,129,0.3)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.05)'}>
                📰 {a.title?.slice(0,75)}{a.title?.length>75?'…':''}
              </a>
            ))}
          </div>
        )}

        {/* Key findings */}
        {brief?.keyFindings?.length > 0 && (
          <div style={{ flexShrink:0 }}>
            <div style={{ fontSize:7, color:'#6b7280', fontFamily:'monospace', letterSpacing:'0.1em', marginBottom:4 }}>KEY INTELLIGENCE FINDINGS</div>
            {brief.keyFindings.slice(0,3).map((f,i) => (
              <div key={i} style={{ fontSize:9, color:'#d1d5db', lineHeight:1.5, display:'flex', gap:6, marginBottom:3 }}>
                <span style={{ color:'#10b981', flexShrink:0 }}>▸</span><span>{f}</span>
              </div>
            ))}
          </div>
        )}

        {/* No data yet */}
        {!agentIntel && (
          <div style={{ textAlign:'center', padding:'20px 0', color:'#374151', fontSize:10, fontFamily:'monospace' }}>
            <div style={{ fontSize:14, marginBottom:8 }}>⬡</div>
            <div>360° analysis running…</div>
            <div style={{ fontSize:8, marginTop:4, color:'#1f2937' }}>5-agent board + SAR + news loading</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Danger Zone Layer — auto-calculates and renders risk zones ─────────── */
// Zones are computed from: hotspot escalation + conflict events + vehicle route intersections
const DANGER_ZONES = [
  // ── Northeast India ──────────────────────────────────────────────────────
  { id:'dz-ne-01', lat:24.66, lng:93.91, r:80,  level:'CRITICAL', label:'Manipur Conflict Zone',    ops:['COIN OPS','HADR','IDP FLOW'] },
  { id:'dz-ne-02', lat:26.15, lng:94.56, r:60,  level:'HIGH',     label:'Nagaland AFSPA Zone',      ops:['COIN OPS','BORDER WATCH'] },
  { id:'dz-ne-03', lat:28.21, lng:94.72, r:120, level:'HIGH',     label:'Arunachal LAC Zone',       ops:['BORDER DEF','AIR COVER','ARMOR FWD'] },
  { id:'dz-ne-04', lat:23.16, lng:92.94, r:70,  level:'HIGH',     label:'Mizoram-Myanmar Border',   ops:['BORDER MGMT','REFUGEE OPS'] },
  { id:'dz-ne-05', lat:26.72, lng:88.43, r:50,  level:'ELEVATED', label:'Siliguri Corridor',        ops:['CRITICAL INFRA','ARTERY DEFENSE'] },
  { id:'dz-ne-06', lat:27.07, lng:93.61, r:40,  level:'ELEVATED', label:'Jorhat Forward Base',      ops:['AIR OPS','LOGISTICS HUB'] },
  // ── Global critical zones ─────────────────────────────────────────────────
  { id:'dz-gl-01', lat:31.50, lng:34.40, r:25,  level:'CRITICAL', label:'Gaza Combat Zone',         ops:['KINETIC','HADR BLOCKED','AIRSTRIKE'] },
  { id:'dz-gl-02', lat:48.00, lng:37.80, r:80,  level:'CRITICAL', label:'Donetsk Frontline',        ops:['HEAVY ARMOR','ARTY','DRONE OPS'] },
  { id:'dz-gl-03', lat:49.99, lng:36.23, r:60,  level:'CRITICAL', label:'Kharkiv Combat Zone',      ops:['URBAN COMBAT','MISSILE STRIKES'] },
  { id:'dz-gl-04', lat:34.53, lng:74.07, r:40,  level:'HIGH',     label:'LoC Hot Sector',           ops:['ARTY EXCHANGE','PATROL','ARMOR FWD'] },
  { id:'dz-gl-05', lat:15.55, lng:32.53, r:100, level:'CRITICAL', label:'Khartoum War Zone',        ops:['KINETIC','CIVIL COLLAPSE','RSF OPS'] },
  { id:'dz-gl-06', lat:13.50, lng:45.00, r:90,  level:'HIGH',     label:'Red Sea/Houthi Zone',      ops:['NAVAL THREAT','DRONE SWARMS','SHIPPING'] },
  { id:'dz-gl-07', lat:12.00, lng:114.00,r:150, level:'ELEVATED', label:'South China Sea',          ops:['NAVAL PATROL','ISR','FREEDOM OPS'] },
  { id:'dz-gl-08', lat:24.00, lng:120.50,r:120, level:'HIGH',     label:'Taiwan Strait',            ops:['AMPHIBIOUS THREAT','AIR SURGE','NAVAL'] },
  { id:'dz-gl-09', lat:19.70, lng:96.10, r:80,  level:'HIGH',     label:'Myanmar Civil War',        ops:['COIN','DISPLACEMENT','BORDER PRESSURE'] },
];

const DZ_COLORS = {
  CRITICAL: { ring:'#ef4444', fill:'rgba(239,68,68,0.06)', text:'#ef4444', dash:'none'   },
  HIGH:     { ring:'#f97316', fill:'rgba(249,115,22,0.05)', text:'#f97316', dash:'8 6'   },
  ELEVATED: { ring:'#f59e0b', fill:'rgba(245,158,11,0.04)', text:'#f59e0b', dash:'12 8'  },
  MODERATE: { ring:'#3b82f6', fill:'rgba(59,130,246,0.03)', text:'#3b82f6', dash:'14 10' },
};

function DangerZoneLayer({ active, conflictEvents }) {
  const map = useMap();
  const refs = useRef([]);

  useEffect(() => {
    refs.current.forEach(x => x?.remove());
    refs.current = [];
    if (!active) return;

    DANGER_ZONES.forEach(dz => {
      const c = DZ_COLORS[dz.level] || DZ_COLORS.MODERATE;
      const radiusM = dz.r * 1000;

      // Outer pulse ring
      const outer = L.circle([dz.lat, dz.lng], {
        radius: radiusM * 1.12, color: c.ring, weight: 0.7,
        fillOpacity: 0, opacity: 0.3, dashArray: c.dash,
      }).addTo(map);

      // Main zone fill
      const zone = L.circle([dz.lat, dz.lng], {
        radius: radiusM, color: c.ring, weight: 1.5,
        fillColor: c.ring, fillOpacity: 0.06, opacity: 0.55, dashArray: c.dash,
      }).addTo(map);

      // Zone label
      const labelHtml = `
        <div style="pointer-events:none;text-align:center;">
          <div style="background:${c.ring}22;border:0.5px solid ${c.ring}66;border-radius:4px;padding:2px 8px;display:inline-block">
            <div style="font-family:monospace;font-size:7.5px;color:${c.text};letter-spacing:0.12em;font-weight:700">${dz.level}</div>
            <div style="font-family:monospace;font-size:7px;color:${c.text};opacity:0.8">${dz.label}</div>
            <div style="font-family:monospace;font-size:6.5px;color:${c.text};opacity:0.55">${dz.ops.join(' · ')}</div>
          </div>
        </div>`;
      const labelIcon = L.divIcon({ className:'', html:labelHtml, iconSize:[200,40], iconAnchor:[100,20] });
      const labelM = L.marker([dz.lat, dz.lng], { icon:labelIcon, interactive:false, zIndexOffset:100 }).addTo(map);

      refs.current.push(outer, zone, labelM);
    });

    // Also add cluster zones around dense conflict event areas
    if (conflictEvents?.length) {
      const clusters = {};
      conflictEvents.filter(e=>['airstrike','missile','battle'].includes(e.type)).forEach(e => {
        const key = `${Math.round(e.lat)},${Math.round(e.lng)}`;
        clusters[key] = (clusters[key]||[]);
        clusters[key].push(e);
      });
      Object.values(clusters).filter(evs=>evs.length>=2).forEach(evs => {
        const avgLat = evs.reduce((s,e)=>s+e.lat,0)/evs.length;
        const avgLng = evs.reduce((s,e)=>s+e.lng,0)/evs.length;
        const deaths = evs.reduce((s,e)=>s+(e.deaths||0),0);
        const ring = deaths>50?'#ef4444':deaths>10?'#f97316':'#f59e0b';
        const r = L.circle([avgLat,avgLng], {
          radius:30000, color:ring, weight:1.2,
          fillColor:ring, fillOpacity:0.04, opacity:0.4, dashArray:'6 6',
        }).addTo(map);
        refs.current.push(r);
      });
    }

    return () => { refs.current.forEach(x=>x?.remove()); refs.current = []; };
  }, [map, active, conflictEvents]);

  return null;
}

/* ─── Operations Tracker HUD ─────────────────────────────────────────────── */
function OperationsTrackerHUD({ conflictEvents, agentIntel, sarAutoOverlays, localIntelOverlay, activeLayers, onLayerToggle }) {
  const [expanded, setExpanded] = useState(true);
  const [alertIdx,  setAlertIdx]  = useState(0);

  const movActive = activeLayers.has('movement');
  const dzActive  = activeLayers.has('dangerzone');

  const totalCivilFlow = CIVILIAN_FLOWS.length;
  const totalTrucks    = TRUCK_ROUTES.length;
  const totalTanks     = TANK_ROUTES.length;
  const totalAircraft  = AIRCRAFT_ROUTES.length;

  const criticalDz = DANGER_ZONES.filter(d=>d.level==='CRITICAL').length;
  const highDz     = DANGER_ZONES.filter(d=>d.level==='HIGH').length;

  const alerts = [
    criticalDz > 0  && `⚠ ${criticalDz} CRITICAL DANGER ZONES ACTIVE`,
    totalTanks > 0  && `🔴 ${totalTanks} ARMOR COLUMNS IN MOTION`,
    totalAircraft > 0 && `✈ ${totalAircraft} AIR SORTIES TRACKED`,
    (sarAutoOverlays?.length||0)>0 && `🛸 ${sarAutoOverlays.length} SAR OVERLAYS ACTIVE`,
    agentIntel?.threat?.level==='CRITICAL' && `◈ AGENT BOARD: CRITICAL THREAT — ${agentIntel.threat.score}/100`,
    localIntelOverlay?.location && `🛰 LOCAL INTEL ACTIVE: ${localIntelOverlay.location?.toUpperCase()}`,
  ].filter(Boolean);

  // Cycle alerts every 3s
  useEffect(() => {
    if (!alerts.length) return;
    const id = setInterval(()=>setAlertIdx(i=>(i+1)%alerts.length), 3000);
    return ()=>clearInterval(id);
  }, [alerts.length]);

  if (!expanded) {
    return (
      <div style={{ position:'absolute', top:60, left:10, zIndex:1300, cursor:'pointer' }}
        onClick={()=>setExpanded(true)}>
        <div style={{ background:'rgba(4,8,16,0.92)', border:'1px solid rgba(16,185,129,0.4)', borderRadius:6, padding:'5px 10px', display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ width:7,height:7,borderRadius:'50%',background:'#ef4444',display:'inline-block',animation:'blink 0.8s ease-in-out infinite' }}/>
          <span style={{ fontSize:8, fontFamily:'monospace', color:'#10b981', letterSpacing:'0.1em' }}>OPS TRACKER</span>
          <span style={{ fontSize:8, fontFamily:'monospace', color:'#ef4444' }}>{criticalDz} CRIT</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position:'absolute', top:60, left:10, zIndex:1300, width:230, fontFamily:'monospace' }}>
      <div style={{ background:'rgba(4,8,16,0.97)', border:'1px solid rgba(16,185,129,0.35)', borderRadius:8, overflow:'hidden', boxShadow:'0 4px 24px rgba(0,0,0,0.7)' }}>
        {/* Header */}
        <div style={{ background:'rgba(16,185,129,0.08)', borderBottom:'1px solid rgba(16,185,129,0.18)', padding:'5px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:6,height:6,borderRadius:'50%',background:'#10b981',display:'inline-block',animation:'blink 1s ease-in-out infinite' }}/>
            <span style={{ fontSize:8, color:'#10b981', letterSpacing:'0.12em', fontWeight:700 }}>OPS TRACKER</span>
          </div>
          <button onClick={()=>setExpanded(false)} style={{ background:'none',border:'none',color:'#4b5563',cursor:'pointer',fontSize:10,padding:0,lineHeight:1 }}>−</button>
        </div>

        {/* Alert ticker */}
        {alerts.length > 0 && (
          <div style={{ background:'rgba(239,68,68,0.08)', borderBottom:'1px solid rgba(239,68,68,0.2)', padding:'4px 10px', minHeight:24, display:'flex', alignItems:'center' }}>
            <span style={{ fontSize:8, color:'#ef4444', letterSpacing:'0.06em', animation:'fade-in .3s ease' }} key={alertIdx}>
              {alerts[alertIdx]}
            </span>
          </div>
        )}

        {/* Movement counts */}
        <div style={{ padding:'6px 10px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize:7, color:'#4b5563', letterSpacing:'0.1em', marginBottom:5 }}>TRACKED MOVEMENTS {movActive?'● LIVE':'○ HIDDEN'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
            {[
              { icon:'🚶', label:'IDP FLOWS',  val:totalCivilFlow, color:'#f97316', key:'movement' },
              { icon:'🚛', label:'CONVOYS',    val:totalTrucks,    color:'#4ade80', key:'movement' },
              { icon:'🔴', label:'ARMOR',      val:totalTanks,     color:'#ef4444', key:'movement' },
              { icon:'✈',  label:'AIR OPS',   val:totalAircraft,  color:'#60a5fa', key:'movement' },
            ].map((m,i)=>(
              <div key={i} style={{ background:`${m.color}0d`, border:`0.5px solid ${m.color}33`, borderRadius:5, padding:'4px 7px', cursor:'pointer' }}
                onClick={()=>onLayerToggle(m.key)}>
                <div style={{ fontSize:9, color:m.color }}>{m.icon} {m.label}</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#f9fafb' }}>{movActive?m.val:<span style={{color:'#4b5563'}}>–</span>}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Danger zones */}
        <div style={{ padding:'6px 10px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
            <div style={{ fontSize:7, color:'#4b5563', letterSpacing:'0.1em' }}>DANGER ZONES {dzActive?'● LIVE':'○ HIDDEN'}</div>
            <button onClick={()=>onLayerToggle('dangerzone')} style={{ fontSize:7, background:dzActive?'rgba(239,68,68,0.15)':'rgba(255,255,255,0.05)', border:`0.5px solid ${dzActive?'#ef444466':'#374151'}`, borderRadius:3, color:dzActive?'#ef4444':'#4b5563', padding:'1px 6px', cursor:'pointer', fontFamily:'monospace' }}>
              {dzActive?'HIDE':'SHOW'}
            </button>
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {[['CRITICAL','#ef4444'], ['HIGH','#f97316'], ['ELEVATED','#f59e0b']].map(([lv,col])=>{
              const cnt = DANGER_ZONES.filter(d=>d.level===lv).length;
              return (
                <div key={lv} style={{ flex:1, background:`${col}0d`, border:`0.5px solid ${col}44`, borderRadius:4, padding:'3px 4px', textAlign:'center' }}>
                  <div style={{ fontSize:9, fontWeight:700, color:col }}>{cnt}</div>
                  <div style={{ fontSize:6, color:col, opacity:.7, letterSpacing:'0.05em' }}>{lv.slice(0,4)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active layers quick-toggle */}
        <div style={{ padding:'6px 10px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize:7, color:'#4b5563', letterSpacing:'0.1em', marginBottom:5 }}>INTEL OVERLAYS</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
            {[
              { id:'conflict',    icon:'💥', label:'Conflict' },
              { id:'hotspots',    icon:'🎯', label:'Hotspots' },
              { id:'military',    icon:'🏭', label:'Military' },
              { id:'cyberattacks',icon:'🔴', label:'APT' },
              { id:'satellite',   icon:'🛰️', label:'SAR' },
              { id:'agentswarms', icon:'⬡',  label:'Swarms' },
            ].map(l=>{
              const on = activeLayers.has(l.id);
              return (
                <button key={l.id} onClick={()=>onLayerToggle(l.id)}
                  style={{ fontSize:7.5, padding:'2px 6px', border:`0.5px solid ${on?'rgba(16,185,129,0.5)':'rgba(255,255,255,0.08)'}`, borderRadius:3, background:on?'rgba(16,185,129,0.1)':'transparent', color:on?'#10b981':'#4b5563', cursor:'pointer', fontFamily:'monospace' }}>
                  {l.icon} {l.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected operation quick-info */}
        <div style={{ padding:'5px 10px' }}>
          <div style={{ fontSize:7, color:'#4b5563', letterSpacing:'0.1em', marginBottom:4 }}>NE INDIA OPS SUMMARY</div>
          <div style={{ fontSize:8, color:'#9ca3af', lineHeight:1.6 }}>
            <span style={{ color:'#4ade80' }}>↑</span> 7 convoy routes active<br/>
            <span style={{ color:'#60a5fa' }}>✈</span> 6 air sorties (Tezpur/Jorhat/Imphal AFB)<br/>
            <span style={{ color:'#3b82f6' }}>⚑</span> Armor fwd: Pathankot→LoC, Manali→Ladakh<br/>
            <span style={{ color:'#f97316' }}>↳</span> 7 IDP flows tracked (68k+ displaced)
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Agent Discussion Overlay (center of map, discussion auto-hides after 2s) ── */
function AgentDiscussionOverlay({ discussion, agentIntel, analysisRunning }) {
  const [discussVisible, setDiscussVisible] = useState(false);
  const [dismissed,      setDismissed]      = useState(false);
  const hideTimerRef = useRef(null);
  const scrollRef    = useRef(null);

  // Show discussion when new message arrives; auto-hide after 2s of silence
  useEffect(() => {
    if (!discussion?.length) return;
    setDiscussVisible(true);
    setDismissed(false);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setDiscussVisible(false), 2000);
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    return () => clearTimeout(hideTimerRef.current);
  }, [discussion]);

  // Always show prediction panel when analysis completes
  useEffect(() => {
    if (agentIntel) setDismissed(false);
  }, [agentIntel]);

  const hasPredictions = !!(agentIntel?.scenarios || agentIntel?.brief || agentIntel?.threat);
  const hasContent = discussVisible || hasPredictions;
  if (!hasContent || dismissed) return null;

  const scenarios = agentIntel?.scenarios;
  const brief     = agentIntel?.brief;
  const threat    = agentIntel?.threat;
  const threatColor = threat?.level==='CRITICAL'?'#ef4444':threat?.level==='HIGH'?'#f97316':threat?.level==='MODERATE'?'#f59e0b':'#10b981';

  return (
    <div style={{
      position:'absolute', top:'50%', left:'50%',
      transform:'translate(-50%,-50%)',
      zIndex:1200, width:500, maxWidth:'88vw',
      background:'rgba(4,8,16,0.97)',
      border:`1px solid ${analysisRunning ? 'rgba(16,185,129,0.6)' : 'rgba(16,185,129,0.3)'}`,
      borderRadius:10,
      boxShadow:`0 0 50px rgba(0,0,0,0.85), 0 0 80px rgba(16,185,129,0.04)${analysisRunning?', 0 0 0 1px rgba(16,185,129,0.15)':''}`,
      backdropFilter:'blur(24px)',
      overflow:'hidden',
      pointerEvents:'auto',
      animation:'fade-in .3s ease',
    }}>
      {/* ── Header ── */}
      <div style={{
        background:'rgba(16,185,129,0.07)',
        borderBottom:'1px solid rgba(16,185,129,0.18)',
        padding:'7px 12px',
        display:'flex', alignItems:'center', gap:8,
      }}>
        {analysisRunning
          ? <div style={{ width:7,height:7,borderRadius:'50%',background:'#10b981',boxShadow:'0 0 8px #10b981',animation:'blink 1s ease-in-out infinite',flexShrink:0 }}/>
          : <span style={{ fontSize:10, color:'#10b981' }}>⬡</span>
        }
        <span style={{ fontSize:9, fontFamily:'monospace', letterSpacing:'0.16em', color:'#10b981', fontWeight:600, flex:1 }}>
          AGENT BOARD · TACTICAL COMMAND · {analysisRunning ? 'LIVE ANALYSIS' : 'DECISION OUTPUT'}
        </span>
        {threat && (
          <span style={{ fontSize:8, fontFamily:'monospace', color:threatColor,
            background:`${threatColor}18`, border:`0.5px solid ${threatColor}55`,
            borderRadius:4, padding:'1px 7px', letterSpacing:'0.1em' }}>
            {threat.level} · {threat.score}/100
          </span>
        )}
        <button onClick={()=>setDismissed(true)}
          style={{ background:'none',border:'none',color:'#4b5563',cursor:'pointer',fontSize:13,padding:'0 2px',lineHeight:1 }}>✕</button>
      </div>

      {/* ── Live discussion log (auto-hides after 2s) ── */}
      {discussVisible && discussion?.length > 0 && (
        <div ref={scrollRef} style={{
          maxHeight:130, overflowY:'auto', padding:'7px 12px',
          display:'flex', flexDirection:'column', gap:4,
          borderBottom:'1px solid rgba(255,255,255,0.05)',
          scrollbarWidth:'thin', scrollbarColor:'rgba(16,185,129,0.15) transparent',
          background:'rgba(0,0,0,0.2)',
        }}>
          {discussion.slice(-8).map((d,i,arr) => {
            const fc = AGENT_COLORS[d.from] || '#9ca3af';
            const isLatest = i === arr.length - 1;
            return (
              <div key={i} style={{
                display:'flex', gap:6, alignItems:'flex-start',
                opacity: isLatest ? 1 : 0.35 + (i / arr.length) * 0.55,
                borderLeft: isLatest ? `2px solid ${fc}` : '2px solid transparent',
                paddingLeft:6,
                animation: isLatest ? 'fade-in .3s ease' : 'none',
              }}>
                <span style={{ fontSize:8, color:'#374151', fontFamily:'monospace', minWidth:52, flexShrink:0, paddingTop:1 }}>
                  {d.ts.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                </span>
                <span style={{ fontSize:8, fontFamily:'monospace', color:fc, flexShrink:0, minWidth:100 }}>[{d.from}]</span>
                <span style={{ fontSize:9, color:'#c9d1da', lineHeight:1.4, flex:1 }}>{d.msg}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tactical graphs section ── */}
      {hasPredictions && (
        <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:10 }}>

          {/* Row 1: Escalation gauge + scenario bars + pattern radar */}
          {(threat || scenarios?.scenarios?.length > 0) && (
            <div style={{
              background:'rgba(255,255,255,0.02)',
              border:'0.5px solid rgba(255,255,255,0.07)',
              borderRadius:8, padding:'10px 12px',
            }}>
              <div style={{ fontSize:8, fontFamily:'monospace', color:'#6b7280', letterSpacing:'0.14em', marginBottom:8 }}>
                TACTICAL ASSESSMENT GRAPHS
              </div>
              <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                {/* Escalation gauge */}
                {threat && (
                  <div style={{ textAlign:'center', flexShrink:0 }}>
                    <EscalationGauge score={threat.score} level={threat.level}/>
                    <div style={{ fontSize:7, color:'#4b5563', fontFamily:'monospace', marginTop:2 }}>ESCALATION</div>
                  </div>
                )}
                {/* Scenario probability bars */}
                {scenarios?.scenarios?.length > 0 && (
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:8, fontFamily:'monospace', color:'#6b7280', marginBottom:6 }}>SCENARIO PROBABILITY</div>
                    <ScenarioBars scenarios={scenarios.scenarios}/>
                  </div>
                )}
                {/* Threat pattern radar */}
                {threat?.patterns?.length > 0 && (
                  <div style={{ flexShrink:0, textAlign:'center' }}>
                    <ThreatPatternRadar patterns={threat.patterns}/>
                    <div style={{ fontSize:7, color:'#4b5563', fontFamily:'monospace', marginTop:2 }}>THREAT RADAR</div>
                  </div>
                )}
              </div>

              {/* Threat patterns as chips below */}
              {threat?.patterns?.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:8 }}>
                  {threat.patterns.map((p,i) => (
                    <span key={i} style={{
                      fontSize:8, fontFamily:'monospace',
                      color:'#f59e0b', background:'rgba(245,158,11,0.08)',
                      border:'0.5px solid rgba(245,158,11,0.25)',
                      padding:'1px 7px', borderRadius:3,
                    }}>▲ {p}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Row 2: Next move + Red team */}
          {(scenarios?.nextMoveProjection || scenarios?.redTeamDecision) && (
            <div style={{ display:'grid', gridTemplateColumns: scenarios?.redTeamDecision ? '1fr 1fr' : '1fr', gap:8 }}>
              {scenarios?.nextMoveProjection && (
                <div style={{
                  background:'rgba(239,68,68,0.07)', border:'0.5px solid rgba(239,68,68,0.3)',
                  borderRadius:7, padding:'8px 10px',
                }}>
                  <div style={{ fontSize:7, fontFamily:'monospace', color:'#ef4444', letterSpacing:'0.14em', marginBottom:4 }}>
                    ◈ NEXT MOVE — 72H
                  </div>
                  <div style={{ fontSize:10, color:'#fca5a5', lineHeight:1.5 }}>{scenarios.nextMoveProjection}</div>
                </div>
              )}
              {scenarios?.redTeamDecision && (
                <div style={{
                  background:'rgba(168,85,247,0.06)', border:'0.5px solid rgba(168,85,247,0.25)',
                  borderRadius:7, padding:'8px 10px',
                }}>
                  <div style={{ fontSize:7, fontFamily:'monospace', color:'#a855f7', letterSpacing:'0.14em', marginBottom:4 }}>
                    RED TEAM DECISION
                  </div>
                  <div style={{ fontSize:10, color:'#c084fc', lineHeight:1.5 }}>{scenarios.redTeamDecision}</div>
                </div>
              )}
            </div>
          )}

          {/* Row 3: Active tactics */}
          {scenarios?.activeTactics?.length > 0 && (
            <div>
              <div style={{ fontSize:7, fontFamily:'monospace', color:'#6b7280', letterSpacing:'0.12em', marginBottom:5 }}>ACTIVE WAR-GAME TACTICS</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                {scenarios.activeTactics.map((t,i) => (
                  <span key={i} style={{
                    fontSize:8, fontFamily:'monospace',
                    background:'rgba(168,85,247,0.1)', color:'#c084fc',
                    padding:'2px 7px', borderRadius:4, border:'0.5px solid rgba(168,85,247,0.28)',
                  }}>{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Row 4: Window of action */}
          {brief?.windowOfAction && (
            <div style={{
              background:'rgba(245,158,11,0.07)', border:'0.5px solid rgba(245,158,11,0.3)',
              borderRadius:7, padding:'8px 10px',
              display:'flex', gap:8, alignItems:'flex-start',
            }}>
              <span style={{ color:'#f59e0b', fontSize:14, flexShrink:0 }}>⏱</span>
              <div>
                <div style={{ fontSize:7, fontFamily:'monospace', color:'#f59e0b', letterSpacing:'0.12em', marginBottom:3 }}>
                  COMMANDER WINDOW OF ACTION
                </div>
                <div style={{ fontSize:10, color:'#fbbf24', lineHeight:1.5 }}>{brief.windowOfAction}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function TacticalMap({ predictedRoi, agentIntel, discussion, analysisRunning, localIntelOverlay, sarOverlay, sarAutoOverlays, onMapSearch, mapSearchTarget }) {
  const [conflictEvents, setConflictEvents] = useState([]);
  const [quakes,         setQuakes]         = useState([]);
  const [naturalEvts,    setNaturalEvts]    = useState([]);
  const [cyberThreats,   setCyberThreats]   = useState([]);
  const [humanitarian,   setHumanitarian]   = useState([]);
  const [news,           setNews]           = useState([]);
  const [newsLoading,    setNewsLoading]    = useState(true);
  const [lastUpdate,     setLastUpdate]     = useState(null);
  const [activeLayers,   setActiveLayers]   = useState(new Set(['conflict','hotspots']));
  const [activeTab,      setActiveTab]      = useState('hotspots');
  const [selectedHotspot,setSelectedHotspot]= useState(null);
  const [tickerPaused,   setTickerPaused]   = useState(false);
  const [tickerVisible,  setTickerVisible]  = useState(true);
  const [layersVisible,  setLayersVisible]  = useState(true);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [mapMode,        setMapMode]        = useState('2d'); // '2d' | '3d'
  // Floating map search
  const [mapSearch,           setMapSearch]           = useState('');
  const [mapSearchOverlay,    setMapSearchOverlay]    = useState(null); // {boundary, location}
  const [mapSearchLoading,    setMapSearchLoading]    = useState(false);
  const [mapSearchFlyTarget,  setMapSearchFlyTarget]  = useState(null); // {lat,lng,zoom}
  const [show360Panel,        setShow360Panel]        = useState(false);
  const [hoveredHotspot,      setHoveredHotspot]      = useState(null); // hotspot obj or null
  const refreshRef = useRef(null);

  // Show 360 panel whenever we have a map search + agent intel
  useEffect(() => {
    if (mapSearchOverlay?.location && agentIntel) setShow360Panel(true);
  }, [mapSearchOverlay, agentIntel]);

  // When mapSearchTarget changes (from SentinelPlatform), update search overlay on the map
  useEffect(() => {
    if (!mapSearchTarget) return;
    setMapSearch(mapSearchTarget.name || '');
    setMapSearchOverlay({ boundary: { lat: mapSearchTarget.lat, lng: mapSearchTarget.lng }, location: mapSearchTarget.name });
    setMapSearchFlyTarget({ lat: mapSearchTarget.lat, lng: mapSearchTarget.lng, zoom: 10 });
    setShow360Panel(true);
  }, [mapSearchTarget]);

  const toggleLayer = id => setActiveLayers(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Map search → boundary resolve → fly → emit to parent for 360 analysis
  const doMapSearch = useCallback(async (loc) => {
    setMapSearchLoading(true);
    try {
      const r = await fetch(`/api/local-intel?action=boundary&location=${encodeURIComponent(loc)}`);
      const d = await r.json();
      if (d.boundary) {
        setMapSearchOverlay({ boundary: d.boundary, location: loc });
        const { lat, lng } = d.boundary;
        if (lat && lng) {
          setMapSearchFlyTarget({ lat, lng, zoom: 11 });
          setShow360Panel(true);
          if (onMapSearch) onMapSearch({ lat, lng, name: loc });
        }
      }
    } catch(_) {}
    setMapSearchLoading(false);
  }, [onMapSearch]);

  const fetchAll = useCallback(async () => {
    const [ce, qk, ne, ct, hm] = await Promise.allSettled([
      fetch('/api/conflict-events').then(r=>r.json()),
      fetch('/api/earthquakes').then(r=>r.json()),
      fetch('/api/natural-events').then(r=>r.json()),
      fetch('/api/cyber-threats').then(r=>r.json()),
      fetch('/api/humanitarian').then(r=>r.json()),
    ]);
    if (ce.status==='fulfilled') setConflictEvents(ce.value.events||[]);
    if (qk.status==='fulfilled') setQuakes(qk.value.events||[]);
    if (ne.status==='fulfilled') setNaturalEvts(ne.value.events||[]);
    if (ct.status==='fulfilled') setCyberThreats(ct.value.threats||[]);
    if (hm.status==='fulfilled') setHumanitarian(hm.value.crises||[]);
    setLastUpdate(new Date());
  }, []);

  const fetchNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const q = predictedRoi?.location_name
        ? `${predictedRoi.location_name} airstrike missile bombing`
        : 'airstrike missile bombing conflict war drone';
      const r = await fetch(`/api/conflict-news?q=${encodeURIComponent(q)}&timespan=3d`);
      const d = await r.json();
      setNews(d.articles||[]);
    } catch {}
    setNewsLoading(false);
  }, [predictedRoi?.location_name]);

  useEffect(() => {
    fetchAll();
    fetchNews();
    refreshRef.current = setInterval(fetchAll, 120000);
    return () => clearInterval(refreshRef.current);
  }, [fetchAll, fetchNews]);

  useEffect(() => { if (predictedRoi) fetchNews(); }, [predictedRoi, fetchNews]);

  const flyCoords = predictedRoi?.lat && predictedRoi?.lng ? predictedRoi : null;
  const roiLat   = predictedRoi?.lat;
  const roiLng   = predictedRoi?.lng;
  const roiKm    = predictedRoi?.radius_km || 50;
  const roiColor = (predictedRoi?.deception_score||0)>.5 ? '#f59e0b' : '#ef4444';
  const roiEvents = roiLat && roiLng ? conflictEvents.filter(e=>haversineKm(roiLat,roiLng,e.lat,e.lng)<=roiKm*1.5) : [];

  // Breaking news ticker
  const tickerItems = [...news.slice(0,6).map(a=>a.title), ...INTEL_HOTSPOTS.filter(h=>h.escalation>=4).map(h=>`⚠️ ${h.name}: ${h.summary}`)];

  // Memoize swarm hotspots — stable reference so AgentSwarmLayer doesn't recreate on every render
  const swarmHotspots = useMemo(() => [
    ...(predictedRoi?.lat ? [{ lat: predictedRoi.lat, lng: predictedRoi.lng, name: predictedRoi.location_name }] : []),
    ...INTEL_HOTSPOTS.filter(h => h.escalation >= 3),
    ...conflictEvents.filter(e => ['airstrike','missile','battle'].includes(e.type)).slice(0, 10),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [predictedRoi?.lat, predictedRoi?.lng, conflictEvents.length]);

  /* ── TAB DEFINITIONS ── */
  const TABS = [
    { id:'hotspots',     label:'🎯 HOTSPOTS' },
    { id:'conflict',     label:'💥 CONFLICT' },
    { id:'explosives',   label:'💣 MUNITIONS' },
    { id:'military',     label:'🏭 MILITARY' },
    { id:'waterways',    label:'⚓ WATERWAYS' },
    { id:'earthquakes',  label:'🫨 QUAKES' },
    { id:'natural',      label:'🌋 NATURAL' },
    { id:'cyber',        label:'🔴 CYBER OPS' },
    { id:'humanitarian', label:'🏥 HUMAN' },
    { id:'intel',        label:'⬡ INTEL' },
    { id:'swarms',       label:'⬡ SWARMS' },
    { id:'news',         label:'📡 NEWS' },
  ];

  const totalDeaths = conflictEvents.reduce((s,e)=>s+(e.deaths||0),0);
  const activeConflicts = new Set(conflictEvents.map(e=>e.country)).size;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', width:'100%', background:'#060a14', color:'#f9fafb', fontFamily:'monospace' }}>
      <style>{GLOBAL_CSS}</style>

      {/* ── Breaking news ticker — with hide toggle ──────���──────────────── */}
      {tickerVisible ? (
        <div style={{ background:'rgba(239,68,68,0.12)', borderBottom:'1px solid rgba(239,68,68,0.3)', height:28, display:'flex', alignItems:'center', overflow:'hidden', flexShrink:0 }}
          onMouseEnter={()=>setTickerPaused(true)} onMouseLeave={()=>setTickerPaused(false)}>
          <div style={{ background:'#ef4444', color:'#fff', fontSize:9, fontWeight:700, letterSpacing:'0.14em', padding:'0 12px', height:'100%', display:'flex', alignItems:'center', whiteSpace:'nowrap', flexShrink:0 }}>LIVE</div>
          <div style={{ flex:1, overflow:'hidden', position:'relative' }}>
            <div style={{ display:'flex', gap:'60px', whiteSpace:'nowrap', animation:tickerPaused?'none':'ticker-scroll 45s linear infinite', fontSize:10, color:'#fca5a5', padding:'0 20px' }}>
              {tickerItems.map((t,i)=><span key={i}>{t}</span>)}
              {tickerItems.map((t,i)=><span key={`r${i}`}>{t}</span>)}
            </div>
          </div>
          <button onClick={()=>setTickerVisible(false)} style={{ padding:'0 10px', height:'100%', background:'transparent', border:'none', color:'rgba(239,68,68,0.5)', cursor:'pointer', fontSize:10, flexShrink:0 }} title="Hide ticker">✕</button>
        </div>
      ) : (
        <div style={{ height:18, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(239,68,68,0.06)', borderBottom:'1px solid rgba(239,68,68,0.15)', flexShrink:0, cursor:'pointer' }} onClick={()=>setTickerVisible(true)}>
          <span style={{ fontSize:8, color:'rgba(239,68,68,0.6)', letterSpacing:'0.1em' }}>▲ SHOW LIVE INTEL TICKER</span>
        </div>
      )}

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        {!sidebarVisible && (
          <div style={{ width:28, display:'flex', flexDirection:'column', alignItems:'center', background:'rgba(6,10,20,0.97)', borderRight:'1px solid rgba(255,255,255,0.06)', paddingTop:10 }}>
            <button onClick={()=>setSidebarVisible(true)} title="Show Live Global Intelligence"
              style={{ background:'transparent', border:'none', color:'#10b981', cursor:'pointer', fontSize:10, writing:'vertical-lr', padding:'6px 4px', letterSpacing:'0.1em' }}>
              ▶
            </button>
          </div>
        )}
        <div style={{ width:sidebarVisible?340:0, minWidth:sidebarVisible?340:0, display:'flex', flexDirection:'column', background:'rgba(6,10,20,0.97)', borderRight:'1px solid rgba(255,255,255,0.06)', overflow:'hidden', transition:'width .28s, min-width .28s' }}>

          {/* Header */}
          <div style={{ padding:'10px 14px 8px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:8, letterSpacing:'0.2em', color:'#10b981', marginBottom:2 }}>⬡ SENTINEL · TACTICAL COMMAND · WORLDMONITOR</div>
                <div style={{ fontSize:14, fontWeight:600, color:'#f9fafb' }}>Live Global Intelligence</div>
                <div style={{ fontSize:8, color:'#4b5563', marginTop:1 }}>
                  {lastUpdate ? `↻ ${lastUpdate.toLocaleTimeString()}` : 'Connecting…'} · Auto 2min
                </div>
              </div>
              <button onClick={()=>setSidebarVisible(false)} title="Hide panel"
                style={{ background:'transparent', border:'none', color:'#4b5563', cursor:'pointer', fontSize:14, padding:'0 2px', flexShrink:0, lineHeight:1 }}>
                ✕
              </button>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5, padding:'8px 10px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            <StatBox label="CONFLICTS" value={activeConflicts} color="#ef4444" blink />
            <StatBox label="DEATHS"    value={`${(totalDeaths/1000).toFixed(1)}k`} color="#9ca3af" />
            <StatBox label="QUAKES"    value={quakes.length}   color="#f59e0b" />
            <StatBox label="CYBER C2"  value={cyberThreats.length} color="#a855f7" />
          </div>

          {/* Escalation mini-bar */}
          <div style={{ padding:'6px 12px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', gap:4 }}>
            {[5,4,3,2,1].map(l => {
              const cnt = INTEL_HOTSPOTS.filter(h=>h.escalation===l).length;
              const c = ESCALATION_COLOR[l];
              return cnt>0 ? <div key={l} style={{ flex:cnt, background:`${c}33`, border:`1px solid ${c}44`, borderRadius:3, textAlign:'center', fontSize:8, color:c, padding:'2px 0' }}>L{l}:{cnt}</div> : null;
            })}
          </div>

          {/* Tabs */}
          <div className="sentinel-scroll" style={{ display:'flex', overflowX:'auto', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id)}
                style={{ padding:'7px 10px', fontSize:9, letterSpacing:'0.06em', background:'transparent', border:'none', color:activeTab===t.id?'#10b981':'#4b5563', borderBottom:activeTab===t.id?'2px solid #10b981':'2px solid transparent', cursor:'pointer', whiteSpace:'nowrap', transition:'color .15s' }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="sentinel-scroll" style={{ flex:1, overflowY:'auto', padding:'10px 10px' }}>

            {activeTab==='hotspots' && (
              <div>
                {selectedHotspot ? (
                  <div style={{ animation:'fade-in .3s ease' }}>
                    <button onClick={()=>setSelectedHotspot(null)} style={{ fontSize:9, color:'#10b981', background:'none', border:'none', cursor:'pointer', marginBottom:8, padding:0 }}>← Back</button>
                    <div style={{ fontSize:13, fontWeight:600, color:'#f9fafb', marginBottom:6 }}>{selectedHotspot.name}</div>
                    <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                      <Pill color={ESCALATION_COLOR[selectedHotspot.escalation]}>Level {selectedHotspot.escalation}</Pill>
                      <Pill color={selectedHotspot.trend==='escalating'?'#ef4444':selectedHotspot.trend==='de-escalating'?'#10b981':'#f59e0b'}>{selectedHotspot.trend.toUpperCase()}</Pill>
                    </div>
                    <div style={{ fontSize:11, color:'#d1d5db', lineHeight:1.6 }}>{selectedHotspot.summary}</div>
                    <div style={{ marginTop:10, fontSize:10, color:'#6b7280' }}>Lat {selectedHotspot.lat.toFixed(2)}, Lng {selectedHotspot.lng.toFixed(2)}</div>
                  </div>
                ) : (
                  <HotspotsPanel hotspots={INTEL_HOTSPOTS} onSelect={setSelectedHotspot} />
                )}
              </div>
            )}

            {activeTab==='conflict' && (
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <SectionHeader color="#ef4444">ACTIVE CONFLICT EVENTS</SectionHeader>
                {conflictEvents.map(e => {
                  const s = getEventStyle(e.type);
                  const inRoi = roiLat && roiLng && haversineKm(roiLat,roiLng,e.lat,e.lng)<=roiKm*1.5;
                  return (
                    <div key={e.id} style={{ background:inRoi?`${s.color}18`:'rgba(255,255,255,0.02)', border:`1px solid ${inRoi?s.color+'55':s.color+'22'}`, borderRadius:6, padding:'6px 9px' }}>
                      <div style={{ display:'flex', gap:7, alignItems:'center', marginBottom:2 }}>
                        <span style={{ fontSize:13 }}>{s.icon}</span>
                        <span style={{ fontSize:9, color:s.fill }}>{s.label}</span>
                        <span style={{ fontSize:9, color:'#6b7280', marginLeft:'auto' }}>{e.country}</span>
                        {inRoi && <span style={{ fontSize:8, color:'#10b981', background:'rgba(16,185,129,0.15)', padding:'1px 4px', borderRadius:3 }}>IN ROI</span>}
                      </div>
                      <div style={{ fontSize:10, color:'#d1d5db', lineHeight:1.4 }}>{e.description?.slice(0,80)}</div>
                      {e.deaths>0 && <div style={{ fontSize:9, color:'#9ca3af', marginTop:2 }}>💀 {e.deaths} · {e.date}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab==='explosives'   && <ExplosivesPanel   conflictEvents={conflictEvents} />}
            {activeTab==='military'     && <MilitaryPanel     bases={MILITARY_BASES} />}
            {activeTab==='waterways'    && <WaterwaysPanel    waterways={STRATEGIC_WATERWAYS} />}
            {activeTab==='earthquakes'  && <EarthquakesPanel  quakes={quakes} />}
            {activeTab==='natural'      && <NaturalEventsPanel events={naturalEvts} />}
            {activeTab==='cyber'        && <CyberPanel        threats={cyberThreats} aptAttacks={APT_ATTACKS} />}
            {activeTab==='humanitarian' && <HumanitarianPanel crises={humanitarian} />}
            {activeTab==='news'         && <NewsPanel         articles={news} loading={newsLoading} onRefresh={fetchNews} />}

            {activeTab==='intel' && (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {!predictedRoi && !agentIntel && (
                  <div style={{ fontSize:10, color:'#4b5563', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:7, padding:12, lineHeight:1.8 }}>
                    Run analysis on the Intelligence Platform.<br/>Agent intel auto-overlays here.
                  </div>
                )}
                {predictedRoi && (
                  <div style={{ background:'rgba(59,130,246,0.06)', border:'1px solid #3b82f644', borderRadius:8, padding:10 }}>
                    <SectionHeader color="#3b82f6">AGENTIC ROI</SectionHeader>
                    <div style={{ fontSize:13, fontWeight:600, color:'#f9fafb', marginBottom:3 }}>{predictedRoi.location_name}</div>
                    <div style={{ fontSize:10, color:'#9ca3af', lineHeight:1.5, marginBottom:6 }}>{predictedRoi.reasoning}</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <Pill color="#10b981">PROB {((predictedRoi.conflict_probability||0)*100).toFixed(0)}%</Pill>
                      <Pill color="#f59e0b">R={roiKm}km</Pill>
                      <Pill color="#ef4444">EVENTS IN ROI: {roiEvents.length}</Pill>
                    </div>
                    {predictedRoi.red_team_critique && (
                      <div style={{ marginTop:8, padding:'6px 9px', background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:5 }}>
                        <div style={{ fontSize:9, color:'#ef4444', marginBottom:3 }}>ARTEMIS RED TEAM</div>
                        <div style={{ fontSize:10, color:'#fca5a5', lineHeight:1.5 }}>{predictedRoi.red_team_critique}</div>
                      </div>
                    )}
                  </div>
                )}
                {agentIntel?.threat && (
                  <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:7, padding:10 }}>
                    <SectionHeader color="#f59e0b">THREAT ASSESSMENT</SectionHeader>
                    <div style={{ display:'flex', gap:6, marginBottom:6 }}>
                      <Pill color={{'CRITICAL':'#ef4444','HIGH':'#f97316','MODERATE':'#3b82f6','LOW':'#10b981'}[agentIntel.threat.level]||'#9ca3af'}>{agentIntel.threat.level}</Pill>
                      <Pill color="#9ca3af">{agentIntel.threat.score}/100</Pill>
                    </div>
                    <div style={{ fontSize:10, color:'#d1d5db', lineHeight:1.5, marginBottom:6 }}>{agentIntel.threat.summary}</div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                      {agentIntel.threat.patterns?.map((p,i)=><Pill key={i} color="#f59e0b">{p}</Pill>)}
                    </div>
                  </div>
                )}
                {agentIntel?.brief?.immediateRecommendations?.length>0 && (
                  <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:7, padding:10 }}>
                    <SectionHeader color="#10b981">COMMANDER BRIEF</SectionHeader>
                    {agentIntel.brief.windowOfAction && (
                      <div style={{ fontSize:10, color:'#ef4444', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:4, padding:'4px 8px', marginBottom:6 }}>◈ {agentIntel.brief.windowOfAction}</div>
                    )}
                    {agentIntel.brief.immediateRecommendations.slice(0,3).map((r,i)=>{
                      const c=r.priority==='IMMEDIATE'?'#ef4444':r.priority==='URGENT'?'#f59e0b':'#3b82f6';
                      return (
                        <div key={i} style={{ background:`${c}0d`, border:`1px solid ${c}33`, borderRadius:4, padding:'5px 8px', marginBottom:4 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                            <span style={{ fontSize:9, color:c }}>{r.priority}</span>
                            <span style={{ fontSize:9, color:'#4b5563' }}>{r.source}</span>
                          </div>
                          <div style={{ fontSize:10, color:'#d1d5db', lineHeight:1.4 }}>{r.action}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {agentIntel?.scenarios?.scenarios && (
                  <div style={{ background:'rgba(168,85,247,0.04)', border:'1px solid rgba(168,85,247,0.2)', borderRadius:7, padding:10 }}>
                    <SectionHeader color="#a855f7">WAR GAMES DECISIONS</SectionHeader>
                    {agentIntel.scenarios.redTeamDecision&&<div style={{ fontSize:10, color:'#fca5a5', lineHeight:1.5, marginBottom:6 }}><span style={{ color:'#ef4444', fontFamily:'monospace', fontSize:9 }}>ADVERSARY: </span>{agentIntel.scenarios.redTeamDecision}</div>}
                    {agentIntel.scenarios.nextMoveProjection&&<div style={{ fontSize:10, color:'#f87171', fontWeight:500, marginBottom:6 }}><span style={{ color:'#ef4444', fontFamily:'monospace', fontSize:9 }}>72H: </span>{agentIntel.scenarios.nextMoveProjection}</div>}
                    {agentIntel.scenarios.activeTactics?.length>0&&(
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {agentIntel.scenarios.activeTactics.map((t,i)=><Pill key={i} color="#a855f7">{t}</Pill>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Swarms tab ── */}
            {activeTab==='swarms' && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ fontSize:9, fontFamily:'monospace', color:'#10b981', letterSpacing:'0.12em', marginBottom:2 }}>⬡ AGENT SWARM NETWORK — 5 AGENTS × 10 DRONES</div>
                {AGENT_HQS.map((hq,i)=>(
                  <div key={hq.id} style={{ background:'rgba(255,255,255,0.02)', border:`0.5px solid ${hq.color}44`, borderRadius:7, padding:'8px 10px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:hq.color, boxShadow:`0 0 6px ${hq.color}` }}/>
                        <span style={{ fontSize:11, fontFamily:'monospace', color:'#f9fafb' }}>{hq.label}</span>
                      </div>
                      <span style={{ fontSize:9, fontFamily:'monospace', color:'#4b5563' }}>HQ: {hq.lat.toFixed(2)}°N {Math.abs(hq.lng).toFixed(2)}°{hq.lng<0?'W':'E'}</span>
                    </div>
                    <div style={{ display:'flex', gap:3, flexWrap:'wrap', marginBottom:5 }}>
                      {Array.from({length:10},(_,k)=>(
                        <div key={k} style={{ width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center' }}
                          dangerouslySetInnerHTML={{__html:`<svg viewBox="0 0 12 12" width="12" height="12"><line x1="3" y1="3" x2="9" y2="9" stroke="${hq.swarmColor}" stroke-width="1.2"/><line x1="9" y1="3" x2="3" y2="9" stroke="${hq.swarmColor}" stroke-width="1.2"/><rect x="4.5" y="4.5" width="3" height="3" rx="0.5" fill="${hq.swarmColor}"/></svg>`}}/>
                      ))}
                    </div>
                    <div style={{ fontSize:9, color:'#6b7280' }}>
                      10 swarms deployed · targets: {INTEL_HOTSPOTS.filter(h=>h.escalation>=3).slice(i*2, i*2+2).map(h=>h.name).join(', ')||'conflict zones'}
                    </div>
                  </div>
                ))}
                <div style={{ background:'rgba(16,185,129,0.04)', border:'0.5px solid rgba(16,185,129,0.2)', borderRadius:6, padding:'8px 10px' }}>
                  <div style={{ fontSize:9, fontFamily:'monospace', color:'#10b981', marginBottom:4 }}>SWARM NETWORK STATUS</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    {[{label:'Total Drones',val:'50 ACTIVE'},{label:'Coverage Zones',val:`${INTEL_HOTSPOTS.filter(h=>h.escalation>=3).length} HOTSPOTS`},{label:'Data Relay',val:'REAL-TIME'},{label:'Protocol',val:'MESH ENCRYPTED'}].map((s,i)=>(
                      <div key={i} style={{ background:'#111827', borderRadius:4, padding:'5px 8px' }}>
                        <div style={{ fontSize:8, color:'#4b5563', fontFamily:'monospace' }}>{s.label}</div>
                        <div style={{ fontSize:11, color:'#10b981', fontFamily:'monospace', fontWeight:600 }}>{s.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Legend strip */}
          <div style={{ padding:'7px 10px', borderTop:'1px solid rgba(255,255,255,0.06)', background:'rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:8, color:'#4b5563', marginBottom:4, letterSpacing:'0.1em' }}>ESCALATION</div>
            <div style={{ display:'flex', gap:3 }}>
              {[5,4,3,2,1].map(l=>(
                <div key={l} style={{ flex:1, height:4, background:ESCALATION_COLOR[l], borderRadius:2, opacity:.7 }} title={`Level ${l}`} />
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:7, color:'#374151', marginTop:2 }}>
              <span>ACTIVE CONFLICT</span><span>STABLE</span>
            </div>
          </div>
        </div>

        {/* ── Map area ──────────────────────────────────────────────── */}
        <div style={{ flex:1, position:'relative', overflow:'hidden' }}>

          {/* 2D / 3D mode toggle */}
          <div style={{ position:'absolute', top:10, left:'50%', transform:'translateX(-50%)', zIndex:1000, display:'flex', gap:0, background:'rgba(6,10,20,0.92)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, overflow:'hidden' }}>
            {['2d','3d'].map(m=>(
              <button key={m} onClick={()=>setMapMode(m)}
                style={{ padding:'5px 18px', fontSize:10, fontFamily:'monospace', letterSpacing:'0.1em', background:mapMode===m?'rgba(16,185,129,0.2)':'transparent', border:'none', borderRight:m==='2d'?'1px solid rgba(255,255,255,0.08)':'none', color:mapMode===m?'#10b981':'#4b5563', cursor:'pointer', transition:'all .15s' }}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Layer toggles — collapsible horizontal bar at bottom of map */}
          {layersVisible ? (
            <div style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', zIndex:1000, background:'rgba(6,10,20,0.95)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'6px 12px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', maxWidth:'95%', backdropFilter:'blur(12px)' }}>
              <span style={{ fontSize:8, color:'#6b7280', letterSpacing:'0.12em', flexShrink:0 }}>LAYERS</span>
              {ALL_LAYERS.map(l=>(
                <label key={l.id} style={{ display:'flex', gap:4, alignItems:'center', cursor:'pointer', fontSize:9, color:activeLayers.has(l.id)?l.color:'#4b5563', transition:'color .15s', whiteSpace:'nowrap' }}>
                  <input type="checkbox" checked={activeLayers.has(l.id)} onChange={()=>toggleLayer(l.id)}
                    style={{ width:9, height:9, accentColor:l.color, cursor:'pointer' }} />
                  {l.icon} {l.label}
                </label>
              ))}
              <button onClick={()=>setLayersVisible(false)} style={{ background:'transparent', border:'none', color:'#4b5563', cursor:'pointer', fontSize:10, padding:'0 2px', flexShrink:0 }} title="Hide layers">✕</button>
            </div>
          ) : (
            <div style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', zIndex:1000, background:'rgba(6,10,20,0.9)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, padding:'5px 16px', cursor:'pointer', backdropFilter:'blur(12px)' }} onClick={()=>setLayersVisible(true)}>
              <span style={{ fontSize:8, color:'#6b7280', letterSpacing:'0.12em' }}>▲ SHOW LAYERS</span>
            </div>
          )}

          {/* ── Floating map search bar ── */}
          <div style={{ position:'absolute', top:14, left:'50%', transform:'translateX(-50%)', zIndex:1100, display:'flex', gap:6, alignItems:'center', background:'rgba(6,10,20,0.92)', border:'1px solid rgba(16,185,129,0.45)', borderRadius:24, padding:'5px 8px 5px 14px', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', boxShadow:'0 4px 20px rgba(0,0,0,0.5)', minWidth:300, maxWidth:'calc(100% - 40px)' }}>
            <span style={{ fontSize:10, color:'#10b981', flexShrink:0 }}>🔍</span>
            <input
              value={mapSearch}
              onChange={e=>setMapSearch(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter'&&mapSearch.trim()) doMapSearch(mapSearch.trim()); }}
              placeholder="Search any location → 360° auto-analysis…"
              style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'#f9fafb', fontSize:11, fontFamily:'monospace', minWidth:160 }}
            />
            <button
              onClick={()=>{ if(mapSearch.trim()) doMapSearch(mapSearch.trim()); }}
              disabled={mapSearchLoading||!mapSearch.trim()}
              style={{ background:'rgba(16,185,129,.15)', border:'0.5px solid rgba(16,185,129,.5)', borderRadius:16, color:'#10b981', fontSize:9, fontFamily:'monospace', fontWeight:700, padding:'4px 12px', cursor:'pointer', flexShrink:0, letterSpacing:'0.08em', opacity: mapSearchLoading?0.5:1 }}>
              {mapSearchLoading?'SCANNING…':'360° SCAN'}
            </button>
            {mapSearchOverlay&&(
              <button onClick={()=>{ setMapSearchOverlay(null); setShow360Panel(false); }}
                style={{ background:'transparent', border:'none', color:'#4b5563', cursor:'pointer', fontSize:11, padding:'0 2px', flexShrink:0 }} title="Clear search">✕</button>
            )}
          </div>

          {/* Scan overlay on ROI */}
          {predictedRoi && (
            <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:500, overflow:'hidden', opacity:.06 }}>
              <div style={{ width:'100%', height:3, background:'linear-gradient(90deg,transparent,#00ff88,transparent)', animation:'scan-sweep 4s linear infinite' }} />
            </div>
          )}

          {/* ── Agent Discussion + Conflict Prediction overlay (center of map) ── */}
          <AgentDiscussionOverlay
            discussion={discussion}
            agentIntel={agentIntel}
            analysisRunning={analysisRunning}
          />

          {/* ── 360° Tactical Overview Panel (bottom-right, triggered by map search) ── */}
          {show360Panel && mapSearchOverlay?.location && (
            <TacticalOverview360Panel
              location={mapSearchOverlay.location}
              agentIntel={agentIntel}
              sarAutoOverlays={sarAutoOverlays}
              news={news}
              onClose={()=>setShow360Panel(false)}
            />
          )}

          {/* ── Hover Footage Mini-player (appears on hotspot hover) ── */}
          {hoveredHotspot && (
            <HoverFootagePanel
              hotspot={hoveredHotspot}
              news={news}
              onClose={()=>setHoveredHotspot(null)}
            />
          )}

          {/* ── Operations Tracker HUD (top-left, tracks all intel + movements) ── */}
          <OperationsTrackerHUD
            conflictEvents={conflictEvents}
            agentIntel={agentIntel}
            sarAutoOverlays={sarAutoOverlays}
            localIntelOverlay={localIntelOverlay}
            activeLayers={activeLayers}
            onLayerToggle={toggleLayer}
          />

          {/* 3D perspective wrapper */}
          <div style={{
            height:'100%', width:'100%', position:'relative',
            ...(mapMode==='3d' ? {
              perspective:'900px',
              perspectiveOrigin:'50% 0%',
            } : {}),
          }}>
          <div style={{
            height:'100%', width:'100%',
            ...(mapMode==='3d' ? {
              transform:'rotateX(28deg) scale(1.18)',
              transformOrigin:'50% 50%',
              transition:'transform .6s cubic-bezier(.4,0,.2,1)',
            } : {
              transform:'rotateX(0deg) scale(1)',
              transformOrigin:'50% 50%',
              transition:'transform .6s cubic-bezier(.4,0,.2,1)',
            }),
          }}>
          <MapContainer center={[20,15]} zoom={2} scrollWheelZoom style={{ height:'100%', width:'100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
              url={mapMode==='3d'
                ? "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"}
              subdomains="abcd" maxZoom={20}
            />
            {/* Satellite imagery overlay */}
            {activeLayers.has('satellite') && (
              <TileLayer
                attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19} opacity={0.55}
              />
            )}

            {/* ── SAR auto-overlays — actual images for conflict hotspots (no Pane to avoid duplicate-name errors) ── */}
            {(sarAutoOverlays || []).map((item, i) => {
              if (!item.bbox) return null;
              const b = item.bbox; // [west, south, east, north]
              const bounds = [[b[1], b[0]], [b[3], b[2]]]; // [[south,west],[north,east]]
              if (item.previewUrl && !item.previewUrl.startsWith('error:')) {
                return (
                  <ImageOverlay
                    key={`auto-img-${item.sceneName || i}`}
                    url={item.previewUrl}
                    bounds={bounds}
                    opacity={0.65}
                    zIndex={220}
                  />
                );
              }
              const footprintData = item.footprint
                ? { type:'Feature', geometry: item.footprint, properties:{} }
                : { type:'Feature', geometry:{ type:'Polygon', coordinates:[[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]],[b[0],b[1]]]] }, properties:{} };
              return (
                <GeoJSON
                  key={`auto-fp-${item.sceneName || i}`}
                  data={footprintData}
                  style={{ color:'#6366f1', weight:1.5, opacity:0.7, fillColor:'#6366f1', fillOpacity:0.07, dashArray:'4 4' }}
                />
              );
            })}

            {/* ── SAR selected scene — image overlay + border ── */}
            {sarOverlay?.bbox && !sarOverlay?.allScenes && (()=>{
              const b = sarOverlay.bbox;
              const bounds = [[b[1], b[0]], [b[3], b[2]]];
              const hasImg = sarOverlay.previewUrl && !sarOverlay.previewUrl.startsWith('error:');
              return [
                hasImg && (
                  <ImageOverlay
                    key={`sar-img-${sarOverlay.sceneName}-${sarOverlay.previewUrl?.slice(-8)}`}
                    url={sarOverlay.previewUrl}
                    bounds={bounds}
                    opacity={0.85}
                    zIndex={230}
                  />
                ),
                sarOverlay.footprint ? (
                  <GeoJSON
                    key={`sar-border-${sarOverlay.sceneName}`}
                    data={{ type:'Feature', geometry: sarOverlay.footprint, properties:{} }}
                    style={{ color:'#f59e0b', weight: hasImg ? 1.5 : 2.5, opacity: hasImg ? 0.5 : 0.95, fillColor:'transparent', fillOpacity:0, dashArray:'8 4' }}
                  />
                ) : (
                  <Circle
                    key={`sar-circle-${sarOverlay.sceneName}`}
                    center={[(b[1]+b[3])/2, (b[0]+b[2])/2]}
                    radius={Math.abs(b[2]-b[0])*55000}
                    pathOptions={{ color:'#f59e0b', weight: hasImg ? 1.5 : 2, fillColor:'transparent', fillOpacity:0, dashArray:'8 4' }}
                  />
                ),
              ].filter(Boolean);
            })()}

            {/* ── SAR analysis mode — footprint outlines for all scenes ── */}
            {sarOverlay?.allScenes && sarOverlay.allScenes.flatMap((scene, i) => {
              const hue = (i * 37) % 360;
              const color = `hsl(${hue},85%,62%)`;
              const center = scene.bbox ? [(scene.bbox[1]+scene.bbox[3])/2, (scene.bbox[0]+scene.bbox[2])/2] : null;
              const els = [];
              if (scene.geometry) {
                els.push(<GeoJSON key={`sar-fp-${scene.id||i}`} data={{ type:'Feature', geometry: scene.geometry, properties:{} }} style={{ color, weight:2, opacity:0.9, fillColor:color, fillOpacity:0.1, dashArray:'6 3' }} />);
              } else if (scene.bbox && center) {
                els.push(<Circle key={`sar-circ-${scene.id||i}`} center={center} radius={Math.abs(scene.bbox[2]-scene.bbox[0])*50000} pathOptions={{ color, weight:2, fillColor:color, fillOpacity:0.08, dashArray:'6 3' }} />);
              }
              return els;
            })}

            <MapFlyer coords={flyCoords} />
            <MapSearchFlyer target={mapSearchFlyTarget} />
            <HumanMovementLayer active={activeLayers.has('movement')} />
            <DangerZoneLayer active={activeLayers.has('dangerzone')} conflictEvents={conflictEvents} />

            {/* ROI circles */}
            {predictedRoi?.lat && predictedRoi?.lng && (<>
              <Circle center={[predictedRoi.lat,predictedRoi.lng]} radius={roiKm*1000}
                pathOptions={{ color:roiColor, fillColor:roiColor, fillOpacity:.07, dashArray:'8,12', weight:2 }} />
              <Circle center={[predictedRoi.lat,predictedRoi.lng]} radius={roiKm*400}
                pathOptions={{ color:roiColor, fillColor:roiColor, fillOpacity:.03, dashArray:'3,8', weight:1, opacity:.5 }} />
            </>)}

            {/* ── Animated drones flying between conflict zones (max 2 drones) ── */}
            {activeLayers.has('conflict') && conflictEvents.length > 3 && (
              <AnimatedDronesLayer
                waypoints={conflictEvents.filter(e=>['airstrike','drone','missile'].includes(e.type)).slice(0,8)}
              />
            )}

            {/* ── Airstrike explosion animations — only top 6 events ── */}
            {activeLayers.has('conflict') && (
              <AirstrikeEffectsLayer
                events={conflictEvents.filter(e=>['airstrike','missile','explosion'].includes(e.type)).slice(0,6)}
              />
            )}

            {/* ── Missile trails from air bases to airstrike targets ── */}
            {activeLayers.has('military') && activeLayers.has('conflict') && (
              <MissileTrailsLayer
                bases={MILITARY_BASES.filter(b=>b.type==='Air').slice(0,4)}
                targets={conflictEvents.filter(e=>['airstrike','missile'].includes(e.type)).slice(0,4)}
              />
            )}

            {/* ── APT cyber attack animations (external packet flows + internal IoC rings) ── */}
            <CyberAttackLayer
              attacks={APT_ATTACKS}
              bases={MILITARY_BASES}
              active={activeLayers.has('cyberattacks')}
            />

            {/* ── Agent intelligence swarms (5 agents × 10 drones each flying to real GDELT conflict zones) ── */}
            <AgentSwarmLayer
              agentIntel={agentIntel}
              conflictHotspots={swarmHotspots}
              active={activeLayers.has('agentswarms')}
            />

            {/* ── Conflict events ── */}
            {activeLayers.has('conflict') && conflictEvents.map(e => {
              const s=getEventStyle(e.type);
              const inRoi=roiLat&&roiLng&&haversineKm(roiLat,roiLng,e.lat,e.lng)<=roiKm*1.5;
              const r=inRoi?((['airstrike','missile','explosion'].includes(e.type))?14:10):((['airstrike','missile','explosion'].includes(e.type))?9:6);
              return (
                <CircleMarker key={e.id} center={[e.lat,e.lng]} radius={r}
                  pathOptions={{ color:s.color, fillColor:s.fill, fillOpacity:inRoi?.95:.75, weight:inRoi?2:1 }}>
                  <Tooltip direction="top" offset={[0,-r]} opacity={.95}>
                    <div style={{ fontFamily:'monospace', fontSize:11 }}>
                      <b style={{ color:s.fill }}>{s.icon} {s.label}</b><br/>
                      {e.country} · {e.date}<br/>
                      {e.deaths>0 && <>💀 {e.deaths} fatalities<br/></>}
                      {e.description?.slice(0,80)}
                      {inRoi && <><br/><b style={{ color:'#10b981' }}>⚑ INSIDE ROI</b></>}
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}

            {/* Pulse rings for airstrike/missile in ROI */}
            {activeLayers.has('conflict') && roiEvents.filter(e=>['airstrike','missile','explosion','drone'].includes(e.type)).map(e=>(
              <Circle key={`px-${e.id}`} center={[e.lat,e.lng]} radius={20000}
                pathOptions={{ color:'#ff4500', fillColor:'#ff4500', fillOpacity:.04, weight:1, dashArray:'3,9', opacity:.4 }} />
            ))}

            {/* ── Intel Hotspots ── */}
            {activeLayers.has('hotspots') && INTEL_HOTSPOTS.map(h=>{
              const c=ESCALATION_COLOR[h.escalation];
              return (
                <CircleMarker key={h.id} center={[h.lat,h.lng]} radius={h.escalation===5?16:h.escalation>=4?13:10}
                  pathOptions={{ color:c, fillColor:c, fillOpacity:.25, weight:2, dashArray:h.escalation>=4?undefined:'4,4' }}
                  eventHandlers={{
                    mouseover: () => setHoveredHotspot(h),
                    mouseout:  () => setTimeout(()=>setHoveredHotspot(null), 300),
                  }}>
                  <Tooltip direction="top" opacity={.95}>
                    <div style={{ fontFamily:'monospace', fontSize:11, minWidth:180 }}>
                      <b style={{ color:c }}>🎯 {h.name}</b><br/>
                      Level {h.escalation} · {h.trend.toUpperCase()}<br/>
                      <span style={{ color:'#ccc' }}>{h.summary}</span><br/>
                      <span style={{ color:'#666', fontSize:9 }}>Hover for live footage ↑</span>
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}

            {/* ── Military bases ── */}
            {activeLayers.has('military') && MILITARY_BASES.map(b=>{
              const c=OPERATOR_COLOR[b.operator]||OPERATOR_COLOR.default;
              return (
                <CircleMarker key={b.id} center={[b.lat,b.lng]} radius={b.size==='large'?8:6}
                  pathOptions={{ color:c, fillColor:c, fillOpacity:.8, weight:1 }}>
                  <Tooltip direction="top" opacity={.95}>
                    <div style={{ fontFamily:'monospace', fontSize:11 }}>
                      <b style={{ color:c }}>{b.type==='Naval'?'⚓':b.type==='Air'?'✈️':'🏭'} {b.name}</b><br/>
                      {b.operator} · {b.type} · {b.size}
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}

            {/* ── Nuclear facilities ── */}
            {activeLayers.has('nuclear') && NUCLEAR_SITES.map(s=>(
              <CircleMarker key={s.id} center={[s.lat,s.lng]} radius={7}
                pathOptions={{ color:'#a855f7', fillColor:'#c084fc', fillOpacity:.85, weight:2 }}>
                <Tooltip direction="top" opacity={.95}>
                  <div style={{ fontFamily:'monospace', fontSize:11 }}>
                    <b style={{ color:'#c084fc' }}>☢️ {s.name}</b><br/>
                    {s.country} · {s.type}
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}

            {/* ── Strategic waterways ── */}
            {activeLayers.has('waterways') && STRATEGIC_WATERWAYS.map(w=>{
              const c=WATERWAY_RISK_COLOR[w.risk];
              return (
                <CircleMarker key={w.id} center={[w.lat,w.lng]} radius={12}
                  pathOptions={{ color:c, fillColor:c, fillOpacity:.2, weight:2, dashArray:'6,4' }}>
                  <Tooltip direction="top" opacity={.95}>
                    <div style={{ fontFamily:'monospace', fontSize:11 }}>
                      <b style={{ color:c }}>⚓ {w.name}</b><br/>
                      Risk: {w.risk} · {w.daily_mbpd}M bbl/day
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}

            {/* ── Earthquakes ── */}
            {activeLayers.has('earthquakes') && quakes.map(q=>{
              const c=q.mag>=7?'#ef4444':q.mag>=6?'#f97316':q.mag>=5?'#f59e0b':'#eab308';
              const r=q.mag>=7?14:q.mag>=6?11:q.mag>=5?8:6;
              return (
                <CircleMarker key={q.id} center={[q.lat,q.lng]} radius={r}
                  pathOptions={{ color:c, fillColor:c, fillOpacity:.55, weight:1 }}>
                  <Tooltip direction="top" opacity={.95}>
                    <div style={{ fontFamily:'monospace', fontSize:11 }}>
                      <b style={{ color:c }}>🫨 M{q.mag}</b><br/>
                      {q.place}<br/>
                      Depth: {q.depth}km · {q.time?.slice(0,10)}{q.tsunami?' ⚠️TSUNAMI':''}
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}

            {/* ── Natural events ── */}
            {activeLayers.has('natural') && naturalEvts.map(e=>(
              <CircleMarker key={e.id} center={[e.lat,e.lng]} radius={7}
                pathOptions={{ color:'#10b981', fillColor:'#34d399', fillOpacity:.7, weight:1 }}>
                <Tooltip direction="top" opacity={.95}>
                  <div style={{ fontFamily:'monospace', fontSize:11 }}>
                    <b style={{ color:'#34d399' }}>{EONET_ICONS[e.category]||'🌐'} {e.category}</b><br/>
                    {e.title}<br/>{e.date?.slice(0,10)}
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}

            {/* ── Cyber threats ── */}
            {activeLayers.has('cyber') && cyberThreats.map((t,i)=>(
              <CircleMarker key={i} center={[t.lat,t.lng]} radius={5}
                pathOptions={{ color:'#a855f7', fillColor:'#c084fc', fillOpacity:.6, weight:1 }}>
                <Tooltip direction="top" opacity={.95}>
                  <div style={{ fontFamily:'monospace', fontSize:11 }}>
                    <b style={{ color:'#c084fc' }}>💻 C2 Server</b><br/>
                    {t.ip}<br/>{t.country} · {t.isp}
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}

            {/* ── Humanitarian ── */}
            {activeLayers.has('humanitarian') && humanitarian.map((c,i)=>{
              const sc=c.severity==='critical'?'#ef4444':c.severity==='high'?'#f97316':'#f59e0b';
              return (
                <CircleMarker key={i} center={[c.lat,c.lng]} radius={c.severity==='critical'?10:7}
                  pathOptions={{ color:sc, fillColor:sc, fillOpacity:.15, weight:2, dashArray:'5,5' }}>
                  <Tooltip direction="top" opacity={.95}>
                    <div style={{ fontFamily:'monospace', fontSize:11 }}>
                      <b style={{ color:sc }}>🏥 {c.country}</b><br/>
                      IDP: {(c.displaced/1e6).toFixed(1)}M · Ref: {(c.refugees/1e6).toFixed(1)}M<br/>
                      Severity: {c.severity.toUpperCase()}
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })}
            {/* ── Local Intelligence overlay (from panel) ── */}
            {localIntelOverlay?.boundary?.geojson && (
              <GeoJSON
                key={`li-${localIntelOverlay.location}`}
                data={localIntelOverlay.boundary.geojson}
                style={{ color:'#10b981', weight:2.5, opacity:0.9, fillColor:'#10b981', fillOpacity:0.07, dashArray:'6 3' }}
              />
            )}
            {localIntelOverlay?.boundary?.lat && !localIntelOverlay?.boundary?.geojson && (
              <Circle center={[localIntelOverlay.boundary.lat, localIntelOverlay.boundary.lng]} radius={25000}
                pathOptions={{ color:'#10b981', weight:2, fillColor:'#10b981', fillOpacity:0.07, dashArray:'6 3' }} />
            )}
            {localIntelOverlay?.boundary?.lat && (
              <CircleMarker center={[localIntelOverlay.boundary.lat, localIntelOverlay.boundary.lng]} radius={7}
                pathOptions={{ color:'#10b981', weight:2, fillColor:'#10b981', fillOpacity:0.9 }}>
                <Tooltip permanent direction="top" offset={[0,-10]}>
                  <span style={{fontFamily:'monospace',fontSize:10,color:'#10b981',fontWeight:700}}>🛰 {localIntelOverlay.location?.toUpperCase()}</span>
                </Tooltip>
              </CircleMarker>
            )}

            {/* ── Map search overlay (from floating search bar) ── */}
            {mapSearchOverlay?.boundary?.geojson && (
              <GeoJSON
                key={`ms-${mapSearchOverlay.location}`}
                data={mapSearchOverlay.boundary.geojson}
                style={{ color:'#3b82f6', weight:2.5, opacity:0.9, fillColor:'#3b82f6', fillOpacity:0.08, dashArray:'4 2' }}
              />
            )}
            {mapSearchOverlay?.boundary?.lat && !mapSearchOverlay?.boundary?.geojson && (
              <Circle center={[mapSearchOverlay.boundary.lat, mapSearchOverlay.boundary.lng]} radius={20000}
                pathOptions={{ color:'#3b82f6', weight:2, fillColor:'#3b82f6', fillOpacity:0.08, dashArray:'4 2' }} />
            )}
            {mapSearchOverlay?.boundary?.lat && (
              <CircleMarker center={[mapSearchOverlay.boundary.lat, mapSearchOverlay.boundary.lng]} radius={8}
                pathOptions={{ color:'#3b82f6', weight:2, fillColor:'#3b82f6', fillOpacity:0.9 }}>
                <Tooltip permanent direction="top" offset={[0,-10]}>
                  <span style={{fontFamily:'monospace',fontSize:10,color:'#3b82f6',fontWeight:700}}>🔍 {mapSearchOverlay.location?.toUpperCase()}</span>
                </Tooltip>
              </CircleMarker>
            )}

            {/* ── SAR auto-overlay labels ── */}
            {(sarAutoOverlays || []).map((item, i) => {
              if (!item.bbox) return null;
              const b = item.bbox;
              const center = [(b[1]+b[3])/2, (b[0]+b[2])/2];
              return (
                <CircleMarker key={`auto-lbl-${item.sceneName||i}`} center={center} radius={4}
                  pathOptions={{ color:'#6366f1', weight:1.5, fillColor:'#6366f1', fillOpacity:0.9 }}>
                  <Tooltip direction="top" offset={[0,-8]}>
                    <span style={{fontFamily:'monospace',fontSize:9,color:'#818cf8',fontWeight:700}}>
                      🛸 {item.zone} · {item.sceneName} {item.previewUrl ? '· IMG' : '· NO IMG'}
                    </span>
                  </Tooltip>
                </CircleMarker>
              );
            })}

            {/* ── SAR marker labels — above tactical layer so tooltips are readable ── */}
            {sarOverlay?.bbox && !sarOverlay?.allScenes && (
              <CircleMarker center={[(sarOverlay.bbox[1]+sarOverlay.bbox[3])/2, (sarOverlay.bbox[0]+sarOverlay.bbox[2])/2]} radius={7}
                pathOptions={{ color:'#f59e0b', weight:2, fillColor:'#f59e0b', fillOpacity:0.9 }}>
                <Tooltip permanent direction="top" offset={[0,-10]}>
                  <span style={{fontFamily:'monospace',fontSize:10,color:'#f59e0b',fontWeight:700}}>🛸 {sarOverlay.sceneName?.substring(0,20)?.toUpperCase() || 'SAR SCENE'}</span>
                </Tooltip>
              </CircleMarker>
            )}
            {sarOverlay?.allScenes && sarOverlay.allScenes.map((scene, i) => {
              const hue = (i * 37) % 360;
              const color = `hsl(${hue},85%,62%)`;
              const center = scene.bbox
                ? [(scene.bbox[1]+scene.bbox[3])/2, (scene.bbox[0]+scene.bbox[2])/2]
                : null;
              return center ? (
                <CircleMarker key={`sar-lbl-${scene.id||i}`} center={center} radius={5}
                  pathOptions={{ color, weight:1.5, fillColor:color, fillOpacity:0.9 }}>
                  <Tooltip direction="top" offset={[0,-8]}>
                    <span style={{fontFamily:'monospace',fontSize:9,color,fontWeight:700}}>
                      🛸 Scene {i+1} · {scene.date_label||scene.date?.slice(0,10)} · {scene.orbit}
                    </span>
                  </Tooltip>
                </CircleMarker>
              ) : null;
            })}
            {sarOverlay?.allScenes && (() => {
              const first = sarOverlay.allScenes.find(s => s.bbox);
              const center = first?.bbox ? [(first.bbox[1]+first.bbox[3])/2, (first.bbox[0]+first.bbox[2])/2] : null;
              return center ? (
                <CircleMarker center={center} radius={0} pathOptions={{opacity:0,fillOpacity:0}}>
                  <Tooltip permanent direction="top" offset={[0,-14]}>
                    <span style={{fontFamily:'monospace',fontSize:9,color:'#a855f7',fontWeight:700}}>
                      ⬡ SAR ANALYSIS · {sarOverlay.allScenes.length} SCENES
                    </span>
                  </Tooltip>
                </CircleMarker>
              ) : null;
            })()}
          </MapContainer>
          </div>{/* 3d-transform inner */}
          </div>{/* 3d-perspective outer */}
        </div>
      </div>
    </div>
  );
}
