"""Import missing public NBA portraits. Keep generic silhouettes out of the game."""
import concurrent.futures
import io
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "assets/images/Player/verified"
CANDIDATES = ROOT / "tools/artifacts/headshot-candidates.json"


def key(value):
    text = unicodedata.normalize("NFKD", value)
    return re.sub(r"[^a-z0-9]", "", text.lower())


def read_url(url, accept):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": accept})
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.read()


def photo_content(image):
    # Official generic silhouettes have no skin colors. This conservative check
    # may reject monochrome portraits; those stay unresolved for a manual source.
    colors = image.convert("RGBA").resize((64, 64)).get_flattened_data()
    visible = [(r, g, b) for r, g, b, a in colors if a > 64]
    skin = sum(r > g + 5 and g > b + 2 and r > 45 for r, g, b in visible)
    return len(set(visible)) >= 200 and skin >= max(30, len(visible) * 0.02)


def import_one(row, current_names):
    if not row.get("id"):
        return {**row, "status": "unresolved", "reason": "NBA identity not found"}
    player_id = row["id"]
    url = f"https://cdn.nba.com/headshots/nba/latest/260x190/{player_id}.png"
    try:
        target = DESTINATION / f"{player_id}.png"
        image = Image.open(target) if target.exists() else Image.open(io.BytesIO(read_url(url, "image/png")))
        image.load()
        if image.width < 50 or image.height < 50 or not photo_content(image):
            return {**row, "status": "unresolved", "reason": "official silhouette or no usable portrait", "url": url}
        canonical = current_names.get(player_id)
        profile_url = f"https://www.nba.com/stats/player/{player_id}/career"
        if canonical is None:
            html = read_url(profile_url, "text/html").decode("utf-8")
            title = re.search(r"<title>([^<]+)</title>", html)
            if not title:
                raise ValueError("official profile identity unavailable")
            canonical = title.group(1).split("|")[0].strip()
        if key(canonical) != key(row["canonical"]):
            raise ValueError(f"official identity mismatch: {canonical}")
        if not target.exists():
            image.save(target, format="PNG")
        return {**row, "canonical": canonical, "status": "imported",
                "p": f"assets/images/Player/verified/{player_id}.png", "url": url, "profile": profile_url}
    except Exception as error:
        return {**row, "status": "unresolved", "reason": str(error), "url": url}


def main():
    rows = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    html = read_url("https://www.nba.com/players", "text/html").decode("utf-8")
    payload = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
    directory = json.loads(payload.group(1))["props"]["pageProps"]["players"]
    current_names = {p["PERSON_ID"]: p["PLAYER_FIRST_NAME"] + " " + p["PLAYER_LAST_NAME"] for p in directory}
    DESTINATION.mkdir(parents=True, exist_ok=True)
    groups = {}
    for row in rows:
        groups.setdefault(row.get("id", row["name"]), []).append(row)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(import_one, group[0], current_names): group for group in groups.values()}
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            result = future.result()
            for row in futures[future]:
                results.append({**result, "name": row["name"], "eras": row["eras"]})
            if index % 25 == 0:
                print(f"Checked {index}/{len(groups)} NBA identities; imported {sum(r['status'] == 'imported' for r in results)} name entries", flush=True)
    print("===HEADSHOT_RESULTS===", flush=True)
    print(json.dumps(sorted(results, key=lambda row: row["name"]), ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
