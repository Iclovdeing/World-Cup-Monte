import { useState, useCallback, useEffect } from "react";

const ODDS_URL = "https://raw.githubusercontent.com/Iclovdeing/World-Cup-Monte/main/odds.json";

// ── TEAM DATA ─────────────────────────────────────────────────────────────────
const RAW_TEAMS = [
  [1,"Spain",2129,0,-2,8,-28],[2,"Argentina",2128,1,3,0,-4],
  [3,"France",2084,2,1,2,9],[4,"England",2055,3,1,2,7],
  [5,"Colombia",1998,2,1,6,3],[6,"Brazil",1978,-1,-1,3,-1],
  [7,"Portugal",1967,-1,-2,2,-3],[8,"Netherlands",1944,0,-4,-1,-3],
  [9,"Germany",1939,1,7,1,26],[10,"Norway",1929,1,1,5,4],
  [11,"Japan",1910,3,4,5,5],[12,"Ecuador",1890,-3,-4,8,-1],
  [13,"Switzerland",1885,4,-6,5,4],[14,"Croatia",1881,-2,-3,1,-5],
  [14,"Mexico",1881,4,6,10,6],[16,"Belgium",1879,-1,-1,5,1],
  [17,"Uruguay",1870,-1,-2,2,-5],[18,"Austria",1857,3,2,7,-2],
  [19,"Turkey",1849,-8,-6,2,1],[20,"Morocco",1840,2,1,3,3],
  [21,"Australia",1839,5,6,2,8],[21,"Senegal",1839,-2,-2,1,7],
  [23,"Scotland",1794,1,1,2,15],[24,"South Korea",1786,7,2,8,6],
  [25,"Paraguay",1780,-5,-5,4,-4],[25,"United States",1780,12,5,4,17],
  [27,"Canada",1777,-5,-1,1,-3],[28,"Algeria",1759,-4,-1,3,10],
  [29,"Iran",1756,-5,-1,6,-8],[30,"Sweden",1755,8,4,3,-2],
  [31,"Ivory Coast",1743,12,4,8,28],[32,"Egypt",1711,6,1,5,8],
  [33,"Uzbekistan",1698,-5,-1,6,-5],[34,"Czechia",1696,-13,-4,4,-13],
  [35,"Panama",1683,-11,-4,7,-11],[36,"DR Congo",1674,3,2,2,14],
  [37,"Jordan",1653,-3,-2,7,2],[38,"Cape Verde",1606,6,2,8,15],
  [39,"Saudi Arabia",1598,5,2,2,-5],[40,"Bosnia-Herz.",1596,0,1,0,10],
  [41,"Iraq",1592,-3,-1,5,5],[42,"Tunisia",1585,-11,-4,3,-11],
  [43,"New Zealand",1578,2,1,6,-8],[44,"Ghana",1557,8,4,7,13],
  [45,"Haiti",1536,-3,-1,2,8],[46,"South Africa",1527,1,1,0,-4],
  [47,"Qatar",1437,5,1,6,-13],[48,"Curaçao",1427,-3,0,7,11],
];

const WC_GROUPS = {
  A:["Mexico","South Africa","South Korea","Czechia"],
  B:["Canada","Bosnia-Herz.","Switzerland","Qatar"],
  C:["Brazil","Haiti","Scotland","Morocco"],
  D:["United States","Australia","Turkey","Paraguay"],
  E:["Spain","Uruguay","Belgium","Curaçao"],
  F:["Netherlands","Sweden","Senegal","Egypt"],
  G:["France","Saudi Arabia","DR Congo","New Zealand"],
  H:["Argentina","Algeria","Austria","Jordan"],
  I:["Germany","Iran","Ghana","Cape Verde"],
  J:["Colombia","Ivory Coast","Norway","Iraq"],
  K:["Portugal","Uzbekistan","Ecuador","Tunisia"],
  L:["Japan","Croatia","United States","Panama"],
};

const TEAM_MAP = {};
RAW_TEAMS.forEach(([rank,name,elo,r3,e3,r12,e12]) => {
  TEAM_MAP[name] = {name,elo,rank,r3,e3:e3||0,r12,e12};
});

// Live market data + the merged team map are applied via mutation so every
// simulateX function (which reads TEAM_MAP by closure) sees updated values
// without threading extra params through the whole call chain.
let marketData = null; // { updated_at, teams: {name: pct} } once fetched

// Normalize odds-feed team names to this simulator's naming (handles spelling
// differences between The Odds API / bookmakers and our WC_GROUPS/TEAM_MAP keys).
const MARKET_NAME_MAP = {
  "Czech Republic": "Czechia",
  "Bosnia & Herzegovina": "Bosnia-Herz.",
  "Bosnia and Herzegovina": "Bosnia-Herz.",
  "USA": "United States",
  "Côte d'Ivoire": "Ivory Coast",
  "Congo DR": "DR Congo",
  "Cape Verde Islands": "Cape Verde",
};
function normalizeMarketName(name) {
  return MARKET_NAME_MAP[name] || name;
}

function syncMarketIntoTeamMap() {
  const raw = marketData?.teams || {};
  const normalized = {};
  Object.entries(raw).forEach(([name, pct]) => {
    normalized[normalizeMarketName(name)] = pct;
  });
  const adj = Object.keys(normalized).length ? buildMarketEloAdjustments(normalized) : {};
  RAW_TEAMS.forEach(([, name]) => {
    if (TEAM_MAP[name]) TEAM_MAP[name].marketEloAdj = adj[name] || 0;
  });
}

