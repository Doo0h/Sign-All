"""Verify a self-contained baked operation GLB; this does not validate KSL meaning."""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path


def verify(path):
    data = Path(path).read_bytes()
    if len(data) < 28 or struct.unpack_from('<4sII', data) != (b'glTF', 2, len(data)):
        raise ValueError('Invalid GLB header')
    chunks = {}
    offset = 12
    while offset < len(data):
        size, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        if offset + size > len(data):
            raise ValueError('Truncated GLB chunk')
        chunks[kind] = data[offset:offset + size]
        offset += size
    document = json.loads(chunks[0x4E4F534A])
    binary = chunks[0x004E4942]
    if any(item.get('uri') for group in ('buffers', 'images') for item in document.get(group, [])):
        raise ValueError('External resources are not permitted')

    def floats(index):
        accessor = document['accessors'][index]
        if accessor['componentType'] != 5126 or 'sparse' in accessor:
            raise ValueError('Expected dense float animation accessor')
        width = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
        view = document['bufferViews'][accessor['bufferView']]
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', width * 4)
        values = [struct.unpack_from('<' + 'f' * width, binary, start + i * stride) for i in range(accessor['count'])]
        if not all(math.isfinite(v) for row in values for v in row):
            raise ValueError('Non-finite animation value')
        return values

    animation = next(a for a in document['animations'] if a['name'] == 'operation-draft')
    rotation_tracks = weight_tracks = 0
    for channel in animation['channels']:
        sampler = animation['samplers'][channel['sampler']]
        times = [row[0] for row in floats(sampler['input'])]
        values = floats(sampler['output'])
        if len(times) != 45 or abs(times[0]) > 1e-6 or abs(times[-1] - 1.466) > .001:
            raise ValueError('Unexpected operation timeline')
        if any(b <= a for a, b in zip(times, times[1:])):
            raise ValueError('Non-increasing key times')
        if channel['target']['path'] == 'rotation':
            rotation_tracks += 1
            if len(values) != 45 or any(abs(sum(v*v for v in row) - 1) > .001 for row in values):
                raise ValueError('Invalid quaternion track')
        elif channel['target']['path'] == 'weights':
            weight_tracks += 1
            if len(values) % 45:
                raise ValueError('Invalid expression track')
    if not rotation_tracks or not weight_tracks or not document.get('skins'):
        raise ValueError('Missing skeletal or expression animation')
    metadata = next(n['extras'] for n in document['nodes'] if n.get('extras', {}).get('word') == '운영')
    if metadata.get('status') != 'draft-unreviewed':
        raise ValueError('Do not infer linguistic approval from a bake')
    return {'status': 'technical-check-passed', 'linguisticReview': 'pending', 'sha256': hashlib.sha256(data).hexdigest(),
            'bytes': len(data), 'frames': 45, 'durationSeconds': 1.466, 'rotationTracks': rotation_tracks,
            'expressionTracks': weight_tracks, 'selfContained': True, 'sourceVideoSha256': metadata['sourceVideoSha256']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('glb')
    parser.add_argument('--output')
    args = parser.parse_args()
    result = json.dumps(verify(args.glb), ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(result + '\n', encoding='utf8')
    print(result)
