"""Local-only viewer for the licensed pixiv VRM sample and a verified motion source."""
import argparse
import hashlib
import json
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from retarget_makehuman import assign_hands

MODEL_SHA='12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2'


def create_server(model,motion,player,port=8091):
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
    payload=json.dumps({'status':'draft-unreviewed','frames':frames,'source':data['source'],
        'modelSha256':MODEL_SHA,'sourceVideoSha256':data['sourceVideoSha256']},ensure_ascii=False).encode()
    routes={'/':(Path(__file__).with_name('vrm-review.html'),'text/html; charset=utf-8'),
        '/vrm-player.js':(player,'text/javascript'),'/avatar.vrm':(model,'model/gltf-binary')}
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path=urlsplit(self.path).path
            if path=='/motion.json':body,mime=payload,'application/json; charset=utf-8'
            elif path in routes:
                file,mime=routes[path];body=file.read_bytes()
            else:self.send_error(404);return
            self.send_response(200);self.send_header('Content-Type',mime)
            self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)
        def log_message(self,*args):pass
    return ThreadingHTTPServer(('127.0.0.1',port),Handler)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for k in ('model','motion','player'):p.add_argument('--'+k,required=True)
    p.add_argument('--port',type=int,default=8091);a=p.parse_args()
    with create_server(a.model,a.motion,a.player,a.port) as server:
        print(f'VRM review: http://127.0.0.1:{server.server_port}',flush=True);server.serve_forever()
