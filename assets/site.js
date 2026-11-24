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

    // 주휴수당: 주 15시간 이상 일하고 개근하면, (주 소정근로시간 ÷ 40) × 8시간 × 시급. 40시간 넘어도 8시간까지
    weeklyHoliday: function (wage, hoursPerDay, daysPerWeek, perfect) {
      var weekHours = hoursPerDay * daysPerWeek;
      var eligible = weekHours >= 15 && perfect;
      var holidayHours = eligible ? Math.min(40, weekHours) / 40 * 8 : 0;
      var holiday = Math.round(holidayHours * wage);
      var base = Math.round(weekHours * wage);
      var weekly = base + holiday;
      // 월 환산은 주당 유급시간 × 365 ÷ 7 ÷ 12를 반올림한 시간으로 (주 40시간이면 209시간)
      var monthHours = Math.round((weekHours + holidayHours) * 365 / 7 / 12);
      var monthly = Math.round(monthHours * wage);
      return { weekHours: weekHours, eligible: eligible, holidayHours: holidayHours, holiday: holiday, base: base, weekly: weekly, monthHours: monthHours, monthly: monthly, monthlyHoliday: Math.round(holidayHours * 365 / 7 / 12 * wage) };
    },

    // 4대보험 (2026년, 근로자 부담): 국민연금 4.75%(기준소득월액 41만~659만, 천원 미만 버림),
    // 건강 3.595%, 장기요양 = 건강보험료 × 13.14%, 고용 0.9%. 각 보험료는 10원 미만 버림
    insurance: function (monthly, nontax) {
      var base = Math.max(0, monthly - (nontax || 0));
      var t10 = function (v) { return Math.floor(v / 10) * 10; };
      var npBase = Math.min(6590000, Math.max(410000, Math.floor(base / 1000) * 1000));
      var pension = t10(npBase * 0.0475);
      var health = t10(base * 0.03595);
      var care = t10(health * 0.1314);
      var employ = t10(base * 0.009);
      return { base: base, pension: pension, health: health, care: care, employ: employ, total: pension + health + care + employ, pensionCapped: base > 6590000 };
    },

    // 종합소득세·근로소득세 기본세율 (2023년 개정, 2026년 적용)
    taxByBracket: function (taxBase) {
      var B = [[14e6, .06, 0], [50e6, .15, 1.26e6], [88e6, .24, 5.76e6], [150e6, .35, 15.44e6], [300e6, .38, 19.94e6], [500e6, .40, 25.94e6], [1e9, .42, 35.94e6], [Infinity, .45, 65.94e6]];
      if (taxBase <= 0) return 0;
      for (var i = 0; i < B.length; i++) if (taxBase <= B[i][0]) return taxBase * B[i][1] - B[i][2];
      return 0;
    },

    // 연봉 실수령액: 4대보험 + 근로소득세(연간 계산 ÷ 12, 간이세액표에 가깝게 추정) + 지방소득세 10%
    salary: function (annual, nontaxMonthly, family) {
      var monthly = annual / 12;
      var ins = calc.insurance(monthly, nontaxMonthly);
      var gross = Math.max(0, (monthly - nontaxMonthly) * 12);
      var ded;
      if (gross <= 5e6) ded = gross * .7;
      else if (gross <= 15e6) ded = 3.5e6 + (gross - 5e6) * .4;
      else if (gross <= 45e6) ded = 7.5e6 + (gross - 15e6) * .15;
      else if (gross <= 1e8) ded = 12e6 + (gross - 45e6) * .05;
      else ded = 14.75e6 + (gross - 1e8) * .02;
      ded = Math.min(ded, 20e6);
      var taxBase = gross - ded - 1.5e6 * Math.max(1, family) - ins.pension * 12 - (ins.health + ins.care + ins.employ) * 12;
      var calcTax = calc.taxByBracket(taxBase);
      var credit = calcTax <= 1.3e6 ? calcTax * .55 : 715000 + (calcTax - 1.3e6) * .3;
      var limit = gross <= 33e6 ? 740000 : gross <= 70e6 ? Math.max(660000, 740000 - (gross - 33e6) * .008) : gross <= 120e6 ? Math.max(500000, 660000 - (gross - 70e6) * .5) : Math.max(200000, 500000 - (gross - 120e6) * .5);
      credit = Math.min(credit, limit);
      var yearTax = Math.max(0, calcTax - credit);
      var incomeTax = Math.floor(yearTax / 12 / 10) * 10;
      var localTax = Math.floor(incomeTax * .1 / 10) * 10;
      var deduct = ins.total + incomeTax + localTax;
      return { monthly: monthly, ins: ins, incomeTax: incomeTax, localTax: localTax, deduct: deduct, net: monthly - deduct, netYear: (monthly - deduct) * 12 };
    },

    // 프리랜서 3.3%: 단순경비율 추계 (기본율은 수입 4,000만 원까지, 넘는 부분은 초과율)
    freelancer: function (income, rate, overRate, family) {
      var exp = Math.min(income, 4e7) * rate + Math.max(0, income - 4e7) * overRate;
      var profit = Math.max(0, income - exp);
      var taxBase = Math.max(0, profit - 1.5e6 * Math.max(1, family));
      var calcTax = calc.taxByBracket(taxBase);
      var tax = Math.max(0, calcTax - 70000);
      var finalTax = Math.floor(tax) + Math.floor(tax * .1);
      var paid = Math.floor(income * .03) + Math.floor(income * .003);
      return { exp: exp, profit: profit, taxBase: taxBase, calcTax: calcTax, finalTax: finalTax, paid: paid, refund: paid - finalTax };
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
    function fmt() { var v = read(); input.value = v ? v.toLocaleString('ko-KR') : (/[0-9]/.test(input.value) ? '0' : ''); }
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
