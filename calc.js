/* "How Long Will Your Money Last?" — the spreadsheet's math, cell for cell.
   Sheet columns per month: G new APR (optional), H interest, I principal, J max withdrawal,
   K balance, L cumulative interest, M over/under, N amount withdrawn, Q amount you enter. */
(function (root) {
  'use strict';

  // The sheet's row 18 reads the PREVIOUS month's entry: N18 = IF(Q17>0, Q17-R18, 0),
  // while every other month reads its own row. Kept to match the sheet exactly.
  var MONTH2_READS_MONTH1 = true;
  var MAX_YEARS = 30;            // K12: IF(K10<31, K10*12, "Error-Max 30 Years")
  var OVER_UNDER_MONTHS = 180;   // M12: SUM(M17:M196) — the sheet totals the first 180 months

  function num(v) {
    if (v === null || v === undefined) return NaN;
    var s = String(v).replace(/[$,\s%]/g, '');
    if (s === '' || s === '-' || s === '.') return NaN;
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  function has(v) { return isFinite(num(v)); }

  // Numbers PMT(rate, nper, pv) × (-1.0), as the sheet writes it.
  function maxPayment(monthlyRate, nper, pv) {
    if (!(nper > 0)) return NaN;
    if (monthlyRate === 0) return pv / nper;
    return pv * monthlyRate / (1 - Math.pow(1 + monthlyRate, -nper));
  }

  var FIELDS = [
    { key: 'amount', label: 'IRA / 401K amount' },
    { key: 'apr', label: 'Initial APR %' },
    { key: 'years', label: 'Years to withdraw' },
    { key: 'drawMonth', label: 'first draw month' },
    { key: 'drawYear', label: 'first draw year' },
    { key: 'birthMonth', label: 'birth month' },
    { key: 'birthYear', label: 'birth year' }
  ];

  function validate(inp) {
    var missing = [], errors = [];
    FIELDS.forEach(function (f) { if (!has(inp[f.key])) missing.push(f.label); });
    var y = num(inp.years);
    if (has(inp.years) && (y > MAX_YEARS)) errors.push('Max 30 years');
    else if (has(inp.years) && (y < 1 || Math.round(y) !== y)) errors.push('Years to withdraw must be a whole number from 1 to 30');
    ['drawMonth', 'birthMonth'].forEach(function (k) {
      var m = num(inp[k]);
      if (has(inp[k]) && (m < 1 || m > 12 || Math.round(m) !== m)) errors.push((k === 'drawMonth' ? 'First draw month' : 'Birth month') + ' must be 1 to 12');
    });
    ['drawYear', 'birthYear'].forEach(function (k) {
      var v = num(inp[k]);
      if (has(inp[k]) && (v < 1900 || v > 2200 || Math.round(v) !== v)) errors.push((k === 'drawYear' ? 'First draw year' : 'Birth year') + ' should be a 4-digit year');
    });
    if (has(inp.amount) && num(inp.amount) <= 0) errors.push('IRA / 401K amount must be more than 0');
    if (has(inp.drawDay)) { var d = num(inp.drawDay); if (d < 1 || d > 31 || Math.round(d) !== d) errors.push('First draw day must be 1 to 31'); }
    return { missing: missing, errors: errors };
  }

  // inp: amount, apr, years, drawMonth, drawDay, drawYear, birthMonth, birthYear, monthly (all strings as typed)
  // aprOver / drawOver: { monthNumber: string } — the green NEW APR column and per-month yellow amounts
  function compute(inp, aprOver, drawOver) {
    aprOver = aprOver || {}; drawOver = drawOver || {};
    var v = validate(inp);
    if (v.missing.length || v.errors.length) return { ready: false, missing: v.missing, errors: v.errors };

    var amount = num(inp.amount), apr = num(inp.apr), years = num(inp.years);
    var nper = years * 12;
    var bm = num(inp.birthMonth), by = num(inp.birthYear);
    var dm = num(inp.drawMonth), dy = num(inp.drawYear);
    var monthly = num(inp.monthly);

    function entered(n) {             // what sits in the yellow "Amount Withdrawn" cell for month n
      var o = num(drawOver[n]);
      if (isFinite(o)) return o;
      return isFinite(monthly) ? monthly : 0;
    }
    var anyEntered = isFinite(monthly) && monthly > 0;
    Object.keys(drawOver).forEach(function (k) { if (num(drawOver[k]) > 0 && +k <= nper) anyEntered = true; });

    var rows = [], kPrev = amount, cum = 0, month = dm, year = dy;
    var totInterest = 0, totPrincipal = 0, totEntered = 0, overUnder = 0, runOut = null;
    for (var n = 1; n <= nper; n++) {
      if (n > 1) { month = month < 12 ? month + 1 : 1; if (month === 1) year += 1; }
      var age;
      if (n === 1) age = bm > dm ? dy - by - 1 : dy - by;       // A17
      else age = month === bm ? year - by : null;               // A18…: IF(D=$B$11, F-$B$12, "")
      var g = num(aprOver[n]);
      var newApr = isFinite(g) ? g : null;
      var rate = (isFinite(g) && g !== 0) ? g : apr;            // IF(G=0, $I$12, G)
      var H = rate / 100 / 12 * kPrev;
      var J = maxPayment(rate / 12 / 100, nper - (n - 1), kPrev);
      var q = entered(MONTH2_READS_MONTH1 && n === 2 ? 1 : n);
      var N = q > 0 ? q : 0;
      var M = N > 0 ? (N > J ? (N - J) * -1 : J - N) : 0;
      var I = J - H - M;
      var K = kPrev - I;
      cum += H;
      totInterest += H; totPrincipal += I; totEntered += entered(n);
      if (n <= OVER_UNDER_MONTHS) overUnder += M;
      var row = { n: n, month: month, year: year, age: age, newApr: newApr, rate: rate,
        interest: H, principal: I, max: J, balance: K, cumInterest: cum, overUnder: M,
        withdrawn: N, taken: H + I, entered: entered(n), startBalance: kPrev };
      if (!runOut && K < -0.005) {
        runOut = { n: n, month: month, year: year, age: bm > month ? year - by - 1 : year - by };
      }
      rows.push(row); kPrev = K;
    }

    var yearsOut = [];
    rows.forEach(function (r) {
      var last = yearsOut[yearsOut.length - 1];
      if (!last || last.year !== r.year) {
        last = { year: r.year, age: r.year - by, months: 0, taken: 0, interest: 0, principal: 0, startBalance: r.startBalance, endBalance: 0 };
        yearsOut.push(last);
      }
      last.months++; last.taken += r.taken; last.interest += r.interest; last.principal += r.principal; last.endBalance = r.balance;
    });

    var maxMonthly = maxPayment(apr / 12 / 100, nper, amount);   // J12
    return {
      ready: true, nper: nper, years: years, rows: rows, yearly: yearsOut,
      maxMonthly: maxMonthly, annualWithdrawal: maxMonthly * 12,  // H8: SUM(J12*12)
      overUnder15: overUnder,                                     // M12
      totalInterest: totInterest, totalPrincipal: totPrincipal, totalEntered: totEntered,
      endBalance: rows[rows.length - 1].balance, anyEntered: anyEntered, runOut: runOut,
      ageAtStart: rows[0].age
    };
  }

  var api = { num: num, has: has, maxPayment: maxPayment, compute: compute, validate: validate,
    MONTH2_READS_MONTH1: MONTH2_READS_MONTH1, MAX_YEARS: MAX_YEARS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IRA = api;
})(typeof window !== 'undefined' ? window : globalThis);
