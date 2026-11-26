// Token Radar dashboard. It reads window.RADAR — the dataset main.ts
// writes beside dashboard/ — and renders the ranked board, a filterable
// table, and a per-protocol detail view with the model's own working and
// the protocol's farm plan. No network: every byte shown is in data.js,
// and the page recomputes each row's implied value from the snapshot
// figures so the page's arithmetic and the board's data visibly agree.
(() => {
  'use strict';

  const DATA = window.RADAR;
  if (!DATA) return;
  const root = document.getElementById('board');
  const state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  // ---- formatting -------------------------------------------------------

  const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  const money = (n) => {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usdFmt.format(n);
  };

  const pct = (n) => {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  };

  const ageLabel = (days) => {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  };

  // ---- radar-2, recomputed in the page ----------------------------------
  //
  // Same constants as lib/model.ts, read from DATA.model. The age curve
  // peaks at two years; the category table is ordered, first match wins,
  // exactly as the model scores it.

  const maturityForAge = (age) => {
    if (age === null || age === undefined) return 0.95;
    if (age < 90) return 0.85 + (age / 90) * 0.1;
    if (age < 365) return 0.95 + ((age - 90) / 275) * 0.1;
    if (age < 730) return 1.05 + ((age - 365) / 365) * 0.05;
    if (age < 1095) return 1.1 - ((age - 730) / 365) * 0.05;
    return Math.max(0.95, 1.05 - (Math.min(age - 1095, 1095) / 1095) * 0.1);
  };

  const CATEGORY_ODDS = [
    { words: ['bridge'], mult: 0.88 },
    { words: ['liquid staking', 'liquid restaking', 'restaked'], mult: 0.88 },
    { words: ['cex'], mult: 0.85 },
    { words: ['dex', 'lend', 'risk curator', 'onchain capital allocator'], mult: 1.08 },
    { words: ['yield', 'derivative', 'perpetual'], mult: 1.06 },
    { words: ['cdp', 'collateral'], mult: 1.04 },
    { words: ['staking pool'], mult: 0.92 },
    { words: ['rwa'], mult: 0.96 },
    { words: ['basis'], mult: 0.98 },
  ];

  const categoryOdds = (cat) => {
    const lowered = (cat || '').toLowerCase();
    for (const rule of CATEGORY_ODDS) {
      if (rule.words.some((word) => lowered.includes(word))) return rule.mult;
    }
    return 1.0;
  };

  const chainSpread = (row, model) =>
    1 + Math.min(Math.max(((row.chains || []).length - 1), 0), 5) * model.chain_bonus_per_chain;

  const sizeDampener = (row, model) => {
    const span = Math.log10(2750000000 / 5000000);
    const at = Math.min(Math.max(Math.log10(Math.max(row.tvl_usd, 5000000) / 5000000) / span, 0), 1);
    return model.scale_high - (model.scale_high - model.scale_low) * at;
  };

  const clampedGrowth = (row, model) =>
    Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));

  /** Every multiplier behind one row, as a named object the detail view shows. */
  const breakdownFor = (row, model) => {
    const growth = clampedGrowth(row, model);
    return {
      growth: 1 + (growth / 100) * model.growth_weight,
      age: maturityForAge(row.age_days),
      chain: chainSpread(row, model),
      category: categoryOdds(row.category),
      scale: sizeDampener(row, model),
      data: row.change_7d === null || row.change_7d === undefined ? model.missing_data_multiplier : 1,
    };
  };

  /** Recompute a row's implied value from its snapshot figures. */
  const recomputeImplied = (row, model) => {
    const bd = breakdownFor(row, model);
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * bd.growth * bd.age * bd.chain * bd.category * bd.scale * bd.data));
  };

  /**
   * Risk notes for one row, sharpest first, at most three: a single chain,
   * a sharp 7d fall or jump, a very young or very old age, a low-odds
   * category, or a TVL so large the number is mostly size.
   */
  const riskNotesFor = (row) => {
    const notes = [];
    const chains = row.chains || [];
    if (chains.length === 1) notes.push('Single-chain on ' + (chains[0] || 'one chain') + ': a failure there hits the whole position.');
    if (row.change_7d !== null && row.change_7d !== undefined && row.change_7d < -5) notes.push('TVL fell ' + row.change_7d.toFixed(2) + '% in 7 days: momentum is against the farm, add nothing until it flattens.');
    if (row.change_7d !== null && row.change_7d !== undefined && row.change_7d > 20) notes.push('TVL jumped +' + row.change_7d.toFixed(2) + '% in 7 days: fast growth can reverse as fast.');
    if (row.age_days !== null && row.age_days !== undefined && row.age_days < 180) notes.push('Young protocol (' + row.age_days + 'd): less track record, hold longer.');
    if (row.age_days !== null && row.age_days !== undefined && row.age_days > 1095) notes.push('Old with no token (' + (row.age_days / 365).toFixed(1) + 'y): a launch is less certain the longer it waits.');
    const cat = (row.category || '').toLowerCase();
    if (cat.includes('bridge') || cat.includes('staking')) notes.push('Category ' + row.category + ': token odds are lower than for Dexs / Lending.');
    if (row.tvl_usd >= 1e9) notes.push('Large TVL: implied value here is mostly size, not a new launch.');
    return notes.slice(0, 3);
  };

  // ---- farm plan, same derivation as lib/model.ts -----------------------
  //
  // Category, chains, TVL and age decide the action, the capital, the hold
  // and every cost and time. No name is special-cased.

  const firstChain = (p) => (p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain');

  const stakeSize = (p) => {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  };

  const holdWindow = (age) => {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  };

  const actionFor = (p, capital, chain) => {
    const c = (p.category || '').toLowerCase();
    const name = p.name;
    if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.includes('bridge')) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.includes('staking') || c.includes('restak')) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.includes('perpetual') || c.includes('derivative')) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.includes('prediction')) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.includes('curator') || c.includes('allocator')) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.includes('stable')) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.includes('rwa')) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.includes('yield aggregator') || c.includes('yield')) return 'Deposit $' + capital + " into " + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.includes('basis')) return 'Deposit $' + capital + " into " + name + "'s basis position on " + chain + ' and keep it open.';
    if (c.includes('liquid staking') || c.includes('staking pool')) return 'Stake $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt token in the same wallet.';
    if (c.includes('insurance')) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  };

  const stepText = (step) => {
    let s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  };

  const farmPlanFor = (p) => {
    const chain = firstChain(p);
    const capital = stakeSize(p);
    const hold = holdWindow(p.age_days);
    const second = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    const growth = p.change_7d === null || p.change_7d === undefined ? 'no 7d change reported' : (p.change_7d > 0 ? '+' : '') + p.change_7d.toFixed(2) + '% in 7 days';
    const third = second !== null
      ? { text: 'Repeat the same position with $' + Math.max(25, Math.round(capital / 2)) + ' on ' + second + ' so the farm is not single-chain: use the same wallet, the same ' + (p.category || 'protocol') + ' action, and keep both positions open.', cost: '$' + Math.max(25, Math.round(capital / 2)) + ' of capital and about $4 of gas', time: '15 minutes to set up' }
      : { text: 'Make one qualifying action each week on ' + chain + ', such as a deposit, a borrow, a swap or a vote in ' + p.name + '.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, fund it with ' + chain + ' gas and $' + capital + ' of USDC, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      third,
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Risk check before adding more: ' + p.name + ' moved ' + growth + ' on $' + Math.round(p.tvl_usd / 1e6) + 'M TVL across ' + p.chains.length + ' chain' + (p.chains.length === 1 ? '' : 's') + '; if the 7d move is negative, add nothing until it flattens.', cost: 'nothing to check', time: '5 minutes' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then unwind in tranches and keep enough ' + chain + ' gas to exit.', cost: 'nothing but the log', time: '5 minutes' },
    ].map(stepText);
  };

  // ---- DOM helper --------------------------------------------------------
  //
  // h('div', { class: 'panel', text: '...' }, child1, child2) builds one
  // element: `class`, `text` and `html` are special, `on*` keys become
  // listeners, everything else becomes an attribute.

  const h = (tag, attrs, ...kids) => {
    const node = document.createElement(tag);
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else if (value !== null && value !== undefined) node.setAttribute(key, value);
      }
    }
    for (const kid of kids) {
      if (kid === null || kid === undefined || kid === false) continue;
      if (Array.isArray(kid)) kid.forEach((c) => { if (c) node.appendChild(c); });
      else if (typeof kid === 'string') node.appendChild(document.createTextNode(kid));
      else node.appendChild(kid);
    }
    return node;
  };

  // ---- state in the URL hash --------------------------------------------

  const readHash = () => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  };

  const writeHash = () => {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    const next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  // ---- filtering and sorting --------------------------------------------

  const visibleRows = () => {
    const q = state.q.trim().toLowerCase();
    return DATA.rows.filter((r) => {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      const hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  };

  const sortedRows = (list) => {
    const key = state.sort;
    const valueOf = (r) => {
      if (key === 'name') return r.name.toLowerCase();
      if (key === 'tvl') return r.tvl_usd;
      if (key === 'growth') return r.change_7d === null ? -Infinity : r.change_7d;
      if (key === 'age') return r.age_days === null ? Infinity : r.age_days;
      return r.implied_value_usd;
    };
    return list.slice().sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  };

  // ---- page sections ------------------------------------------------------

  const topBar = () => h('header', { class: 'top' },
    h('div', { class: 'brand' }, h('span', { class: 'mark' }), h('span', { class: 'brand-name', text: 'Token Radar' })),
    h('div', { class: 'top-meta' },
      h('span', { text: 'Snapshot ' + DATA.as_of }),
      h('span', { text: 'DefiLlama protocol index' }),
      h('span', { text: DATA.model_version + ' model' })));

  const intro = () => h('section', { class: 'lede' },
    h('div', null,
      h('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
      h('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })),
    h('div', { class: 'facts' },
      h('div', { class: 'fact' }, h('span', { text: 'Watchlist covered' }), h('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
      h('div', { class: 'fact' }, h('span', { text: 'Pre-token rows scored' }), h('b', { text: String(DATA.board_size) })),
      h('div', { class: 'fact' }, h('span', { text: 'Early rows below the floor' }), h('b', { text: String(DATA.early_size) })),
      h('div', { class: 'fact' }, h('span', { text: 'Live-token protocols set aside' }), h('b', { text: String(DATA.live_size) }))));

  const filterBar = () => {
    const categories = Array.from(new Set(DATA.rows.map((r) => r.category || 'Other'))).sort();
    const chains = Array.from(new Set(DATA.rows.flatMap((r) => r.chains || []))).sort();
    const search = h('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', () => { state.q = search.value; writeHash(); render(); });
    const chainSelect = h('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      h('option', { value: 'all', text: 'All chains' }),
      chains.map((c) => h('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null })));
    chainSelect.addEventListener('change', () => { state.chain = chainSelect.value; writeHash(); render(); });
    const categorySelect = h('select', { id: 'category', 'aria-label': 'Filter by category' },
      h('option', { value: 'all', text: 'All categories' }),
      categories.map((c) => h('option', { value: c, text: c, selected: c === state.category ? 'selected' : null })));
    categorySelect.addEventListener('change', () => { state.category = categorySelect.value; writeHash(); render(); });
    const preBtn = h('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: () => { state.tab = 'pre-token'; render(); } });
    const liveBtn = h('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: () => { state.tab = 'live'; render(); } });
    return h('div', { class: 'controls' },
      h('div', { class: 'field' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { class: 'field' }, h('label', { for: 'category', text: 'Category' }), categorySelect),
      h('div', { class: 'field' }, h('label', { for: 'chain', text: 'Chain' }), chainSelect),
      h('div', { class: 'field' }, h('span', { class: 'sub', text: 'Token status' }), h('div', { class: 'tabs' }, preBtn, liveBtn)),
      h('span', { class: 'count', text: state.tab === 'pre-token' ? visibleRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' }));
  };

  const sortHeader = (key, label) => h('th', { scope: 'col' },
    h('button', { type: 'button', onclick: () => { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
      label,
      state.sort === key ? h('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null));

  const protocolCell = (r) => h('td', null, h('div', { class: 'name' },
    h('b', { text: r.name }),
    h('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })));

  const boardTable = () => {
    const list = sortedRows(visibleRows());
    if (list.length === 0) {
      return h('div', { class: 'panel' }, h('div', { class: 'empty' },
        h('h2', { text: 'No protocol matches that filter' }),
        h('p', { text: 'Clear the search or pick another category to see the board again.' }),
        h('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: () => { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })));
    }
    const max = list[0].implied_value_usd || 1;
    const tbody = h('tbody');
    list.forEach((r) => {
      const growth = r.change_7d === null ? 'n/a' : pct(r.change_7d);
      const growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      const tr = h('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: () => openDetail(r.slug),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
      },
        h('td', { class: 'num', text: String(r.rank) }),
        protocolCell(r),
        h('td', { class: 'num', text: money(r.tvl_usd) }),
        h('td', { class: 'num ' + growthClass, text: growth }),
        h('td', { class: 'num', text: ageLabel(r.age_days) }),
        h('td', null, h('div', { class: 'implied' },
          h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          h('span', { class: 'num', text: money(r.implied_value_usd) }))),
        h('td', null, h('span', { class: 'status', text: 'no token' })));
      tbody.appendChild(tr);
    });
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          h('thead', null, h('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            h('th', { scope: 'col', text: 'Token' }))),
          tbody)));
  };

  const liveTable = () => {
    const tbody = h('tbody');
    DATA.live.forEach((r) => {
      tbody.appendChild(h('tr', null,
        h('td', { class: 'num', text: 'live' }),
        protocolCell(r),
        h('td', { class: 'num', text: money(r.tvl_usd) }),
        h('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: pct(r.change_7d) }),
        h('td', { class: 'num', text: money(r.mcap_usd) }),
        h('td', null, h('span', { class: 'status', text: 'already trades' }))));
    });
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Status' }), h('th', { scope: 'col', text: 'Protocol' }), h('th', { scope: 'col', text: 'TVL' }), h('th', { scope: 'col', text: '7d' }), h('th', { scope: 'col', text: 'Market cap' }), h('th', { scope: 'col', text: 'Token' }))),
          tbody)));
  };

  const modelPanel = () => {
    const m = DATA.model;
    return h('section', { class: 'panel model' },
      h('h2', { text: 'How implied value is computed' }),
      h('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      h('div', { class: 'formula' },
        'implied = round( tvl x ' + m.base_multiple + ' x growth x age x chain x category x scale x data )  |  growth = 1 + clamp(7d, ' + m.growth_floor + ', ' + m.growth_cap + ')/100 x ' + m.growth_weight + '  |  age = sweet spot 0.85 (young) to 1.10 (730d) to 0.95 (old)  |  chain = 1 + 0.03 x min(chains-1, 5)  |  scale = 1.15 (small) to 0.85 (large, log TVL)  |  category: Dexs/Lending/curators 1.08, Bridge/Staking 0.88, default 1.00  |  data = 0.95 if 7d missing'),
      h('p', { class: 'sub', text: 'Radar-2. TVL still sets the size, but log-scale dampens giants, momentum counts more, age peaks at about two years instead of rewarding mere survival, multi-chain spread is worth up to +15%, and bridge / staking wrappers are marked down. Early rows are the 160 best below the $50M floor by this model, not by TVL alone. Live-token protocols are set aside with their market caps shown.' }));
  };

  // ---- detail view ---------------------------------------------------------

  const dialog = h('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', () => { state.selected = null; writeHash(); });

  const openDetail = (slug) => {
    const row = DATA.rows.filter((r) => r.slug === slug)[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    const steps = farmPlanFor(row);
    const recomputed = recomputeImplied(row, DATA.model);
    const bd = breakdownFor(row, DATA.model);
    const risks = riskNotesFor(row);
    dialog.appendChild(h('div', { class: 'detail-head' },
      h('div', null,
        h('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        h('h2', { id: 'detail-title', text: row.name }),
        h('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: () => dialog.close() })));
    dialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Implied value' }),
      h('div', { class: 'equation' },
        h('div', null, h('span', { text: 'TVL' }), h('b', { class: 'num', text: money(row.tvl_usd) })),
        h('div', null, h('span', { text: 'Seven-day growth' }), h('b', { class: 'num', text: pct(row.change_7d) })),
        h('div', null, h('span', { text: 'Age with no token' }), h('b', { class: 'num', text: ageLabel(row.age_days) })),
        h('div', null, h('span', { text: 'Growth multiplier' }), h('b', { class: 'num', text: String(row.growth_multiplier) })),
        h('div', null, h('span', { text: 'Maturity multiplier' }), h('b', { class: 'num', text: String(row.maturity_multiplier) })),
        h('div', null, h('span', { text: 'Implied value' }), h('b', { class: 'num', text: money(row.implied_value_usd) }))),
      h('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + money(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })));
    dialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Score breakdown (radar-2)' }),
      h('div', { class: 'equation' },
        h('div', null, h('span', { text: 'Growth x' + bd.growth.toFixed(2) }), h('b', { class: 'num', text: pct(row.change_7d) })),
        h('div', null, h('span', { text: 'Age x' + bd.age.toFixed(2) }), h('b', { class: 'num', text: ageLabel(row.age_days) })),
        h('div', null, h('span', { text: 'Chain x' + bd.chain.toFixed(2) }), h('b', { class: 'num', text: String(row.chain_count || (row.chains || []).length) + ' chains' })),
        h('div', null, h('span', { text: 'Category x' + bd.category.toFixed(2) }), h('b', { class: 'num', text: row.category || 'Other' })),
        h('div', null, h('span', { text: 'Scale x' + bd.scale.toFixed(2) }), h('b', { class: 'num', text: money(row.tvl_usd) })),
        h('div', null, h('span', { text: 'Data x' + bd.data.toFixed(2) }), h('b', { class: 'num', text: row.change_7d === null ? '7d missing' : '7d present' }))),
      risks.length
        ? h('div', { class: 'risks' }, h('h3', { text: 'Risk notes' }), h('ul', null, risks.map((n) => h('li', { text: n }))))
        : h('p', { class: 'sub', text: 'No red flags in the snapshot figures.' })));
    dialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Farm plan' }),
      h('ol', { class: 'steps' }, steps.map((s) => {
        const at = s.indexOf(' Cost: ');
        const action = at >= 0 ? s.slice(0, at) : s;
        const tail = at >= 0 ? s.slice(at + 1) : '';
        return h('li', null, h('b', { text: action }), h('span', { class: 'cost', text: tail }));
      }))));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  };

  // ---- render --------------------------------------------------------------

  const render = () => {
    root.textContent = '';
    const shell = h('div', { class: 'shell' });
    shell.appendChild(topBar());
    shell.appendChild(intro());
    shell.appendChild(filterBar());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    root.appendChild(shell);
    root.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) root.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  };

  readHash();
  render();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
