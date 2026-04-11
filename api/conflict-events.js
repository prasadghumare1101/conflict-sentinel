const axios = require('axios');

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const KNOWN_CONFLICT_ZONES = [
  { id:'ukr-01', lat:48.3794, lng:38.0297, country:'Ukraine',   type:'battle',    deaths:120, side_a:'Ukraine Armed Forces', side_b:'Russian Federation',   description:'Frontline clashes in Donetsk Oblast — drone + artillery',        date:daysAgo(1) },
  { id:'ukr-02', lat:47.8388, lng:35.1396, country:'Ukraine',   type:'airstrike', deaths:8,   side_a:'Russian Air Force',    side_b:'Energy infrastructure', description:'Kh-101 cruise missile strike on Zaporizhzhia power grid',        date:daysAgo(2) },
  { id:'ukr-03', lat:50.4501, lng:30.5234, country:'Ukraine',   type:'airstrike', deaths:5,   side_a:'Russian Air Force',    side_b:'Kyiv city',             description:'Shahed-136 drone swarm attack on Kyiv',                         date:daysAgo(1) },
  { id:'ukr-04', lat:48.0159, lng:37.8028, country:'Ukraine',   type:'battle',    deaths:200, side_a:'Ukraine Armed Forces', side_b:'Russian Federation',   description:'Urban combat — Donetsk city center',                             date:daysAgo(3) },
  { id:'ukr-05', lat:49.9935, lng:36.2304, country:'Ukraine',   type:'missile',   deaths:14,  side_a:'Russian Federation',   side_b:'Kharkiv city',          description:'Iskander-M ballistic missile strike on Kharkiv',                date:daysAgo(1) },
  { id:'ukr-06', lat:47.1000, lng:37.5400, country:'Ukraine',   type:'drone',     deaths:0,   side_a:'Ukraine Armed Forces', side_b:'Russian territory',    description:'Ukrainian FPV drone strike on logistics depot',                  date:daysAgo(2) },
  { id:'gza-01', lat:31.5017, lng:34.4668, country:'Palestine', type:'airstrike', deaths:450, side_a:'Israeli Air Force',    side_b:'Gaza City',             description:'Airstrikes on northern Gaza — GBU-39 SDB munitions',            date:daysAgo(1) },
  { id:'gza-02', lat:31.3479, lng:34.3071, country:'Palestine', type:'airstrike', deaths:320, side_a:'Israeli Air Force',    side_b:'Khan Yunis',            description:'Strikes in Khan Yunis + ground operation',                      date:daysAgo(2) },
  { id:'gza-03', lat:31.2827, lng:34.2654, country:'Palestine', type:'battle',    deaths:180, side_a:'IDF',                  side_b:'Hamas',                 description:'Ground incursion — Rafah corridor',                             date:daysAgo(3) },
  { id:'sdn-01', lat:15.5007, lng:32.5599, country:'Sudan',     type:'battle',    deaths:310, side_a:'SAF',                  side_b:'RSF',                   description:'RSF assault on Khartoum — urban warfare',                       date:daysAgo(2) },
  { id:'sdn-02', lat:13.4432, lng:22.4555, country:'Sudan',     type:'one-sided', deaths:175, side_a:'RSF',                  side_b:'Civilians',             description:'Civilian mass casualties in Darfur',                            date:daysAgo(5) },
  { id:'syr-01', lat:36.2021, lng:37.1343, country:'Syria',     type:'airstrike', deaths:22,  side_a:'Israeli Air Force',    side_b:'Iranian-linked sites',  description:'Israeli strikes on weapons depots near Aleppo',                 date:daysAgo(4) },
  { id:'syr-02', lat:33.5138, lng:36.2765, country:'Syria',     type:'airstrike', deaths:18,  side_a:'Israeli Air Force',    side_b:'Damascus suburbs',      description:'Israeli air operation — southern Damascus',                      date:daysAgo(1) },
  { id:'yem-01', lat:15.3694, lng:44.1910, country:'Yemen',     type:'airstrike', deaths:30,  side_a:'Saudi Coalition',      side_b:'Houthi forces',         description:'Coalition airstrikes on Sanaa military sites',                  date:daysAgo(3) },
  { id:'yem-02', lat:14.7976, lng:42.9540, country:'Yemen',     type:'missile',   deaths:0,   side_a:'Houthi IRGC',          side_b:'Red Sea shipping',      description:'Houthi missile fired at Red Sea shipping lane',                 date:daysAgo(1) },
  { id:'mmr-01', lat:21.9162, lng:95.9560, country:'Myanmar',   type:'battle',    deaths:55,  side_a:'PDF/EAOs',             side_b:'Myanmar Military',      description:'Resistance forces offensive — Mandalay region',                 date:daysAgo(4) },
  { id:'eth-01', lat:13.5137, lng:39.4699, country:'Ethiopia',  type:'battle',    deaths:88,  side_a:'ENDF',                 side_b:'Fano militia',          description:'Clashes in Amhara region — mortar & small arms',                date:daysAgo(6) },
  { id:'som-01', lat:2.0469,  lng:45.3182, country:'Somalia',   type:'airstrike', deaths:12,  side_a:'US/Somali forces',     side_b:'Al-Shabaab',            description:'US Reaper airstrike on Al-Shabaab command position',            date:daysAgo(2) },
  { id:'mli-01', lat:14.6500, lng:-4.0000, country:'Mali',      type:'battle',    deaths:34,  side_a:'JNIM',                 side_b:'Wagner/FAMA',           description:'JNIM ambush on military convoy — IED + RPG',                   date:daysAgo(7) },
  { id:'lbn-01', lat:33.5138, lng:35.8808, country:'Lebanon',   type:'airstrike', deaths:12,  side_a:'Israeli Air Force',    side_b:'Hezbollah remnants',    description:'IDF precision strike on Hezbollah resupply route',              date:daysAgo(2) },
  { id:'irq-01', lat:33.3406, lng:44.4009, country:'Iraq',      type:'drone',     deaths:9,   side_a:'IRGC/PMF',             side_b:'Military targets',      description:'Iranian-backed PMF Shahed-type drone strike',                   date:daysAgo(3) },
  { id:'pak-01', lat:33.7294, lng:73.0931, country:'Pakistan',  type:'airstrike', deaths:28,  side_a:'Pakistan Air Force',   side_b:'TTP positions',         description:'PAF strike on TTP militant camp — Khyber Pakhtunkhwa',         date:daysAgo(5) },
  { id:'rus-01', lat:55.7558, lng:37.6176, country:'Russia',    type:'drone',     deaths:0,   side_a:'Ukraine GUR',          side_b:'Moscow region',         description:'Ukrainian long-range drone intercepted near Moscow',             date:daysAgo(1) },
  // Indian subcontinent
  { id:'ind-01', lat:34.0837, lng:74.7973, country:'India',    type:'battle',    deaths:4,   side_a:'Indian Army',          side_b:'Militant groups',       description:'Counter-insurgency operation in Kashmir Valley — encounter',     date:daysAgo(3) },
  { id:'ind-02', lat:32.7266, lng:74.8570, country:'India',    type:'airstrike', deaths:0,   side_a:'Indian Air Force',     side_b:'LoC positions',         description:'IAF patrol along Line of Control — Jammu sector',               date:daysAgo(5) },
  { id:'pak-02', lat:34.0151, lng:71.5249, country:'Pakistan', type:'battle',    deaths:8,   side_a:'Pakistan Army',        side_b:'TTP insurgents',        description:'Pakistan Army operation against TTP in FATA region',             date:daysAgo(2) },
  { id:'ind-03', lat:24.8170, lng:93.9368, country:'India',    type:'one-sided', deaths:2,   side_a:'Militant groups',      side_b:'Civilians',             description:'Armed militant attack in Manipur — ethnic violence ongoing',     date:daysAgo(4) },
  { id:'ind-04', lat:18.9322, lng:82.1000, country:'India',    type:'battle',    deaths:3,   side_a:'CRPF/Security Forces', side_b:'Naxal/Maoist groups',   description:'CRPF encounter with Naxal group in Chhattisgarh',               date:daysAgo(6) },
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=airstrike+missile+bombing+battle+explosion+drone+attack+sourcelang:eng&mode=artlist&maxrecords=25&format=json&timespan=30d&sort=DateDesc`;
    let gdeltArticles = [];
    try {
      const gdeltResp = await axios.get(gdeltUrl, { timeout: 8000 });
      gdeltArticles = gdeltResp.data?.articles || [];
    } catch (e) { console.warn('GDELT fetch failed:', e.message); }

    let aiEvents = [];
    if (gdeltArticles.length > 0 && process.env.HF_TOKEN) {
      const headlines = gdeltArticles.slice(0, 12).map((a, i) => `${i + 1}. ${a.title}`).join('\n');
      try {
        const decisionToken = process.env.HF_DECISION_TOKEN || process.env.HF_TOKEN;
        const hfResp = await axios.post(
          'https://router.huggingface.co/v1/chat/completions',
          {
            model: 'meta-llama/Llama-3.1-8B-Instruct:fastest',
            messages: [
              { role: 'system', content: `You are a conflict event extractor. Given news headlines, extract conflict events with their geolocations. Respond ONLY with a JSON array, no markdown. Each item: {"lat":number,"lng":number,"country":"string","type":"airstrike|battle|missile|drone|explosion|one-sided","deaths":number,"description":"string","date":"YYYY-MM-DD"}. Only include events with specific locations. If unsure of coordinates, skip the event.` },
              { role: 'user', content: `Extract conflict events from these headlines:\n${headlines}` },
            ],
            max_tokens: 1000,
            temperature: 0.1,
          },
          { headers: { Authorization: `Bearer ${decisionToken}`, 'Content-Type': 'application/json' }, timeout: 18000 }
        );
        const raw = hfResp.data.choices[0].message.content.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          aiEvents = parsed
            .filter(e => e.lat && e.lng && !isNaN(e.lat) && !isNaN(e.lng))
            .map((e, i) => ({ ...e, id: `ai-${Date.now()}-${i}`, source_url: gdeltArticles[i]?.url || '' }));
        }
      } catch (e) { console.warn('HF extraction failed:', e.message); }
    }

    res.json({ events: [...KNOWN_CONFLICT_ZONES, ...aiEvents], ai_extracted: aiEvents.length });
  } catch (err) {
    res.json({ events: KNOWN_CONFLICT_ZONES, ai_extracted: 0 });
  }
};
