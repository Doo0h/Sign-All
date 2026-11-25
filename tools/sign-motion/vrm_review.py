"""Local-only viewer for the licensed pixiv VRM sample and a verified motion source."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from retarget_makehuman import assign_hands

MODEL_SHA='12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2'


def create_server(model,motion,player,port=8091,video=None):
    model,motion,player=map(lambda p:Path(p).resolve(),(model,motion,player))
    if hashlib.sha256(model.read_bytes()).hexdigest()!=MODEL_SHA:
        raise ValueError('This viewer is configured for the reviewed pixiv sample only')
    if not player.is_file():raise ValueError('Build the VRM viewer bundle first')
    data=json.loads(motion.read_text(encoding='utf8'))
    if data.get('sourceVideoSha256')!='92e79ecc08dab0ec5fcd8d57b015dcf9c81aca16f8b5d731c3c028f069ae47b6':
        raise ValueError('Expected the documented licensed operation video')
    frames=[]
    for sample in data['frames'][11:56]:
        hands=assign_hands(sample)
        frames.append({'timestampMs':sample['timestampMs'],'poseWorld':sample['poseWorld'],
            'hands':{k:v['world'] for k,v in hands.items()},'blendshapes':sample['blendshapes']})
    payload=json.dumps({'status':'draft-unreviewed','frames':frames,'source':data['source'],'hasVideo':bool(video),
        'modelSha256':MODEL_SHA,'sourceVideoSha256':data['sourceVideoSha256']},ensure_ascii=False).encode()
    routes={'/':(Path(__file__).with_name('vrm-review.html'),'text/html; charset=utf-8'),
        '/vrm-player.js':(player,'text/javascript'),'/avatar.vrm':(model,'model/gltf-binary')}
    if video:
        video=Path(video).resolve()
        if not video.is_file() or video.suffix.lower()!='.webm':raise ValueError('Expected a local WebM reference video')
        routes['/source.webm']=(video,'video/webm')
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path=urlsplit(self.path).path
            if path=='/motion.json':body,mime=payload,'application/json; charset=utf-8'
            elif path in routes:
                file,mime=routes[path];body=file.read_bytes()
            else:self.send_error(404);return
            total=len(body);requested=self.headers.get('Range') if path=='/source.webm' else None
            if requested:
                match=re.fullmatch(r'bytes=(\d+)-(\d*)',requested)
                start=int(match[1]) if match else total
                end=min(int(match[2]) if match and match[2] else total-1,total-1)
                if start>end or start>=total:
                    self.send_response(416);self.send_header('Content-Range',f'bytes */{total}');self.end_headers();return
                body=body[start:end+1];self.send_response(206);self.send_header('Content-Range',f'bytes {start}-{end}/{total}')
            else:self.send_response(200)
            if path=='/source.webm':self.send_header('Accept-Ranges','bytes')
            self.send_header('Content-Type',mime)
            self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)
        def log_message(self,*args):pass
    return ThreadingHTTPServer(('127.0.0.1',port),Handler)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for k in ('model','motion','player'):p.add_argument('--'+k,required=True)
    p.add_argument('--port',type=int,default=8091);p.add_argument('--video');a=p.parse_args()
    with create_server(a.model,a.motion,a.player,a.port,a.video) as server:
        print(f'VRM review: http://127.0.0.1:{server.server_port}',flush=True);server.serve_forever()