const FLAG = {
  "Spain":"🇪🇸","Argentina":"🇦🇷","France":"🇫🇷","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Colombia":"🇨🇴","Brazil":"🇧🇷","Portugal":"🇵🇹","Netherlands":"🇳🇱",
  "Germany":"🇩🇪","Norway":"🇳🇴","Japan":"🇯🇵","Ecuador":"🇪🇨",
  "Switzerland":"🇨🇭","Croatia":"🇭🇷","Mexico":"🇲🇽","Belgium":"🇧🇪",
  "Uruguay":"🇺🇾","Austria":"🇦🇹","Turkey":"🇹🇷","Morocco":"🇲🇦",
  "Australia":"🇦🇺","Senegal":"🇸🇳","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","South Korea":"🇰🇷",
  "Paraguay":"🇵🇾","United States":"🇺🇸","Canada":"🇨🇦","Algeria":"🇩🇿",
  "Iran":"🇮🇷","Sweden":"🇸🇪","Ivory Coast":"🇨🇮","Egypt":"🇪🇬",
  "Uzbekistan":"🇺🇿","Czechia":"🇨🇿","Panama":"🇵🇦","DR Congo":"🇨🇩",
  "Jordan":"🇯🇴","Cape Verde":"🇨🇻","Saudi Arabia":"🇸🇦","Bosnia-Herz.":"🇧🇦",
  "Iraq":"🇮🇶","Tunisia":"🇹🇳","New Zealand":"🇳🇿","Ghana":"🇬🇭",
  "Haiti":"🇭🇹","South Africa":"🇿🇦","Qatar":"🇶🇦","Curaçao":"🇨🇼",
};

// ── SIMULATION CORE ───────────────────────────────────────────────────────────

