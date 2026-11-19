"""Register an independently reviewed, self-contained GLB. Never auto-approve motion."""
import argparse
import json
from pathlib import Path
import shutil
import struct
import datetime
from pipeline import read_json, write_json, digest

def inspect_glb(path, clips):
    raw = Path(path).read_bytes()
    if len(raw) < 20 or len(raw) > 30 * 1024 * 1024:
        raise ValueError('GLB must be nonempty and at most 30 MiB')
    magic, version, length = struct.unpack_from('<4sII', raw)
    if magic != b'glTF' or version != 2 or length != len(raw):
        raise ValueError('Invalid GLB header')
    size, kind = struct.unpack_from('<I4s', raw, 12)
    if kind != b'JSON' or 20 + size > len(raw):
        raise ValueError('Invalid GLB JSON chunk')
    doc = json.loads(raw[20:20 + size])
    if any(b.get('uri') for b in doc.get('buffers', [])) or any(i.get('uri') and not i['uri'].startswith('data:image/') for i in doc.get('images', [])):
        raise ValueError('GLB must embed buffers and images')
    if doc.get('extensionsRequired'):
        raise ValueError('Required GLB extensions are not supported by this workflow')
    available = {a.get('name') for a in doc.get('animations', []) if a.get('channels') and a.get('samplers')}
    if not clips or any(not isinstance(c, str) or c not in available for c in clips):
        raise ValueError('Named animation clips are missing')
    return doc

def prepare(manifest, review, glb):
    doc, approval = read_json(manifest), read_json(review)
    if doc.get('language') != 'ksl' or not doc.get('questionText', '').strip():
        raise ValueError('Exact KSL question is required')
    rights = doc.get('rights', {})
    if rights.get('motionExtraction') is not True or rights.get('derivativeDistribution') is not True:
        raise ValueError('Extraction and derivative distribution permission are required')
    evidence = rights.get('evidenceFile')
    if not evidence or not (Path(manifest).parent / evidence).is_file():
        raise ValueError('Permission evidence file is missing')
    if approval.get('questionText') != doc['questionText'] or approval.get('status') != 'reviewed':
        raise ValueError('Review must match the exact question and be completed')
    if approval.get('assetSha256') != digest(glb):
        raise ValueError('Review hash does not match this GLB; review the final asset')
    for key in ('reviewedBy', 'reviewedAt', 'version'):
        if not isinstance(approval.get(key), str) or not approval[key].strip():
            raise ValueError('Missing review field: ' + key)
    datetime.date.fromisoformat(approval['reviewedAt'])
    if not doc.get('source', '').strip():
        raise ValueError('Source is required')
    if approval.get('checks') != {'meaning': True, 'hands': True, 'faceAndBody': True, 'transitions': True, 'avatarPlayback': True}:
        raise ValueError('All linguistic and final-avatar checks must be complete')
    inspect_glb(glb, approval.get('clips'))
    return {'questionText': doc['questionText'], 'language': 'ksl', 'status': 'reviewed',
            'reviewedBy': approval['reviewedBy'], 'reviewedAt': approval['reviewedAt'],
            'version': approval['version'], 'source': doc['source'], 'rightsConfirmed': True,
            'clips': approval['clips'], 'assetSha256': approval['assetSha256']}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('manifest', 'review', 'glb'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--repo', default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument('--apply', action='store_true', help='Copy asset and update catalog; default is validation only')
    args = parser.parse_args()
    try:
        entry = prepare(args.manifest, args.review, args.glb)
        # Content address avoids overwriting an existing published asset.
        filename = 'motion-' + entry['assetSha256'] + '.glb'
        entry['assetUrl'] = '/avatars/' + filename
        repo = Path(args.repo)
        catalog_path = repo / 'backend/src/avatar-catalog.json'
        catalog = read_json(catalog_path)
        if any(e['questionText'] == entry['questionText'] for e in catalog):
            raise ValueError('Question already registered; review and update it manually')
        if args.apply:
            target = repo / 'frontend/avatars' / filename
            if target.exists() and digest(target) != entry['assetSha256']:
                raise ValueError('Asset collision')
            if not target.exists():
                shutil.copyfile(args.glb, target)
            temporary = catalog_path.with_suffix('.json.tmp')
            write_json(temporary, [*catalog, entry])
            temporary.replace(catalog_path)
        print(json.dumps({'applied': args.apply, 'entry': entry}, ensure_ascii=False, indent=2))
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, str(error) + '\n')

if __name__ == '__main__':
    main()
