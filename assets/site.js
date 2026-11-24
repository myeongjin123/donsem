/* 받을셈 공통 스크립트: 계산식, 숫자·그래프 애니메이션, 입력 도우미 */
(function (root) {
  var MAN = 10000;

  /* ---------- 계산식 (2026년 기준) ---------- */
  var calc = {
    // 육아휴직 급여: 1~3개월 100%(250만), 4~6개월 100%(200만), 7개월~ 80%(160만), 하한 70만
    // 6+6: 첫 6개월 100%, 상한 250·250·300·350·400·450만
    parentalLeave: function (wage, months, six) {
      var out = [], FLOOR = 70 * MAN;
      for (var m = 1; m <= months; m++) {
        var rate, cap;
        if (six && m <= 6) { rate = 1; cap = [250, 250, 300, 350, 400, 450][m - 1] * MAN; }
        else if (m <= 3) { rate = 1; cap = 250 * MAN; }
        else if (m <= 6) { rate = 1; cap = 200 * MAN; }
        else { rate = 0.8; cap = 160 * MAN; }
        var base = wage * rate, pay = Math.min(base, cap), kind = base > cap ? '상한' : '통상임금';
        if (pay < FLOOR) { pay = FLOOR; kind = '하한'; }
        out.push({ m: m, rate: rate, cap: cap, pay: pay, kind: kind });
      }
      return out;
    },

    // 연차: 1년 미만은 개근한 달마다 1일(최대 11일), 1년 이상은 15일 + 최초 1년 초과 2년마다 1일, 최대 25일
    leaveDaysForYear: function (fullYears) {
      if (fullYears < 1) return 0;
      return Math.min(25, 15 + Math.floor((fullYears - 1) / 2));
    },
    annualLeave: function (start, ref, wage, used) {
      var y = fullYears(start, ref), mo = fullMonths(start, ref);
      var days = y < 1 ? Math.min(11, mo) : calc.leaveDaysForYear(y);
      var daily = wage / 209 * 8;
      var unused = Math.max(0, days - used);
      return { years: y, months: mo, days: days, daily: daily, unused: unused, pay: Math.round(daily * unused) };
    },

    // 실업급여: 1일 = 평균임금 × 60%, 하한 66,048원(최저임금 10,320원 × 80% × 8시간), 상한 68,100원
    unemployment: function (monthly, age50, years) {
      var avgDaily = monthly * 12 / 365;
      var raw = avgDaily * 0.6, daily = Math.min(68100, Math.max(66048, raw));
      var kind = raw > 68100 ? '상한' : (raw < 66048 ? '하한' : '평균임금 60%');
      var idx = years < 1 ? 0 : years < 3 ? 1 : years < 5 ? 2 : years < 10 ? 3 : 4;
      var days = (age50 ? [120, 180, 210, 240, 270] : [120, 150, 180, 210, 240])[idx];
      return { avgDaily: avgDaily, daily: Math.round(daily), kind: kind, days: days, total: Math.round(daily) * days, per4w: Math.round(daily) * 28 };
    },

    // 퇴직금: 1일 평균임금 × 30 × 재직일수 ÷ 365
    // 1일 평균임금 = (퇴직 전 3개월 임금 + 연 상여금 × 3/12 + 연차수당 × 3/12) ÷ 그 3개월의 달력 일수
    severance: function (start, lastDay, monthly, bonus, leavePay) {
      var DAY = 864e5;
      var workDays = Math.round((lastDay - start) / DAY) + 1;
      var end = new Date(lastDay.getTime() + DAY);
      var from = addMonths(end, -3);
      var periodDays = Math.round((end - from) / DAY);
      var total3 = monthly * 3 + bonus * 3 / 12 + leavePay * 3 / 12;
      var avg = total3 / periodDays;
      var pay = workDays >= 365 ? avg * 30 * workDays / 365 : 0;
      return { workDays: workDays, periodDays: periodDays, total3: total3, avg: avg, pay: Math.floor(pay), eligible: workDays >= 365 };
    }
  };

  function fullMonths(a, b) {
    var m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m--;
    return Math.max(0, m);
  }
  function fullYears(a, b) { return Math.floor(fullMonths(a, b) / 12); }
  function addMonths(d, n) {
    var r = new Date(d.getFullYear(), d.getMonth() + n, 1);
    var last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(d.getDate(), last));
    return r;
  }

  /* ---------- 표시 ---------- */
  function won(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }
  function manwon(n) {
    var v = n / MAN;
    return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('ko-KR') + '만';
  }

  var reduce = false;
  try { reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // 숫자가 이전 값에서 새 값으로 부드럽게 올라가거나 내려가요
  function countUp(el, to, fmt) {
    var from = Number(el.dataset.v || 0);
    el.dataset.v = to;
    if (el._raf) cancelAnimationFrame(el._raf);
    if (reduce || from === to) { el.textContent = fmt(to); return; }
    var t0 = null, dur = 650;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) el._raf = requestAnimationFrame(step);
    }
    el._raf = requestAnimationFrame(step);
  }

  // 막대는 다시 그리지 않고 길이만 바꿔서 CSS 전환으로 움직여요
  function setHBars(box, rows) {
    while (box.children.length > rows.length) box.removeChild(box.lastChild);
    while (box.children.length < rows.length) {
      var r = document.createElement('div');
      r.className = 'hbar';
      r.innerHTML = '<span></span><span class="t"><i></i></span><b></b>';
      box.appendChild(r);
    }
    rows.forEach(function (row, i) {
      var el = box.children[i];
      el.children[0].textContent = row.label;
      el.children[2].textContent = row.text;
      var bar = el.children[1].firstChild;
      requestAnimationFrame(function () { bar.style.width = Math.max(0, Math.min(100, row.pct)) + '%'; });
    });
  }

  function setVBars(box, axis, items) {
    while (box.children.length > items.length) box.removeChild(box.lastChild);
    while (box.children.length < items.length) {
      var d = document.createElement('div');
      d.appendChild(document.createElement('i'));
      box.appendChild(d);
    }
    items.forEach(function (it, i) {
      var bar = box.children[i].firstChild;
      bar.className = it.cls || '';
      bar.title = it.title || '';
      requestAnimationFrame(function () { bar.style.height = Math.max(0, Math.min(100, it.pct)) + '%'; });
    });
    if (axis) {
      axis.textContent = '';
      items.forEach(function (it) {
        var s = document.createElement('span');
        s.textContent = it.label || '';
        axis.appendChild(s);
      });
    }
  }

  // 금액 입력칸: 쉼표 자동, 숫자만
  function moneyInput(input, onChange) {
    function read() { return Number(String(input.value).replace(/[^0-9]/g, '')) || 0; }
    function fmt() { var v = read(); input.value = v ? v.toLocaleString('ko-KR') : ''; }
    input.addEventListener('input', function () { fmt(); onChange(); });
    fmt();
    return { read: read, set: function (v) { input.value = String(v); fmt(); } };
  }

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem('bs:' + key) || 'null');
      localStorage.setItem('bs:' + key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  root.BS = { calc: calc, won: won, manwon: manwon, countUp: countUp, setHBars: setHBars, setVBars: setVBars, moneyInput: moneyInput, store: store, parseDate: parseDate, isoDate: isoDate, fullYears: fullYears, fullMonths: fullMonths };
  if (typeof module !== 'undefined') module.exports = root.BS;
})(typeof window !== 'undefined' ? window : globalThis);
