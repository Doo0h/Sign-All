// Sign-All 프론트엔드 (프레임워크 없는 단일 파일). 화면 흐름: docs/screen-flow.md
const BASE = ''; // 개발·Docker·서버 모두 같은 출처의 /api 프록시를 사용한다.
let serverInfo = null;
const STEPS = { S0: '시작', S1: '채용공고 선택', S2: '자기소개서', S3: '질문 목록', S4: '질문 연습', S5: '종료' };

// 토큰은 메모리(이 객체)에만 둔다. URL·storage·콘솔에 남기지 않는다.
const fresh = () => ({
  screen: 'S0', token: null, isDemo: false, companies: [], jobs: [],
  companyId: '', jobId: '', posting:null, resumeText: '', analysis: null,
  questions: [], answers: {}, feedbacks: {}, signs: {}, current: 0, uploadName: '',
});
let st = fresh();
let busy = false;

const $ = (id) => document.getElementById(id);
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k.startsWith('aria-') || k === 'role') el.setAttribute(k, v);
    else if (v != null) el[k] = v;
  }
  el.append(...kids.flat().filter((k) => k != null && k !== false));
  return el;
}
const say = (msg = '') => { $('status').textContent = msg; };
const fail = (msg = '') => { $('error').textContent = msg; };

// 면접 입력을 유지한 채 독립적으로 사전 원문을 탐색한다.
$('open-sign-library')?.addEventListener('click', () => {
  const dialog=h('dialog',{'aria-label':'수어 자료실',className:'sign-library'});
  const results=h('div',{className:'sign-library-results'}),status=h('p',{role:'status'});
  const query=h('input',{type:'search',maxLength:100,'aria-label':'수어 검색어',placeholder:'회사, 준비, 경험 등'});
  const more=h('button',{type:'button'},'더 보기');
  let offset=0,version=0;
  async function search(append=false){
    const request=++version;more.disabled=true;status.textContent='자료를 불러오는 중입니다.';
    if(!append){offset=0;results.replaceChildren();}
    try{
      const data=await api(`/api/signs/catalog?q=${encodeURIComponent(query.value.trim())}&offset=${offset}`);
      if(request!==version || !dialog.isConnected)return;
      for(const item of data.items)results.append(h('article',{},h('h3',{},item.term),h('p',{},'문맥 적합성 미검토 · 원문에서 동작을 확인하세요.'),h('a',{href:item.sourcePageUrl,target:'_blank',rel:'noopener noreferrer'},'한국수어사전 원문 열기 ↗')));
      offset+=data.items.length;status.textContent=`검색 결과 ${data.total}개 · ${offset}개 표시`;
      more.hidden=offset>=data.total;
    }catch(e){if(request===version)status.textContent=e.message;}finally{if(request===version)more.disabled=false;}
  }
  const form=h('form',{onsubmit:e=>{e.preventDefault();search();}},query,h('button',{type:'submit'},'검색'));
  more.addEventListener('click',()=>search(true));
  dialog.append(h('button',{type:'button',onclick:()=>dialog.close()},'닫기'),h('h2',{},'면접 준비 수어 자료실'),h('p',{},'국립국어원 한국수어사전의 단어별 참고 링크입니다. 문장 전체 번역이 아니며, 영상은 원문 사이트에서 확인합니다.'),form,status,results,more);
  dialog.addEventListener('close',()=>{version++;dialog.remove();});
  document.body.append(dialog);dialog.showModal();query.focus();search();
});

class ApiError extends Error { constructor(m, status) { super(m); this.status = status; } }

async function api(path, body, file) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(130000),
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': file ? 'application/octet-stream' : 'application/json' }),
        ...(file ? { 'X-File-Name': encodeURIComponent(file.name) } : {}),
        ...(st.token ? { 'X-Session-Token': st.token } : {}),
      },
      ...(body === undefined ? {} : { body: file || JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError('서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.', 0);
  }
  const json = await res.json().catch(() => ({}));
  if (json.meta?.isDemo) { st.isDemo = true; $('demo-banner').hidden = false; }
  if (!res.ok) {
    if (res.status === 401 || res.status === 410) { st = fresh(); st.screen = 'EXPIRED'; render(); }
    // D5 미확정: 백엔드 message 필드가 있으면 그대로 쓰고, 없으면 공통 문구
    throw new ApiError(json.error?.message || '요청을 처리하지 못했습니다. 입력하신 내용은 그대로 남아 있습니다.', res.status);
  }
  return json.data;
}

