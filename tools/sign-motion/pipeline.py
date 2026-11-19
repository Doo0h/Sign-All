"""Local, offline video-to-landmarks preparation. Not a KSL translation model."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.request
import zipfile

MODEL_URLS = {
    'pose': 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    'hand': 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    'face': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
}

def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))

def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2), encoding='utf-8')

def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def validate_model(path):
    try:
        with zipfile.ZipFile(path) as bundle:
            if bundle.testzip() is not None or not any(n.endswith('.tflite') for n in bundle.namelist()):
                raise ValueError('Invalid model bundle: ' + str(path))
    except zipfile.BadZipFile as error:
        raise ValueError('Incomplete model download: ' + str(path)) from error

def validate_manifest(path):
    path = Path(path).resolve()
    doc = read_json(path)
    if not re.fullmatch(r'[a-z0-9_-]+', doc.get('id', '')):
        raise ValueError('id must contain lowercase letters, digits, hyphen or underscore')
    if doc.get('language') != 'ksl' or not doc.get('questionText', '').strip():
        raise ValueError('KSL language and exact question text are required')
    if not doc.get('source', '').strip() or not doc.get('signerId', '').strip():
        raise ValueError('source and pseudonymous signerId are required')
    if not isinstance(doc.get('mirrored'), bool):
        raise ValueError('mirrored must explicitly be true or false')
    rights = doc.get('rights', {})
    if rights.get('motionExtraction') is not True:
        raise ValueError('Motion extraction permission has not been recorded')
    evidence = rights.get('evidenceFile', '')
    if not evidence or not (path.parent / evidence).is_file():
        raise ValueError('A local permission/consent evidence file is required')
    video = path.parent / doc.get('video', '')
    if not video.is_file():
        raise ValueError('Video file not found')
    return doc, video.resolve()

def download_models(directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, url in MODEL_URLS.items():
        target = directory / (name + '.task')
        if not target.exists():
            temporary = target.with_suffix('.download')
            try:
                with urllib.request.urlopen(url, timeout=60) as response, temporary.open('wb') as output:
                    while chunk := response.read(1024 * 1024):
                        output.write(chunk)
                validate_model(temporary)
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
        validate_model(target)
        manifest[name] = {'url': url, 'sha256': digest(target)}
    write_json(directory / 'models.json', manifest)
    print('Models ready:', directory)

def points(values):
    return [{'x': p.x, 'y': p.y, 'z': p.z,
             **({'visibility': p.visibility} if p.visibility is not None else {})}
            for p in values]

def quality(frames):
    total = len(frames)
    if not total:
        raise ValueError('No decoded frames')
    counts = {key: sum(bool(f[key]) for f in frames) for key in ('pose', 'face')}
    counts['twoHands'] = sum(len(f['hands']) == 2 for f in frames)
    ratios = {key: round(value / total, 4) for key, value in counts.items()}
    return {'frames': total, 'detectionCoverage': ratios,
            'reviewRequired': True,
            'warnings': ['Coordinates are estimates, not a rig or verified sign language.',
                         'Hands may be out of view at rest; coverage is not linguistic accuracy.',
                         'Separate hand and pose world coordinates have different origins; do not concatenate them.',
                         'Missing detections remain empty; no invented or interpolated signs.']}

def extract(manifest_path, models, output, max_seconds=120):
    doc, video = validate_manifest(manifest_path)
    if not 0 < max_seconds <= 600:
        raise ValueError('max-seconds must be between 0 and 600')
    output = Path(output)
    if output.exists():
        raise ValueError('Output directory already exists; choose a new directory')
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision
    paths = {name: Path(models) / (name + '.task') for name in MODEL_URLS}
    for path in paths.values():
        if not path.is_file():
            raise ValueError('Missing model: ' + str(path))
        validate_model(path)
    cap = cv2.VideoCapture(str(video))
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        if not cap.isOpened() or not math.isfinite(fps) or not 1 <= fps <= 120:
            raise ValueError('Unreadable video or invalid frame rate')
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if frame_count / fps > max_seconds:
            raise ValueError('Clip is too long; trim to the exact question first')
        mode = vision.RunningMode.VIDEO
        base = lambda name: python.BaseOptions(model_asset_path=str(paths[name]))
        frames = []
        with vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=base('pose'), running_mode=mode, num_poses=1)) as pose, \
             vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(base_options=base('hand'), running_mode=mode, num_hands=2)) as hand, \
             vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=base('face'), running_mode=mode, num_faces=1, output_face_blendshapes=True, output_facial_transformation_matrixes=True)) as face:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if len(frames) / fps > max_seconds:
                    raise ValueError('Clip exceeds duration limit')
                if doc['mirrored']:
                    frame = cv2.flip(frame, 1)
                timestamp = round(len(frames) * 1000 / fps)
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                p, h, f = (task.detect_for_video(image, timestamp) for task in (pose, hand, face))
                frames.append({'timestampMs': timestamp,
                    'pose': points(p.pose_landmarks[0]) if p.pose_landmarks else [],
                    'poseWorld': points(p.pose_world_landmarks[0]) if p.pose_world_landmarks else [],
                    'hands': [{'label': labels[0].category_name, 'score': labels[0].score,
                               'landmarks': points(local), 'world': points(world)}
                              for labels, local, world in zip(h.handedness, h.hand_landmarks, h.hand_world_landmarks)],
                    'face': points(f.face_landmarks[0]) if f.face_landmarks else [],
                    'blendshapes': {c.category_name: c.score for c in f.face_blendshapes[0]} if f.face_blendshapes else {},
                    'faceTransform': f.facial_transformation_matrixes[0].tolist() if len(f.facial_transformation_matrixes) else None})
        report = quality(frames)
        output.mkdir(parents=True)
        write_json(output / 'motion.json', {'schemaVersion': 1, 'status': 'unreviewed',
            'questionText': doc['questionText'], 'id': doc['id'], 'language': 'ksl',
            'fps': fps, 'sourceVideoSha256': digest(video), 'source': doc['source'],
            'signerId': doc['signerId'], 'unmirrored': doc['mirrored'],
            'models': {name: {'sha256': digest(path), 'url': MODEL_URLS[name]} for name, path in paths.items()},
            'mediapipeVersion': mp.__version__, 'frames': frames})
        write_json(output / 'quality.json', report)
        write_json(output / 'manifest.json', doc)
        print(json.dumps(report, ensure_ascii=False))
    finally:
        cap.release()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    download = commands.add_parser('models')
    download.add_argument('--directory', required=True)
    run = commands.add_parser('extract')
    run.add_argument('--manifest', required=True)
    run.add_argument('--models', required=True)
    run.add_argument('--output', required=True)
    run.add_argument('--max-seconds', type=float, default=120)
    args = parser.parse_args()
    try:
        if args.command == 'models':
            download_models(args.directory)
        else:
            extract(args.manifest, args.models, args.output, args.max_seconds)
    except (ValueError, OSError) as error:
        parser.exit(1, str(error) + '\n')

if __name__ == '__main__':
    main()
