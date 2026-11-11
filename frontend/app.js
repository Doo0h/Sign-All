// Sign-All 프론트엔드 (프레임워크 없는 단일 파일). 화면 흐름: docs/screen-flow.md
const BASE = 'http://127.0.0.1:3001';
const STEPS = { S0: '시작', S1: '기업·직무 선택', S2: '자기소개서', S3: '질문 목록', S4: '질문 연습', S5: '종료' };

// 토큰은 메모리(이 객체)에만 둔다. URL·storage·콘솔에 남기지 않는다.
const fresh = () => ({
  screen: 'S0', token: null, isDemo: false, companies: [], jobs: [],
  companyId: '', jobId: '', resumeText: '', analysis: null,
  questions: [], answers: {}, feedbacks: {}, signs: {}, current: 0,
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

class ApiError extends Error { constructor(m, status) { super(m); this.status = status; } }

async function api(path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method: body === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(130000),
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(st.token ? { 'X-Session-Token': st.token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
  const locked = [...document.querySelectorAll('#main button, #main textarea, #main select')].map(el => [el, el.disabled]);
  locked.forEach(([el]) => { el.disabled = true; });
  btn.disabled = true; fail(); say(loading);
  $('main').setAttribute('aria-busy', 'true');
  try { await fn(); say(); } catch (e) { say(); if (st.screen !== 'EXPIRED') fail(e.message); }
  finally { busy = false; locked.forEach(([el, disabled]) => { if (el.isConnected) el.disabled = disabled; }); btn.disabled = false; $('main').removeAttribute('aria-busy'); if ($('generate')) $('generate').disabled = !st.analysis; }
}

function go(screen) {
  st.screen = screen; fail(); say(); render();
}

function render() {
  const main = $('main');
  main.replaceChildren();
  main.dataset.screen = st.screen;
  const idx = Object.keys(STEPS).indexOf(st.screen);
  $('step').textContent = idx >= 0 ? `${idx + 1} / 6 단계 · ${STEPS[st.screen]}` : '';
  const stages = ['시작 안내', '기업·직무', '자기소개서', '질문·답변', '연습 완료'];
  const current = ({ S0: 0, S1: 1, S2: 2, S3: 3, S4: 3, S5: 4 })[st.screen];
  $('step').textContent = current == null ? '연습 다시 시작' : `${current + 1} / 5 단계`;
  $('progress').replaceChildren(...stages.map((label, i) =>
    h('li', { className: i === current ? 'active' : i < current ? 'done' : '', ...(i === current ? { 'aria-current': 'step' } : {}) },
      h('span', { className: 'number', 'aria-hidden': 'true' }, i < current ? '✓' : String(i + 1)), label)));
  const view = { S0, S1, S2, S3, S4, S5, EXPIRED }[st.screen]();
  main.append(...view.filter(node => node != null && node !== false));
  main.querySelector('h2')?.focus(); // 화면이 바뀌면 제목으로 포커스
}
const title = (t) => h('h2', { tabIndex: -1 }, t);

// ---------- S0 시작
function S0() {
  const btn = h('button', { onclick: () => run(btn, '시작하는 중…', async () => {
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
      h('p', { className: 'eyebrow' }, 'READY AT YOUR OWN PACE'),
      title('당신의 경험이, 더 잘 전해지도록.'),
      h('p', { className: 'lead' }, '자기소개서에서 시작해 나만의 답변까지. 글로 읽고, 천천히 생각하고, 편안하게 면접을 연습하세요.'),
      btn, h('p', { className: 'hero-caption' }, '회원가입 없이 · 텍스트로 답변 · 나의 속도에 맞춰'),
      h('div', { className: 'hero-mark', 'aria-hidden': 'true' }, '↗')),
    h('div', { className: 'feature-grid' },
      feature('01', '경험에서 찾는 강점', '자기소개서를 정리하고 핵심 키워드와 역량을 확인해요.'),
      feature('02', '한 질문씩 차근차근', '기업·직무를 선택하고 관련 질문에 글로 답해요.'),
      feature('03', '답변을 더 구체적으로', '잘한 점과 보완할 점을 읽고 다음 연습을 준비해요.')),
    h('p', { className: 'privacy-note' }, '입력한 자기소개서와 답변은 서버에 영구 저장되지 않으며, 연습 종료 시 화면에서 지워집니다. 이름·연락처 등 개인정보는 제외해 주세요. 수어 자료는 질문의 핵심 단어를 이해하기 위한 참고 자료입니다.'),
  ];
}

async function loadLists() {
  say('기업과 직무 목록을 불러오고 있습니다.');
  const [c, j] = await Promise.all([api('/api/companies'), api('/api/jobs')]);
  st.companies = c.items; st.jobs = j.items;
}

// ---------- S1 기업·직무
function S1() {
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
    st[key] = e.target.value; resetQuestions(); sync();
  };
  return [
    title('어떤 면접을 준비하고 있나요?'),
    h('p', { className: 'lead' }, '연습할 기업과 직무를 선택해 주세요. 선택한 자료를 바탕으로 질문을 준비합니다.'),
    st.companies.length ? null : h('p', {}, '불러올 수 있는 기업 정보가 없습니다.'),
    st.jobs.length ? null : h('p', {}, '불러올 수 있는 직무 정보가 없습니다.'),
    h('label', { htmlFor: 'company' }, '기업'),
    h('select', { id: 'company', onchange: pick('companyId') }, opts(st.companies, st.companyId)),
    h('label', { htmlFor: 'job' }, '직무'),
    h('select', { id: 'job', onchange: pick('jobId') }, opts(st.jobs, st.jobId)),
    h('p', { className: 'note' }, '시연 모드에서는 가상 기업과 연습용 직무가 표시됩니다.'),
    next,
  ];
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
    const r = await api('/api/interview/questions', { companyId: st.companyId, jobId: st.jobId, analysisId: st.analysis.analysisId });
    resetQuestions(); st.questions = r.questions; go('S3');
  }));
  showAnalysis();
  return [
    title('당신의 경험을 들려주세요.'),
    h('p', { className: 'lead' }, '자기소개서를 붙여 넣거나 경험을 직접 적어 주세요. 분석 결과를 확인한 뒤 질문을 만들 수 있어요.'),
    summaryLine(),
    h('label', { htmlFor: 'resume' }, '자기소개서'), ta, count,
    h('button', { onclick: () => go('S1') }, '이전'), analyze, gen, result,
  ];
}
const summaryLine = () => h('p', { className: 'note' },
  `선택: ${st.companies.find((c) => c.id === st.companyId)?.name ?? '-'} / ${st.jobs.find((j) => j.id === st.jobId)?.name ?? '-'}`);

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
        h('p', {}, st.feedbacks[q.questionId] ? '✓ 피드백 받음' : '○ 미답변'),
        h('button', { onclick: () => { st.current = i; go('S4'); } }, '연습하기'))))
    : h('p', {}, '생성된 질문이 없습니다. 다시 만들어 주세요.');
  const end = h('button', { onclick: () => run(end, '종료하는 중…', endSession) }, '연습 종료');
  return [
    title('한 질문씩 연습해 볼까요?'), h('p', { className: 'lead' }, '나의 경험을 구체적으로 전달하는 데 집중해 보세요.'), summaryLine(), list,
    h('button', { onclick: back('S1', '기업·직무를 바꾸면 지금까지 만든 질문과 받은 피드백이 모두 지워집니다. 계속할까요?') }, '기업·직무 변경'),
    h('button', { onclick: back('S2', '자기소개서를 수정하면 분석, 질문, 받은 피드백이 모두 지워집니다. 계속할까요?') }, '자기소개서 수정'),
    end,
  ];
}