// 버튼 중복 클릭 방지 + 로딩 문구 + 오류 처리
async function run(btn, loading, fn) {
  if (btn.disabled || busy) return;
  busy = true;
  const locked = [...document.querySelectorAll('#main button, #main textarea, #main select, #main input')].map(el => [el, el.disabled]);
  locked.forEach(([el]) => { el.disabled = true; });
  btn.disabled = true; fail(); say(loading);
  $('main').setAttribute('aria-busy', 'true');
  try { await fn(); say(); } catch (e) { say(); if (st.screen !== 'EXPIRED') fail(e.message); }
  finally { busy = false; locked.forEach(([el, disabled]) => { if (el.isConnected) el.disabled = disabled; }); btn.disabled = false; $('main').removeAttribute('aria-busy'); if ($('generate')) $('generate').disabled = !st.analysis; }
}

function go(screen) {
  st.screen = screen; fail(); say(); render();
}

function render(focusTitle = true) {
  const main = $('main');
  main.replaceChildren();
  main.dataset.screen = st.screen;
  const idx = Object.keys(STEPS).indexOf(st.screen);
  $('step').textContent = idx >= 0 ? `${idx + 1} / 6 단계 · ${STEPS[st.screen]}` : '';
  const stages = ['연습 안내', '채용공고 선택', '지원서 준비', '면접 연습', '연습 완료'];
  const current = ({ S0: 0, S1: 1, S2: 2, S3: 3, S4: 3, S5: 4 })[st.screen];
  $('step').textContent = current == null ? '연습 다시 시작' : `${current + 1} / 5 단계`;
  $('progress').replaceChildren(...stages.map((label, i) =>
    h('li', { className: i === current ? 'active' : i < current ? 'done' : '', ...(i === current ? { 'aria-current': 'step' } : {}) },
      h('span', { className: 'number', 'aria-hidden': 'true' }, i < current ? '✓' : String(i + 1)), label)));
  const view = { S0, S1, S2, S3, S4, S5, EXPIRED }[st.screen]();
  main.append(...view.filter(node => node != null && node !== false));
  if (focusTitle) main.querySelector('h2')?.focus(); // 사용자 화면 이동 시에만 제목으로 포커스
}
const title = (t) => h('h2', { tabIndex: -1 }, t);

// ---------- S0 시작
function S0() {
  const btn = h('button', { onclick: () => run(btn, '시작하는 중…', async () => {
    serverInfo=await api('/api/health');
    if (!st.token) {
      const s = await api('/api/session', {});
      st.token = s.sessionToken;
    }
    await loadLists();
    go('S1');
  }) }, '연습 시작');
  btn.className = 'primary';
  btn.textContent = '내 면접 연습 시작하기 →';
  const feature = (n, heading, body) => h('div', { className: 'feature' },
    h('span', { className: 'feature-no' }, n), h('h3', {}, heading), h('p', {}, body));
  return [
    h('div', { className: 'hero' },
      h('p', { className: 'eyebrow' }, 'YOUR NEXT CHAPTER'),
      title('다음 기회는,\n당신의 이야기에서.'),
      h('p', { className: 'lead' }, '관심 기업을 살펴보고, 지원서를 준비하고, 나만의 답변을 연습하세요. 모든 과정을 읽고 쓰며, 나의 속도로.'),
      btn, h('p', { className: 'hero-caption' }, '면접 연습 전용 · 실제 입사지원 접수 없음'),
      h('div', { className: 'application-preview', 'aria-hidden': 'true' },
        h('div', {className:'preview-top'}, h('span',{},'MY APPLICATION'), h('span',{className:'preview-dot'},'작성 중')),
        h('div',{className:'preview-avatar'},'나'),h('h3',{},'경험을 강점으로'),h('p',{},'작은 경험도 나만의 이야기가 됩니다.'),
        h('div',{className:'preview-line'}),h('div',{className:'preview-line short'}),h('div',{className:'preview-tags'},'경험 정리  ·  질문 연습'),
        h('div',{className:'preview-check'},'✓  준비하는 만큼, 한 걸음 더'))),
    h('div', { className: 'feature-grid' },
      feature('01', '관심 기업부터 탐색', '공식 기업 정보를 확인하고 연습할 직무를 선택해요.'),
      feature('02', '한 질문씩 차근차근', '채용공고를 선택하고 관련 질문에 글로 답해요.'),
      feature('03', '나의 문서로 시작', 'PDF·HWP·HWPX·DOCX·TXT에서 글을 불러와 직접 확인해요.')),
    h('p', { className: 'privacy-note' }, '입력한 자기소개서와 답변은 서버에 영구 저장되지 않으며, 연습 종료 시 화면에서 지워집니다. 이름·연락처 등 개인정보는 제외해 주세요. 수어 자료는 질문의 핵심 단어를 이해하기 위한 참고 자료입니다.'),
  ];
}

