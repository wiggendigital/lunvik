// Lunvik: savings calculator, chart tooltips and the booking form.
// The page works without this file: the calculator then shows its starting example
// and the questions still open and close.

(function () {
  'use strict';

  var data = JSON.parse(document.getElementById('page-data').textContent);
  var model = data.model;
  var text = data.text;
  var $ = function (id) { return document.getElementById(id); };
  var NBSP = ' ';

  var whole = new Intl.NumberFormat(data.locale, { maximumFractionDigits: 0 });
  var money2 = new Intl.NumberFormat(data.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var one = new Intl.NumberFormat(data.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (m, key) { return values[key]; });
  }

  /* ---------- Top bar ---------- */

  var bar = $('top-bar');
  var onScroll = function () { bar.classList.toggle('is-stuck', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Calculator ---------- */

  var kwh = $('kwh');
  var price = $('price');
  var form = $('saving');

  /** The figures behind the result. Kept apart from the page so it can be tested alone. */
  function estimate(kwhYear, pricePerKwh, heating) {
    var share = model.heatShare[heating];
    var heatKwh = kwhYear * share;
    var savedKwh = heatKwh * model.cover * (1 - 1 / model.scop);
    var pack = model.packages.filter(function (p) { return kwhYear <= p.upto; })[0];
    var saving = savedKwh * pricePerKwh;
    return {
      share: share,
      today: heatKwh * pricePerKwh,
      pump: (heatKwh - savedKwh) * pricePerKwh,
      saving: saving,
      pack: pack,
      years: pack.price / saving
    };
  }

  /** Round to the nearest hundred kroner: the estimate is not exact to the krone. */
  function hundreds(n) { return Math.round(n / 100) * 100; }

  function paint(input) {
    var span = input.max - input.min;
    input.style.setProperty('--fill', ((input.value - input.min) / span * 100).toFixed(2) + '%');
  }

  function update() {
    var k = Number(kwh.value);
    var p = Number(price.value);
    var heating = form.elements.heat.value;
    var e = estimate(k, p, heating);

    $('kwh-out').textContent = whole.format(k) + NBSP + 'kWh';
    $('price-out').textContent = money2.format(p) + NBSP + 'kr';
    kwh.setAttribute('aria-valuetext', whole.format(k) + ' kWh');
    price.setAttribute('aria-valuetext', money2.format(p) + ' kr');
    paint(kwh);
    paint(price);

    var today = hundreds(e.today);
    var saving = hundreds(e.saving);
    $('save-out').textContent = whole.format(saving);
    $('today-out').textContent = whole.format(today);
    $('pump-out').textContent = whole.format(today - saving);

    // Bars share one scale: the largest household the slider allows, at today's price.
    var scale = model.kwh.max * model.heatShare.electric * p;
    $('bar-today').style.width = (e.today / scale * 100).toFixed(2) + '%';
    $('bar-pump').style.width = (e.pump / scale * 100).toFixed(2) + '%';

    $('payback').textContent = fill(text.payback, {
      pkg: text.pkg[e.pack.id],
      price: whole.format(e.pack.price),
      years: one.format(e.years)
    });
    $('how-text').textContent = fill(text.how, { share: Math.round(e.share * 100) });
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', function (event) { event.preventDefault(); });
  update();

  /* ---------- Chart tooltips ---------- */

  var chart = $('chart');
  var tip = $('chart-tip');
  if (chart && tip) {
    var show = function (hit) {
      var i = Number(hit.getAttribute('data-i'));
      var row = data.chart.rows[i];
      tip.textContent = '';
      var title = document.createElement('strong');
      title.textContent = row.month;
      tip.appendChild(title);
      [[data.chart.before, row.before], [data.chart.after, row.after]].forEach(function (pair) {
        var line = document.createElement('span');
        var value = document.createElement('b');
        line.textContent = pair[0];
        value.textContent = whole.format(pair[1]) + NBSP + 'kWh';
        line.appendChild(value);
        tip.appendChild(line);
      });
      var saved = document.createElement('em');
      saved.textContent = fill(text.tipSaved, { n: whole.format(row.before - row.after) });
      tip.appendChild(saved);

      var box = hit.getBoundingClientRect();
      var frame = chart.getBoundingClientRect();
      tip.hidden = false;
      var half = tip.offsetWidth / 2;
      var x = box.left + box.width / 2 - frame.left;
      x = Math.max(half + 8, Math.min(frame.width - half - 8, x));
      tip.style.left = x + 'px';
      tip.style.top = (box.top - frame.top + Number(hit.getAttribute('data-peak')) * box.height - 10) + 'px';
    };
    var hide = function () { tip.hidden = true; };
    Array.prototype.forEach.call(chart.querySelectorAll('.chart__hit'), function (hit) {
      hit.addEventListener('pointerenter', function () { show(hit); });
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('focus', function () { show(hit); });
      hit.addEventListener('blur', hide);
    });
  }

  /* ---------- Booking form ---------- */

  var book = $('book-form');
  var done = $('book-done');
  var fields = {
    name: { input: $('f-name'), error: $('e-name'), message: text.errName },
    phone: { input: $('f-phone'), error: $('e-phone'), message: text.errPhone },
    post: { input: $('f-post'), error: $('e-post'), message: text.errPost }
  };
  var postHint = $('h-post');

  /** Eight digits, with or without spaces and a +47 or 0047 in front. */
  function phoneDigits(value) {
    var digits = value.replace(/[\s().-]/g, '').replace(/^(\+47|0047)/, '');
    return /^\d{8}$/.test(digits) ? digits : null;
  }

  var checks = {
    name: function (v) { return v.trim().length >= 2; },
    phone: function (v) { return phoneDigits(v) !== null; },
    post: function (v) { return /^\d{4}$/.test(v.trim()); }
  };

  function validate(key) {
    var f = fields[key];
    var ok = checks[key](f.input.value);
    f.input.setAttribute('aria-invalid', ok ? 'false' : 'true');
    f.error.hidden = ok;
    f.error.textContent = ok ? '' : f.message;
    return ok;
  }

  function hintPostcode() {
    var v = fields.post.input.value.trim();
    if (!/^\d{4}$/.test(v)) { postHint.hidden = true; return; }
    var n = Number(v);
    var inside = n >= model.postcodes[0] && n <= model.postcodes[1];
    postHint.textContent = inside ? text.postIn : text.postOut;
    postHint.classList.toggle('is-in', inside);
    postHint.hidden = false;
  }

  Object.keys(fields).forEach(function (key) {
    var f = fields[key];
    f.input.addEventListener('blur', function () { if (f.input.value !== '') validate(key); });
    f.input.addEventListener('input', function () {
      if (f.input.getAttribute('aria-invalid') === 'true') validate(key);
    });
  });
  fields.post.input.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 4);
    hintPostcode();
  });

  book.addEventListener('submit', function (event) {
    event.preventDefault();
    var bad = Object.keys(fields).filter(function (key) { return !validate(key); });
    if (bad.length) { fields[bad[0]].input.focus(); return; }
    if (book.elements.company.value !== '') return; // filled in by a script, not a person

    var digits = phoneDigits(fields.phone.input.value);
    var first = fields.name.input.value.trim().split(/\s+/)[0];
    $('done-title').textContent = fill(text.doneTitle, { name: first });
    $('done-text').textContent = fill(text.doneText, { phone: digits.replace(/(\d{3})(\d{2})(\d{3})/, '$1 $2 $3') });
    $('done-sample').textContent = text.doneSample;
    $('done-again').textContent = text.doneAgain;
    book.hidden = true;
    done.hidden = false;
    done.focus();
  });

  $('done-again').addEventListener('click', function () {
    book.reset();
    Object.keys(fields).forEach(function (key) {
      fields[key].input.removeAttribute('aria-invalid');
      fields[key].error.hidden = true;
    });
    postHint.hidden = true;
    done.hidden = true;
    book.hidden = false;
    fields.name.input.focus();
  });
})();
