// 백오피스 데이터 계층 (Firebase) — 타임어택 연산
//  읽기: 관리자 권한으로 Firestore 데이터베이스 'arithmetic' 를 직접 읽음 (firestore.rules 의 isAdmin)
//  쓰기: 반드시 관리자 Cloud Functions(tacAdmin*) 를 거침
//  화면(admin.js)은 한국사 백오피스와 같은 REST 응답 모양으로 받도록 여기서 맞춰 준다.
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, query, where, orderBy, limit, getCountFromServer,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { app, EMULATOR, call } from '../firebase.js';

const fs = getFirestore(app, 'arithmetic');
if (EMULATOR) connectFirestoreEmulator(fs, location.hostname, 8085);

let META = null; // tacAdminMe 결과 (시리즈 설정 · 점수 규칙)
export async function loadMeta() { META = await call('adminMe'); return META; }

const kstDayStart = () => { const k = Date.now() + 9 * 3600e3; return k - (k % 86400e3) - 9 * 3600e3; };
function weekKey(ms = Date.now()) {
  const kst = new Date(ms + 9 * 3600 * 1000);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}
const count = async (q) => (await getCountFromServer(q)).data().count;
const runRow = (r) => ({
  id: r.id, week_key: r.weekKey, total_score: r.totalScore, correct_count: r.correctCount, question_count: r.questionCount, total_time_ms: r.totalTimeMs,
  finished_at: r.finishedAt, flagged: r.flagged ? 1 : 0, disqualified: r.disqualified ? 1 : 0, too_fast_count: r.tooFastCount, focus_lost_count: r.focusLostCount,
  nickname: r.nickname, user_id: r.uid, score_version: r.scoreVersion, level: r.setup?.level || 1, ops: r.setup?.ops || [],
});
/** 연산·자리 수별 통계 한 줄 */
function opRow(id, s) {
  const attempts = s.attempts || 0, correct = s.correct || 0;
  return {
    id, op: s.op || id.split('_')[0], lv: s.lv || Number(id.split('_')[1]), served: s.served || 0, attempts, correct, wrong: s.wrong || 0, timeouts: s.timeouts || 0,
    accuracy: attempts ? Math.round((1000 * correct) / attempts) / 10 : null,
    avg_correct_ms: correct ? Math.round((s.sumCorrectMs || 0) / correct) : null,
    avg_points: attempts ? Math.round((s.sumPoints || 0) / attempts) : null,
    tb: Array.from({ length: 10 }, (_, i) => s[`tb${i}`] || 0),
  };
}
async function opStats() {
  const snap = await getDocs(collection(fs, 'opstats'));
  return snap.docs.map((d) => opRow(d.id, d.data()));
}