async function loadLists() {
  if(serverInfo?.postingsEnabled)return;
  say('기업과 직무 목록을 불러오고 있습니다.');
  const [c, j] = await Promise.all([api('/api/companies?limit=100'), api('/api/jobs?limit=100')]);
  st.companies = c.items; st.jobs = j.items;
}

// ---------- S1 기업·직무
function S1() {
  if(st.posting){st.posting=null;st.companyId='';st.jobId='';}
  if(serverInfo?.postingsEnabled)return [title('채용공고'),postingBrowser()];
  const opts = (items, cur) => [
    h('option', { value: '' }, '선택해 주세요'),
    ...items.map((i) => h('option', { value: i.id, selected: i.id === cur }, i.name)),
  ];
  const next = h('button', { className: 'primary', disabled: !(st.companyId && st.jobId), onclick: () => go('S2') }, '자기소개서 작성하기 →');
  const sync = () => { next.disabled = !(st.companyId && st.jobId); };
  const confirmReset = () => !hasFeedback() || confirm('기업·직무를 바꾸면 지금까지 만든 질문과 받은 피드백이 모두 지워집니다. 계속할까요?');
  const pick = (key) => (e) => {
    if (e.target.value === st[key]) return;
    if (!confirmReset()) { e.target.value = st[key]; return; }
    st[key] = e.target.value; st.posting=null; resetQuestions(); sync();
  };
  const companySelect=h('select', { id: 'company', onchange: e=>{pick('companyId')(e);drawCards();} }, opts(st.companies, st.companyId));
  const cards=h('div',{className:'company-grid'});
  const search=h('input',{id:'company-search',type:'search',placeholder:'기업명 또는 산업 검색',oninput:()=>drawCards()});
  function drawCards(){
    const query=search.value.trim().toLowerCase();
    const filtered=st.companies.filter(c=>(c.name+' '+(c.industry||'')).toLowerCase().includes(query));
    cards.replaceChildren(...filtered.map(c=>h('article',{className:'company-card'+(c.id===st.companyId?' selected':'')},
      h('div',{className:'company-top'},h('span',{className:'company-monogram '+(c.accent||'')},c.name.slice(0,1)),h('span',{className:'tag'},'기업 탐색')),
      h('h3',{},c.name),h('p',{className:'industry'},c.industry||'연습용 기업'),h('p',{},c.summary||'시연을 위한 가상 기업입니다.'),
      h('div',{className:'company-meta'},c.checkedAt?'출처 확인 '+c.checkedAt:'시연 데이터'),
      c.sourcePageUrl?.startsWith('https://')?h('a',{href:c.sourcePageUrl,target:'_blank',rel:'noopener noreferrer'},'공식 소개 ↗'):null,
      h('button',{className:c.id===st.companyId?'primary':'', 'aria-pressed':String(c.id===st.companyId),onclick:()=>{companySelect.value=c.id;companySelect.dispatchEvent(new Event('change'));}},c.id===st.companyId?'선택됨 ✓':'이 기업으로 연습'))));
    if(!filtered.length)cards.append(h('p',{},'검색 결과가 없습니다. 다른 검색어를 입력해 주세요.'));
  }
  drawCards();
  const hiring=serverInfo?.postingsEnabled?postingBrowser():null;
  return [
    h('p',{className:'eyebrow'},'EXPLORE COMPANIES'),title('어떤 미래를 준비하고 있나요?'),
    h('p', { className: 'lead' }, '채용 공고를 선택해 맞춤 면접을 준비하거나, 기업과 직무를 직접 골라 연습하세요.'),
    hiring,
    h('h3',{className:'practice-heading'},'기업·직무 직접 선택'),
    h('label',{htmlFor:'company-search'},'기업 찾기'),search,cards,
    st.companies.length ? null : h('p', {}, '불러올 수 있는 기업 정보가 없습니다.'),
    st.jobs.length ? null : h('p', {}, '불러올 수 있는 직무 정보가 없습니다.'),
    h('label', { htmlFor: 'company' }, '기업'),
    companySelect,
    h('label', { htmlFor: 'job' }, '직무'),
    h('select', { id: 'job', onchange: pick('jobId') }, opts(st.jobs, st.jobId)),
    h('p', { className: 'note' }, '기업 공식 소개와 팀 작성 직무 연습 기준을 구분합니다. 실제 지원서가 기업에 제출되지 않습니다.'),
    next,
  ];
}
function postingBrowser(){
  const results=h('div',{className:'posting-grid posting-list',role:'list','aria-label':'채용공고 목록'}),status=h('p',{role:'status'}),selected=h('aside',{className:'posting-selected',hidden:true,'aria-label':'선택한 공고 상세'});
  const q=h('input',{type:'search',placeholder:'기업명 또는 공고 제목',maxLength:100,'aria-label':'채용 공고 검색'});
  const company=h('select',{'aria-label':'채용 기업'},h('option',{value:''},'전체 기업'));
  const category=h('select',{'aria-label':'채용 직무'},h('option',{value:''},'전체 직무'));
  const region=h('input',{type:'search',placeholder:'지역 (서울은 Seoul로 검색)',maxLength:100,'aria-label':'근무지역'});
  const experience=h('select',{'aria-label':'경력 표현'},...['','신입·인턴 명시','경력 표현 포함','원문 확인'].map(v=>h('option',{value:v},v||'전체 경력')));
  const sort=h('select',{'aria-label':'공고 정렬'},h('option',{value:'default'},'기업별 보기'),h('option',{value:'deadline'},'마감 임박순'),h('option',{value:'recent'},'최근 갱신순'));
  const chips=h('div',{className:'company-chips','aria-label':'기업 바로 선택'});
  const pages=h('nav',{className:'posting-pages','aria-label':'채용공고 페이지'});let offset=0,version=0,initialized=false;
  const panel=h('section',{className:'hiring-panel hiring-table'},h('p',{className:'posting-notice'},'공식 채용공고를 확인하고 나에게 맞는 면접을 준비하세요. 한 페이지에 10개씩 표시합니다.'));
  async function search(page=1){
    const request=++version;offset=(page-1)*10;results.replaceChildren();pages.replaceChildren();selected.hidden=true;status.textContent='공식 채용 게시판을 확인하고 있습니다…';
    try{
      const params=new URLSearchParams({q:q.value,company:company.value,category:category.value,region:region.value,experience:experience.value,sort:sort.value,offset:String(offset)});
      const data=await api('/api/postings?'+params);
      if(request!==version||!panel.isConnected)return;
      if(!initialized){company.append(...data.companies.map(c=>h('option',{value:c.id},c.name)));category.append(...data.categories.map(c=>h('option',{value:c},c)));chips.append(...[{id:'',name:'전체'},...data.companies].map(c=>h('button',{type:'button','aria-pressed':String(company.value===c.id),onclick:()=>{company.value=c.id;search();}},c.name)));initialized=true;}
      [...chips.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===0?!company.value:data.companies[i-1]?.id===company.value)));
      for(const p of data.items){
        const pick=h('button',{type:'button',className:'posting-pick','aria-pressed':'false',onclick:()=>run(pick,'공고 원문을 확인하고 있습니다.',async()=>{
          const r=await api('/api/postings/select',{postingId:p.id});
          if(!panel.isConnected)return;
          selected.hidden=false;
          results.querySelectorAll('.posting-pick').forEach(b=>b.setAttribute('aria-pressed',String(b===pick)));
          const heading=h('h4',{tabIndex:-1},r.posting.title);
          selected.replaceChildren(h('button',{type:'button',className:'posting-close',onclick:()=>{selected.hidden=true;pick.focus();}},'상세 닫기'),h('p',{className:'posting-company'},r.posting.companyName),heading,h('p',{className:'posting-meta'},r.posting.location),h('p',{className:'posting-description'},r.posting.description||'상세 내용은 공고 원문에서 확인하세요.'),h('p',{className:'posting-notice'},'공고 본문의 일부를 표시합니다. 정확한 자격요건과 마감은 원문을 확인하세요.'),h('a',{href:r.posting.sourceUrl,target:'_blank',rel:'noopener noreferrer'},'공식 공고 원문 ↗'),h('button',{className:'primary',type:'button',onclick:()=>{st.posting=r.posting;st.companyId=r.company.id;st.jobId=r.job.id;resetQuestions();go('S2');}},'이 공고로 면접 연습 →'));
          heading.focus({preventScroll:true});
          selected.scrollIntoView?.({block:'nearest'});
        })},'공고 선택');
        const logos={kakao:'ico',naver:'ico',coupang:'ico',moloco:'png',sendbird:'svg',riotgames:'png','2k':'png'};
        const fallback=h('span',{className:'posting-initial','aria-hidden':'true'},p.companyName.slice(0,1));
        const logo=logos[p.board]?h('img',{src:'/logos/'+p.board+'.'+logos[p.board],alt:p.companyName+' 기업 이미지',width:52,height:52,loading:'lazy',onerror:e=>e.target.replaceWith(fallback)}):fallback;
        const titleButton=h('button',{type:'button',className:'posting-title-button',onclick:()=>pick.click()},p.title);
        results.append(h('article',{className:'posting-card posting-row',role:'listitem'},h('div',{className:'posting-row-company'},logo,h('p',{className:'posting-company'},p.companyName)),h('div',{className:'posting-row-info'},h('h4',{},titleButton),h('p',{className:'posting-meta'},p.category)),h('p',{className:'posting-cell'},p.experience),h('p',{className:'posting-cell'},p.location),h('div',{className:'posting-row-action'},h('p',{className:'posting-deadline'},p.deadline?new Date(p.deadline).toLocaleDateString('ko-KR'):'원문 확인'),pick)));
      }
      const totalPages=Math.ceil(data.total/10),start=Math.floor((page-1)/5)*5+1;
      const pageButton=(label,n,disabled=false)=>h('button',{type:'button',disabled,'aria-label':label==='이전'||label==='다음'?label+' 페이지':n+' 페이지','aria-current':n===page?'page':'false',onclick:()=>search(n)},label);
      if(totalPages>1){pages.append(pageButton('이전',page-1,page===1));for(let n=start;n<=Math.min(start+4,totalPages);n++)pages.append(pageButton(String(n),n));pages.append(pageButton('다음',page+1,page===totalPages));}
      status.textContent=`검색 결과 ${data.total}건 · ${page} / ${Math.max(1,totalPages)} 페이지 · 확인 ${new Date(data.checkedAt).toLocaleString('ko-KR')}`+(data.failedBoards.length?' · 일부 기업 연결 실패: '+data.failedBoards.join(', '):'');
      if(!data.total)results.append(h('p',{},'조건에 맞는 공고가 없습니다. 검색 조건을 바꿔 보세요.'));
    }catch(e){if(request===version&&panel.isConnected)status.textContent=e.message;}
  }
  const form=h('form',{className:'posting-filters',onsubmit:e=>{e.preventDefault();search();}},q,company,category,region,experience,sort,h('button',{type:'submit'},'공고 검색'));
  const columns=h('div',{className:'posting-columns','aria-hidden':'true'},...['기업명','공고명 / 직무','경력','근무지역','마감일'].map(t=>h('span',{},t)));
  panel.append(form,chips,status,columns,results,pages,selected);
  queueMicrotask(()=>{if(panel.isConnected)search();});return panel;
}
const hasFeedback = () => Object.keys(st.feedbacks).length > 0;
function resetQuestions() { st.questions = []; st.answers = {}; st.feedbacks = {}; st.signs = {}; st.current = 0; }

