"""Loopback-only draft avatar reviewer; explicit files only, no directory listing."""
import argparse
import json
import struct
import re
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs


def create_server(folder, player, video=None, port=8091, comparison=None):
    folder, player = Path(folder).resolve(), Path(player).resolve()
    model = folder / 'draft-operation.glb'
    raw = model.read_bytes()
    if raw[:4] != b'glTF':
        raise ValueError('Invalid draft GLB')
    size = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20+size])
    report = json.loads((folder/'retarget-report.json').read_text(encoding='utf8'))
    if report.get('status') != 'draft-unreviewed':
        raise ValueError('Expected a draft report')
    report['clips'] = [a['name'] for a in gltf.get('animations', [])]
    report['assetUrl'] = '/avatars/draft-operation.glb'
    report['hasVideo'] = bool(video)
    if not report['clips'] or not player.is_file():
        raise ValueError('Animation or player bundle missing; build frontend/avatar-player.js first')
    routes = {'/': (Path(__file__).with_name('avatar-review.html'),'text/html; charset=utf-8'),
              '/avatar-player.js': (player,'text/javascript'),
              '/avatars/draft-operation.glb': (model,'model/gltf-binary')}
    original=None
    if comparison:
        comparison=Path(comparison).resolve()
        original=json.loads((comparison/'retarget-report.json').read_text(encoding='utf8'))
        if original.get('status')!='draft-unreviewed' or any(original.get(k)!=report.get(k) for k in ('sourceVideoSha256','selectedFrames','modelSha256')):
            raise ValueError('Comparison must use the same draft source, model and interval')
        original_raw=(comparison/'draft-operation.glb').read_bytes()
        original_gltf=json.loads(original_raw[20:20+struct.unpack_from('<I',original_raw,12)[0]])
        original.update(clips=[a['name'] for a in original_gltf.get('animations',[])],assetUrl='/avatars/draft-original.glb',hasVideo=bool(video),hasComparison=True,variant='original')
        routes['/avatars/draft-original.glb']=(comparison/'draft-operation.glb','model/gltf-binary')
        report.update(hasComparison=True,variant='updated')
    if video:
        video = Path(video).resolve()
        if not video.is_file() or video.suffix.lower() != '.webm':
            raise ValueError('Preview reference video must be a local WebM file')
        routes['/source.webm'] = (video,'video/webm')
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path = urlsplit(self.path).path
            if path == '/data.json':
                selected=original if original and parse_qs(urlsplit(self.path).query).get('variant')==['original'] else report
                data, mime = json.dumps(selected,ensure_ascii=False).encode(), 'application/json; charset=utf-8'
            elif path in routes:
                file, mime = routes[path]
                data = file.read_bytes()
            else:
                self.send_error(404); return
            total=len(data);range_header=self.headers.get('Range') if path=='/source.webm' else None
            if range_header:
                match=re.fullmatch(r'bytes=(\d+)-(\d*)',range_header)
                start=int(match[1]) if match else total
                end=min(int(match[2]) if match and match[2] else total-1,total-1)
                if start> end or start>=total:
                    self.send_response(416);self.send_header('Content-Range',f'bytes */{total}');self.end_headers();return
                data=data[start:end+1];self.send_response(206)
                self.send_header('Content-Range',f'bytes {start}-{end}/{total}')
            else:self.send_response(200)
            if path=='/source.webm':self.send_header('Accept-Ranges','bytes')
            self.send_header('Content-Type',mime)
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.end_headers()
            self.wfile.write(data)
        def log_message(self,*args):
            pass
    return ThreadingHTTPServer(('127.0.0.1',port),Handler)


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder',required=True)
    parser.add_argument('--player',default=str(Path(__file__).resolve().parents[2]/'frontend/avatar-player.js'))
    parser.add_argument('--video')
    parser.add_argument('--port',type=int,default=8091)
    parser.add_argument('--comparison')
    args=parser.parse_args()
    with create_server(args.folder,args.player,args.video,args.port,args.comparison) as server:
        print(f'Draft reviewer: http://127.0.0.1:{server.server_port}',flush=True)
        server.serve_forever()