// ---------- 화면용 api(path, {method, body}) ----------
export async function api(path, opts = {}) {
  const method = opts.method || 'GET';
  const [p, qstr] = path.split('?');
  const qs = Object.fromEntries(new URLSearchParams(qstr || ''));
  const seg = p.split('/').filter(Boolean);

  if (p === '/meta') return { ...META };

  if (p === '/dashboard') {
    const runs = collection(fs, 'runs');
    const today = kstDayStart();
    const [todayN, weekN, finN, startN, flagN, users, recent, ops] = await Promise.all([
      count(query(runs, where('startedAt', '>=', today))),
      count(query(runs, where('weekKey', '==', weekKey()))),
      count(query(runs, where('status', '==', 'FINISHED'))),
      count(runs),
      count(query(runs, where('status', '==', 'FINISHED'), where('flagged', '==', true), where('disqualified', '==', false))),
      count(collection(fs, 'users')),
      getDocs(query(runs, where('startedAt', '>=', today - 13 * 86400e3), orderBy('startedAt', 'desc'), limit(5000))),
      opStats(),
    ]);
    const daily = {}, levels = { 1: 0, 2: 0, 3: 0 }, opsUse = {};
    for (const d of recent.docs) {
      const r = d.data();
      const k = new Date(r.startedAt + 9 * 3600e3).toISOString().slice(0, 10);
      const x = (daily[k] ||= { d: k, runs: 0, finished: 0, sum: 0 });
      x.runs++; if (r.status === 'FINISHED') { x.finished++; x.sum += r.totalScore; }
      if (r.setup) { levels[r.setup.level] = (levels[r.setup.level] || 0) + 1; for (const o of r.setup.ops || []) opsUse[o] = (opsUse[o] || 0) + 1; }
    }
    const att = ops.reduce((a, r) => a + r.attempts, 0), cor = ops.reduce((a, r) => a + r.correct, 0), to = ops.reduce((a, r) => a + r.timeouts, 0);
    return {
      plays: { today: todayN, week_finished: weekN, finished: finN, started: startN, flagged: flagN },
      users, levels, opsUse, recentRuns: recent.size,
      daily: Object.values(daily).sort((a, b) => a.d.localeCompare(b.d)).map((x) => ({ ...x, avg_score: x.finished ? Math.round(x.sum / x.finished) : null })),
      attempts: att, accuracy: att ? Math.round((1000 * cor) / att) / 10 : null, timeoutRate: att ? Math.round((1000 * to) / att) / 10 : null,
    };
  }

  if (p === '/stats') {
    const rows = await opStats();
    const finished = await getDocs(query(collection(fs, 'runs'), where('status', '==', 'FINISHED'), orderBy('finishedAt', 'desc'), limit(2000)));
    const dist = {}, byLevel = {};
    for (const d of finished.docs) {
      const r = d.data();
      if (r.scoreVersion !== META.scoring.version) continue;
      const lv = r.setup?.level || 1;
      const L = (byLevel[lv] ||= { lv, runs: 0, sum: 0, best: 0, correct: 0, questions: 0 });
      L.runs++; L.sum += r.totalScore; L.best = Math.max(L.best, r.totalScore); L.correct += r.correctCount; L.questions += r.questionCount;
      const step = lv === 3 ? 10000 : lv === 2 ? 5000 : 2000;
      const b = Math.floor(r.totalScore / step) * step;
      (dist[lv] ||= {})[b] = ((dist[lv] || {})[b] || 0) + 1;
    }
    return {
      rows,
      byLevel: Object.values(byLevel).map((L) => ({ ...L, avg: L.runs ? Math.round(L.sum / L.runs) : 0, accuracy: L.questions ? Math.round((1000 * L.correct) / L.questions) / 10 : null })),
      scoreDist: Object.fromEntries(Object.entries(dist).map(([lv, m]) => [lv, Object.entries(m).map(([bucket, c]) => ({ bucket: Number(bucket), c })).sort((a, b) => a.bucket - b.bucket)])),
    };
  }
  if (p === '/stats/reset') return call('adminResetOpStats');

  if (p === '/playstats') {
    const [runSnap, userSnap] = await Promise.all([getDocs(collection(fs, 'runs')), getDocs(collection(fs, 'users'))]);
    const kday = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const days = {}, users = {};
    let started = 0, finished = 0, abandoned = 0;
    for (const d of runSnap.docs) {
      const r = d.data();
      if (!r.startedAt || !r.uid) continue;
      started++; if (r.status === 'FINISHED') finished++; if (r.status === 'ABANDONED') abandoned++;
      const day = kday(r.startedAt);
      const D = (days[day] ||= { day, runs: 0, finished: 0, per: {} });
      D.runs++; if (r.status === 'FINISHED') D.finished++;
      D.per[r.uid] = (D.per[r.uid] || 0) + 1;
      const U = (users[r.uid] ||= { uid: r.uid, nickname: r.nickname || '', runs: 0, finished: 0, perDay: {}, last: 0, maxLevel: 1 });
      U.runs++; if (r.status === 'FINISHED') U.finished++;
      U.perDay[day] = (U.perDay[day] || 0) + 1; U.last = Math.max(U.last, r.startedAt);
      U.maxLevel = Math.max(U.maxLevel, r.setup?.level || 1);
      if (r.nickname) U.nickname = r.nickname;
    }
    const info = {};
    for (const d of userSnap.docs) info[d.id] = d.data();
    const dayRows = Object.values(days).sort((a, b) => b.day.localeCompare(a.day)).map((D) => {
      const top = Object.entries(D.per).sort((a, b) => b[1] - a[1])[0] || ['', 0];
      return { day: D.day, runs: D.runs, finished: D.finished, players: Object.keys(D.per).length, maxPerUser: top[1], maxUser: users[top[0]]?.nickname || info[top[0]]?.nickname || '' };
    });
    const userRows = Object.values(users).map((U) => {
      const top = Object.entries(U.perDay).sort((a, b) => b[1] - a[1])[0] || ['', 0];
      return { nickname: U.nickname || info[U.uid]?.nickname || '(닉네임 없음)', runs: U.runs, finished: U.finished, days: Object.keys(U.perDay).length, maxPerDay: top[1], maxDay: top[0], last: U.last, maxLevel: U.maxLevel, defaultLevel: info[U.uid]?.defaultLevel || 1 };
    }).sort((a, b) => b.runs - a.runs);
    return { started, finished, abandoned, players: userRows.length, dayRows, userRows, maxPerDay: dayRows.reduce((m, d) => Math.max(m, d.maxPerUser), 0) };
  }

  if (p === '/runs') {
    const cons = [where('status', '==', 'FINISHED')];
    if (qs.flagged === '1') cons.push(where('flagged', '==', true));
    if (qs.week) cons.push(where('weekKey', '==', qs.week));
    const snap = await getDocs(query(collection(fs, 'runs'), ...cons, orderBy('finishedAt', 'desc'), limit(500)));
    let rows = snap.docs.map((d) => runRow(d.data()));
    if (qs.nickname) rows = rows.filter((r) => (r.nickname || '').includes(qs.nickname));
    const page = Math.max(1, Number(qs.page) || 1);
    const blocked = new Set();
    const uids = [...new Set(rows.slice((page - 1) * 50, page * 50).map((r) => r.user_id))];
    await Promise.all(uids.map(async (u) => { if ((await getDoc(doc(fs, 'users', u))).data()?.blocked) blocked.add(u); }));
    return { total: rows.length, page, rows: rows.slice((page - 1) * 50, page * 50).map((r) => ({ ...r, blocked: blocked.has(r.user_id) ? 1 : 0 })) };
  }
  if (seg[0] === 'runs' && seg[2] === 'disqualify') return call('adminDisqualify', { runId: seg[1], value: !!opts.body?.value });
  if (seg[0] === 'runs' && seg[1]) {
    const d = await call('adminRunDetail', { runId: seg[1] });
    return {
      run: runRow(d.run),
      questions: d.questions.map((x) => ({ seq: x.seq, op: x.op, lv: x.lv, text: x.text, answer: x.answer, chosen: x.chosen != null ? x.opts[x.chosen] : null, status: x.status, elapsed_ms: x.elapsed ?? null, points: x.points ?? null, is_correct: x.correct ? 1 : 0, too_fast: x.tooFast ? 1 : 0, focus_lost: x.focusLost || 0 })),
    };
  }
  if (seg[0] === 'users' && seg[2] === 'block') return call('adminBlockUser', { uid: seg[1], value: !!opts.body?.value });

  if (p === '/ranking') {
    const thisWeek = weekKey(), lastWeek = weekKey(Date.now() - 7 * 86400e3);
    const week = qs.week || thisWeek;
    const snap = await getDocs(query(collection(fs, 'weeks', week, 'best'), orderBy('score', 'desc'), orderBy('timeMs', 'asc'), orderBy('finishedAt', 'asc'), limit(200)));
    return { week, thisWeek, lastWeek, list: snap.docs.map((d, i) => ({ rank: i + 1, nickname: d.data().nickname, score: d.data().score, correct_count: d.data().correct, total_time_ms: d.data().timeMs, finished_at: d.data().finishedAt, run_id: d.data().runId, level: d.data().level || 1, ops: d.data().ops || [] })) };
  }

  if (p === '/settings' && method === 'GET') return { free_plays: '3', ...((await getDoc(doc(fs, 'settings', 'game'))).data() || {}) };
  if (p === '/settings' && method === 'PUT') return call('adminSetSettings', opts.body);

  throw new Error('알 수 없는 요청: ' + path);
}
