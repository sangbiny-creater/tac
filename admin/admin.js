import { api, loadMeta } from './data.js';
import { adminUser, signInAdmin, signOutAll } from '../firebase.js';
// 타임어택 연산 백오피스 SPA — 한국사 백오피스와 같은 모양. 문제은행이 없으므로 문항 관리 · 가져오기 · 사용자 문제 · 정정 요청은 없음
const $main = document.getElementById('main');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR'));
const secs = (ms) => (ms == null ? '-' : (ms / 1000).toFixed(1) + '초');
const pct = (v) => (v == null ? '-' : v + '%');
const dt = (ms) => (ms ? new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');

let META = null;
const opLabel = (o) => META?.series.opLabels[o] || o;
const lvLabel = (l) => META?.series.levelLabels[l] || l;
const LV_COLOR = { 1: 'gray', 2: 'green', 3: 'orange' };
const lvPill = (l) => `<span class="pill ${LV_COLOR[l] || 'gray'}">${esc(lvLabel(l))}</span>`;
const opsText = (ops) => (ops || []).map(opLabel).join('·');
// 화면 안 확인 창 — 브라우저 기본 confirm() 은 일부 환경(앱 안 브라우저 등)에서 뜨지 않고 바로 '취소'가 됨
function ask(msg) {
  return new Promise((resolve) => {
    const d = document.createElement('div');
    d.className = 'ask-back';
    d.innerHTML = `<div class="ask-box" role="dialog" aria-modal="true"><p></p><div class="ask-btns"><button class="btn" data-v="0">취소</button><button class="btn primary" data-v="1">확인</button></div></div>`;
    d.querySelector('p').textContent = msg;
    const done = (v) => { d.remove(); document.removeEventListener('keydown', key); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
    d.onclick = (e) => { if (e.target === d) done(false); const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1'); };
    document.addEventListener('keydown', key);
    document.body.appendChild(d);
    d.querySelector('[data-v="1"]').focus();
  });
}
function toast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'show' + (error ? ' error' : '');
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = ''), 2400);
}
const parseHash = () => {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  return { parts: path.split('/'), query: Object.fromEntries(new URLSearchParams(qs || '')) };
};
const setQuery = (base, q) => {
  const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v != null)).toString();
  history.replaceState(null, '', '#/' + base + (s ? '?' + s : ''));
};
const accColor = (a) => (a == null ? '#C8D0CB' : a >= 80 ? '#47A276' : a >= 50 ? '#FF9E3D' : '#E5484D');
const accBar = (a) => `<div class="acc-bar"><div class="bar"><i style="width:${a ?? 0}%;background:${accColor(a)}"></i></div><b>${pct(a)}</b></div>`;

// ---------- 로그인 (구글 · arithmetic 데이터베이스의 admins/{이메일} 에 등록된 계정만) ----------
function showLogin(msg = '') {
  document.getElementById('shell').hidden = true;
  document.getElementById('login').hidden = false;
  document.getElementById('login-err').textContent = msg;
}
document.getElementById('google-login').onclick = async () => {
  try { if (await signInAdmin()) boot(); } catch (err) { showLogin(err.message); }
};
document.getElementById('logout').onclick = async () => { await signOutAll(); showLogin(); };

async function boot() {
  const u = await adminUser();
  if (!u || u.isAnonymous) return showLogin();
  try {
    META = await loadMeta();
  } catch (e) {
    await signOutAll();
    return showLogin(e.message);
  }
  document.getElementById('login').hidden = true;
  document.getElementById('shell').hidden = false;
  document.getElementById('series-title').textContent = META.series.title;
  document.getElementById('who').textContent = u.email || '';
  document.title = META.series.title + ' 백오피스';
  route();
}

