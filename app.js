(function () {
  'use strict';
  var IRA = window.IRA;
  var KEY = 'iraplanner.v1';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var KEYS = ['amount', 'apr', 'years', 'monthly', 'drawMonth', 'drawDay', 'drawYear', 'birthMonth', 'birthYear'];

  function blank() { var s = { inputs: {}, aprOver: {}, drawOver: {} }; KEYS.forEach(function (k) { s.inputs[k] = ''; }); return s; }
  function load() {
    var s = blank();
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved) {
        KEYS.forEach(function (k) { if (saved.inputs && typeof saved.inputs[k] === 'string') s.inputs[k] = saved.inputs[k]; });
        if (saved.aprOver) s.aprOver = saved.aprOver;
        if (saved.drawOver) s.drawOver = saved.drawOver;
      }
    } catch (e) { /* private mode or bad data: start blank */ }
    return s;
  }
  var state = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  var saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 600); }
  function saveNow() { clearTimeout(saveTimer); saveTimer = null; save(); }
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveNow(); });
  var rafPending = false;
  function schedule() {
    if (rafPending) return; rafPending = true;
    requestAnimationFrame(function () { rafPending = false; render(); });
  }

  function $(id) { return document.getElementById(id); }
  function money(n, cents) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var d = cents ? 2 : 0;
    var s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    if (Math.abs(n) < (cents ? 0.005 : 0.5)) return '$' + (cents ? '0.00' : '0');
    return (n < 0 ? '−$' : '$') + s;
  }
  function moneyInput(v) {           // "1234567.5" -> "1,234,567.5" for display in the box
    var n = IRA.num(v);
    if (!isFinite(n)) return v;
    var parts = String(v).replace(/[$,\s]/g, '').split('.');
    var whole = Number(parts[0] || '0').toLocaleString('en-US');
    if (parts[0] && parts[0].charAt(0) === '-') whole = '-' + Math.abs(Number(parts[0])).toLocaleString('en-US');
    return parts.length > 1 ? whole + '.' + parts[1] : whole;
  }
  function moneyRaw(v) { return String(v || '').replace(/[$,\s]/g, ''); }
  function monthName(m, y) { return MONTHS[m - 1] + ' ' + y; }

  /* ---------- top inputs ---------- */
  var inputs = Array.prototype.slice.call(document.querySelectorAll('input[data-key]'));
  function fillInputs() {
    inputs.forEach(function (el) {
      var v = state.inputs[el.dataset.key] || '';
      el.value = el.dataset.money ? moneyInput(v) : v;
    });
  }
  inputs.forEach(function (el) {
    el.addEventListener('input', function () {
      state.inputs[el.dataset.key] = el.dataset.money ? moneyRaw(el.value) : el.value.trim();
      saveSoon(); schedule();
    });
    el.addEventListener('change', saveNow);
    el.addEventListener('blur', function () {
      saveNow();
      if (el.dataset.money) { var f = moneyInput(state.inputs[el.dataset.key] || ''); if (el.value !== f) el.value = f; }
    });
  });

  var clearArmed = null;
  $('clear').addEventListener('click', function () {
    var b = $('clear');
    if (!clearArmed) {
      b.textContent = 'Tap again to clear'; b.classList.add('armed');
      clearArmed = setTimeout(function () { clearArmed = null; b.textContent = 'Clear'; b.classList.remove('armed'); }, 4000);
      return;
    }
    clearTimeout(clearArmed); clearArmed = null; b.textContent = 'Clear'; b.classList.remove('armed');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    state = blank(); saveNow(); fillInputs(); monthlyBuiltFor = null;
    var d = $('monthly-details'); if (d.open) d.open = false;
    render();
    window.scrollTo(0, 0);
  });

  /* ---------- monthly detail table (built once per term/start, updated in place) ---------- */
  var monthlyBuiltFor = null, monthlyCells = [];
  function buildMonthly(res) {
    var sig = res.nper;
    if (monthlyBuiltFor === sig) return;
    var tb = document.querySelector('#monthly tbody');
    var html = '';
    for (var n = 1; n <= res.nper; n++) {
      html += '<tr data-n="' + n + '"><td class="num">' + n + '</td><td class="dt"></td><td class="num age"></td>' +
        '<td class="g"><input type="text" inputmode="decimal" autocomplete="off" data-apr="' + n + '" aria-label="New APR month ' + n + '" placeholder="—"></td>' +
        '<td class="num"></td><td class="num"></td><td class="num"></td><td class="num bal"></td><td class="num"></td>' +
        '<td class="y"><input type="text" inputmode="decimal" autocomplete="off" data-draw="' + n + '" aria-label="Amount withdrawn month ' + n + '"></td></tr>';
    }
    tb.innerHTML = html;
    monthlyCells = Array.prototype.map.call(tb.rows, function (tr) {
      return { tr: tr, td: tr.cells, apr: tr.querySelector('input[data-apr]'), draw: tr.querySelector('input[data-draw]') };
    });
    monthlyCells.forEach(function (c, i) {
      var n = i + 1;
      c.apr.value = state.aprOver[n] || '';
      c.draw.value = state.drawOver[n] ? moneyInput(state.drawOver[n]) : '';
      c.apr.addEventListener('input', function () {
        var v = c.apr.value.trim(); if (v === '') delete state.aprOver[n]; else state.aprOver[n] = v; saveSoon(); schedule();
      });
      c.apr.addEventListener('blur', saveNow);
      c.draw.addEventListener('input', function () {
        var v = moneyRaw(c.draw.value); if (v === '') delete state.drawOver[n]; else state.drawOver[n] = v; saveSoon(); schedule();
      });
      c.draw.addEventListener('blur', function () {
        saveNow();
        var f = state.drawOver[n] ? moneyInput(state.drawOver[n]) : ''; if (c.draw.value !== f) c.draw.value = f;
      });
    });
    monthlyBuiltFor = sig;
  }
  function updateMonthly(res) {
    var dayTxt = IRA.has(state.inputs.drawDay) ? String(IRA.num(state.inputs.drawDay)) : '';
    var monthlyHint = IRA.has(state.inputs.monthly) ? moneyInput(state.inputs.monthly) : 'max';
    res.rows.forEach(function (r, i) {
      var c = monthlyCells[i]; if (!c) return;
      var t = c.td;
      t[1].textContent = dayTxt ? (r.month + '/' + dayTxt + '/' + r.year) : monthName(r.month, r.year);
      t[2].textContent = r.age === null ? '' : String(r.age);
      t[4].textContent = money(r.interest, true);
      t[5].textContent = money(r.principal, true);
      t[6].textContent = money(r.max, true);
      t[7].textContent = money(r.balance, true);
      t[8].textContent = money(r.overUnder, true);
      if (c.draw.placeholder !== monthlyHint) c.draw.placeholder = monthlyHint;
      var ap = String(IRA.num(state.inputs.apr)); if (c.apr.placeholder !== ap) c.apr.placeholder = ap;
      c.tr.className = r.balance < -0.005 ? 'neg' : (res.runOut && res.runOut.n === r.n ? 'neg' : '');
    });
  }

  /* ---------- chart ---------- */
  function chart(res) {
    var pts = [{ x: 0, y: res.rows[0].startBalance, label: '' }];
    res.rows.forEach(function (r) { pts.push({ x: r.n, y: r.balance }); });
    var W = 640, Hh = 300, padL = 70, padR = 16, padT = 16, padB = 44;
    var maxY = 0; pts.forEach(function (p) { if (p.y > maxY) maxY = p.y; });
    if (maxY <= 0) maxY = 1;
    var step = Math.pow(10, Math.floor(Math.log10(maxY)));
    [1, 2, 2.5, 5, 10].some(function (m) { if (maxY / (step * m) <= 5) { step = step * m; return true; } return false; });
    var top = Math.ceil(maxY / step) * step;
    var nx = res.nper;
    function X(n) { return padL + (W - padL - padR) * n / nx; }
    function Y(v) { v = Math.max(0, v); return padT + (Hh - padT - padB) * (1 - v / top); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="IRA balance by month">';
    for (var g = 0; g <= top + 1e-9; g += step) {
      s += '<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/>';
      s += '<text class="ax" x="' + (padL - 8) + '" y="' + (Y(g) + 5) + '" text-anchor="end">' + short(g) + '</text>';
    }
    // x labels: years
    var everyYears = res.years <= 10 ? 1 : res.years <= 20 ? 2 : 5;
    res.yearly.forEach(function (y, i) {
      if (i === 0 || (y.year - res.yearly[0].year) % everyYears === 0) {
        var firstRow = null; for (var k = 0; k < res.rows.length; k++) { if (res.rows[k].year === y.year) { firstRow = res.rows[k]; break; } }
        var x = X(firstRow.n - 1);
        s += '<line class="tick" x1="' + x + '" x2="' + x + '" y1="' + (Hh - padB) + '" y2="' + (Hh - padB + 5) + '"/>';
        s += '<text class="ax" x="' + x + '" y="' + (Hh - padB + 20) + '" text-anchor="middle">' + y.year + '</text>';
        if (IRA.has(state.inputs.birthYear)) s += '<text class="ax age" x="' + x + '" y="' + (Hh - padB + 37) + '" text-anchor="middle">age ' + y.age + '</text>';
      }
    });
    var d = '', area = '';
    var cut = res.runOut ? res.runOut.n : nx;
    pts.forEach(function (p) { if (p.x <= cut) { d += (d ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1); } });
    area = d + 'L' + X(Math.min(cut, nx)).toFixed(1) + ' ' + Y(0) + 'L' + X(0) + ' ' + Y(0) + 'Z';
    s += '<path class="area' + (res.runOut ? ' bad' : '') + '" d="' + area + '"/>';
    s += '<path class="line' + (res.runOut ? ' bad' : '') + '" d="' + d + '"/>';
    s += '<line class="zero" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
    if (res.runOut) {
      var rx = X(res.runOut.n);
      s += '<circle class="dot bad" cx="' + rx + '" cy="' + Y(0) + '" r="7"/>';
      s += '<text class="ax lab bad" x="' + Math.min(Math.max(rx, padL + 60), W - padR - 60) + '" y="' + (Y(0) - 14) + '" text-anchor="middle">runs out ' + monthName(res.runOut.month, res.runOut.year) + '</text>';
    }
    s += '</svg>';
    $('chart').innerHTML = s;
  }
  function short(v) {
    if (v >= 1e6) return '$' + (+(v / 1e6).toFixed(2)) + 'M';
    if (v >= 1e3) return '$' + (+(v / 1e3).toFixed(1)) + 'K';
    return '$' + Math.round(v);
  }

  /* ---------- render ---------- */
  function render() {
    var res = IRA.compute(state.inputs, state.aprOver, state.drawOver);
    var ready = res.ready;
    $('waiting').hidden = ready; $('ready').hidden = !ready;
    ['chartcard', 'yearcard', 'monthcard'].forEach(function (id) { $(id).hidden = !ready; });
    if (!ready) {
      var bits = [];
      if (res.errors.length) bits.push('<strong>Check:</strong> ' + res.errors.join(' · '));
      if (res.missing.length) bits.push('<strong>Still needed:</strong> ' + res.missing.join(', '));
      $('missing').innerHTML = bits.join('<br>');
      return;
    }
    var v = $('verdict'), word = $('v-word'), why = $('v-why');
    var yrs = res.years + (res.years === 1 ? ' year' : ' years');
    if (!res.anyEntered) {
      v.className = 'verdict info';
      word.textContent = 'You can take up to ' + money(res.maxMonthly, true) + ' a month';
      why.textContent = 'That uses up the account in exactly ' + yrs + '. Enter the amount you draw each month to see if it lasts.';
    } else if (res.runOut) {
      v.className = 'verdict bad';
      word.textContent = 'Runs out ' + monthName(res.runOut.month, res.runOut.year) + (IRA.has(state.inputs.birthYear) ? ', at age ' + res.runOut.age : '');
      var mo = res.runOut.n;
      why.textContent = 'The money lasts ' + Math.floor((mo - 1) / 12) + ' years ' + ((mo - 1) % 12) + ' months, short of your ' + yrs + '. To last all ' + yrs + ' at the initial APR, the most you can take is ' + money(res.maxMonthly, true) + ' a month.';
    } else {
      v.className = 'verdict ok';
      word.textContent = 'Yes, it lasts all ' + yrs;
      var last = res.rows[res.rows.length - 1];
      why.textContent = 'Balance after ' + monthName(last.month, last.year) + ': ' + money(res.endBalance, true) + '.';
    }
    $('o-max').textContent = money(res.maxMonthly, true);
    $('o-max-note').textContent = 'lasts exactly ' + yrs;
    $('o-annual').textContent = money(res.annualWithdrawal, true);
    $('o-end-label').textContent = 'Balance at ' + yrs;
    $('o-end').textContent = money(res.endBalance, true);
    $('o-end').className = res.endBalance < -0.005 ? 'neg' : '';
    $('o-int').textContent = money(res.totalInterest, true);
    $('o-prin').textContent = money(res.totalPrincipal, true);
    $('o-tot').textContent = money(res.totalEntered, true);
    $('o-ou').textContent = money(res.overUnder15, true);

    chart(res);

    var yb = document.querySelector('#yearly tbody'), h = '';
    var showAge = IRA.has(state.inputs.birthYear);
    res.yearly.forEach(function (y) {
      var neg = y.endBalance < -0.005;
      h += '<tr' + (neg ? ' class="neg"' : '') + '><td>' + y.year + (y.months < 12 ? ' <span class="hint">(' + y.months + ' mo)</span>' : '') + '</td><td class="num">' + (showAge ? y.age : '') +
        '</td><td class="num">' + money(y.taken) + '</td><td class="num">' + money(y.interest) + '</td><td class="num">' + money(y.principal) +
        '</td><td class="num bal">' + money(y.endBalance) + '</td></tr>';
    });
    yb.innerHTML = h;

    if ($('monthly-details').open) { buildMonthly(res); updateMonthly(res); }
    else if (monthlyBuiltFor !== null && monthlyBuiltFor !== res.nper) { monthlyBuiltFor = null; }
  }
  $('monthly-details').addEventListener('toggle', function () { if (this.open) render(); });

  fillInputs();
  render();

  /* ---------- offline ---------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function () {
        $('offline-state').textContent = 'Works offline once opened.';
      }).catch(function () {});
    });
  }
})();
