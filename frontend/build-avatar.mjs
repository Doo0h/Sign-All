import {build} from 'esbuild';
await build({entryPoints:[new URL('./avatar-player-source.js',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1')],bundle:true,format:'esm',minify:true,outfile:new URL('./avatar-player.js',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),legalComments:'eof'});