const ROUTES = { dashboard: viewDashboard, stats: viewStats, runs: viewRuns, playstats: viewPlayStats, ranking: viewRanking, settings: viewSettings };
async function route() {
  if (!META) return;
  const { parts, query } = parseHash();
  const name = ROUTES[parts[0]] ? parts[0] : 'dashboard';
  document.querySelectorAll('#side nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === name));
  document.getElementById('drawer-root').innerHTML = '';
  try { await ROUTES[name](parts.slice(1), query); } catch (e) { $main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
window.addEventListener('hashchange', route);

// ---------- 대시보드 ----------
async function viewDashboard() {
  const d = await api('/dashboard');
  const maxRuns = Math.max(1, ...d.daily.map((x) => x.runs));
  const S = META.series;
  const lvTotal = Math.max(1, d.recentRuns);
  $main.innerHTML = `
    <h1 class="page">대시보드</h1><p class="page-sub">${esc(S.title)} 운영 현황 · 문제는 판마다 서버가 새로 만들어요 (문제은행 없음)</p>
    <div class="grid g4">
      <div class="card kpi"><div class="k">플레이</div><div class="v">${fmt(d.plays.today)}<small>오늘 시작</small></div><div class="s">이번 주 완료 ${fmt(d.plays.week_finished)} · 누적 완료 ${fmt(d.plays.finished)}</div></div>
      <div class="card kpi"><div class="k">사용자</div><div class="v">${fmt(d.users)}</div><div class="s">닉네임을 만든 사람</div></div>
      <a class="card kpi link" href="#/stats"><div class="k">전체 정답률</div><div class="v">${pct(d.accuracy)}</div><div class="s">푼 문제 ${fmt(d.attempts)}개 · 시간초과 ${pct(d.timeoutRate)}</div></a>
      <a class="card kpi link" href="#/runs?flagged=1"><div class="k">부정행위 의심 판</div><div class="v" style="color:${d.plays.flagged ? 'var(--red)' : ''}">${fmt(d.plays.flagged)}</div><div class="s">미처리 · 눌러서 확인</div></a>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h2>최근 14일 플레이 수</h2>
        ${d.daily.length ? `<div class="bars-v">${d.daily.map((x) => `<div class="b" title="${x.d}: 시작 ${x.runs} / 완료 ${x.finished} / 평균 ${fmt(x.avg_score)}점"><em>${x.runs}</em><i style="height:${(x.runs / maxRuns) * 140}px"></i><span>${x.d.slice(5)}</span></div>`).join('')}</div>` : '<div class="empty">아직 플레이 기록이 없습니다.</div>'}
      </div>
      <div class="card"><h2>최근 14일 고른 설정 <span class="muted" style="font-weight:400">(시작한 판 ${fmt(d.recentRuns)}개 기준)</span></h2>
        <table class="t"><thead><tr><th>자리 수 (가장 높은 자리)</th><th class="num">판</th><th>비율</th></tr></thead><tbody>
          ${S.levels.map((lv) => `<tr><td>${lvPill(lv)}</td><td class="num">${fmt(d.levels[lv] || 0)}</td><td>${accBar(Math.round(((d.levels[lv] || 0) / lvTotal) * 1000) / 10)}</td></tr>`).join('')}
        </tbody></table>
        <table class="t" style="margin-top:10px"><thead><tr><th>연산 (켜고 시작한 판)</th><th class="num">판</th><th>비율</th></tr></thead><tbody>
          ${S.ops.map((o) => `<tr><td><b>${esc(opLabel(o))}</b></td><td class="num">${fmt(d.opsUse[o] || 0)}</td><td>${accBar(Math.round(((d.opsUse[o] || 0) / lvTotal) * 1000) / 10)}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
}

// ---------- 정답률 분석 (연산 × 자리 수) ----------
async function viewStats() {
  const s = await api('/stats');
  const S = META.series;
  const get = (o, l) => s.rows.find((r) => r.op === o && r.lv === l);
  const cell = (r) => (r && r.attempts ? `${accBar(r.accuracy)}<div class="muted" style="font-size:12px;margin-top:2px">${fmt(r.attempts)}문제 · 평균 ${secs(r.avg_correct_ms)}</div>` : '<span class="muted">-</span>');
  const all = s.rows.filter((r) => r.attempts).sort((a, b) => a.accuracy - b.accuracy);
  $main.innerHTML = `
    <div class="page-head"><div class="grow"><h1 class="page">정답률 분석</h1><p class="page-sub" style="margin:4px 0 0">연산·자리 수별 실제 플레이 기록. 정답률이 너무 높거나 낮으면 <code>functions/src/problems.js</code> 의 숫자 범위를 조정하세요.</p></div>
      <button class="btn" id="reset">통계 초기화</button></div>
    <div class="card"><h2>연산 × 자리 수 정답률</h2>
      <table class="t"><thead><tr><th>연산</th>${S.levels.map((l) => `<th>${esc(lvLabel(l))} <span class="muted">×${META.scoring.levelMultiplier[l]}</span></th>`).join('')}</tr></thead>
      <tbody>${S.ops.map((o) => `<tr><td><b>${esc(opLabel(o))}</b> <span class="muted">${esc(S.opSymbols[o])}</span></td>${S.levels.map((l) => `<td>${cell(get(o, l))}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h2>자리 수(판 설정)별 점수 · 점수규칙 v${META.scoring.version}</h2>
        <table class="t"><thead><tr><th>가장 높은 자리</th><th class="num">완료 판</th><th class="num">평균 점수</th><th class="num">최고 점수</th><th>정답률</th></tr></thead>
        <tbody>${s.byLevel.sort((a, b) => a.lv - b.lv).map((L) => `<tr><td>${lvPill(L.lv)}</td><td class="num">${fmt(L.runs)}</td><td class="num"><b>${fmt(L.avg)}</b></td><td class="num">${fmt(L.best)}</td><td>${accBar(L.accuracy)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">아직 완료된 판이 없어요</td></tr>'}</tbody></table>
        <p class="muted" style="font-size:12px;margin:8px 0 0">자리 수 배율이 공정한지 볼 때: 높은 자리 판의 평균 점수가 낮은 자리 판보다 확실히 높아야 해요.</p></div>
      <div class="card"><h2>어려운 순 (정답률 낮은 순)</h2>
        ${all.length ? `<table class="t"><thead><tr><th>연산</th><th>자리</th><th class="num">문제</th><th>정답률</th><th class="num">시간초과</th><th class="num">평균 정답시간</th></tr></thead><tbody>${all.map((r) => `<tr><td><b>${esc(opLabel(r.op))}</b></td><td>${lvPill(r.lv)}</td><td class="num">${fmt(r.attempts)}</td><td>${accBar(r.accuracy)}</td><td class="num">${r.attempts ? Math.round((r.timeouts / r.attempts) * 1000) / 10 + '%' : '-'}</td><td class="num">${secs(r.avg_correct_ms)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">아직 기록이 없습니다.</div>'}
      </div>
    </div>`;
  $main.querySelector('#reset').onclick = async () => {
    if (!await ask('연산별 정답률 통계를 모두 지울까요? (판 기록·랭킹은 그대로예요)')) return;
    const r = await api('/stats/reset', { method: 'POST' });
    toast(`통계 ${r.deleted}칸을 지웠습니다`); route();
  };
}

// ---------- 플레이 통계 (하루 최대 판 수 · 총 판 수 · 사람별) ----------
async function viewPlayStats() {
  $main.innerHTML = '<h1 class="page">플레이 통계</h1><div class="muted">불러오는 중…</div>';
  const d = await api('/playstats');
  $main.innerHTML = `
    <h1 class="page">플레이 통계</h1>
    <p class="page-sub">판 = '문제 풀기'로 시작한 한 판 (끝까지 푼 판 + 중간에 나간 판). 날짜는 한국 시간 기준.</p>
    <div class="grid g4">
      <div class="card kpi"><small>지금까지 총 판 수</small><b>${fmt(d.started)}</b><span class="muted">끝까지 ${fmt(d.finished)} · 중간에 나감 ${fmt(d.abandoned)}</span></div>
      <div class="card kpi"><small>플레이한 사람</small><b>${fmt(d.players)}</b><span class="muted">명</span></div>
      <div class="card kpi"><small>한 사람이 하루에 한 최대 판 수</small><b>${fmt(d.maxPerDay)}</b><span class="muted">판</span></div>
      <div class="card kpi"><small>처음 값이 십의 자리로 바뀐 사람</small><b>${fmt(d.userRows.filter((u) => u.defaultLevel >= 2).length)}</b><span class="muted">명 (일의 자리 ${META.series.levelUp.minRuns}판 · 정답률 ${Math.round(META.series.levelUp.minAccuracy * 100)}% 이상)</span></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h2>날짜별</h2>
        <div class="table-wrap"><table class="t"><thead><tr><th>날짜</th><th class="num">판 수</th><th class="num">끝까지</th><th class="num">사람</th><th class="num">1인 최대</th><th>최대 플레이어</th></tr></thead>
        <tbody>${d.dayRows.map((r) => `<tr><td>${esc(r.day)}</td><td class="num">${fmt(r.runs)}</td><td class="num">${fmt(r.finished)}</td><td class="num">${fmt(r.players)}</td><td class="num"><b>${fmt(r.maxPerUser)}</b></td><td>${esc(r.maxUser)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">아직 기록이 없어요</td></tr>'}</tbody></table></div></div>
      <div class="card"><h2>사람별</h2>
        <div class="table-wrap"><table class="t"><thead><tr><th>닉네임</th><th class="num">총 판 수</th><th class="num">하루 최대</th><th class="num">플레이한 날</th><th>가장 높은 자리</th><th>처음 값</th><th>마지막</th></tr></thead>
        <tbody>${d.userRows.map((u) => `<tr><td>${esc(u.nickname)}</td><td class="num"><b>${fmt(u.runs)}</b></td><td class="num">${fmt(u.maxPerDay)}${u.maxDay ? ` <span class="muted" style="font-size:12px">(${esc(u.maxDay.slice(5))})</span>` : ''}</td><td class="num">${fmt(u.days)}</td><td>${lvPill(u.maxLevel)}</td><td>${lvPill(u.defaultLevel)}</td><td>${dt(u.last)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">아직 기록이 없어요</td></tr>'}</tbody></table></div></div>
    </div>`;
}

// ---------- 플레이 기록 ----------
async function viewRuns(_p, query) {
  const st = { flagged: query.flagged || '', nickname: query.nickname || '', week: query.week || '', page: 1 };
  const sc = META.scoring;
  $main.innerHTML = `
    <h1 class="page">플레이 기록</h1><p class="page-sub">완료된 판. ${sc.tooFastMs / 1000}초 안에 맞힌 답이 ${sc.tooFastFlagCount}개 이상이면 '의심'으로 표시됩니다. 실격 처리하면 랭킹에서 빠집니다.</p>
    <div class="filters">
      <input class="in" id="nick" placeholder="닉네임" value="${esc(st.nickname)}">
      <input class="in" id="week" placeholder="주차 (예: 2026-W48)" value="${esc(st.week)}" style="width:170px">
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="flagged" ${st.flagged ? 'checked' : ''}> 의심 판만</label>
    </div>
    <div class="table-wrap" id="tbl"></div><div class="pager" id="pager"></div>`;
  async function load() {
    setQuery('runs', { flagged: st.flagged, nickname: st.nickname, week: st.week });
    const r = await api('/runs?' + new URLSearchParams(Object.entries(st).filter(([, v]) => v !== '')));
    $main.querySelector('#tbl').innerHTML = r.rows.length ? `<table class="t"><thead><tr><th>완료 시각</th><th>주차</th><th>닉네임</th><th>설정</th><th class="num">점수</th><th class="num">정답</th><th class="num">총 시간</th><th class="num">너무 빠른 답</th><th class="num">화면 이탈</th><th>상태</th></tr></thead>
      <tbody>${r.rows.map((x) => `<tr class="click" data-id="${x.id}"><td>${dt(x.finished_at)}</td><td>${esc(x.week_key)}</td><td><b>${esc(x.nickname)}</b>${x.blocked ? ' <span class="pill red">차단</span>' : ''}</td>
        <td>${lvPill(x.level)} <span class="muted" style="font-size:12px">${esc(opsText(x.ops))}</span></td>
        <td class="num"><b>${fmt(x.total_score)}</b></td><td class="num">${x.correct_count}/${x.question_count}</td><td class="num">${secs(x.total_time_ms)}</td>
        <td class="num" style="color:${x.too_fast_count ? 'var(--red)' : ''}">${x.too_fast_count}</td><td class="num">${x.focus_lost_count}</td>
        <td>${x.disqualified ? '<span class="pill red">실격</span>' : x.flagged ? '<span class="pill orange">의심</span>' : '<span class="pill green">정상</span>'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">기록이 없습니다.</div>';
    const pages = Math.max(1, Math.ceil(r.total / 50));
    $main.querySelector('#pager').innerHTML = `총 ${fmt(r.total)}판 · <button class="btn sm" id="prev" ${st.page <= 1 ? 'disabled' : ''}>이전</button> ${st.page}/${pages} <button class="btn sm" id="next" ${st.page >= pages ? 'disabled' : ''}>다음</button>`;
    $main.querySelector('#prev').onclick = () => { st.page--; load(); };
    $main.querySelector('#next').onclick = () => { st.page++; load(); };
    $main.querySelectorAll('tr.click').forEach((tr) => (tr.onclick = () => runDrawer(tr.dataset.id, load)));
  }
  let deb;
  $main.querySelector('#nick').oninput = (e) => { clearTimeout(deb); deb = setTimeout(() => { st.nickname = e.target.value.trim(); st.page = 1; load(); }, 250); };
  $main.querySelector('#week').onchange = (e) => { st.week = e.target.value.trim(); st.page = 1; load(); };
  $main.querySelector('#flagged').onchange = (e) => { st.flagged = e.target.checked ? '1' : ''; st.page = 1; load(); };
  await load();
}

async function runDrawer(id, reload) {
  const d = await api('/runs/' + id);
  const root = document.getElementById('drawer-root');
  const r = d.run;
  root.innerHTML = `<div class="drawer-back"><div class="drawer">
    <div class="page-head"><div class="grow"><h1 class="page" style="font-size:18px">${esc(r.nickname)} · ${fmt(r.total_score)}점</h1><div class="muted">${dt(r.finished_at)} · ${esc(r.week_key)} · ${esc(lvLabel(r.level))}${r.level > 1 ? '까지' : ''} · ${esc(opsText(r.ops))} · 점수규칙 v${r.score_version}</div></div><button class="btn sm" id="close">닫기</button></div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn ${r.disqualified ? '' : 'danger'}" id="dq">${r.disqualified ? '실격 해제' : '이 판 실격 처리'}</button>
      <button class="btn danger" id="block">사용자 차단 (랭킹 제외)</button>
    </div>
    <table class="t"><thead><tr><th>#</th><th>문제</th><th>자리</th><th>결과</th><th class="num">소요</th><th class="num">점수</th></tr></thead><tbody>
    ${d.questions.map((x) => `<tr><td>${x.seq}</td><td><b>${esc(x.text)} = ${fmt(x.answer)}</b>${x.chosen != null && !x.is_correct ? ` <span class="muted">(고른 답 ${fmt(x.chosen)})</span>` : ''}</td><td>${lvPill(x.lv)}</td>
      <td>${x.status === 'TIMEOUT' ? '<span class="pill gray">시간초과</span>' : x.status === 'PENDING' || x.status === 'SERVED' ? '<span class="pill gray">안 풂</span>' : x.is_correct ? '<span class="pill green">정답</span>' : '<span class="pill red">오답</span>'}${x.too_fast ? ' <span class="pill orange">너무 빠름</span>' : ''}${x.focus_lost ? ` <span class="pill gray">이탈 ${x.focus_lost}</span>` : ''}</td>
      <td class="num">${secs(x.elapsed_ms)}</td><td class="num"><b>${fmt(x.points)}</b></td></tr>`).join('')}
    </tbody></table></div></div>`;
  const close = () => (root.innerHTML = '');
  root.querySelector('.drawer-back').onclick = (e) => { if (e.target.classList.contains('drawer-back')) close(); };
  root.querySelector('#close').onclick = close;
  root.querySelector('#dq').onclick = async () => { await api(`/runs/${id}/disqualify`, { method: 'POST', body: { value: !r.disqualified } }); toast('변경했습니다'); close(); reload(); };
  root.querySelector('#block').onclick = async () => {
    if (!await ask(`${r.nickname} 사용자를 차단할까요? 모든 기록이 랭킹에서 빠지고 플레이할 수 없습니다.`)) return;
    await api(`/users/${r.user_id}/block`, { method: 'POST', body: { value: true } }); toast('차단했습니다'); close(); reload();
  };
}

// ---------- 주간 랭킹 ----------
async function viewRanking(_p, query) {
  const r = await api('/ranking' + (query.week ? '?week=' + encodeURIComponent(query.week) : ''));
  $main.innerHTML = `
    <div class="page-head"><div class="grow"><h1 class="page">주간 랭킹 · ${esc(r.week)}</h1><p class="page-sub" style="margin:4px 0 0">사용자별 그 주 최고 기록 · 동점이면 총 소요시간 → 먼저 달성 순 · 실격/차단 제외</p></div>
      <a class="btn ${r.week === r.thisWeek ? 'primary' : ''}" href="#/ranking">이번 주</a>
      <a class="btn ${r.week === r.lastWeek ? 'primary' : ''}" href="#/ranking?week=${r.lastWeek}">지난 주</a>
      <input class="in" id="wk" placeholder="2026-W48" style="width:120px"></div>
    <div class="table-wrap">${r.list.length ? `<table class="t"><thead><tr><th>순위</th><th>닉네임</th><th>설정</th><th class="num">점수</th><th class="num">정답</th><th class="num">총 소요시간</th><th>달성 시각</th><th></th></tr></thead>
      <tbody>${r.list.map((x) => `<tr><td><b>${x.rank}</b></td><td>${esc(x.nickname)}</td><td>${lvPill(x.level)} <span class="muted" style="font-size:12px">${esc(opsText(x.ops))}</span></td><td class="num"><b>${fmt(x.score)}</b></td><td class="num">${x.correct_count}</td><td class="num">${secs(x.total_time_ms)}</td><td>${dt(x.finished_at)}</td><td><button class="btn sm" data-run="${x.run_id}">상세</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">기록이 없습니다.</div>'}</div>`;
  $main.querySelector('#wk').onchange = (e) => (location.hash = '#/ranking?week=' + encodeURIComponent(e.target.value.trim()));
  $main.querySelectorAll('[data-run]').forEach((b) => (b.onclick = () => runDrawer(b.dataset.run, route)));
}

// ---------- 설정 ----------
async function viewSettings() {
  const s = await api('/settings');
  const sc = META.scoring, S = META.series;
  const mixText = (lv) => Object.entries(S.levelMix[lv]).map(([l, n]) => `${lvLabel(Number(l)).replace(' 자리', '')} ${n}`).join(' + ');
  $main.innerHTML = `
    <h1 class="page">설정</h1><p class="page-sub">운영 정책. 변경 즉시 다음 판부터 적용됩니다.</p>
    <div class="grid g2">
      <form class="card" id="f">
        <h2>운영 정책</h2>
        <label style="display:block;margin-bottom:16px"><b>하루 무료 도전 횟수</b> <span class="muted">(이 횟수를 넘으면 한 판마다 광고를 봐야 함 · 광고 횟수 제한 없음 · 0 = 광고 없이 무제한 · KST 자정 초기화)</span><br><input class="in" type="number" min="0" max="999" name="free_plays" value="${esc(s.free_plays)}" style="margin-top:6px;width:120px"></label>
        <button class="btn primary">저장</button>
      </form>
      <div class="card">
        <h2>점수 규칙 (v${sc.version}) — 읽기 전용</h2>
        <table class="t"><tbody>
          <tr><td>문항당 시간 점수 최고 / 정답 최저</td><td class="num">${sc.maxPoints} / ${sc.minCorrectPoints}</td></tr>
          <tr><td>자리 수 배율 (일 / 십 / 백)</td><td class="num"><b>×${sc.levelMultiplier[1]} / ×${sc.levelMultiplier[2]} / ×${sc.levelMultiplier[3]}</b></td></tr>
          <tr><td>오답 감점 / 시간초과</td><td class="num">최고점×배율의 −${Math.round(sc.wrongPenaltyRatio * 100)}% / ${sc.timeoutPoints}</td></tr>
          <tr><td>문항당 제한시간</td><td class="num">${sc.timeLimitMs / 1000}초</td></tr>
          <tr><td>감점 시작 전 허용 시간 (네트워크 지연분)</td><td class="num">${sc.readMs / 1000}초</td></tr>
          <tr><td>감점 곡선 지수</td><td class="num">${sc.decayExponent}</td></tr>
          <tr><td>너무 빠른 답 기준 / 의심 판 기준</td><td class="num">${sc.tooFastMs}ms / ${sc.tooFastFlagCount}개</td></tr>
        </tbody></table>
        <p class="muted" style="font-size:13px;line-height:1.6">점수 규칙은 랭킹의 공정성을 위해 코드(<code>functions/src/config.js</code>)와 <a href="../docs/SCORING.md" target="_blank">SCORING.md</a>로 관리하며, 바꿀 때는 version을 올리고 주가 바뀌는 시점(월요일 00:00 KST)에 배포하세요.</p>
        <h2 style="margin-top:16px">한 판 구성 (${S.questionCount}문제)</h2>
        <p class="muted" style="font-size:13px;margin:0;line-height:1.7">${S.levels.map((lv) => `${esc(lvLabel(lv))}${lv > 1 ? '까지' : ''}: ${mixText(lv)}`).join('<br>')}<br>
        처음 값 자동 변경: 일의 자리로 ${S.levelUp.minRuns}판 이상, 최근 ${S.levelUp.recentRuns}판 정답률 ${Math.round(S.levelUp.minAccuracy * 100)}% 이상 → 십의 자리</p>
      </div>
    </div>`;
  $main.querySelector('#f').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/settings', { method: 'PUT', body: { free_plays: fd.get('free_plays') || '0' } });
      toast('저장했습니다');
    } catch (err) { toast(err.message, true); }
  };
}

boot();
