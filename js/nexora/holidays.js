// Countries, public holidays and the seasonal calendar (design preview).
// Pure date logic, no DOM — written so it can move into the app as it is.
(function () {
  const COUNTRIES = [
    ['PT', 'Portugal', 'EUR'], ['ES', 'Spain', 'EUR'], ['FR', 'France', 'EUR'], ['DE', 'Germany', 'EUR'], ['IT', 'Italy', 'EUR'],
    ['GB', 'United Kingdom', 'GBP'], ['CH', 'Switzerland', 'CHF'], ['US', 'United States', 'USD'], ['BR', 'Brazil', 'BRL'], ['CN', 'China', 'EUR'],
  ];

  // The computer's time zone is the best hint of where someone lives; the language is the fallback
  const TZ = { 'Europe/Lisbon': 'PT', 'Atlantic/Madeira': 'PT', 'Atlantic/Azores': 'PT', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES',
    'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Rome': 'IT', 'Europe/London': 'GB', 'Europe/Zurich': 'CH',
    'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Harbin': 'CN', 'Asia/Urumqi': 'CN' };
  function guessCountry(lang) {
    let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    if (TZ[tz]) return TZ[tz];
    if (/^America\/(Sao_Paulo|Fortaleza|Recife|Bahia|Belem|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Araguaina|Maceio|Santarem|Noronha|Eirunepe)$/.test(tz)) return 'BR';
    if (/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Sitka|Nome|Adak|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+)|Pacific\/Honolulu)$/.test(tz)) return 'US';
    return { pt: 'PT', zh: 'CN' }[lang] || 'US';
  }

  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const D = (y, m, d) => new Date(y, m - 1, d);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const weekend = d => d.getDay() === 0 || d.getDay() === 6;
  // nth weekday of a month (wd: 0 = Sunday); n = -1 for the last one
  function nthWeekday(y, m, wd, n) {
    if (n > 0) { const d = D(y, m, 1); return addDays(d, (wd - d.getDay() + 7) % 7 + (n - 1) * 7); }
    const d = new Date(y, m, 0); return addDays(d, -((d.getDay() - wd + 7) % 7));
  }
  // Easter Sunday (Gregorian), anonymous algorithm
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = h + l - 7 * m + 114;
    return D(y, Math.floor(n / 31), n % 31 + 1);
  }
  // Lunar holidays as Gregorian dates: Spring Festival (day 1), Dragon Boat, Mid-Autumn
  const LUNAR = {
    2024: ['02-10', '06-10', '09-17'], 2025: ['01-29', '05-31', '10-06'], 2026: ['02-17', '06-19', '09-25'], 2027: ['02-06', '06-09', '09-15'],
    2028: ['01-26', '05-28', '10-03'], 2029: ['02-13', '06-16', '09-22'], 2030: ['02-03', '06-05', '09-12'], 2031: ['01-23', '06-24', '10-01'],
    2032: ['02-11', '06-12', '09-19'],
  };
  const lunar = (y, i) => { const v = LUNAR[y]?.[i]; return v ? D(y, +v.slice(0, 2), +v.slice(3)) : null; };

  // National public holidays: { 'YYYY-MM-DD': name }. Regional holidays (a Spanish
  // region, a Swiss canton, Lisbon's Santo António) aren't included.
  const CACHE = {};
  function holidays(cc, y) {
    const key = cc + y;
    if (CACHE[key]) return CACHE[key];
    const out = {}, E = easter(y);
    const add = (d, name) => { out[iso(d)] = name; };
    const fx = (m, d, name) => add(D(y, m, d), name);
    const fromEaster = (n, name) => add(addDays(E, n), name);
    // Weekend holidays move to the next free weekday (UK) or the nearest weekday (US)
    const ukSub = (d, name) => { while (weekend(d) || out[iso(d)]) d = addDays(d, 1); add(d, name); };
    const usObs = (d, name) => add(d.getDay() === 6 ? addDays(d, -1) : d.getDay() === 0 ? addDays(d, 1) : d, name);
    switch (cc) {
      case 'PT':
        fx(1, 1, 'New Year’s Day'); fromEaster(-2, 'Good Friday'); fromEaster(0, 'Easter Sunday'); fx(4, 25, 'Freedom Day'); fx(5, 1, 'Labour Day');
        fromEaster(60, 'Corpus Christi'); fx(6, 10, 'Portugal Day'); fx(8, 15, 'Assumption Day'); fx(10, 5, 'Republic Day'); fx(11, 1, 'All Saints’ Day');
        fx(12, 1, 'Restoration of Independence'); fx(12, 8, 'Immaculate Conception'); fx(12, 25, 'Christmas Day'); break;
      case 'ES':
        fx(1, 1, 'New Year’s Day'); fx(1, 6, 'Epiphany'); fromEaster(-2, 'Good Friday'); fx(5, 1, 'Labour Day'); fx(8, 15, 'Assumption Day');
        fx(10, 12, 'National Day'); fx(11, 1, 'All Saints’ Day'); fx(12, 6, 'Constitution Day'); fx(12, 8, 'Immaculate Conception'); fx(12, 25, 'Christmas Day'); break;
      case 'FR':
        fx(1, 1, 'New Year’s Day'); fromEaster(1, 'Easter Monday'); fx(5, 1, 'Labour Day'); fx(5, 8, 'Victory in Europe Day'); fromEaster(39, 'Ascension Day');
        fromEaster(50, 'Whit Monday'); fx(7, 14, 'Bastille Day'); fx(8, 15, 'Assumption Day'); fx(11, 1, 'All Saints’ Day'); fx(11, 11, 'Armistice Day'); fx(12, 25, 'Christmas Day'); break;
      case 'DE':
        fx(1, 1, 'New Year’s Day'); fromEaster(-2, 'Good Friday'); fromEaster(1, 'Easter Monday'); fx(5, 1, 'Labour Day'); fromEaster(39, 'Ascension Day');
        fromEaster(50, 'Whit Monday'); fx(10, 3, 'German Unity Day'); fx(12, 25, 'Christmas Day'); fx(12, 26, 'St Stephen’s Day'); break;
      case 'IT':
        fx(1, 1, 'New Year’s Day'); fx(1, 6, 'Epiphany'); fromEaster(1, 'Easter Monday'); fx(4, 25, 'Liberation Day'); fx(5, 1, 'Labour Day'); fx(6, 2, 'Republic Day');
        fx(8, 15, 'Assumption Day'); fx(11, 1, 'All Saints’ Day'); fx(12, 8, 'Immaculate Conception'); fx(12, 25, 'Christmas Day'); fx(12, 26, 'St Stephen’s Day'); break;
      case 'CH':   // the days most cantons share; 1 August is the only federal one
        fx(1, 1, 'New Year’s Day'); fromEaster(-2, 'Good Friday'); fromEaster(1, 'Easter Monday'); fromEaster(39, 'Ascension Day'); fromEaster(50, 'Whit Monday');
        fx(8, 1, 'Swiss National Day'); fx(12, 25, 'Christmas Day'); fx(12, 26, 'St Stephen’s Day'); break;
      case 'GB':   // England & Wales
        ukSub(D(y, 1, 1), 'New Year’s Day'); fromEaster(-2, 'Good Friday'); fromEaster(1, 'Easter Monday');
        add(nthWeekday(y, 5, 1, 1), 'Early May bank holiday'); add(nthWeekday(y, 5, 1, -1), 'Spring bank holiday'); add(nthWeekday(y, 8, 1, -1), 'Summer bank holiday');
        ukSub(D(y, 12, 25), 'Christmas Day'); ukSub(D(y, 12, 26), 'Boxing Day'); break;
      case 'US':   // federal
        usObs(D(y, 1, 1), 'New Year’s Day'); add(nthWeekday(y, 1, 1, 3), 'Martin Luther King Jr. Day'); add(nthWeekday(y, 2, 1, 3), 'Presidents’ Day');
        add(nthWeekday(y, 5, 1, -1), 'Memorial Day'); usObs(D(y, 6, 19), 'Juneteenth'); usObs(D(y, 7, 4), 'Independence Day'); add(nthWeekday(y, 9, 1, 1), 'Labor Day');
        add(nthWeekday(y, 10, 1, 2), 'Columbus Day'); usObs(D(y, 11, 11), 'Veterans Day'); add(nthWeekday(y, 11, 4, 4), 'Thanksgiving'); usObs(D(y, 12, 25), 'Christmas Day');
        if (D(y + 1, 1, 1).getDay() === 6) fx(12, 31, 'New Year’s Day (observed)'); break;
      case 'BR':
        fx(1, 1, 'New Year’s Day'); fromEaster(-48, 'Carnival'); fromEaster(-47, 'Carnival'); fromEaster(-2, 'Good Friday'); fx(4, 21, 'Tiradentes'); fx(5, 1, 'Labour Day');
        fromEaster(60, 'Corpus Christi'); fx(9, 7, 'Independence Day'); fx(10, 12, 'Our Lady of Aparecida'); fx(11, 2, 'All Souls’ Day'); fx(11, 15, 'Republic Day');
        if (y >= 2024) fx(11, 20, 'Black Consciousness Day'); fx(12, 25, 'Christmas Day'); break;
      case 'CN': { // statutory days off; the weekends China swaps to make longer breaks are announced each year and aren't known here
        fx(1, 1, 'New Year’s Day');
        const sf = lunar(y, 0); if (sf) [-1, 0, 1, 2].forEach(n => add(addDays(sf, n), 'Spring Festival'));
        fx(4, y % 4 < 2 ? 4 : 5, 'Qingming Festival'); fx(5, 1, 'Labour Day'); fx(5, 2, 'Labour Day');
        const db = lunar(y, 1); if (db) add(db, 'Dragon Boat Festival');
        const ma = lunar(y, 2); if (ma) add(ma, 'Mid-Autumn Festival');
        [1, 2, 3].forEach(d => fx(10, d, 'National Day')); break;
      }
    }
    return (CACHE[key] = out);
  }
  const holidayOn = (d, cc) => cc ? holidays(cc, d.getFullYear())[iso(d)] || null : null;
  const isBusinessDay = (d, cc) => !weekend(d) && !holidayOn(d, cc);

  // Business day no. n counted back from the end of a month (month 0-based):
  // 1 = the last business day. Public holidays of the country don't count.
  function nthLastBusinessDay(y, month, n, cc) {
    const d = new Date(y, month + 1, 0), skipped = [];
    for (let k = 0; ; d.setDate(d.getDate() - 1)) {
      if (weekend(d)) continue;
      const h = holidayOn(d, cc);
      if (h) { skipped.push({ date: new Date(d), name: h }); continue; }
      if (++k === n) return { date: new Date(d), skipped };
    }
  }

  // ── Seasons: which theme is on for a date and a country (the first match wins)
  // kit = the decoration set; wrap = the Year Wrap is offered
  const SEASONS = {
    newyear: { kit: 'fireworks', name: 'New Year’s Eve' },
    christmas: { kit: 'snow', name: 'Christmas' },
    halloween: { kit: 'halloween', name: 'Halloween' },
    carnival: { kit: 'confetti', name: 'Carnival' },
    santos: { kit: 'festa', name: 'Santos Populares' },
    junina: { kit: 'festa', name: 'Festa Junina' },
    thanksgiving: { kit: 'autumn', name: 'Thanksgiving' },
    july4: { kit: 'fireworks', name: 'Independence Day' },
    bastille: { kit: 'fireworks', name: 'Bastille Day' },
    bonfire: { kit: 'fireworks', name: 'Bonfire Night' },
    springfest: { kit: 'lanterns', name: 'Spring Festival' },
    midautumn: { kit: 'moon', name: 'Mid-Autumn Festival' },
  };
  // Which seasons each country gets (New Year is everyone's)
  const BY_COUNTRY = {
    PT: ['christmas', 'halloween', 'carnival', 'santos'], ES: ['christmas', 'halloween'], FR: ['christmas', 'halloween', 'bastille'],
    DE: ['christmas', 'halloween'], IT: ['christmas', 'halloween'], GB: ['christmas', 'halloween', 'bonfire'], CH: ['christmas', 'halloween'],
    US: ['christmas', 'halloween', 'thanksgiving', 'july4'], BR: ['christmas', 'halloween', 'carnival', 'junina'], CN: ['springfest', 'midautumn'],
  };
  function seasonFor(date, cc) {
    const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate(), t = +D(y, m, d);
    const within = (a, b) => t >= +a && t <= +b;
    const has = s => (BY_COUNTRY[cc] || BY_COUNTRY.US).includes(s);
    if ((m === 12 && d === 31) || (m === 1 && d === 1)) return 'newyear';
    if (has('springfest')) { const sf = lunar(y, 0); if (sf && within(addDays(sf, -7), addDays(sf, 15))) return 'springfest'; }
    if (has('midautumn')) { const ma = lunar(y, 2); if (ma && within(addDays(ma, -4), addDays(ma, 1))) return 'midautumn'; }
    if (has('christmas') && (m === 12 || (cc === 'ES' && m === 1 && d <= 6))) return 'christmas';   // Spain runs to the Three Kings
    if (has('halloween') && m === 10 && d >= 24) return 'halloween';
    if (has('carnival')) { const E = easter(y); if (within(addDays(E, -52), addDays(E, -46))) return 'carnival'; }
    if (has('santos') && m === 6) return 'santos';
    if (has('junina') && m === 6) return 'junina';
    if (has('thanksgiving')) { const tg = nthWeekday(y, 11, 4, 4); if (within(addDays(tg, -3), addDays(tg, 3))) return 'thanksgiving'; }
    if (has('july4') && m === 7 && d <= 4) return 'july4';
    if (has('bastille') && m === 7 && (d === 13 || d === 14)) return 'bastille';
    if (has('bonfire') && m === 11 && (d === 4 || d === 5)) return 'bonfire';
    return null;
  }
  // The Year Wrap: December shows the year so far, January the year just finished
  const wrapYear = (date = new Date()) => date.getMonth() === 0 ? date.getFullYear() - 1 : date.getFullYear();
  const wrapSeason = (date = new Date()) => date.getMonth() === 11 || date.getMonth() === 0;

  window.NX_HOL = { COUNTRIES, SEASONS, BY_COUNTRY, guessCountry, easter, holidays, holidayOn, isBusinessDay, nthLastBusinessDay, seasonFor, wrapYear, wrapSeason, iso };
})();
