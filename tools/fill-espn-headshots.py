"""Import alternative ESPN portraits from exact-name public profile search results."""
import concurrent.futures
import io
import json
import runpy
from pathlib import Path

from PIL import Image
helpers = runpy.run_path(str(Path(__file__).with_name('fill-verified-headshots.py')))
ROOT = helpers['ROOT']
DESTINATION = helpers['DESTINATION']
read_url = helpers['read_url']
photo_content = helpers['photo_content']


def import_one(row):
    url = f"https://a.espncdn.com/i/headshots/nba/players/full/{row['espnId']}.png"
    try:
        image = Image.open(io.BytesIO(read_url(url, 'image/png')))
        image.load()
        if image.width < 50 or image.height < 50 or not photo_content(image):
            raise ValueError('no usable real portrait')
        target = DESTINATION / f"espn-{row['espnId']}.png"
        image.save(target, format='PNG')
        return {**row, 'status':'imported', 'p':f"assets/images/Player/verified/espn-{row['espnId']}.png",
                'url':url, 'profile':row['espnProfile'], 'identityCheck':'exact-name public ESPN profile search result'}
    except Exception as error:
        return {**row, 'status':'unresolved', 'reason':str(error), 'url':url}


def main():
    rows = json.loads((ROOT / 'tools/artifacts/espn-headshot-candidates.json').read_text(encoding='utf-8'))
    DESTINATION.mkdir(parents=True, exist_ok=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        for index, result in enumerate(executor.map(import_one, rows), 1):
            results.append(result)
            if index % 15 == 0:
                print(f"ESPN checked {index}/{len(rows)}; imported {sum(r['status'] == 'imported' for r in results)}", flush=True)
    print('===ESPN_RESULTS===', flush=True)
    print(json.dumps(results, ensure_ascii=True), flush=True)


if __name__ == '__main__':
    main()