// ---------- S2 자기소개서
function S2() {
  const ta = h('textarea', { id: 'resume', maxLength: 10000, value: st.resumeText, placeholder: '어떤 경험을 했나요? 맡았던 역할, 문제를 해결한 과정, 배운 점을 자유롭게 적어 주세요.' });
  const count = h('p', { id: 'count' }, `${st.resumeText.length} / 10000자`);
  const result = h('section', { 'aria-live': 'polite' });
  const gen = h('button', { id: 'generate', className: 'primary', disabled: !st.analysis }, '예상 질문 만들기 →');
  const showAnalysis = () => {
    result.replaceChildren();
    if (!st.analysis) return;
    const a = st.analysis;
    result.append(
      h('h3', {}, '분석 결과'),
      h('p', {}, a.summary),
      h('p', {}, '키워드: ' + (a.keywords || []).join(', ')),
      a.competencies?.length ? h('ul', {}, a.competencies.map((c) => h('li', {}, `${c.name} — "${c.evidence}"`))) : h('p', {}, '추출된 역량이 없습니다.'),
    );
  };
  ta.addEventListener('input', () => {
    const changed = ta.value !== st.resumeText;
    if (changed && st.analysis) { // 자기소개서 변경 → 분석·질문·피드백 초기화
      st.analysis = null; resetQuestions(); gen.disabled = true; showAnalysis();
    }
    st.resumeText = ta.value; count.textContent = `${ta.value.length} / 10000자`;
  });
  const analyze = h('button', { onclick: () => {
    if (!st.resumeText.trim()) { fail('자기소개서를 입력해 주세요.'); ta.focus(); return; }
    run(analyze, '자기소개서를 분석하고 있습니다. 잠시 기다려 주세요.', async () => {
      st.analysis = null; resetQuestions(); gen.disabled = true; showAnalysis();
      st.analysis = await api('/api/resume/analyze', { resumeText: st.resumeText });
      showAnalysis(); gen.disabled = false; result.querySelector('h3').tabIndex = -1; result.querySelector('h3').focus();
    });
  } }, '분석하기');
  gen.addEventListener('click', () => run(gen, '예상 질문을 만들고 있습니다.', async () => {
    resetQuestions();
    const r = await api('/api/interview/questions', { companyId: st.companyId, jobId: st.jobId, analysisId: st.analysis.analysisId,...(st.posting?{postingId:st.posting.id}:{}) });
    resetQuestions(); st.questions = r.questions; go('S3');
  }));
  showAnalysis();
  const upload=h('input',{id:'resume-file',type:'file',accept:'.pdf,.hwp,.hwpx,.docx,.txt'});
  const uploadMessage=h('p',{id:'upload-message',role:'status'},st.uploadName?`불러온 파일: ${st.uploadName}`:'파일의 텍스트를 위 입력란으로 불러와 수정할 수 있습니다.');
  const uploadButton=h('button',{onclick:()=>{
    const file=upload.files?.[0];
    if(!file){fail('불러올 파일을 선택해 주세요.');return;}
    if(file.size>5242880){fail('파일은 최대 5MB까지 가능합니다.');return;}
    if(st.resumeText&&!confirm('파일의 텍스트로 현재 자기소개서 내용을 바꿀까요?'))return;
    run(uploadButton,'문서에서 텍스트를 불러오고 있습니다.',async()=>{
      const result=await api('/api/documents/extract',{},file);
      ta.value=result.text;ta.dispatchEvent(new Event('input'));st.uploadName=file.name;
      uploadMessage.textContent=`${file.name} · ${result.text.length}자 불러옴. `+(result.truncated?'앞 10,000자만 가져왔습니다. ':'')+'표·줄바꿈·누락을 확인해 주세요. 파일은 서버에 저장하지 않습니다.';
      upload.value='';ta.focus();
    });
  }},'파일에서 불러오기');
  return [
    title('자기소개서'),
    st.posting?h('details',{className:'selected-posting'},h('summary',{},st.posting.companyName+' · '+st.posting.title),h('p',{},st.posting.description),h('a',{href:st.posting.sourceUrl,target:'_blank',rel:'noopener noreferrer'},'공고 원문 ↗')):null,
    h('section',{className:'resume-editor','aria-label':'자기소개서 작성'},
      h('label', { htmlFor: 'resume',className:'resume-title' }, '내용 작성'), ta, count,
      h('div',{className:'resume-attachment'},h('label',{htmlFor:'resume-file'},'파일로 불러오기'),
        h('p',{className:'resume-file-help'},'PDF · HWP 5 · HWPX · DOCX · UTF-8 TXT / 최대 5MB. 스캔·암호 문서는 직접 입력해 주세요.'),
        h('div',{className:'resume-file-controls'},upload,uploadButton),uploadMessage)),
    h('button', { onclick: () => go('S1') }, '이전'), analyze, gen, result,
  ];
}
const summaryLine = () => h('p', { className: 'note' },
  st.posting?`선택: ${st.posting.companyName} / ${st.posting.title}`:`선택: ${st.companies.find((c) => c.id === st.companyId)?.name ?? '-'} / ${st.jobs.find((j) => j.id === st.jobId)?.name ?? '-'}`);

