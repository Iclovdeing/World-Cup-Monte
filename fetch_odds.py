"""
fetch_odds.py  (results-gated version)

Logic:
  1. Pull the live WC26 results feed from openfootball/worldcup.json (free, no key).
  2. Count how many matches currently have a final score ("ft").
  3. Compare to the count saved from last run (state.json, committed to repo).
  4. If the count increased -> a match finished since last check -> fetch fresh
     odds from The Odds API and overwrite odds.json.
     If unchanged -> skip the odds call entirely (saves quota).

This means odds only refresh right after full-time results, not on a blind clock.
Run this on a TIGHT cron (e.g. every 15-30 min) — it's cheap because the results
check costs nothing (no API key) and the metered odds call only fires when needed.

Setup:
  - Repo secret: ODDS_API_KEY  (free key from https://the-odds-api.com)
  - No key needed for the results feed (openfootball is public).
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

ODDS_API_KEY = os.environ.get("ODDS_API_KEY")
if not ODDS_API_KEY:
    print("ERROR: ODDS_API_KEY environment variable not set.", file=sys.stderr)
    sys.exit(1)

RESULTS_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json"
STATE_FILE = "state.json"
ODDS_FILE = "odds.json"

SPORT_KEY = "soccer_fifa_world_cup_winner"
REGION = "uk,eu"
MARKET = "outrights"
ODDS_FORMAT = "decimal"
ODDS_URL = (
    f"https://api.the-odds-api.com/v4/sports/{SPORT_KEY}/odds/"
    f"?apiKey={ODDS_API_KEY}&regions={REGION}&markets={MARKET}&oddsFormat={ODDS_FORMAT}"
)

NAME_MAP = {
    "USA": "United States",
    "Côte d'Ivoire": "Ivory Coast",
    "Congo DR": "DR Congo",
    "Bosnia and Herzegovina": "Bosnia-Herz.",
    "Bosnia & Herzegovina": "Bosnia-Herz.",
    "Cape Verde Islands": "Cape Verde",
    "Czech Republic": "Czechia",
}


def normalize_name(name: str) -> str:
    return NAME_MAP.get(name, name)


def get_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "wc26-sim/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode())


def count_finished_matches() -> int:
    """How many WC26 matches currently have a full-time score. -1 = feed unreachable."""
    try:
        data = get_json(RESULTS_URL)
    except Exception as e:
        print(f"WARNING: could not fetch results feed: {e}", file=sys.stderr)
        return -1
    matches = data.get("matches", [])
    finished = [m for m in matches if m.get("score", {}).get("ft")]
    return len(finished)


def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"finished_count": -1, "last_odds_fetch": None}


def save_state(state: dict):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def devig(prices):
    raw = [1.0 / p for p in prices if p and p > 0]
    total = sum(raw)
    return [r / total for r in raw] if total else []


def fetch_and_write_odds():
    try:
        data = get_json(ODDS_URL)
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code}: {e.read().decode(errors='ignore')}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Odds fetch failed: {e}", file=sys.stderr)
        sys.exit(1)

    if not data:
        print("No odds event data returned.")
        return

    event = data[0]
    bookmakers = event.get("bookmakers", [])
    team_probs = {}
    for bk in bookmakers:
        for market in bk.get("markets", []):
            if market.get("key") != "outrights":
                continue
            outcomes = market.get("outcomes", [])
            names = [o["name"] for o in outcomes]
            prices = [o["price"] for o in outcomes]
            probs = devig(prices)
            if len(probs) != len(names):
                continue
            for n, p in zip(names, probs):
                team_probs.setdefault(normalize_name(n), []).append(p)

    final = {t: sum(ps) / len(ps) for t, ps in team_probs.items()}
    s = sum(final.values())
    if s > 0:
        final = {k: round(v / s * 100, 3) for k, v in final.items()}

    out = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": "the-odds-api.com",
        "num_bookmakers": len(bookmakers),
        "trigger": "new_match_result",
        "teams": dict(sorted(final.items(), key=lambda kv: -kv[1])),
    }
    with open(ODDS_FILE, "w") as f:
        json.dump(out, f, indent=2)
    print(f"odds.json updated: {len(out['teams'])} teams, {out['updated_at']}")


def main():
    state = load_state()
    current_count = count_finished_matches()

    if current_count == -1:
        print("Results feed unreachable — skipping this cycle (no odds call wasted).")
        return

    if current_count > state.get("finished_count", -1):
        print(f"New result(s) detected: {state.get('finished_count', 0)} -> {current_count}. Fetching odds.")
        fetch_and_write_odds()
        state["finished_count"] = current_count
        state["last_odds_fetch"] = datetime.now(timezone.utc).isoformat()
        save_state(state)
    else:
        print(f"No new results since last check ({current_count} finished). Skipping odds call.")


if __name__ == "__main__":
    main()
