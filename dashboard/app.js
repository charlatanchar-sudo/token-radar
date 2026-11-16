// Token Launch Radar — the page.
//
// Renders window.RADAR_DATA (written by main.ts beside this page as data.js)
// as a sortable, filterable board with a detail view per protocol. No
// network, no framework: the data file is the only input.
//
// The value on every row is the model in lib/model.ts, and the detail view
// shows its arithmetic for that protocol with its own numbers:
//   implied = TVL x category multiple x momentum factor x seasoning factor
// The category multiple is the shrunk median market-cap/TVL of the category's
// tokened protocols in the same snapshot, so the board's values follow from
// the snapshot's own figures, never from a list of names.

(function () {
  'use strict';

  var D = window.RADAR_DATA;
  if (!D) return;

  var state = { q: '', category: '', chain: '', watchOnly: false, key: 'rank', dir: 1 };

  function el(id) { return document.getElementById(id); }
  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // ---- formatting -------------------------------------------------------

  function commas(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + commas(n);
  }
  function moneyFull(n) { return '$' + commas(n); }
  function pct(v) {
    if (v === null || v === undefined) return 'not reported';
    return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  }
  function pctClass(v) {
    if (v === null || v === undefined || v === 0) return 'flat';
    return v > 0 ? 'up' : 'down';
  }
  function factor(x) { return 'x' + x.toFixed(2); }

  // ---- masthead ---------------------------------------------------------

  var facts = [
    ['Snapshot as of', D.as_of],
    ['Protocols scanned', commas(D.protocol_count)],
    ['On the board', commas(D.board_count)],
    ['Watchlist covered', D.watchlist_count + ' / ' + D.watchlist_count],
    ['Global multiple', factor(D.global_multiple)]
  ];
  var factsBox = el('snapshot-facts');
  facts.forEach(function (pair) {
    var div = make('div');
    div.appendChild(make('dt', null, pair[0]));
    div.appendChild(make('dd', null, pair[1]));
    factsBox.appendChild(div);
  });
  el('model-summary').textContent = D.model_summary;

  // ---- filters ----------------------------------------------------------

  var catSel = el('f-category');
  D.categories.forEach(function (c) {
    var o = make('option', null, c);
    o.value = c;
    catSel.appendChild(o);
  });
  var chainSel = el('f-chain');
  D.chains.forEach(function (c) {
    var o = make('option', null, c);
    o.value = c;
    chainSel.appendChild(o);
  });

  el('q').addEventListener('input', function (e) { state.q = e.target.value.trim().toLowerCase(); render(); });
  catSel.addEventListener('change', function (e) { state.category = e.target.value; render(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  el('f-watch').addEventListener('change', function (e) { state.watchOnly = e.target.checked; render(); });

  // ---- sorting ----------------------------------------------------------

  var headers = document.querySelectorAll('#board th.sortable');
  headers.forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-key');
      if (state.key === key) {
        state.dir = -state.dir;
      } else {
        state.key = key;
        state.dir = key === 'name' || key === 'category' ? 1 : -1;
        if (key === 'rank') state.dir = 1;
      }
      render();
    });
  });

  function compare(a, b) {
    var k = state.key;
    var va = a[k];
    var vb = b[k];
    if (k === 'category') { va = va || 'Uncategorized'; vb = vb || 'Uncategorized'; }
    if (va === null || va === undefined) va = -Infinity;
    if (vb === null || vb === undefined) vb = -Infinity;
    var d = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    if (d === 0) d = a.rank - b.rank;
    return d * state.dir;
  }

  function markHeaders() {
    headers.forEach(function (th) {
      var arrow = th.querySelector('.arrow');
      if (arrow) arrow.remove();
      if (th.getAttribute('data-key') === state.key) {
        th.appendChild(make('span', 'arrow', state.dir === 1 ? ' ▲' : ' ▼'));
      }
    });
  }

  // ---- the board --------------------------------------------------------

  function visible() {
    return D.rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.category && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (state.q && r.name.toLowerCase().indexOf(state.q) === -1 && r.slug.indexOf(state.q) === -1) return false;
      return true;
    }).sort(compare);
  }

  function rowEl(r) {
    var tr = make('tr', r.rank <= 3 ? 'top' : null);
    tr.tabIndex = 0;
    tr.setAttribute('data-slug', r.slug);

    var rank = make('td', 'num rank', '#' + r.rank);
    tr.appendChild(rank);

    var name = make('td');
    name.appendChild(make('span', 'pname', r.name));
    name.appendChild(make('span', 'pslug', r.slug));
    tr.appendChild(name);

    tr.appendChild(make('td', null, r.category || 'Uncategorized'));
    tr.appendChild(make('td', 'chains', r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '')));
    tr.appendChild(make('td', 'num tvl', money(r.tvl_usd)));

    var ch = make('td', 'num ' + pctClass(r.change_7d), r.change_7d === null ? 'n/r' : pct(r.change_7d));
    tr.appendChild(ch);

    tr.appendChild(make('td', 'num', factor(r.multiple)));
    tr.appendChild(make('td', 'num implied', money(r.implied_value_usd)));

    var list = make('td');
    list.appendChild(make('span', r.watchlist ? 'badge badge-watch' : 'badge badge-early', r.watchlist ? 'Watchlist' : 'Early find'));
    tr.appendChild(list);

    tr.addEventListener('click', function () { openDetail(r); });
    tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') openDetail(r); });
    return tr;
  }

  function render() {
    var rows = visible();
    var body = el('board-body');
    body.textContent = '';
    rows.forEach(function (r) { body.appendChild(rowEl(r)); });
    el('empty').hidden = rows.length > 0;
    el('showing').textContent = 'Showing ' + rows.length + ' of ' + D.board_count + ' protocols — click a row for its detail and farm plan';
    markHeaders();
  }

  // ---- detail view ------------------------------------------------------

  var scrim = el('scrim');
  var detail = el('detail');

  function stat(label, value) {
    var div = make('div');
    div.appendChild(make('dt', null, label));
    div.appendChild(make('dd', null, value));
    return div;
  }

  function breakdownRow(label, why, value) {
    var tr = make('tr');
    var a = make('td', null, label);
    if (why) a.appendChild(make('span', 'why', ' — ' + why));
    tr.appendChild(a);
    tr.appendChild(make('td', null, value));
    return tr;
  }

  function openDetail(r) {
    detail.textContent = '';

    var head = make('div', 'detail-head');
    var titleBox = make('div');
    titleBox.appendChild(make('h2', null, r.name));
    titleBox.children[0].id = 'd-name';
    titleBox.appendChild(make('p', 'd-slug', r.slug + ' · rank #' + r.rank + ' of ' + D.board_count));
    head.appendChild(titleBox);
    var close = make('button', 'd-close', '✕');
    close.setAttribute('aria-label', 'Close detail view');
    close.addEventListener('click', closeDetail);
    head.appendChild(close);
    detail.appendChild(head);

    var badges = make('div', 'd-badges');
    badges.appendChild(make('span', r.watchlist ? 'badge badge-watch' : 'badge badge-early',
      r.watchlist ? 'On the snapshot watchlist' : 'Early find — below the watchlist floor or off its list'));
    badges.appendChild(make('span', 'badge badge-early', 'Records no token'));
    detail.appendChild(badges);

    var stats = make('dl', 'd-stats');
    stats.appendChild(stat('TVL', moneyFull(r.tvl_usd)));
    stats.appendChild(stat('Category', r.category || 'Uncategorized'));
    stats.appendChild(stat('7d TVL change', pct(r.change_7d)));
    stats.appendChild(stat('Listed since', r.listed_at || 'not recorded'));
    stats.appendChild(stat('Years with no token', r.years_listed === null ? 'unknown' : r.years_listed.toFixed(2)));
    stats.appendChild(stat('Chains', r.chains.join(', ')));
    detail.appendChild(stats);

    detail.appendChild(make('h3', null, 'How the implied value is built'));
    var table = make('table', 'breakdown');
    table.appendChild(breakdownRow('TVL', 'the snapshot\'s figure', moneyFull(r.tvl_usd)));
    table.appendChild(breakdownRow('Category multiple', (r.category || 'global') + ', shrunk median of tokened peers', factor(r.multiple)));
    table.appendChild(breakdownRow('Base value', 'TVL x multiple', moneyFull(r.base_value_usd)));
    table.appendChild(breakdownRow('Momentum factor', '7-day TVL change of ' + pct(r.change_7d) + ', halved and clamped', factor(r.momentum_factor)));
    table.appendChild(breakdownRow('Seasoning factor',
      r.years_listed === null ? 'listing date unknown, so neutral' : r.years_listed.toFixed(2) + ' years run with no token, log-scaled',
      factor(r.seasoning_factor)));
    var total = breakdownRow('Implied value', 'base x momentum x seasoning, rounded', moneyFull(r.implied_value_usd));
    total.className = 'total';
    table.appendChild(total);
    detail.appendChild(table);

    detail.appendChild(make('h3', null, 'Farm plan — what to do before a launch'));
    var list = make('ol', 'farm');
    r.farm_steps.forEach(function (s) { list.appendChild(make('li', null, s)); });
    detail.appendChild(list);

    scrim.hidden = false;
    close.focus();
  }

  function closeDetail() { scrim.hidden = true; }
  scrim.addEventListener('click', function (e) { if (e.target === scrim) closeDetail(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  render();
})();
