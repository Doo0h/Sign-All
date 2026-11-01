import {readFileSync} from 'node:fs';
import {config} from '../src/common.js';
import {openDatabase, importDataset} from '../src/db.js';
if (!process.argv[2]) { console.error('사용법: npm run import:data -- 검증된-내부형식.json'); process.exit(1); }
const db = openDatabase(config().dbPath);
try { importDataset(db, JSON.parse(readFileSync(process.argv[2], 'utf8'))); console.log('참조자료 트랜잭션 반영 완료'); }
catch { console.error('가져오기 실패: JSON 구조·출처·ID·관계를 확인하세요. 원문은 출력하지 않습니다.'); process.exitCode=1; }
finally { db.close(); }