// ---------- S4 질문 연습
function S4() {
  const q = st.questions[st.current];
  const qid = q.questionId;
  const signBox = h('div', { 'aria-live': 'polite' });
  const fbBox = h('section', { 'aria-live': 'polite' });
  const ta = h('textarea', { id: 'answer', maxLength: 5000, value: st.answers[qid] ?? '', placeholder: '상황 → 내가 한 행동 → 결과 순서로 경험을 적어 보세요.' });
  const count = h('p', { className: 'counter' }, `${ta.value.length} / 5000자`);
  ta.addEventListener('input', () => { st.answers[qid] = ta.value; delete st.feedbacks[qid]; fbBox.replaceChildren(); count.textContent = `${ta.value.length} / 5000자`; });

  const showSign = (kw) => {
    const box = h('div', { id: 'sign-' + kw });
    const r = st.signs[kw];
    if (r === 'error') box.append(h('p', {}, '수어 자료를 불러오지 못했습니다. 답변 연습은 계속할 수 있습니다.'));
    else if (r && !r.items.length) box.append(h('p', {}, `'${kw}'에 해당하는 수어 자료를 찾지 못했습니다. 답변 연습은 계속할 수 있습니다.`));
    else if (r) {
      box.append(h('p', { className: 'note' }, '참고용 후보 자료입니다. 질문 속 의미와 다를 수 있습니다.'),
        h('ul', {}, r.items.map((s) => h('li', {}, `${s.term}${s.meaning ? ' — ' + s.meaning : ''} `,
          s.sourcePageUrl?.startsWith('https://') ? h('a', { href: s.sourcePageUrl, target: '_blank', rel: 'noopener' }, '출처') : null,
          // 영상 주소가 응답에 있을 때만 재생 영역 생성 (자동재생 없음)
          s.videoUrl?.startsWith('https://') ? h('video', { src: s.videoUrl, controls: true, width: 320 }) : null))));
    }
    return box;
  };
  const kwBtns = (q.keywords || []).map((kw) => {
    const b = h('button', { onclick: () => run(b, `'${kw}' 수어 자료를 찾고 있습니다.`, async () => {
      try { st.signs[kw] = await api('/api/signs?keyword=' + encodeURIComponent(kw)); } catch { st.signs[kw] = 'error'; }
      if (b.isConnected && st.screen === 'S4') b.nextElementSibling.replaceWith(showSign(kw));
    }) }, `'${kw}' 수어 자료 보기`);
    return [b, showSign(kw)];
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
    h('section', {}, h('h3', {}, '관련 수어 자료'), kwBtns.length ? kwBtns.flat() : h('p', {}, '이 질문에는 조회할 키워드가 없습니다.'), signBox),
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

render();
// 입력 전에 현재 연결 모드를 확인한다. 실패 시 시작 버튼으로 재시도할 수 있다.
api('/api/health').then(info => {
  $('demo-banner').hidden = false;
  $('demo-banner').textContent = info.aiMode === 'demo-rule-based'
    ? '시연 모드 · 가상 자료와 규칙 기반 응답을 사용합니다. 실제 AI 분석이 아닙니다.'
    : info.aiMode === 'local-model'
      ? '로컬 AI 모드 · 이 PC에 설치된 모델로 처리합니다.'
      : '외부 AI 모드 · 입력 내용이 설정된 AI 공급자로 전송됩니다.';
}).catch(() => { fail('서버 연결을 확인해 주세요. 서버 실행 후 연습 시작을 눌러 다시 시도할 수 있습니다.'); });