function poissonSample(lambda) {
  const L = Math.exp(-Math.min(lambda, 20));
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

function dcCorrect(g1, g2, rho = -0.13) {
  if (g1===0&&g2===0) return 1-rho;
  if (g1===1&&g2===0) return 1+rho;
  if (g1===0&&g2===1) return 1+rho;
  if (g1===1&&g2===1) return 1-rho;
  return 1;
}

function effectiveElo(team, settings) {
  let e = team.elo;
  // momentum: 3-month trend
  e += (team.e3 || 0) * settings.momentumWeight * 0.4;
  // tournament experience bias
  e *= team.rank <= 10 ? 1.02 : team.rank <= 25 ? 1.0 : 0.97;
  // betting market blend (precomputed Elo-equivalent delta, see applyMarketBlend)
  if (settings.marketWeight > 0 && team.marketEloAdj) {
    e += team.marketEloAdj * settings.marketWeight;
  }
  // off-pitch chaos
  if (settings.upsetNoise > 0)
    e += (Math.random() - 0.5) * settings.upsetNoise * 150;
  return e;
}

// Convert market win-probabilities into a per-team Elo adjustment.
// Idea: implied market Elo (relative, anchored to the field) vs. our raw Elo —
// the gap is what we nudge each team toward, scaled by marketWeight.
function buildMarketEloAdjustments(marketProbs) {
  // marketProbs: { teamName: probabilityPercent }  e.g. { "Spain": 14.2, ... }
  const entries = Object.entries(marketProbs).filter(([, p]) => p > 0);
  if (entries.length < 2) return {};

  // Convert title-win probability -> an implied relative strength via log-odds,
  // then express as an Elo-like delta from the field average.
  const logits = entries.map(([name, p]) => {
    const prob = Math.max(0.0005, Math.min(0.65, p / 100)); // clamp extreme tails
    return [name, Math.log(prob / (1 - prob))];
  });
  const avgLogit = logits.reduce((s, [, l]) => s + l, 0) / logits.length;

  // Scale: 400 Elo points ~ a 10x odds ratio is the standard Elo convention (base-10 logistic, /400).
  // Convert natural-log logit to that same base-10/400 scale.
  const SCALE = 400 / Math.log(10);

  const adj = {};
  logits.forEach(([name, l]) => {
    adj[name] = (l - avgLogit) * SCALE * 0.35; // 0.35 damps title-market noise (small-sample tail teams)
  });
  return adj;
}

function simulateMatch(tA, tB, settings, knockout = false) {
  const eA = effectiveElo(tA, settings);
  const eB = effectiveElo(tB, settings);
  const diff = eA - eB;
  const BASE = 1.15;
  const lA = BASE * Math.pow(10, diff / 1600);
  const lB = BASE * Math.pow(10, -diff / 1600);

  let gA, gB;
  if (settings.dcCorrection) {
    let tries = 0;
    do {
      gA = poissonSample(lA); gB = poissonSample(lB); tries++;
    } while (tries < 10 && Math.random() > dcCorrect(gA, gB));
  } else {
    gA = poissonSample(lA); gB = poissonSample(lB);
  }

  if (knockout && gA === gB) {
    gA += poissonSample(lA * 0.22);
    gB += poissonSample(lB * 0.22);
    if (gA === gB) {
      const penA = 0.5 + (eA - eB) / 4000;
      return Math.random() < penA
        ? { winner: tA.name, gA, gB, method:"pens" }
        : { winner: tB.name, gA: gB, gB: gA, method:"pens" };
    }
  }
  if (gA > gB) return { winner: tA.name, gA, gB, method:"ft" };
  if (gB > gA) return { winner: tB.name, gA: gB, gB: gA, method:"ft" };
  return { winner: null, gA, gB, method:"draw" };
}

function simulateGroup(groupNames, settings) {
  const teams = groupNames.map(n => ({
    ...(TEAM_MAP[n] || {name:n,elo:1500,rank:99,e3:0}),
    pts:0, gf:0, ga:0, gd:0,
    h2hPts:{}, h2hGf:{}, h2hGa:{}
  }));
  teams.forEach(t => {
    teams.forEach(u => { if(t.name!==u.name){ t.h2hPts[u.name]=0; t.h2hGf[u.name]=0; t.h2hGa[u.name]=0; } });
  });

  for (let i = 0; i < teams.length; i++) {
    for (let j = i+1; j < teams.length; j++) {
      const r = simulateMatch(teams[i], teams[j], settings, false);
      teams[i].gf += r.gA; teams[i].ga += r.gB; teams[i].gd += r.gA-r.gB;
      teams[j].gf += r.gB; teams[j].ga += r.gA; teams[j].gd += r.gB-r.gA;
      teams[i].h2hGf[teams[j].name] += r.gA; teams[i].h2hGa[teams[j].name] += r.gB;
      teams[j].h2hGf[teams[i].name] += r.gB; teams[j].h2hGa[teams[i].name] += r.gA;
      if (r.method==="draw") {
        teams[i].pts++; teams[j].pts++;
        teams[i].h2hPts[teams[j].name]++; teams[j].h2hPts[teams[i].name]++;
      } else if (r.winner===teams[i].name) {
        teams[i].pts+=3; teams[i].h2hPts[teams[j].name]+=3;
      } else {
        teams[j].pts+=3; teams[j].h2hPts[teams[i].name]+=3;
      }
    }
  }

  teams.sort((a,b) => {
    if (a.pts!==b.pts) return b.pts-a.pts;
    const hA=a.h2hPts[b.name]||0, hB=b.h2hPts[a.name]||0;
    if (hA!==hB) return hB-hA;
    const hdA=(a.h2hGf[b.name]||0)-(a.h2hGa[b.name]||0);
    const hdB=(b.h2hGf[a.name]||0)-(b.h2hGa[a.name]||0);
    if (hdA!==hdB) return hdB-hdA;
    if (a.gd!==b.gd) return b.gd-a.gd;
    if (a.gf!==b.gf) return b.gf-a.gf;
    return (TEAM_MAP[b.name]?.elo||1500)-(TEAM_MAP[a.name]?.elo||1500);
  });
  return teams;
}

// Build a bracket signature string for deduplication
function bracketSig(rounds) {
  return rounds.map(r => r.map(t => t?.name||"?").sort().join(",")).join("|");
}

function simulateTournament(settings) {
  const groupKeys = Object.keys(WC_GROUPS);
  const groupResults = {};
  const allThird = [];

  groupKeys.forEach(g => {
    const sorted = simulateGroup(WC_GROUPS[g], settings);
    groupResults[g] = sorted;
    allThird.push({ ...sorted[2], group: g, pts: sorted[2].pts, gd: sorted[2].gd, gf: sorted[2].gf });
  });

  // Best 8 third-place
  allThird.sort((a,b) => {
    if (a.pts!==b.pts) return b.pts-a.pts;
    if (a.gd!==b.gd) return b.gd-a.gd;
    if (a.gf!==b.gf) return b.gf-a.gf;
    return (TEAM_MAP[b.name]?.elo||1500)-(TEAM_MAP[a.name]?.elo||1500);
  });
  const best8 = allThird.slice(0,8);

  // Build R32: winners + runners + best 8 thirds
  const winners = groupKeys.map(g => groupResults[g][0]);
  const runners = groupKeys.map(g => groupResults[g][1]);
  const thirds  = best8.map(t => TEAM_MAP[t.name]||{name:t.name,elo:1700,rank:20,e3:0});

  // Pair into 16 matches: cross-group seeding (simplified FIFA bracket approximation)
  // 1[A] vs 2[C], 1[B] vs 2[D], etc. — interleaved
  let r32pairs = [];
  for (let i = 0; i < 12; i++) {
    r32pairs.push([winners[i], runners[(i+6)%12]]);
  }
  thirds.forEach((t,i) => {
    r32pairs.push([t, winners[(i+4)%12]]);
  });
  // Take 16 pairs
  r32pairs = r32pairs.slice(0,16);

  function runRound(pairs) {
    return pairs.map(([tA, tB]) => {
      if (!tA) return tB;
      if (!tB) return tA;
      const r = simulateMatch(
        TEAM_MAP[tA.name]||tA,
        TEAM_MAP[tB.name]||tB,
        settings, true
      );
      return TEAM_MAP[r.winner]||{name:r.winner,elo:1600,rank:30,e3:0};
    });
  }

  const r32winners = runRound(r32pairs); // 16 teams
  const r16pairs = [];
  for (let i = 0; i < 16; i+=2) r16pairs.push([r32winners[i], r32winners[i+1]]);
  const r16winners = runRound(r16pairs); // 8
  const qfpairs = [];
  for (let i = 0; i < 8; i+=2) qfpairs.push([r16winners[i], r16winners[i+1]]);
  const qfwinners = runRound(qfpairs); // 4
  const sfpairs = [];
  for (let i = 0; i < 4; i+=2) sfpairs.push([qfwinners[i], qfwinners[i+1]]);
  const sfwinners = runRound(sfpairs); // 2
  const champion = runRound([[sfwinners[0], sfwinners[1]]])[0];

  return {
    champion: champion?.name,
    r32: r32winners,
    r16: r16winners,
    qf:  qfwinners,
    sf:  sfwinners,
    finalist: sfwinners,
    rounds: [r32winners, r16winners, qfwinners, sfwinners, [champion]],
  };
}

// ── MONTE CARLO ───────────────────────────────────────────────────────────────

function runMonteCarlo(N, settings, onProgress) {
  const wins={}, finalR={}, sfR={}, qfR={}, r16R={};
  RAW_TEAMS.forEach(([,n])=>{ wins[n]=0; finalR[n]=0; sfR[n]=0; qfR[n]=0; r16R[n]=0; });

  // Track bracket fingerprints for top-N display
  const bracketCounts = {};
  const bracketStore  = {};  // sig -> representative bracket

  const CHUNK = 400;
  let done = 0;

  return new Promise(resolve => {
    function chunk() {
      const end = Math.min(done + CHUNK, N);
      for (let i = done; i < end; i++) {
        const t = simulateTournament(settings);
        if (t.champion) wins[t.champion] = (wins[t.champion]||0)+1;
        t.r16?.forEach(x=>x&&(r16R[x.name]=(r16R[x.name]||0)+1));
        t.qf ?.forEach(x=>x&&(qfR [x.name]=(qfR [x.name]||0)+1));
        t.sf ?.forEach(x=>x&&(sfR [x.name]=(sfR [x.name]||0)+1));
        t.finalist?.forEach(x=>x&&(finalR[x.name]=(finalR[x.name]||0)+1));

        // Bracket fingerprint
        const sig = [
          t.r16?.map(x=>x?.name||"?").join(","),
          t.qf ?.map(x=>x?.name||"?").join(","),
          t.sf ?.map(x=>x?.name||"?").join(","),
          t.champion
        ].join("|");
        bracketCounts[sig] = (bracketCounts[sig]||0)+1;
        if (!bracketStore[sig]) bracketStore[sig] = t;
      }
      done = end;
      onProgress(Math.round(done/N*100));
      if (done < N) { setTimeout(chunk, 0); return; }

      // Sort brackets by frequency
      const topBrackets = Object.entries(bracketCounts)
        .sort((a,b)=>b[1]-a[1])
        .map(([sig, count]) => ({ count, pct: count/N*100, bracket: bracketStore[sig] }));

      const teamStats = RAW_TEAMS.map(([rank,name,elo])=>({
        rank, name, elo,
        winPct:   (wins[name]||0)/N*100,
        finalPct: (finalR[name]||0)/N*100,
        sfPct:    (sfR[name]||0)/N*100,
        qfPct:    (qfR[name]||0)/N*100,
        r16Pct:   (r16R[name]||0)/N*100,
      }));

      resolve({ teamStats, topBrackets });
    }
    setTimeout(chunk, 0);
  });
}

// ── IMPROVEMENTS DATA ─────────────────────────────────────────────────────────
const IMPROVEMENTS = [
  {
    cat: "📊 Better Ratings",
    color: "#f59e0b",
    items: [
      {
        title: "Club-Elo blend",
        impact: "High",
        effort: "Medium",
        detail: "Blend national Elo with club Elo of each squad's starters. A national team whose players are at Champions League clubs right now is stronger than their 2-year national Elo implies. Weighted average: 60% national / 40% club-level proxy.",
      },
      {
        title: "Betting market implied probability",
        impact: "Very High",
        effort: "Low",
        detail: "Pre-tournament outright odds from Betfair/Pinnacle aggregate thousands of sharp bettors. Convert to implied probability and blend 50/50 with Elo. Historically the single biggest accuracy improvement for tournament sims — markets price in squad news, injuries, and intangibles you can't easily model.",
      },
      {
        title: "xG-calibrated attack/defense ratings",
        impact: "High",
        effort: "High",
        detail: "Replace a single Elo number with separate attack and defense strengths, estimated from recent xG-for / xG-against per game. A team that wins with low xG (lucky) gets lower attack strength than their Elo suggests.",
      },
    ]
  },
  {
    cat: "🎲 Better Match Model",
    color: "#8b5cf6",
    items: [
      {
        title: "Negative Binomial instead of Poisson",
        impact: "Medium",
        effort: "Low",
        detail: "Football goal distributions have higher variance than Poisson predicts (overdispersion). Negative Binomial with dispersion parameter r≈10 fits real WC data better — produces slightly more 0-0 and 5+ goal games, calibrating tail risk.",
      },
      {
        title: "Correlated goals (bivariate Poisson)",
        impact: "Medium",
        effort: "Medium",
        detail: "Goals scored by team A and B aren't fully independent — a high-tempo match inflates both. Bivariate Poisson with a positive covariance term fits tournament data and reduces the frequency of artificial 0-0 results in big-team matchups.",
      },
      {
        title: "Score-state model (dynamic momentum)",
        impact: "High",
        effort: "High",
        detail: "Goal rates change once a team scores first. A team that goes 1-0 up defends deeper, lowering their expected goals conceded. Model this with a state machine: scoreline updates goal rate parameters at each 'tick'. Increases realism of 1-0 results and late equalizers.",
      },
    ]
  },
  {
    cat: "🧠 Better Context Factors",
    color: "#10b981",
    items: [
      {
        title: "Group-stage motivation / dead-rubber adjustment",
        impact: "Medium",
        effort: "Low",
        detail: "Teams already qualified rotate squads in Matchweek 3. Reduce effective Elo by ~80 pts for a team with 6 pts playing a dead rubber, and increase it for a team needing a win to qualify. Historically, top sides drop 0.3 expected goals in such games.",
      },
      {
        title: "Travel & climate fatigue",
        impact: "Low-Medium",
        effort: "Medium",
        detail: "WC 2026 spans three countries across 5 time zones. Teams flying across the continent for short turnarounds underperform. Build a fatigue multiplier: each travel km between last and next game venue > 1000 km reduces effective Elo by ~20 pts.",
      },
      {
        title: "Head-to-head history between specific pairs",
        impact: "Low",
        effort: "Medium",
        detail: "Some matchups have persistent over/underperformance beyond Elo (e.g. Germany historically over-performs vs big nations in tournaments). A h2h lookup table of the last 20 high-stakes results for each pair adds a residual adjustment.",
      },
      {
        title: "Penalty shootout specialist model",
        impact: "Low",
        effort: "Low",
        detail: "Currently pens are 50% + tiny Elo edge. In reality, some nations (Germany, Argentina) are serial penalty winners; others (England, Spain pre-2020) are serial losers. Assign each nation a historical penalty win rate and use that in shootout simulation.",
      },
    ]
  },
  {
    cat: "⚙️ Better Sim Architecture",
    color: "#3b82f6",
    items: [
      {
        title: "Importance-weighted sampling (stratified MC)",
        impact: "Medium",
        effort: "Medium",
        detail: "Instead of sampling uniformly, oversample 'interesting' regions — close Elo matchups — and reweight the samples. This gets more stable tail probability estimates (champion odds) with the same number of sims, reducing variance in the 1-5% probability range.",
      },
      {
        title: "Calibration against historical WC results",
        impact: "Very High",
        effort: "High",
        detail: "Run your model retroactively on WC 2018 and 2022. Compare predicted win rates to actual outcomes using Brier score or log-loss. Tune your Poisson λ base rate, Dixon-Coles rho, and noise parameter until historical calibration is minimized. This is the most rigorous accuracy improvement.",
      },
      {
        title: "Ensemble of models",
        impact: "High",
        effort: "High",
        detail: "Combine: (A) Elo-Poisson (current), (B) market-implied probabilities, (C) xG-based attack/defense ratings. Average their win probabilities per simulation. Ensembles consistently outperform any single model in forecasting tournaments.",
      },
    ]
  },
];

// ── COMPONENTS ────────────────────────────────────────────────────────────────

const S = {
  bg: "#0a0e1a", bg2: "#0f172a", bg3: "#070b14",
  border: "#1e293b", border2: "#334155",
  text: "#e2e8f0", muted: "#64748b", faint: "#475569",
  gold: "#f59e0b", gold2: "#fbbf24",
};

function Pill({ v, color }) {
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:99,
      background: color+"22", color, border:`1px solid ${color}44` }}>{v}</span>
  );
}

