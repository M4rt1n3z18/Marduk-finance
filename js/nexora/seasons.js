// Seasonal themes and the Year Wrap (design preview).
// Decorations stay at the edges — the header, the logo, the tops of cards — never
// over a figure. Movement (snow, bats, fireworks…) plays on the start screens and for
// about 10 seconds on the first open of the day, and not at all for people whose
// system asks for reduced motion.
(function () {
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (v, d = 0) => typeof eur === 'function' ? eur(v, d) : '€' + Math.round(v);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const PAL = {
    newyear: ['#FFD166', '#FFF4D6', '#F5B84B', '#FFFFFF'], july4: ['#FF4D5E', '#FFFFFF', '#4C7DFF'], bastille: ['#4C7DFF', '#FFFFFF', '#FF4D5E'],
    bonfire: ['#FF9F43', '#FFD166', '#FF6B3D'], carnival: ['#FF5A5F', '#FFD166', '#3DF5C0', '#5C8CFF', '#F28BFF', '#FF9F43'],
    festa: ['#FF5A5F', '#FFD166', '#3DF5C0', '#5C8CFF', '#F28BFF', '#FF9F43'], autumn: ['#E8743B', '#C8553D', '#F2A541', '#A0522D'],
    lanterns: ['#FF4B3E', '#FF6A3D', '#E8322B'], moon: ['#FFC24B', '#FF9F43', '#FFD98A'],
  };
  const palFor = season => PAL[season] || PAL[window.NX_HOL?.SEASONS[season]?.kit] || PAL.newyear;

  // ══════════════ STATIC DECORATIONS ══════════════
  const pattern = (id, w, h, body) => `<svg width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${body}</pattern></defs><rect width="100%" height="${h}" fill="url(#${id})"/></svg>`;
  const at = (left, html, top = 0) => `<span class="nx-sea-at" style="left:${left}%;top:${top}px">${html}</span>`;
  const qy = (t, y0, yc) => (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * yc + t * t * y0;   // a sagging string

  const spider = len => `<svg width="16" height="${len + 13}" viewBox="0 0 16 ${len + 13}"><path d="M8 0V${len}" stroke="currentColor" stroke-width=".8" opacity=".55"/>
    <g fill="currentColor"><ellipse cx="8" cy="${len + 5.5}" rx="3" ry="3.6"/><circle cx="8" cy="${len + 1.8}" r="1.9"/></g>
    <path d="M5.4 ${len + 3.6}l-3.6-2.4M5.2 ${len + 5.4}H1M5.4 ${len + 7.2}l-3.6 2.6M10.6 ${len + 3.6}l3.6-2.4M10.8 ${len + 5.4}H15M10.6 ${len + 7.2}l3.6 2.6" stroke="currentColor" stroke-width=".9" stroke-linecap="round"/></svg>`;
  const BAT_D = 'M12 10.2c-.5-1.2-1.4-1.9-2.3-2 .2-1.2-.2-2.4-1.2-3.1-.5 1.6-2 2.3-3.7 2C3.6 6.9 2.2 6 1 4.6c.3 2.6 1.7 4.7 3.8 5.5.4-.9 1.5-1.3 2.4-.6.5-.9 1.5-1.2 2.4-.6.6-.5 1.5-.5 2.1.1L12 10.2l.3-1.2c.6-.6 1.5-.6 2.1-.1.9-.6 1.9-.3 2.4.6.9-.7 2-.3 2.4.6 2.1-.8 3.5-2.9 3.8-5.5-1.2 1.4-2.6 2.3-4.3 2.5-1.7.3-3.2-.4-3.7-2-1 .7-1.4 1.9-1.2 3.1-.9.1-1.8.8-2.3 2zM11.1 7.6l-.5-1.6 1 .8h.8l1-.8-.5 1.6z';
  const bat = (w = 22) => `<svg width="${w}" height="${Math.round(w * .5)}" viewBox="0 2 24 12"><path d="${BAT_D}" fill="currentColor"/></svg>`;
  const lantern = (col = '#FF4B3E', s = 1) => `<svg width="${18 * s}" height="${28 * s}" viewBox="0 0 18 28"><path d="M9 0v4.5" stroke="#C99A2E" stroke-width="1"/>
    <ellipse cx="9" cy="13" rx="9" ry="8" fill="${col}" opacity=".22"/><rect x="5" y="4.2" width="8" height="2.2" rx=".8" fill="#E5B53A"/>
    <ellipse cx="9" cy="12.6" rx="7.4" ry="6.6" fill="${col}"/><path d="M9 6.2v12.8M5.4 6.9c-1.6 3.8-1.6 7.6 0 11.4M12.6 6.9c1.6 3.8 1.6 7.6 0 11.4" stroke="rgba(0,0,0,.18)" stroke-width=".8" fill="none"/>
    <rect x="5.6" y="18.6" width="6.8" height="2" rx=".7" fill="#E5B53A"/><path d="M9 20.6v6.6M7.6 21.2v5M10.4 21.2v5" stroke="#E5B53A" stroke-width=".8"/></svg>`;
  const star5 = (cx, cy, r, fill) => { let p = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; p += `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)} `; } return `<polygon points="${p}" fill="${fill}"/>`; };
  const leafPath = (x, y, s, rot, col) => `<path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 -6C3 -5 5 -2 4.4 1.4 3.6 4.4 1.4 5.6 0 6.6-1.4 5.6-3.6 4.4-4.4 1.4-5-2-3-5 0-6z" fill="${col}"/><path transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" d="M0 -5.5V6.5" stroke="rgba(0,0,0,.22)" stroke-width=".7"/>`;

  // A string of things hanging under the header
  const STRIP = {
    snow: () => pattern('nx-p-lights', 112, 22, `<path d="M0 3Q28 10 56 3Q84 10 112 3" fill="none" stroke="var(--nx-sea-wire)" stroke-width="1.1"/>` +
      [[14, '#FF5A5F'], [42, '#FFD166'], [70, '#3DF5C0'], [98, '#5C8CFF']].map(([x, c]) => { const y = qy(.25 + (x % 56 === 42 ? .5 : 0), 3, 10);
        return `<ellipse cx="${x}" cy="${y + 7}" rx="6" ry="7" fill="${c}" opacity=".16"/><rect x="${x - 1.3}" y="${y - .4}" width="2.6" height="2.6" rx=".6" fill="var(--nx-sea-wire)"/><ellipse cx="${x}" cy="${y + 5.6}" rx="2.6" ry="3.7" fill="${c}"/><ellipse cx="${x - .8}" cy="${y + 4.4}" rx=".7" ry="1.1" fill="#fff" opacity=".6"/>`; }).join('')),
    halloween: () => at(14, spider(14)) + at(31, bat(20), 8) + at(58, bat(16), 5) + at(74, spider(22)) + at(90, bat(22), 9),
    festa: () => { const C = PAL.festa; return pattern('nx-p-flags', 120, 22, `<path d="M0 1Q60 17 120 1" fill="none" stroke="var(--nx-sea-wire)" stroke-width=".9"/>` +
      [10, 30, 50, 70, 90, 110].map((x, i) => { const y = qy(x / 120, 1, 17); return `<path d="M${x - 5.6} ${y}L${x + 5.6} ${y}L${x} ${y + 10.5}z" fill="${C[i]}"/>`; }).join('')); },
    lanterns: () => at(9, lantern('#FF4B3E')) + at(27, lantern('#E8322B', .8)) + at(73, lantern('#E8322B', .8)) + at(91, lantern('#FF4B3E')),
    moon: () => at(12, lantern('#FFB03B', .8)) + at(88, lantern('#FF9F43', .8)),
    fireworks: season => { const C = palFor(season); return pattern('nx-p-stars-' + season, 90, 22, `<path d="M0 2Q45 13 90 2" fill="none" stroke="var(--nx-sea-wire)" stroke-width=".9"/>` +
      [.18, .5, .82].map((t, i) => { const x = 90 * t, y = qy(t, 2, 13); return `<path d="M${x} ${y}v${3 + i % 2 * 3}" stroke="var(--nx-sea-wire)" stroke-width=".7"/>${star5(x, y + 7 + i % 2 * 3, 3.6, C[i % C.length])}`; }).join('')); },
    confetti: () => { const C = PAL.carnival, bits = [[6, 3, 0], [17, 9, 40], [29, 4, 70], [40, 11, 120], [52, 5, 15], [63, 10, 80], [74, 3, 150], [85, 8, 30]];
      return pattern('nx-p-confetti', 96, 16, bits.map(([x, y, r], i) => i % 3 === 2 ? `<circle cx="${x}" cy="${y}" r="1.8" fill="${C[i % C.length]}"/>` : `<rect x="${x - 3}" y="${y - 1.4}" width="6" height="2.8" rx=".6" fill="${C[i % C.length]}" transform="rotate(${r} ${x} ${y})"/>`).join('')); },
    autumn: () => { const C = PAL.autumn; return pattern('nx-p-leaves', 100, 22, `<path d="M0 2Q50 12 100 2" fill="none" stroke="var(--nx-sea-wire)" stroke-width=".9"/>` +
      [.15, .4, .65, .9].map((t, i) => leafPath(100 * t, qy(t, 2, 12) + 7, .95, [-30, 25, -10, 40][i], C[i])).join('')); },
  };

  // Something beside the wordmark (and snow on the logo tile at Christmas)
  const LOGO = {
    snow: () => `<span class="nx-sea-cap"><svg width="32" height="11" viewBox="0 0 32 11"><path d="M1 7.5C1 3.8 3.6 2 7 2.4 9.2.6 12.4.2 15 1.4c2.4-1.2 6-1 8.2.8 3.6-.4 6.8 1.4 7.6 4.6.4 1.6-.4 3-1.8 3-1.2 0-1.4-1.6-2.6-1.6-1.4 0-1.6 2-3.2 2-1.4 0-1.6-1.4-2.8-1.4s-1.6 1.6-3 1.6c-1.6 0-1.8-1.8-3.2-1.8S9.4 10.6 7.8 10.6C6.4 10.6 6 9 4.6 9 3.2 9 3 10.4 1.8 10 1.2 9.6 1 8.6 1 7.5z" fill="var(--nx-sea-snow)"/></svg></span>
      <svg class="nx-sea-mark" width="19" height="23" viewBox="0 0 19 23"><path d="M9.5 5.2 14.6 11.2H4.4zM9.5 8.4l6.8 7.6H2.7zM9.5 12l8.2 8.2H1.3z" fill="#1E9E62"/><path d="M9.5 8.4 4.9 13.5h3zM9.5 12l-5.4 5.4h3.6z" fill="#3DF5C0" opacity=".35"/>
      <rect x="8.3" y="20.2" width="2.4" height="2.6" rx=".5" fill="#8C5A3C"/>${star5(9.5, 3.6, 2.6, '#FFD166')}
      <circle cx="7.6" cy="10.4" r=".95" fill="#FF5A5F"/><circle cx="11.6" cy="14.2" r=".95" fill="#FFD166"/><circle cx="6.4" cy="17.6" r=".95" fill="#5C8CFF"/><circle cx="13" cy="18.4" r=".95" fill="#FF5A5F"/></svg>`,
    halloween: () => `<svg class="nx-sea-mark" width="21" height="19" viewBox="0 0 21 19"><path d="M10.5 4.6c.2-1.8 1.2-3 2.8-3.6" stroke="#3E8E41" stroke-width="1.6" stroke-linecap="round" fill="none"/>
      <path d="M10.5 4.6C7.5 3.4 3.6 4 2 7.2.4 10.6 1.6 15.6 5.4 17.2c1.8.8 3.4.6 5.1-.2 1.7.8 3.3 1 5.1.2 3.8-1.6 5-6.6 3.4-10C17.4 4 13.5 3.4 10.5 4.6z" fill="#FF8A3D"/>
      <path d="M10.5 4.8c-1.6 3.4-1.6 8.6 0 12.2M6.2 5.4c-2 3.4-2 7.8.2 11.2M14.8 5.4c2 3.4 2 7.8-.2 11.2" stroke="#E0661F" stroke-width=".8" fill="none"/>
      <path d="M5.8 9.6 8 8.4l.6 2.4zM15.2 9.6 13 8.4l-.6 2.4zM5.6 13c1.2 1.6 3 2.4 4.9 2.4s3.7-.8 4.9-2.4l-1.6.6-.8-1-1.2 1.2-1.3-1-1.3 1-1.2-1.2-.8 1z" fill="#3B1D0E"/></svg>`,
    fireworks: season => { const C = palFor(season); return `<svg class="nx-sea-mark" width="20" height="20" viewBox="0 0 20 20">${Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4, x1 = 10 + Math.cos(a) * 3.4, y1 = 10 + Math.sin(a) * 3.4, x2 = 10 + Math.cos(a) * 8.6, y2 = 10 + Math.sin(a) * 8.6;
      return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${C[i % C.length]}" stroke-width="1.6" stroke-linecap="round"/><circle cx="${(10 + Math.cos(a + .4) * 6.2).toFixed(1)}" cy="${(10 + Math.sin(a + .4) * 6.2).toFixed(1)}" r=".7" fill="${C[(i + 1) % C.length]}"/>`; }).join('')}<circle cx="10" cy="10" r="1.8" fill="${C[0]}"/></svg>`; },
    confetti: () => `<svg class="nx-sea-mark" width="26" height="16" viewBox="0 0 26 16"><path d="M2 5.2C5.6 3.4 9.4 3.6 13 5.2c3.6-1.6 7.4-1.8 11 0-.2 4-2.4 7.2-6 7.2-2.2 0-3.6-1.4-5-3-1.4 1.6-2.8 3-5 3-3.6 0-5.8-3.2-6-7.2z" fill="#B55CFF"/>
      <ellipse cx="7.8" cy="7.4" rx="2.4" ry="1.5" fill="var(--bg)"/><ellipse cx="18.2" cy="7.4" rx="2.4" ry="1.5" fill="var(--bg)"/><path d="M3.4 4.6 1.6 1M5.6 3.8 5 .4M21 3.8l.8-3.2M23 4.6 25 1.4" stroke="#FFD166" stroke-width="1.2" stroke-linecap="round"/><circle cx="13" cy="4.4" r="1.1" fill="#3DF5C0"/></svg>`,
    festa: season => season === 'junina'
      ? `<svg class="nx-sea-mark" width="20" height="20" viewBox="0 0 20 20"><path d="M3 18.5 17 14.5M3 14.5l14 4" stroke="#8C5A3C" stroke-width="2.2" stroke-linecap="round"/><path d="M10 15c-3.4 0-4.8-2.6-3.8-5.4.6 1.2 1.4 1.6 2 1.4-.6-3 1-5.6 3.2-7.2-.2 2.2.6 3.6 1.8 4.6.6-.8.6-1.8.4-2.6 1.8 1.6 2.6 3.6 2.2 5.6-.4 2.2-2.2 3.6-5.8 3.6z" fill="#FF8A3D"/><path d="M10 15c-1.6 0-2.4-1.2-2-2.6.6.6 1.2.6 1.6.2-.2-1.6.6-2.8 1.8-3.6 0 1.2.4 1.8 1 2.4.6 1.6-.6 3.6-2.4 3.6z" fill="#FFD166"/></svg>`
      : `<svg class="nx-sea-mark" width="20" height="22" viewBox="0 0 20 22"><path d="M5.2 14h9.6l-1.3 7.2H6.5z" fill="#C8643B"/><rect x="4.6" y="13" width="10.8" height="2" rx=".6" fill="#B35530"/>
        <path d="M3.4 10.6C3.4 6.6 6.4 4 10 4s6.6 2.6 6.6 6.6c0 1.6-1 2.6-2.4 2.6H5.8c-1.4 0-2.4-1-2.4-2.6z" fill="#2FA84F"/><path d="M6 8.2h.01M9 6.8h.01M12.4 7.6h.01M14.2 10h.01M8 10.6h.01M11.2 10.4h.01" stroke="#1E7A38" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M13.4 6.2V.8" stroke="#8C5A3C" stroke-width=".8"/><path d="M13.4 1h4.4l-1.2 1.3 1.2 1.3h-4.4z" fill="#FF5A5F"/><circle cx="10" cy="4.6" r="1.6" fill="#FF5A5F"/></svg>`,
    autumn: () => `<svg class="nx-sea-mark" width="20" height="20" viewBox="0 0 20 20">${leafPath(10, 9, 1.35, -20, '#E8743B')}<path d="M10.6 15.6 12 19" stroke="#8C5A3C" stroke-width="1" stroke-linecap="round"/></svg>`,
    lanterns: () => `<span class="nx-sea-mark">${lantern('#FF4B3E', .72)}</span>`,
    moon: () => `<svg class="nx-sea-mark" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#FFD98A" opacity=".22"/><circle cx="10" cy="10" r="6.6" fill="#FFE7A8"/><circle cx="8" cy="8.4" r="1.3" fill="#F5CD6E"/><circle cx="12.4" cy="12" r="1.7" fill="#F5CD6E"/><circle cx="12" cy="7" r=".8" fill="#F5CD6E"/></svg>`,
  };

  // Props that sit in the empty bottom-right corner of the Overview's stat cards, and on the start screen
  const PUMPKIN = (id = 'a') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 42"><defs><filter id="pk${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4"/></filter></defs>
    <ellipse cx="24" cy="39.6" rx="17" ry="2.4" fill="#000" opacity=".2"/><path d="M23.6 10c-.3-3.6 1.4-6.6 4.8-7.8" stroke="#4E7D2E" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    <ellipse cx="13.6" cy="24.6" rx="11" ry="13.6" fill="#D85E17"/><ellipse cx="34.4" cy="24.6" rx="11" ry="13.6" fill="#D85E17"/><ellipse cx="24" cy="24.2" rx="12.6" ry="15" fill="#FF8A2B"/>
    <path d="M17.4 12.6c-2.6 6-2.6 17.4 0 23.4M30.6 12.6c2.6 6 2.6 17.4 0 23.4" stroke="#C9561A" stroke-width="1.1" fill="none" opacity=".75"/>
    <g fill="#FFB02E" filter="url(#pk${id})"><path d="M12.8 21.6 16.8 15l4 6.6zM27.2 21.6l4-6.6 4 6.6zM24 23.4l-2.3 3.6h4.6zM12.4 28.4c3.6 7.2 19.6 7.2 23.2 0l-3 1.6-1.6 2.4-2.4-1.8-2.2 2.6-2.4-2.4-2.4 2.4-2.2-2.6-2.4 1.8-1.6-2.4z"/></g>
    <g fill="#FFE07A"><path d="M12.8 21.6 16.8 15l4 6.6zM27.2 21.6l4-6.6 4 6.6zM24 23.4l-2.3 3.6h4.6zM12.4 28.4c3.6 7.2 19.6 7.2 23.2 0l-3 1.6-1.6 2.4-2.4-1.8-2.2 2.6-2.4-2.4-2.4 2.4-2.2-2.6-2.4 1.8-1.6-2.4z"/></g></svg>`;
  const PUMPKINS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 44"><g transform="translate(30 0) scale(1.05)">${PUMPKIN('b').replace(/<\/?svg[^>]*>/g, '')}</g><g transform="translate(0 14) scale(.68)">${PUMPKIN('c').replace(/<\/?svg[^>]*>/g, '')}</g></svg>`;
  const TREE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52"><ellipse cx="20" cy="49.6" rx="13" ry="2.2" fill="#000" opacity=".18"/><rect x="17.6" y="42" width="4.8" height="6.6" rx="1" fill="#8C5A3C"/>
    <path d="M20 6 30 19H10zM20 13l14 17H6zM20 22l17.5 21h-35z" fill="#1A9A5E"/><path d="M20 6 10 19h5zM20 13 6 30h6zM20 22 2.5 43H9z" fill="#2DC07E" opacity=".45"/>
    <path d="M12 26.5q8 4 16-1.5M8.6 37q11 5.5 23-1" stroke="#FFD166" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <circle cx="14.5" cy="21" r="1.6" fill="#FF5A5F"/><circle cx="25" cy="16.6" r="1.4" fill="#5C8CFF"/><circle cx="23" cy="32.4" r="1.7" fill="#FF5A5F"/><circle cx="12.6" cy="38.6" r="1.7" fill="#5C8CFF"/><circle cx="30" cy="39.6" r="1.7" fill="#FFD166"/><circle cx="18" cy="28" r="1.4" fill="#FFD166"/>
    ${star5(20, 5.6, 3.6, '#FFD166')}</svg>`;
  const GIFTS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 36"><ellipse cx="27" cy="34" rx="25" ry="2" fill="#000" opacity=".18"/>
    <rect x="37" y="10" width="14" height="23" rx="2" fill="#3DBE8F"/><rect x="42.6" y="10" width="2.8" height="23" fill="#FF5A5F"/><path d="M44 10c-3-4-6-4-6-1.6S41.4 10 44 10c2.6 0 6-.4 6-1.6s-3-2.4-6 1.6z" fill="#FF5A5F"/>
    <rect x="2" y="13" width="23" height="20" rx="2" fill="#FF5A5F"/><rect x="12" y="13" width="3" height="20" fill="#FFD166"/><rect x="2" y="20.6" width="23" height="3" fill="#FFD166"/>
    <path d="M13.5 13c-4-5.4-8.4-5-8.4-2.2s4.6 2.2 8.4 2.2c3.8 0 8.4.6 8.4-2.2s-4.4-3.2-8.4 2.2z" fill="#FFD166"/>
    <rect x="22" y="19" width="17" height="14" rx="2" fill="#5C8CFF"/><rect x="29" y="19" width="2.8" height="14" fill="#fff"/><rect x="22" y="24.6" width="17" height="2.6" fill="#fff"/></svg>`;
  const asUrl = svg => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}")`;
  const PROPS = { halloween: [PUMPKIN('d'), PUMPKINS], snow: [TREE, GIFTS] };
  // The mark beside each tab's title: the logo's mark as a stand-alone image
  const asImage = svg => svg.replace(/^<svg class="nx-sea-mark"/, '<svg xmlns="http://www.w3.org/2000/svg"').replace(/^<svg (?!xmlns)/, '<svg xmlns="http://www.w3.org/2000/svg" ');
  const MARK = { snow: () => TREE, halloween: () => PUMPKIN('m'), lanterns: () => asImage(lantern('#FF4B3E')),
                 fireworks: s => asImage(LOGO.fireworks(s)), confetti: () => asImage(LOGO.confetti()), festa: s => asImage(LOGO.festa(s)),
                 autumn: () => asImage(LOGO.autumn()), moon: () => asImage(LOGO.moon()) };

  let currentSeason = null;
  function apply(season) {
    currentSeason = season || null;
    const kit = season ? window.NX_HOL?.SEASONS[season]?.kit : null;
    if (kit) { document.body.dataset.kit = kit; document.body.dataset.season = season; }
    else { delete document.body.dataset.kit; delete document.body.dataset.season; }
    const [a, b] = PROPS[kit] || [];
    document.body.style.setProperty('--nx-prop-a', a ? asUrl(a) : 'none');
    document.body.style.setProperty('--nx-prop-b', b ? asUrl(b) : 'none');
    document.body.style.setProperty('--nx-sea-mark', kit && MARK[kit] ? asUrl(MARK[kit](season)) : 'none');
    const header = document.querySelector('#app-wrapper > header'), logo = document.querySelector('#app-wrapper .logo');
    header?.querySelector('.nx-sea-strip')?.remove();
    logo?.querySelectorAll('.nx-sea-logo').forEach(e => e.remove());
    if (!kit) return;
    header?.insertAdjacentHTML('beforeend', `<div class="nx-sea-strip nx-strip-${kit}" aria-hidden="true">${STRIP[kit](season)}</div>`);
    logo?.insertAdjacentHTML('beforeend', `<span class="nx-sea-logo" aria-hidden="true">${LOGO[kit](season)}</span>`);
  }

  // ══════════════ MOVEMENT ══════════════
  function inkFor(host) {
    const onBrand = !!host.closest?.('.nx-auth-brand'), light = document.body.dataset.theme === 'light';
    return { snow: onBrand || !light ? '#FFFFFF' : '#9DB4D8', bat: onBrand ? '#140E2A' : light ? '#2B2140' : '#B9A6FF', light: light && !onBrand };
  }
  const BAT_PATH = typeof Path2D !== 'undefined' ? new Path2D(BAT_D) : null;
  const SYSTEMS = {
    snow: ({ seed }) => {
      let seeded = !seed;
      const flake = (W, y) => { const r = rnd(.8, 3); return { x: rnd(0, W), y, r, vy: 14 + r * 14, ph: rnd(0, 6.28), amp: rnd(6, 22), o: rnd(.45, .95) }; };
      return {
        spawn(items, W, H) {
          const n = Math.round(Math.min(150, Math.max(40, W * H / 8500)));
          if (!seeded) { seeded = true; for (let i = 0; i < n; i++) items.push(flake(W, rnd(-10, H))); }
          else if (items.length < n && Math.random() < .5) items.push(flake(W, -6));
        },
        step(p, dt, W, H, ending) { p.y += p.vy * dt; p.ph += dt * .9; if (p.y > H + 6) { if (ending) return false; p.y = -6; p.x = rnd(0, W); } return true; },
        draw(c, p, ink) { c.globalAlpha = p.o; c.fillStyle = ink.snow; c.beginPath(); c.arc(p.x + Math.sin(p.ph) * p.amp, p.y, p.r, 0, 6.283); c.fill(); },
      };
    },
    // confetti, paper flags and leaves share one falling-and-fluttering body
    fall: ({ pal, shape, dense, slow }) => {
      let acc = 0;
      return {
        spawn(items, W, H, dt) {
          acc += dt * Math.min(dense ? 55 : 14, W / (dense ? 20 : 60)) * (slow ? .5 : 1);
          while (acc > 1) { acc--; items.push({ x: rnd(0, W), y: rnd(-30, -6), s: rnd(.8, 1.3), rot: rnd(0, 6.28), vr: rnd(-3, 3), vx: rnd(-18, 18), vy: slow ? rnd(35, 70) : rnd(70, 150), ph: rnd(0, 6.28), col: pick(pal), c: Math.random() < .25 }); }
        },
        step(p, dt, W, H) { p.y += p.vy * dt; p.x += p.vx * dt + Math.sin(p.ph) * (slow ? .9 : .4); p.rot += p.vr * dt; p.ph += dt * (slow ? 2.6 : 6); return p.y < H + 14; },
        draw(c, p) {
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.scale(p.s, p.s * Math.cos(p.ph)); c.fillStyle = p.col; c.globalAlpha = .95;
          if (shape === 'flag') { c.beginPath(); c.moveTo(-5, -4); c.lineTo(5, -4); c.lineTo(0, 6); c.closePath(); c.fill(); }
          else if (shape === 'leaf') { c.beginPath(); c.moveTo(0, -7); c.quadraticCurveTo(6.5, -1, 0, 7); c.quadraticCurveTo(-6.5, -1, 0, -7); c.fill(); c.strokeStyle = 'rgba(0,0,0,.2)'; c.lineWidth = .7; c.beginPath(); c.moveTo(0, -6); c.lineTo(0, 7); c.stroke(); }
          else if (p.c) { c.beginPath(); c.arc(0, 0, 3, 0, 6.283); c.fill(); }
          else c.fillRect(-4.5, -2, 9, 4);
          c.restore();
        },
      };
    },
    bats: ({ seed }) => {
      let wait = .1;
      return {
        spawn(items, W, H, dt) {
          wait -= dt;
          if (wait > 0 || items.length >= (seed ? 7 : 10)) return;
          wait = rnd(.5, 1.2);
          const left = Math.random() < .5;
          items.push({ x: left ? -50 : W + 50, y: rnd(H * .06, H * .6), dir: left ? 1 : -1, v: rnd(80, 160), s: seed ? rnd(24, 46) : rnd(20, 36), ph: rnd(0, 6), wob: rnd(10, 36), t: 0 });
        },
        step(p, dt, W) { p.x += p.dir * p.v * dt; p.ph += dt * 12; p.t += dt; return p.dir > 0 ? p.x < W + 60 : p.x > -60; },
        draw(c, p, ink) {
          if (!BAT_PATH) return;
          c.save(); c.translate(p.x, p.y + Math.sin(p.t * 2.2) * p.wob); c.scale(p.dir * p.s / 24, p.s / 24 * (.45 + .55 * Math.abs(Math.sin(p.ph))));
          c.translate(-12, -8); c.fillStyle = ink.bat; c.globalAlpha = .92; c.fill(BAT_PATH); c.restore();
        },
      };
    },
    fireworks: ({ pal }) => {
      let wait = .15;
      return {
        spawn(items, W, H, dt) {
          wait -= dt;
          if (wait > 0) return;
          wait = rnd(.45, 1.1);
          const apex = rnd(H * .12, H * .45), t = rnd(.9, 1.3);
          items.push({ k: 'r', x: rnd(W * .12, W * .88), y: H + 4, vy: -(H + 4 - apex) / t, apex, col: pick(pal), px: 0, py: H + 4 });
        },
        step(p, dt, W, H, ending, add) {
          p.px = p.x; p.py = p.y;
          if (p.k === 'r') {
            p.y += p.vy * dt;
            if (p.y > p.apex) return true;
            const n = Math.round(rnd(46, 72)), sp = rnd(90, 170);
            for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = sp * rnd(.35, 1); add({ k: 's', x: p.x, y: p.y, px: p.x, py: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(1, 1.7), max: 1.7, col: Math.random() < .2 ? '#FFFFFF' : p.col }); }
            return false;
          }
          p.vx *= .982; p.vy = p.vy * .982 + 55 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
          return p.life > 0;
        },
        draw(c, p) {
          c.globalCompositeOperation = 'lighter';
          c.strokeStyle = p.col; c.globalAlpha = p.k === 'r' ? .9 : Math.max(0, p.life / p.max);
          c.lineWidth = p.k === 'r' ? 2 : 1.6; c.lineCap = 'round';
          c.beginPath(); c.moveTo(p.px, p.py + (p.k === 'r' ? 6 : 0)); c.lineTo(p.x, p.y); c.stroke();
          c.globalCompositeOperation = 'source-over';
        },
      };
    },
    lanterns: ({ pal }) => {
      let wait = 0;
      return {
        spawn(items, W, H, dt) {
          wait -= dt;
          if (wait > 0 || items.length >= 22) return;
          wait = rnd(.45, 1);
          items.push({ x: rnd(0, W), y: H + 24, s: rnd(7, 16), vy: -rnd(16, 36), ph: rnd(0, 6), amp: rnd(4, 14), fl: rnd(0, 6), col: pick(pal) });
        },
        step(p, dt) { p.y += p.vy * dt; p.ph += dt * .7; p.fl += dt * 9; return p.y > -40; },
        draw(c, p) {
          const x = p.x + Math.sin(p.ph) * p.amp, w = p.s, h = p.s * 1.3, a = .82 + .18 * Math.sin(p.fl);
          const g = c.createRadialGradient(x, p.y, 0, x, p.y, w * 2.2); g.addColorStop(0, 'rgba(255,170,80,' + (.35 * a) + ')'); g.addColorStop(1, 'rgba(255,120,60,0)');
          c.globalAlpha = 1; c.fillStyle = g; c.fillRect(x - w * 2.2, p.y - w * 2.2, w * 4.4, w * 4.4);
          c.globalAlpha = a; c.fillStyle = p.col; c.beginPath(); c.roundRect ? c.roundRect(x - w / 2, p.y - h / 2, w, h, w * .35) : c.rect(x - w / 2, p.y - h / 2, w, h); c.fill();
          c.fillStyle = 'rgba(255,230,160,.85)'; c.fillRect(x - w * .22, p.y + h / 2 - 1.6, w * .44, 1.6);
        },
      };
    },
  };
  function systemFor(kit, season, opts) {
    switch (kit) {
      case 'snow': return SYSTEMS.snow(opts);
      case 'halloween': return SYSTEMS.bats(opts);
      case 'fireworks': return SYSTEMS.fireworks({ ...opts, pal: palFor(season) });
      case 'confetti': return SYSTEMS.fall({ ...opts, pal: PAL.carnival });
      case 'festa': return SYSTEMS.fall({ ...opts, pal: PAL.festa, shape: 'flag', slow: true });
      case 'autumn': return SYSTEMS.fall({ ...opts, pal: PAL.autumn, shape: 'leaf', slow: true });
      case 'lanterns': return SYSTEMS.lanterns({ ...opts, pal: PAL.lanterns });
      case 'moon': return SYSTEMS.lanterns({ ...opts, pal: PAL.moon });
    }
    return null;
  }

  // Runs a particle system in a canvas over `host`; seconds = 0 runs until the host goes away.
  // Capped at ~30 fps and paused while the window is hidden.
  function particles(host, season, { seconds = 0, seed = false, dense = false } = {}) {
    const kit = window.NX_HOL?.SEASONS[season]?.kit;
    if (!host || !kit || reduceMotion()) return () => {};
    const sys = systemFor(kit, season, { seed, dense });
    if (!sys) return () => {};
    const fixed = host === document.body;
    const cv = Object.assign(document.createElement('canvas'), { className: 'nx-sea-canvas' + (fixed ? ' nx-sea-fixed' : '') });
    cv.setAttribute('aria-hidden', 'true');
    host.appendChild(cv);
    const ctx = cv.getContext('2d');
    let W = 0, H = 0;
    const size = () => {
      const r = fixed ? { width: innerWidth, height: innerHeight } : host.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size); ro.observe(fixed ? document.documentElement : host);
    let items = [], last = performance.now(), drawn = 0, raf = 0, stopped = false;
    const start = last, ink = inkFor(host);
    const stop = () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); ro.disconnect(); cv.remove(); };
    const frame = now => {
      if (stopped) return;
      if (!cv.isConnected) return stop();
      raf = requestAnimationFrame(frame);
      if (document.hidden || now - drawn < 32) return;
      const dt = Math.min(.05, (now - last) / 1000); last = drawn = now;
      const t = (now - start) / 1000, ending = seconds > 0 && t > seconds;
      if (ending && t > seconds + 1.6) return stop();
      if (!ending) sys.spawn(items, W, H, dt);
      const born = [];
      items = items.filter(p => sys.step(p, dt, W, H, ending, q => born.push(q)));
      if (born.length) items.push(...born);
      ctx.clearRect(0, 0, W, H);
      cv.style.opacity = ending ? String(Math.max(0, 1 - (t - seconds) / 1.6)) : '1';
      for (const p of items) sys.draw(ctx, p, ink);
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return stop;
  }

  // ~10 s over the app, once a day (force = the preview's theme picker)
  let stopGreet = null;
  function greet(season, { force = false } = {}) {
    if (!season) return;
    const today = window.NX_HOL.iso(new Date());
    let seen = null; try { seen = localStorage.getItem('nexora_season_seen'); } catch (e) {}
    if (!force && seen === today + season) return;
    try { localStorage.setItem('nexora_season_seen', today + season); } catch (e) {}
    stopGreet?.();
    stopGreet = particles(document.body, season, { seconds: 10, dense: true });
  }
  // Continuous, behind the start screens' brand panel
  const BRAND = {
    halloween: () => `<div class="nx-bd-moon"></div><div class="nx-bd-scene nx-bd-pumpkins"><span style="width:44px">${PUMPKIN('e')}</span><span style="width:78px">${PUMPKIN('f')}</span><span style="width:52px">${PUMPKIN('g')}</span></div>`,
    moon: () => `<div class="nx-bd-moon nx-bd-moon-warm"></div><div class="nx-bd-hang">${[18, 46, 78].map((l, i) => at(l, lantern(['#FFB03B', '#FF9F43', '#FFC24B'][i], 1.6 - i % 2 * .4))).join('')}</div>`,
    lanterns: () => `<div class="nx-bd-hang">${[14, 38, 64, 88].map((l, i) => at(l, lantern(i % 2 ? '#E8322B' : '#FF4B3E', i % 2 ? 1.3 : 1.8))).join('')}</div>`,
    snow: () => `<svg class="nx-bd-drift" viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 34C40 22 70 30 104 26S170 12 214 22 290 36 330 24 380 16 400 22V60H0z" fill="#fff" opacity=".9"/><path d="M0 46C50 38 90 44 140 40S240 30 290 40 370 48 400 42V60H0z" fill="#EAF1FF"/></svg>
      <div class="nx-bd-scene nx-bd-xmas"><span style="width:58px">${TREE}</span><span style="width:84px">${TREE}</span><span style="width:76px">${GIFTS}</span></div>`,
    festa: season => `<div class="nx-bd-flags">${STRIP.festa(season)}</div>`,
  };
  function onBrand(el, season) {
    if (!el) return;
    el.querySelectorAll('.nx-brand-deco').forEach(e => e.remove());
    const kit = season ? window.NX_HOL?.SEASONS[season]?.kit : null;
    if (kit && BRAND[kit]) el.insertAdjacentHTML('afterbegin', `<div class="nx-brand-deco" aria-hidden="true">${BRAND[kit](season)}</div>`);
    if (season && !el.querySelector('.nx-sea-canvas')) particles(el, season, { seed: true });
  }

  // ══════════════ YEAR WRAP ══════════════
  const SLIDE_MS = 7000;
  const fmtv = (v, f) => f === 'eur' ? money(v) : f === 'signed' ? (v >= 0 ? '+' : '−') + money(Math.abs(v)) : f === 'pct' ? Math.round(v) + '%' : f === 'spct' ? (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)) + '%' : String(Math.round(v));
  const big = (v, f = 'eur', cls = '') => `<div class="w-big ${cls}" data-count="${v}" data-fmt="${f}">${fmtv(v, f)}</div>`;
  const chip = (label, value, sub = '') => `<div class="w-chip"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const ring = pct => { const r = 34, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct)) / 100;
    return `<svg class="w-ring-svg" width="88" height="88" viewBox="0 0 88 88"><circle cx="44" cy="44" r="${r}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="9"/><circle class="w-ring-arc" cx="44" cy="44" r="${r}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 44 44)" style="--len:${(c * p).toFixed(1)}"/></svg>`; };
  const spark = pts => {
    if (!pts || pts.length < 2) return '';
    const w = 300, h = 70, lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
    const xy = pts.map((v, i) => [i / (pts.length - 1) * w, h - 6 - (v - lo) / span * (h - 12)]);
    const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    return `<svg class="w-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}L${w} ${h}L0 ${h}z" fill="rgba(255,255,255,.14)"/><path class="w-spark-line" pathLength="1" d="${d}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="${xy.at(-1)[0]}" cy="${xy.at(-1)[1]}" r="4" fill="#fff"/></svg>`;
  };

  function wrapSlides(d) {
    const S = [], m = i => `<span>${MONTHS[i]}</span>`;
    S.push({ c: 'intro', h: `<div class="w-emblem w-mark"></div><div class="w-kicker">Nexora</div><div class="w-year" data-no-tr>${d.year}</div>
      <div class="w-h">Your year in money</div><div class="w-sub">${d.partial ? `<span>So far:</span> ${m(d.from)} – ${m(d.to)}` : `${m(0)} – ${m(11)}`}</div>
      <div class="w-hint">Click or use the arrow keys</div>` });
    if (d.income.total > 0) S.push({ c: 'blue', h: `<div class="w-kicker">You brought in</div>${big(d.income.total)}<div class="w-sub">salary and extra income</div>
      <div class="w-chips">${chip('Salary', money(d.income.salary))}${chip('Extra income', money(d.income.extra))}</div>` });
    if (d.spent.total > 0) S.push({ c: 'coral', h: `<div class="w-kicker">You spent</div>${big(d.spent.total)}
      <div class="w-chips">${d.spent.top ? chip('Busiest month', money(d.spent.top.amount), m(d.spent.top.m)) : ''}${chip('A typical month', money(d.spent.avg))}</div>` });
    if (d.cats.length) { const max = d.cats[0].amount;
      S.push({ c: 'violet', h: `<div class="w-kicker">Most of it went to</div><div class="w-big w-word">${escH(d.cats[0].cat)}</div>
        <div class="w-sub"><b>${Math.round(d.cats[0].share)}%</b> <span>of everything you spent</span></div>
        <div class="w-bars">${d.cats.map((c, i) => `<div class="w-bar" style="--i:${i}"><span>${escH(c.cat)}</span><i><em style="width:${(c.amount / max * 100).toFixed(1)}%"></em></i><b>${money(c.amount)}</b></div>`).join('')}</div>` }); }
    if (d.place) S.push({ c: 'mint', h: `<div class="w-kicker">Your most visited place</div><div class="w-big w-word" data-no-tr>${escH(d.place.name)}</div>
      <div class="w-sub"><b>${d.place.visits}</b> <span>visits</span> · <b>${money(d.place.total)}</b> <span>in total</span></div>` });
    if (d.income.total > 0 && d.spent.total > 0) S.push(d.kept.amount >= 0
      ? { c: 'green', h: `<div class="w-kicker">You kept</div>${big(d.kept.amount)}<div class="w-ring">${ring(d.kept.rate)}<div><b data-count="${d.kept.rate}" data-fmt="pct">${Math.round(d.kept.rate)}%</b><span>of what came in</span></div></div>` }
      : { c: 'coral', h: `<div class="w-kicker">More went out than came in</div>${big(-d.kept.amount)}<div class="w-sub">A fresh page starts every month.</div>` });
    if (d.invest) S.push({ c: 'indigo', h: `<div class="w-kicker">Your portfolios are worth</div>${big(d.invest.value)}
      <div class="w-chips">${d.invest.invested > 0 ? chip('Invested this year', money(d.invest.invested)) : ''}${d.invest.dividends > 0 ? chip('Dividends this year', money(d.invest.dividends, 2)) : ''}
      ${d.invest.best ? chip('Best performer', `<span data-no-tr>${escH(d.invest.best.ticker)}</span> <em>${fmtv(d.invest.best.pct, 'spct')}</em>`, '<span>since you bought it</span>') : ''}</div>` });
    if (d.nw) S.push({ c: 'sky', h: `<div class="w-kicker">Your net worth</div>${big(d.nw.now)}
      <div class="w-sub"><b>${fmtv(d.nw.change, 'signed')}</b> <span>this year</span></div>${spark(d.nw.points)}` });
    if (d.goals.length) { const done = d.goals.filter(g => g.pct >= 100).length;
      S.push({ c: 'amber', h: `<div class="w-kicker">Your goals</div><div class="w-big"><span data-count="${done}" data-fmt="int">${done}</span><small>/${d.goals.length}</small></div><div class="w-sub">goals reached</div>
        <div class="w-goals">${d.goals.map((g, i) => `<div class="w-goal" style="--i:${i}"><span data-no-tr>${escH(g.name)}</span><i><em style="width:${Math.min(100, g.pct).toFixed(1)}%"></em></i><b>${Math.round(g.pct)}%</b></div>`).join('')}</div>` }); }
    S.push({ c: 'outro', h: `<div class="w-kicker">That was your</div><div class="w-year" data-no-tr>${d.year}</div>
      <div class="w-grid">${chip('Brought in', money(d.income.total))}${chip('Spent', money(d.spent.total))}${chip('Kept', money(d.kept.amount))}${d.nw ? chip('Net worth', fmtv(d.nw.change, 'signed')) : ''}</div>
      <div class="w-sub">${d.partial ? 'The year isn’t over yet — there’s still time to make it count.' : `<span>See you in</span> <b data-no-tr>${d.year + 1}</b>`}</div>
      <div class="w-btns"><button type="button" data-w="again">Watch again</button><button type="button" data-w="close" class="w-primary">Close</button></div>` });
    return S;
  }

  let wrap = null;
  function openWrap(d) {
    closeWrap();
    const slides = wrapSlides(d);
    const el = document.createElement('div');
    el.id = 'nx-wrap';
    el.innerHTML = `<div class="nx-wrap-card" role="dialog" aria-label="Your year in Nexora">
      <div class="w-prog">${slides.map(() => '<span><i></i></span>').join('')}</div>
      <button type="button" class="w-x" data-w="close" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      ${slides.map((s, i) => `<section class="w-slide w-${s.c}" data-i="${i}"><div class="w-deco"><i></i><i></i></div><div class="w-in">${s.h}</div></section>`).join('')}
    </div>`;
    document.body.appendChild(el);
    wrap = { el, n: slides.length, i: -1, keys: null };
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-w]');
      if (b) { if (b.dataset.w === 'close') closeWrap(); else go(0); return; }
      if (e.target === el) return closeWrap();
      if (!e.target.closest('.nx-wrap-card')) return;
      const r = el.querySelector('.nx-wrap-card').getBoundingClientRect();
      go(wrap.i + (e.clientX < r.left + r.width * .3 ? -1 : 1));
    });
    el.querySelector('.w-prog').addEventListener('animationend', e => { if (e.target.closest('span')?.classList.contains('on') && wrap.i < wrap.n - 1) go(wrap.i + 1); });
    wrap.keys = e => { if (e.key === 'Escape') closeWrap(); else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(wrap.i + 1); } else if (e.key === 'ArrowLeft') go(wrap.i - 1); };
    document.addEventListener('keydown', wrap.keys);
    requestAnimationFrame(() => el.classList.add('open'));
    go(0);
  }
  function go(i) {
    if (!wrap) return;
    i = Math.max(0, Math.min(wrap.n - 1, i));
    wrap.i = i;
    wrap.el.querySelectorAll('.w-slide').forEach((s, k) => s.classList.toggle('on', k === i));
    wrap.el.querySelectorAll('.w-prog span').forEach((s, k) => { s.classList.toggle('done', k < i); s.classList.remove('on'); if (k === i) { void s.offsetWidth; s.classList.add('on'); } });
    wrap.el.querySelector('.w-prog').style.setProperty('--dur', SLIDE_MS + 'ms');
    countUp(wrap.el.querySelector(`.w-slide[data-i="${i}"]`));
  }
  function countUp(slide) {
    slide?.querySelectorAll('[data-count]').forEach(el => {
      const to = +el.dataset.count, f = el.dataset.fmt;
      if (reduceMotion()) { el.textContent = fmtv(to, f); return; }
      const t0 = performance.now(), ms = 1100;
      const tick = now => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmtv(to * e, f); if (k < 1 && el.isConnected) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }
  function closeWrap() {
    if (!wrap) return;
    document.removeEventListener('keydown', wrap.keys);
    const el = wrap.el; wrap = null;
    el.classList.remove('open'); setTimeout(() => el.remove(), 260);
  }

  window.NX_SEASONS = { apply, particles, greet, onBrand, openWrap, closeWrap, current: () => currentSeason };
})();