// ---------- S3 질문 목록
function S3() {
  const back = (to, msg) => () => {
    if (hasFeedback() && !confirm(msg)) return;
    if (to === 'S1') resetQuestions(); else { st.analysis = null; resetQuestions(); }
    go(to);
  };
  const list = st.questions.length
    ? h('ul', { className: 'q' }, st.questions.map((q, i) => h('li', {},
    h('p', {}, q.text),
    h('div',{className:'references'},(q.references||[]).filter(r=>r.id!=='team-practice-rubric' && r.url?.startsWith('https://')).map(r=>h('a',{href:r.url,target:'_blank',rel:'noopener noreferrer'},r.name+' ↗'))),
        h('button', { onclick: () => { st.current = i; go('S4'); } }, '연습하기'))))
    : h('p', {}, '생성된 질문이 없습니다. 다시 만들어 주세요.');
  const end = h('button', { onclick: () => run(end, '종료하는 중…', endSession) }, '연습 종료');
  return [
    title('한 질문씩 연습해 볼까요?'), h('p', { className: 'lead' }, '나의 경험을 구체적으로 전달하는 데 집중해 보세요.'), summaryLine(), list,
    h('button', { onclick: back('S1', '공고를 바꾸면 지금까지 만든 질문과 받은 피드백이 모두 지워집니다. 계속할까요?') }, '채용공고 다시 선택'),
    h('button', { onclick: back('S2', '자기소개서를 수정하면 분석, 질문, 받은 피드백이 모두 지워집니다. 계속할까요?') }, '자기소개서 수정'),
    end,
  ];
}