function BracketCard({ entry, rank, totalSims }) {
  const { pct, count, bracket } = entry;
  const rounds = [
    { label:"R16", teams: bracket.r16 },
    { label:"QF",  teams: bracket.qf  },
    { label:"SF",  teams: bracket.sf  },
    { label:"🏆",  teams: [TEAM_MAP[bracket.champion]||{name:bracket.champion}] },
  ];
  return (
    <div style={{ background: S.bg2, border:`1px solid ${S.border}`, borderRadius:10,
      padding:"14px", marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:12, fontWeight:800, color:S.muted }}>#{rank}</span>
          <span style={{ fontSize:13, fontWeight:700, color:S.gold }}>{pct.toFixed(3)}%</span>
          <span style={{ fontSize:11, color:S.faint }}>({count.toLocaleString()} / {totalSims.toLocaleString()})</span>
        </div>
        <span style={{ fontSize:20 }}>{FLAG[bracket.champion]||"🏆"} {bracket.champion}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
        {rounds.map(({ label, teams }) => (
          <div key={label}>
            <div style={{ fontSize:10, color:S.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
            {(teams||[]).filter(Boolean).map(t => (
              <div key={t.name} style={{ fontSize:11, color:S.text, padding:"2px 0",
                display:"flex", alignItems:"center", gap:4 }}>
                <span style={{fontSize:13}}>{FLAG[t.name]||"🏳️"}</span>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.name}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ImprovementCard({ item }) {
  const impactColor = { "Very High":"#f59e0b", "High":"#10b981", "Medium":"#3b82f6", "Low-Medium":"#8b5cf6", "Low":"#64748b" };
  const effortColor = { "High":"#ef4444", "Medium":"#f59e0b", "Low":"#10b981" };
  return (
    <div style={{ background:S.bg2, border:`1px solid ${S.border}`, borderRadius:10, padding:"14px", marginBottom:8 }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:8 }}>
        <span style={{ fontSize:13, fontWeight:700, color:S.text }}>{item.title}</span>
        <div style={{ display:"flex", gap:5, flexShrink:0 }}>
          <Pill v={`↑ ${item.impact}`} color={impactColor[item.impact]||"#64748b"} />
          <Pill v={`effort: ${item.effort}`} color={effortColor[item.effort]||"#64748b"} />
        </div>
      </div>
      <p style={{ fontSize:12, color:S.muted, margin:0, lineHeight:1.6 }}>{item.detail}</p>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("sim");
  const [settings, setSettings] = useState({
    nSims: 10000,
    momentumWeight: 0.5,
    upsetNoise: 0.5,
    dcCorrection: true,
    topN: 10,
    marketWeight: 0.5,
  });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [sortCol, setSortCol] = useState("winPct");
  const [teamFilter, setTeamFilter] = useState("");
  const [marketStatus, setMarketStatus] = useState("loading"); // loading | ok | error | none
  const [marketMeta, setMarketMeta] = useState(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(ODDS_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.teams && Object.keys(json.teams).length > 0) {
          marketData = json;
          syncMarketIntoTeamMap();
          setMarketMeta({ updatedAt: json.updated_at, n: Object.keys(json.teams).length, source: json.source });
          setMarketStatus("ok");
        } else {
          setMarketStatus("none");
        }
      } catch (e) {
        if (!cancelled) { setMarketStatus("error"); setShowPaste(true); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setProgress(0);
    setResults(null);
    syncMarketIntoTeamMap(); // ensure latest weight is applied
    const res = await runMonteCarlo(settings.nSims, settings, setProgress);
    setResults(res);
    setRunning(false);
  }, [settings]);

  const sorted = results
    ? [...results.teamStats]
        .sort((a,b) => b[sortCol]-a[sortCol])
        .filter(r => r.name.toLowerCase().includes(teamFilter.toLowerCase()))
    : [];

  const pct = v => v < 0.05 ? "<0.1%" : v.toFixed(1)+"%";

  const Bar = ({ v, max, color }) => (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ width:`${Math.max(2,(v/max)*88)}%`, height:7,
        background:color, borderRadius:3 }} />
      <span style={{ fontSize:11, color:S.faint, minWidth:38, textAlign:"right" }}>{pct(v)}</span>
    </div>
  );

  const TH = ({ col, label }) => (
    <th onClick={()=>setSortCol(col)} style={{ cursor:"pointer", padding:"8px 10px",
      fontSize:10, fontWeight:700, color: sortCol===col ? S.gold : S.faint,
      textTransform:"uppercase", letterSpacing:"0.05em", textAlign:"left",
      userSelect:"none", whiteSpace:"nowrap" }}>
      {label}{sortCol===col ? " ▼":""}
    </th>
  );

  const Slider = ({ k, label, min, max, step, fmt }) => (
    <div style={{ background:S.bg2, border:`1px solid ${S.border}`, borderRadius:10, padding:"12px 14px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
        <span style={{ fontSize:11, color:S.muted, fontWeight:600 }}>{label}</span>
        <span style={{ fontSize:12, color:S.gold, fontWeight:700 }}>{fmt(settings[k])}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={settings[k]}
        onChange={e => setSettings(s=>({...s,[k]:parseFloat(e.target.value)}))}
        style={{ width:"100%", accentColor:S.gold }} />
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:S.bg, color:S.text,
      fontFamily:"'Inter',system-ui,sans-serif" }}>

      {/* ── HEADER ── */}
      <div style={{ background:"linear-gradient(135deg,#1e2942,#0f172a,#1a1035)",
        borderBottom:`1px solid ${S.border}`, padding:"24px 20px 0" }}>
        <div style={{ maxWidth:980, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:10, marginBottom:4 }}>
            <span style={{fontSize:26}}>⚽</span>
            <h1 style={{ fontSize:21, fontWeight:900, margin:0, letterSpacing:"-0.02em",
              background:"linear-gradient(90deg,#f59e0b,#fbbf24)",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              WC 2026 Monte Carlo
            </h1>
            <span style={{ fontSize:11, color:S.faint }}>48 teams · 12 groups · Dixon-Coles</span>
          </div>
          {/* Tab bar */}
          <div style={{ display:"flex", gap:0, marginTop:16 }}>
            {[["sim","📊 Simulator"],["brackets","🗂 Top Brackets"],["improve","💡 Improve the Model"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} style={{
                background:"transparent", border:"none", borderBottom:tab===id?`2px solid ${S.gold}`:"2px solid transparent",
                color: tab===id ? S.gold : S.muted, padding:"8px 16px", fontSize:13,
                fontWeight: tab===id ? 700 : 500, cursor:"pointer", marginBottom:"-1px"
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:980, margin:"0 auto", padding:"20px 16px" }}>

        {/* ── TAB: SIMULATOR ── */}
        {tab==="sim" && (
          <>
            {/* Settings grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:10, marginBottom:10 }}>
              <Slider k="nSims"          label="Simulations"       min={1000}  max={50000} step={1000} fmt={v=>v.toLocaleString()} />
              <Slider k="momentumWeight" label="📈 Momentum"       min={0}     max={1}     step={0.1}  fmt={v=>`${Math.round(v*100)}%`} />
              <Slider k="upsetNoise"     label="🎲 Off-Pitch Chaos" min={0}    max={1}     step={0.1}  fmt={v=>`${Math.round(v*100)}%`} />
              <Slider k="marketWeight"   label="💰 Market Blend"   min={0}    max={1}     step={0.1}  fmt={v=>`${Math.round(v*100)}%`} />
              <div style={{ background:S.bg2, border:`1px solid ${S.border}`, borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:11, color:S.muted, fontWeight:600, marginBottom:10 }}>⚙️ Options</div>
                <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:12, color:"#94a3b8" }}>
                  <input type="checkbox" checked={settings.dcCorrection}
                    onChange={e=>setSettings(s=>({...s,dcCorrection:e.target.checked}))}
                    style={{accentColor:S.gold}} />
                  Dixon-Coles correction
                </label>
              </div>
            </div>

            {/* Market data status */}
            <div style={{ marginBottom:8, fontSize:11, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
              {marketStatus==="loading" && <span style={{color:S.faint}}>⏳ Loading live market odds…</span>}
              {marketStatus==="ok" && marketMeta && (
                <span style={{color:"#10b981"}}>
                  ✓ Live market odds loaded — {marketMeta.n} teams, updated {new Date(marketMeta.updatedAt).toLocaleString()} ({marketMeta.source})
                </span>
              )}
              {marketStatus==="error" && (
                <span style={{color:"#f87171"}}>⚠ Auto-fetch blocked in this environment — paste your odds.json below instead</span>
              )}
              {marketStatus==="none" && (
                <span style={{color:S.faint}}>No market data yet in odds.json — using pure Elo</span>
              )}
              <button onClick={()=>setShowPaste(s=>!s)} style={{
                background:"transparent", border:`1px solid ${S.border2}`, borderRadius:6,
                color:S.muted, fontSize:11, padding:"2px 8px", cursor:"pointer" }}>
                {showPaste ? "Hide paste box" : "📋 Paste odds.json"}
              </button>
            </div>

            {showPaste && (
              <div style={{ background:S.bg2, border:`1px solid ${S.border}`, borderRadius:10, padding:12, marginBottom:14 }}>
                <div style={{ fontSize:11, color:S.muted, marginBottom:6 }}>
                  Paste the full contents of your repo's <code style={{color:S.gold}}>odds.json</code> here, then click Apply.
                </div>
                <textarea value={pasteText} onChange={e=>setPasteText(e.target.value)}
                  placeholder='{"updated_at": "...", "teams": {"France": 18.7, "Spain": 13.8, ...}}'
                  style={{ width:"100%", minHeight:110, background:"#070b14", border:`1px solid ${S.border2}`,
                    borderRadius:8, color:S.text, fontSize:11, fontFamily:"monospace", padding:8,
                    boxSizing:"border-box", resize:"vertical" }} />
                <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"center" }}>
                  <button onClick={()=>{
                    try {
                      const parsed = JSON.parse(pasteText);
                      if (!parsed.teams || Object.keys(parsed.teams).length === 0) throw new Error("No 'teams' field found");
                      marketData = parsed;
                      syncMarketIntoTeamMap();
                      setMarketMeta({ updatedAt: parsed.updated_at || new Date().toISOString(), n: Object.keys(parsed.teams).length, source: parsed.source || "manual paste" });
                      setMarketStatus("ok");
                      setPasteError(null);
                    } catch (err) {
                      setPasteError(err.message);
                    }
                  }} style={{
                    background:`linear-gradient(135deg,#d97706,#f59e0b)`, color:"#0a0e1a", border:"none",
                    borderRadius:6, padding:"6px 16px", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                    Apply odds
                  </button>
                  {pasteError && <span style={{ color:"#f87171", fontSize:11 }}>⚠ {pasteError}</span>}
                </div>
              </div>
            )}

            {/* Run bar */}
            <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:20 }}>
              <button onClick={run} disabled={running} style={{
                background: running?"#1e293b":"linear-gradient(135deg,#d97706,#f59e0b)",
                color: running?S.faint:"#0a0e1a", border:"none", borderRadius:8,
                padding:"9px 22px", fontWeight:800, fontSize:14, cursor:running?"not-allowed":"pointer" }}>
                {running ? `Running… ${progress}%` : "▶ Run Simulation"}
              </button>
              {running && (
                <div style={{ flex:1, background:"#1e293b", borderRadius:4, height:6, maxWidth:200 }}>
                  <div style={{ width:`${progress}%`, height:"100%", background:S.gold, borderRadius:4 }} />
                </div>
              )}
              {results && (
                <input placeholder="Filter team…" value={teamFilter}
                  onChange={e=>setTeamFilter(e.target.value)}
                  style={{ background:"#1e293b", border:`1px solid ${S.border2}`, borderRadius:8,
                    padding:"7px 12px", color:S.text, fontSize:13, outline:"none", minWidth:130 }} />
              )}
            </div>

            {results && (
              <>
                {/* Podium */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:20 }}>
                  {sorted.slice(0,3).map((t,i)=>(
                    <div key={t.name} style={{
                      background: i===0?"linear-gradient(135deg,#292015,#1e1408)":"linear-gradient(135deg,#1a1f2e,#0f172a)",
                      border:`1px solid ${i===0?"#92400e":S.border}`, borderRadius:12,
                      padding:"16px 12px", textAlign:"center" }}>
                      <div style={{fontSize:26,marginBottom:4}}>{FLAG[t.name]||"🏳️"}</div>
                      <div style={{fontSize:i===0?14:12,fontWeight:800,color:i===0?S.gold2:S.text}}>
                        {["🥇","🥈","🥉"][i]} {t.name}
                      </div>
                      <div style={{fontSize:21,fontWeight:900,color:S.gold,marginTop:6}}>{t.winPct.toFixed(1)}%</div>
                      <div style={{fontSize:10,color:S.muted}}>chance to win</div>
                    </div>
                  ))}
                </div>

                {/* Table */}
                <div style={{ background:S.bg2, border:`1px solid ${S.border}`, borderRadius:12, overflow:"hidden", marginBottom:14 }}>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ borderBottom:`1px solid ${S.border}` }}>
                          <th style={{ padding:"8px 10px", fontSize:10, color:S.faint, textAlign:"left", width:28 }}>#</th>
                          <th style={{ padding:"8px 10px", fontSize:10, color:S.faint, textAlign:"left" }}>Team</th>
                          <th style={{ padding:"8px 10px", fontSize:10, color:S.faint, textAlign:"right" }}>Elo</th>
                          <TH col="winPct"   label="🏆 Win" />
                          <TH col="finalPct" label="Final" />
                          <TH col="sfPct"    label="Semi" />
                          <TH col="qfPct"    label="QF" />
                          <TH col="r16Pct"   label="R16" />
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((t,i)=>(
                          <tr key={t.name} style={{ borderBottom:`1px solid ${S.bg3}`,
                            background: i%2===0?"transparent":S.bg3 }}>
                            <td style={{ padding:"6px 10px", fontSize:12, color:S.faint, textAlign:"center" }}>{i+1}</td>
                            <td style={{ padding:"6px 10px" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                <span style={{fontSize:15}}>{FLAG[t.name]||"🏳️"}</span>
                                <div>
                                  <div style={{fontSize:12,fontWeight:600,color:S.text}}>{t.name}</div>
                                  <div style={{fontSize:10,color:S.faint}}>#{t.rank}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding:"6px 10px", fontSize:11, color:S.faint, textAlign:"right" }}>{t.elo}</td>
                            <td style={{padding:"6px 12px",minWidth:110}}><Bar v={t.winPct}   max={sorted[0].winPct*1.05} color={S.gold} /></td>
                            <td style={{padding:"6px 12px",minWidth:100}}><Bar v={t.finalPct} max={50}  color="#8b5cf6" /></td>
                            <td style={{padding:"6px 12px",minWidth:100}}><Bar v={t.sfPct}    max={80}  color="#3b82f6" /></td>
                            <td style={{padding:"6px 12px",minWidth:100}}><Bar v={t.qfPct}    max={95}  color="#10b981" /></td>
                            <td style={{padding:"6px 12px",minWidth:100}}><Bar v={t.r16Pct}   max={100} color="#06b6d4" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Legend */}
                <div style={{ padding:"10px 14px", background:S.bg3, borderRadius:10,
                  border:`1px solid ${S.border}`, display:"flex", flexWrap:"wrap", gap:14, fontSize:11, color:S.faint }}>
                  <span><strong style={{color:S.gold}}>Off-pitch chaos</strong> = random Elo shock per game</span>
                  <span><strong style={{color:"#8b5cf6"}}>Momentum</strong> = 3-month trend applied per match</span>
                  <span><strong style={{color:"#10b981"}}>Dixon-Coles</strong> = low-score correlation fix</span>
                </div>
              </>
            )}

            {!results && !running && (
              <div style={{ textAlign:"center", padding:"50px 20px", color:"#334155" }}>
                <div style={{fontSize:44,marginBottom:14}}>⚽</div>
                <div style={{fontSize:15,fontWeight:600}}>Configure and hit Run</div>
                <div style={{fontSize:12,marginTop:4}}>10k sims ≈ 4 seconds in browser</div>
              </div>
            )}
          </>
        )}

        {/* ── TAB: TOP BRACKETS ── */}
        {tab==="brackets" && (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16, flexWrap:"wrap" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:S.text, marginBottom:2 }}>
                  Top bracket outcomes by frequency
           </div>
                <div style={{ fontSize:12, color:S.muted }}>
                  Each card = a unique R16→QF→SF→Champion path. Rarity shows how the sim distributes futures.
                </div>
              </div>
              <div style={{ background:S.bg2, border:`1px solid ${S.border}`, borderRadius:10, padding:"10px 14px", minWidth:200 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:11, color:S.muted, fontWeight:600 }}>Show top N brackets</span>
                  <span style={{ fontSize:12, color:S.gold, fontWeight:700 }}>{settings.topN}</span>
                </div>
                <input type="range" min={1} max={50} step={1} value={settings.topN}
                  onChange={e=>setSettings(s=>({...s,topN:parseInt(e.target.value)}))}
                  style={{ width:"100%", accentColor:S.gold }} />
              </div>
            </div>

            {!results && (
              <div style={{ textAlign:"center", padding:"50px 20px", color:"#334155" }}>
                <div style={{fontSize:36,marginBottom:12}}>🗂</div>
                <div style={{fontSize:14,fontWeight:600}}>Run the simulator first</div>
                <div style={{fontSize:12,marginTop:4}}>Then come back here to see the most probable bracket paths</div>
                <button onClick={()=>setTab("sim")} style={{
                  marginTop:14, background:`linear-gradient(135deg,#d97706,#f59e0b)`,
                  color:"#0a0e1a", border:"none", borderRadius:8,
                  padding:"8px 18px", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                  Go to Simulator →
                </button>
              </div>
            )}

            {results && results.topBrackets.slice(0, settings.topN).map((entry, i) => (
              <BracketCard key={i} entry={entry} rank={i+1} totalSims={settings.nSims} />
            ))}
          </>
        )}

        {/* ── TAB: IMPROVEMENTS ── */}
        {tab==="improve" && (
          <>
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:14, fontWeight:700, color:S.text, marginBottom:4 }}>
                How to make this sim more accurate
              </div>
              <div style={{ fontSize:12, color:S.muted, lineHeight:1.6 }}>
                Ranked by expected accuracy gain. Impact = how much the Brier score (calibration) would likely improve.
                Effort = implementation complexity.
              </div>
            </div>
            {IMPROVEMENTS.map(cat => (
              <div key={cat.cat} style={{ marginBottom:24 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                  <div style={{ width:3, height:20, background:cat.color, borderRadius:2 }} />
                  <span style={{ fontSize:13, fontWeight:800, color:cat.color }}>{cat.cat}</span>
                </div>
                {cat.items.map(item => <ImprovementCard key={item.title} item={item} />)}
              </div>
            ))}
          </>
        )}

      </div>
    </div>
  );
}
