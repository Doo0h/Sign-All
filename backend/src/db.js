import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

// 모든 JSON 항목은 팀 내부 설계. 원본 데이터 필드와 혼동하지 않습니다.
const tables = ['sources', 'companies', 'jobs', 'units', 'job_units', 'signs'];
export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true});
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('demo','live')), payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS companies(id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS units(id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS job_units(job_id TEXT REFERENCES jobs(id), unit_id TEXT REFERENCES units(id), PRIMARY KEY(job_id, unit_id));
    CREATE TABLE IF NOT EXISTS signs(id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), payload TEXT NOT NULL);`);
  return db;
}
export function importDataset(db, data) {
  if (!data || tables.some(k => !Array.isArray(data[k]))) throw new Error('sources/companies/jobs/units/job_units/signs 배열이 필요합니다.');
  const validId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(x);
  const required = (row, keys) => keys.every(k => typeof row[k] === 'string' && row[k].trim());
  for (const row of data.sources) {
    if (!validId(row.id) || !['demo','live'].includes(row.mode) || !required(row,['name','checkedAt','usage'])) throw new Error('잘못된 출처 항목');
    if (row.mode === 'live' && (!required(row,['url']) || row.verificationStatus !== 'verified')) throw new Error('실자료는 출처 URL과 검증 상태가 필요합니다.');
  }
  for (const kind of ['companies','jobs','units','signs']) for (const row of data[kind]) {
    if (!validId(row.id) || !validId(row.sourceId) || !required(row,[kind === 'signs' ? 'term' : 'name'])) throw new Error(`잘못된 항목: ${kind}`);
    if (kind === 'units' && !required(row,['definition'])) throw new Error('능력단위 정의가 필요합니다.');
    if (kind === 'signs') {
      if (!Array.isArray(row.keywords) || row.keywords.some(x => typeof x !== 'string' || !x.trim())) throw new Error('수어 키워드 형식 오류');
      for (const key of ['sourcePageUrl','videoUrl']) if (row[key]) {
        const url = new URL(row[key]);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('수어 주소는 HTTPS여야 합니다.');
      }
    }
  }
  for (const row of data.job_units) if (!validId(row.jobId) || !validId(row.unitId)) throw new Error('잘못된 연결');
  db.exec('BEGIN');
  try {
    for (const r of data.sources) db.prepare('INSERT INTO sources VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET mode=excluded.mode,payload=excluded.payload').run(r.id,r.mode,JSON.stringify(r));
    for (const kind of ['companies','jobs','units','signs']) for (const r of data[kind])
      db.prepare(`INSERT INTO ${kind} VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET source_id=excluded.source_id,payload=excluded.payload`).run(r.id,r.sourceId,JSON.stringify(r));
    // 연결 목록이 제공된 직무는 해당 목록으로 교체합니다. 빈 목록으로 초기화할 직무도 포함할 수 있습니다.
    for (const job of data.jobs) db.prepare('DELETE FROM job_units WHERE job_id=?').run(job.id);
    for (const r of data.job_units) db.prepare('INSERT OR IGNORE INTO job_units VALUES(?,?)').run(r.jobId,r.unitId);
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}
export function repository(db, mode) {
  const rows = kind => db.prepare(`SELECT t.payload FROM ${kind} t JOIN sources s ON t.source_id=s.id WHERE s.mode=? ORDER BY t.id`).all(mode).map(r=>JSON.parse(r.payload));
  const source = sid => { const r=db.prepare('SELECT payload FROM sources WHERE id=? AND mode=?').get(sid,mode); return r ? JSON.parse(r.payload) : null; };
  return {
    list: rows, source,
    get: (kind,key) => rows(kind).find(r=>r.id===key),
    units: jid => {
      const ids=new Set(db.prepare('SELECT unit_id FROM job_units WHERE job_id=?').all(jid).map(r=>r.unit_id));
      return rows('units').filter(r=>ids.has(r.id));
    }
  };
}
export const demoData = {
  sources:[{id:'demo-source',mode:'demo',name:'팀 작성 가상 테스트 자료',checkedAt:'2026-11-01',usage:'로컬 연동 테스트 전용',verificationStatus:'demo'}],
  companies:[{id:'demo-company',sourceId:'demo-source',name:'가상기업 (테스트 전용)',region:'가상 지역',industry:'가상 소프트웨어업',companySize:null,referenceDate:null,originalNumber:null}],
  jobs:[{id:'demo-job',sourceId:'demo-source',name:'가상 백엔드 개발 연습 직무',classification:null}],
  units:[{id:'demo-unit',sourceId:'demo-source',name:'팀 작성 문제 해결 연습 요소',definition:'문제 상황과 수행한 행동, 결과를 구체적으로 설명하는 연습용 요소. 공식 NCS 자료가 아님.'}],
  job_units:[{jobId:'demo-job',unitId:'demo-unit'}],
  signs:[] // 실제 영상은 확보 전이므로 가짜 URL을 넣지 않습니다.
};
