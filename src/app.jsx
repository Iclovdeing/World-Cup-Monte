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