// ---------- S4 질문 연습
function S4() {
  const q = st.questions[st.current];
  const qid = q.questionId;
  const fbBox = h('section', { 'aria-live': 'polite' });
  const ta = h('textarea', { id: 'answer', maxLength: 5000, value: st.answers[qid] ?? '', placeholder: '상황 → 내가 한 행동 → 결과 순서로 경험을 적어 보세요.' });
  const count = h('p', { className: 'counter' }, `${ta.value.length} / 5000자`);
  ta.addEventListener('input', () => { st.answers[qid] = ta.value; delete st.feedbacks[qid]; fbBox.replaceChildren(); count.textContent = `${ta.value.length} / 5000자`; });

  const showSign = (kw) => {
    const box = h('div', { id: 'sign-' + kw, className:'sign-card-result', 'aria-live':'polite' });
    const r = st.signs[kw];
    if (r === 'error') box.append(h('p', {}, '수어 자료를 불러오지 못했습니다. 답변 연습은 계속할 수 있습니다.'));
    else if (r && !r.items.length) box.append(h('p', {}, `'${kw}'에 해당하는 수어 자료를 찾지 못했습니다. 답변 연습은 계속할 수 있습니다.`));
    else if (r) {
      box.append(h('p', { className: 'note' }, '참고용 후보 자료입니다. 질문 속 의미와 다를 수 있습니다.'),
        h('ul', {}, r.items.map((s) => h('li', {}, `${s.term}${s.meaning ? ' — ' + s.meaning : ''} `,
          s.sourcePageUrl?.startsWith('https://') ? h('a', { href: s.sourcePageUrl, target: '_blank', rel: 'noopener' }, '사전 원문 열기 ↗') : null,
          // 영상 주소가 응답에 있을 때만 재생 영역 생성 (자동재생 없음)
          s.videoUrl?.startsWith('https://') ? h('video', { src: s.videoUrl, controls: true, width: 320 }) : null))));
    }
    return box;
  };
  const kwBtns = [...new Set([...(q.keywords || []),'경험','문제','해결','도움','질문'])].map((kw) => {
    const b = h('button', { className:'sign-card-button', 'aria-label':`'${kw}' 수어 자료 보기`, 'aria-expanded':'false', 'aria-controls':'sign-'+kw, onclick: () => {
      if(b.getAttribute('aria-expanded')==='true'){
        b.setAttribute('aria-expanded','false');b.nextElementSibling.hidden=true;
        b.querySelector('.sign-card-action').textContent='수어 자료 보기 →';return;
      }
      run(b, `'${kw}' 수어 자료를 찾고 있습니다.`, async () => {
        if(!st.signs[kw] || st.signs[kw]==='error')try { st.signs[kw] = await api('/api/signs?keyword=' + encodeURIComponent(kw)); } catch { st.signs[kw] = 'error'; }
        if (b.isConnected && st.screen === 'S4'){
          b.nextElementSibling.replaceWith(showSign(kw));b.setAttribute('aria-expanded','true');
          b.querySelector('.sign-card-action').textContent='접기 ↑';
        }
      });
    } }, h('span',{className:'sign-card-kind'},(q.keywords||[]).includes(kw)?'질문 핵심어':'일반 참고어'),h('strong',{},kw),h('span',{className:'sign-card-action'},'수어 자료 보기 →'));
    const result=showSign(kw);result.hidden=true;
    return h('article',{className:'sign-card'},b,result);
  });

  const showFeedback = () => {
    fbBox.replaceChildren();
    const f = st.feedbacks[qid];
    if (!f) return;
    const list = (arr) => h('ul', {}, (arr || []).map((x) => h('li', {}, typeof x === 'string' ? x : JSON.stringify(x))));
    fbBox.append(h('h3', { tabIndex: -1 }, '피드백'), h('h4', {}, '잘한 점'), list(f.strengths),
      h('h4', {}, '보완할 점'), list(f.improvements), h('h4', {}, '제안'), h('p', {}, f.suggestion || ''),
      h('button', { onclick: () => go('S3') }, '질문 목록으로'),
      st.current < st.questions.length - 1 ? h('button', { onclick: () => { st.current++; go('S4'); } }, '다음 질문') : null);
    fbBox.querySelector('h3').focus();
  };
  const fb = h('button', { className: 'primary', onclick: () => {
    if (!ta.value.trim()) { fail('답변을 입력해 주세요.'); ta.focus(); return; }
    if (st.feedbacks[qid] && !confirm('이미 받은 피드백이 있습니다. 다시 받을까요?')) return; // D9 임시: 재요청 허용
    run(fb, '답변을 검토하고 있습니다.', async () => {
      st.feedbacks[qid] = await api('/api/interview/feedback', { questionId: qid, answerText: ta.value });
      showFeedback();
    });
  } }, '피드백 받기');
  showFeedback();
  return [
    title('질문 연습'),
    h('p', {}, `${st.current + 1} / ${st.questions.length}`),
    h('p', { className: 'question-text' }, h('strong', {}, q.text)),
    h('section', {className:'sign-panel'}, h('h3', {}, '단어 이해를 돕는 수어 사전'),h('p',{className:'sign-intro'},'궁금한 단어를 선택하면 사전 참고 자료를 확인할 수 있어요.'),h('div',{className:'sign-card-grid'},kwBtns),h('p',{className:'sign-disclaimer'},'질문 전체 번역이 아닌 단어별 참고 자료입니다. 질문 속 의미와 맞는지 원문에서 확인하세요.')),
    h('section', {}, h('label', { htmlFor: 'answer' }, '내 답변'), ta, count, fb),
    fbBox,
    h('button', { onclick: () => go('S3') }, '질문 목록으로'),
  ];
}

