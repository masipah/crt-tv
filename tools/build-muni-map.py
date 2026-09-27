#!/usr/bin/env python3
"""Refresh the bundled F-line map from SFMTA and SF Public Works open data."""
import datetime, json, pathlib, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[1]
def get(url):
    return json.loads(subprocess.check_output(['curl','-fLsS','--max-time','60',url]))
base = 'https://sfmta.gtfs.media/gtfs/api/v2/feeds/sfmta'
route = get(base + '/agencies/SFMTA/routes/F/geojson?_format=json')['data']['geometry']['coordinates']
streets = get('https://data.sfgov.org/resource/3psu-pn9h.json?$limit=20000&$where=active%3D%27True%27')
roads = []
for street in streets:
    line = street.get('line', {})
    if line.get('type') != 'LineString':
        continue
    coords = line['coordinates']
    if not any(-122.442 <= x <= -122.385 and 37.756 <= y <= 37.813 for x,y in coords):
        continue
    roads.append({'name': street.get('streetname', ''), 'kind': int(street.get('classcode', 5)),
                  'points': [[round(x,6), round(y,6)] for x,y in coords]})
stops = []
for stop_id, direction in [('5668','Wharf'), ('5672','Castro'), ('5673','Wharf')]:
    stop = get(base + '/stops/' + stop_id + '?_format=json')['data']
    stops.append({'id':stop['stop_code'], 'name':stop['stop_name'], 'direction':direction,
                  'point':[float(stop['stop_lon']),float(stop['stop_lat'])]})
data = {'updated':datetime.date.today().isoformat(), 'route':route, 'roads':roads, 'stops':stops,
        'sources':['https://www.sfmta.com/routes/f-market-wharves', 'https://data.sfgov.org/d/3psu-pn9h']}
(ROOT / 'remote/public/muni/map.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
print(f'Wrote {len(roads)} streets, {len(route)} F-line shapes and {len(stops)} highlighted platforms.')