// ---------- S5 종료 / 만료
async function endSession() {
  try { await api('/api/session/end', {}); } catch (e) { if (![401, 410].includes(e.status)) throw e; }
  st = fresh(); $('demo-banner').hidden = true; go('S5');
}
function S5() {
  return [title('오늘도 한 걸음 나아갔어요.'), h('p', { className: 'lead' }, '면접 연습을 마쳤습니다. 입력한 내용은 화면에서 지워졌어요. 준비가 되면 새로운 연습을 시작해 보세요.'),
    h('button', { className: 'primary', onclick: () => go('S0') }, '새로운 연습 시작하기 →')];
}
function EXPIRED() {
  return [title('세션 만료'), h('p', {}, '연습 시간이 만료되었습니다. 새로 시작하면 분석과 질문을 다시 만들어야 합니다.'),
    // D11 임시: 자기소개서 입력은 새 세션에서 유지하지 않음
    h('button', { onclick: () => { st = fresh(); $('demo-banner').hidden = true; go('S0'); } }, '새로 시작')];
}

// 입력 내용이 있으면 새로고침·탭 닫기 전에 브라우저 확인 창
window.addEventListener('beforeunload', (e) => {
  if (st.resumeText || Object.values(st.answers).some(Boolean)) e.preventDefault();
});

render(false);
// 입력 전에 현재 연결 모드를 확인한다. 실패 시 시작 버튼으로 재시도할 수 있다.
api('/api/health').then(info => {
  serverInfo=info;
  $('demo-banner').hidden = false;
  $('demo-banner').textContent = info.aiMode === 'demo-rule-based'
    ? 'AI 시연 모드 · 규칙 기반 응답입니다. '+(info.dataMode==='live'?'기업·수어는 출처가 있는 참고 자료입니다.':'가상 연습 자료를 사용합니다.')
    : info.aiMode === 'local-model'
      ? '로컬 AI 모드 · 이 PC에 설치된 모델로 처리합니다.'
      : '외부 AI 모드 · 입력 내용이 설정된 AI 공급자로 전송됩니다.';
}).catch(() => { fail('서버 연결을 확인해 주세요. 서버 실행 후 연습 시작을 눌러 다시 시도할 수 있습니다.'); });
