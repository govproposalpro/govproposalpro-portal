/*
 * "See pricing" sheet on the VSL sales page: the Core, Enterprise and Compare one-pagers as a
 * full-screen bento view with buy buttons. Opened by any [data-plans] link (data-plans="core",
 * "enterprise" or "compare") and by /plans, /pricing or #plans. Built here from static data, so
 * watch.html only carries the trigger links. Must load before site.js: site.js binds the
 * [data-checkout] buttons this file creates. Feature names and limits follow src/app/tiers.js.
 */
(function () {
  'use strict';
  var ICONS = {"sparkles":"<path d=\"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z\" /><path d=\"M20 3v4\" /><path d=\"M22 5h-4\" /><path d=\"M4 17v2\" /><path d=\"M5 18H3\" />","file-search":"<path d=\"M14 2v4a2 2 0 0 0 2 2h4\" /><path d=\"M4.268 21a2 2 0 0 0 1.727 1H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3\" /><path d=\"m9 18-1.5-1.5\" /><circle cx=\"5\" cy=\"14\" r=\"3\" />","gauge":"<path d=\"m12 14 4-4\" /><path d=\"M3.34 19a10 10 0 1 1 17.32 0\" />","scan-eye":"<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" /><path d=\"M17 3h2a2 2 0 0 1 2 2v2\" /><path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" /><path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" /><circle cx=\"12\" cy=\"12\" r=\"1\" /><path d=\"M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0\" />","trophy":"<path d=\"M6 9H4.5a2.5 2.5 0 0 1 0-5H6\" /><path d=\"M18 9h1.5a2.5 2.5 0 0 0 0-5H18\" /><path d=\"M4 22h16\" /><path d=\"M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22\" /><path d=\"M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22\" /><path d=\"M18 2H6v7a6 6 0 0 0 12 0V2Z\" />","square-kanban":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /><path d=\"M8 7v7\" /><path d=\"M12 7v4\" /><path d=\"M16 7v9\" />","radar":"<path d=\"M19.07 4.93A10 10 0 0 0 6.99 3.34\" /><path d=\"M4 6h.01\" /><path d=\"M2.29 9.62A10 10 0 1 0 21.31 8.35\" /><path d=\"M16.24 7.76A6 6 0 1 0 8.23 16.67\" /><path d=\"M12 18h.01\" /><path d=\"M17.99 11.66A6 6 0 0 1 15.77 16.67\" /><circle cx=\"12\" cy=\"12\" r=\"2\" /><path d=\"m13.41 10.59 5.66-5.66\" />","bell-ring":"<path d=\"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9\" /><path d=\"M10.3 21a1.94 1.94 0 0 0 3.4 0\" /><path d=\"M4 2C2.8 3.7 2 5.7 2 8\" /><path d=\"M22 8c0-2.3-.8-4.3-2-6\" />","graduation-cap":"<path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\" /><path d=\"M22 10v6\" /><path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\" />","megaphone":"<path d=\"m3 11 18-5v12L3 14v-3z\" /><path d=\"M11.6 16.8a3 3 0 1 1-5.8-1.6\" />","truck":"<path d=\"M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2\" /><path d=\"M15 18H9\" /><path d=\"M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14\" /><circle cx=\"17\" cy=\"18\" r=\"2\" /><circle cx=\"7\" cy=\"18\" r=\"2\" />","send":"<path d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\" /><path d=\"m21.854 2.147-10.94 10.939\" />","calculator":"<rect width=\"16\" height=\"20\" x=\"4\" y=\"2\" rx=\"2\" /><line x1=\"8\" x2=\"16\" y1=\"6\" y2=\"6\" /><line x1=\"16\" x2=\"16\" y1=\"14\" y2=\"18\" /><path d=\"M16 10h.01\" /><path d=\"M12 10h.01\" /><path d=\"M8 10h.01\" /><path d=\"M12 14h.01\" /><path d=\"M8 14h.01\" /><path d=\"M12 18h.01\" /><path d=\"M8 18h.01\" />","folder-search":"<path d=\"M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1\" /><path d=\"m21 21-1.9-1.9\" /><circle cx=\"17\" cy=\"17\" r=\"3\" />","clipboard-check":"<rect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\" /><path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\" /><path d=\"m9 14 2 2 4-4\" />","check":"<path d=\"M20 6 9 17l-5-5\" />","bot":"<path d=\"M12 8V4H8\" /><rect width=\"16\" height=\"12\" x=\"4\" y=\"8\" rx=\"2\" /><path d=\"M2 14h2\" /><path d=\"M20 14h2\" /><path d=\"M15 13v2\" /><path d=\"M9 13v2\" />","target":"<circle cx=\"12\" cy=\"12\" r=\"10\" /><circle cx=\"12\" cy=\"12\" r=\"6\" /><circle cx=\"12\" cy=\"12\" r=\"2\" />","list-checks":"<path d=\"m3 17 2 2 4-4\" /><path d=\"m3 7 2 2 4-4\" /><path d=\"M13 6h8\" /><path d=\"M13 12h8\" /><path d=\"M13 18h8\" />","scale":"<path d=\"m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z\" /><path d=\"m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z\" /><path d=\"M7 21h10\" /><path d=\"M12 3v18\" /><path d=\"M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2\" />","file-question":"<path d=\"M12 17h.01\" /><path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z\" /><path d=\"M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3\" />","shield-check":"<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" /><path d=\"m9 12 2 2 4-4\" />","shield-alert":"<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" /><path d=\"M12 8v4\" /><path d=\"M12 16h.01\" />","handshake":"<path d=\"m11 17 2 2a1 1 0 1 0 3-3\" /><path d=\"m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4\" /><path d=\"m21 3 1 11h-2\" /><path d=\"M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3\" /><path d=\"M3 4h8\" />","layers":"<path d=\"m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z\" /><path d=\"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65\" /><path d=\"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65\" />","award":"<path d=\"m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526\" /><circle cx=\"12\" cy=\"8\" r=\"6\" />","activity":"<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\" />","map":"<path d=\"M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z\" /><path d=\"M15 5.764v15\" /><path d=\"M9 3.236v15\" />","user-plus":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\" /><circle cx=\"9\" cy=\"7\" r=\"4\" /><line x1=\"19\" x2=\"19\" y1=\"8\" y2=\"14\" /><line x1=\"22\" x2=\"16\" y1=\"11\" y2=\"11\" />","crown":"<path d=\"M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z\" /><path d=\"M5 21h14\" />","search-check":"<path d=\"m8 11 2 2 4-4\" /><circle cx=\"11\" cy=\"11\" r=\"8\" /><path d=\"m21 21-4.3-4.3\" />","flag":"<path d=\"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z\" /><line x1=\"4\" x2=\"4\" y1=\"22\" y2=\"15\" />","x":"<path d=\"M18 6 6 18\" /><path d=\"m6 6 12 12\" />","download":"<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /><polyline points=\"7 10 12 15 17 10\" /><line x1=\"12\" x2=\"12\" y1=\"15\" y2=\"3\" />","wallet":"<path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\" /><path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\" />"};

  function ico(name, tone, cls) {
    return '<svg class="pl-ico ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="url(#pl-g-' + (tone || 'grad') + ')" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  // Tile fields, drawn in this order: icon, eyebrow, big, num(+unit), pill, h, p, chips, sub, list.
  var CORE = [
    { a: 'eng', cls: 'pl-hero pl-blue', icon: 'sparkles', tone: 'white', eyebrow: 'AI Proposal Engine', big: 'Upload the solicitation. It does the rest.',
      p: 'The brief, Go/No-Go, subs, pricing and a formatted, compliant proposal with PDF and Word export. FAR clauses come only from your solicitation.', chips: ['Decrypt', 'Score', 'Source subs', 'Price', 'Write'] },
    { a: 'dec', icon: 'file-search', tone: 'blue', h: 'AI Bid Decryptor', p: 'Any RFP as a 1-page brief' },
    { a: 'gng', icon: 'gauge', tone: 'red', h: 'Go/No\u2011Go Indicator', p: 'Bid or skip, scored' },
    { a: 'first', cls: 'pl-hero pl-red pl-top', eyebrow: 'Beginner friendly', mid: 'First Win Path', p: 'From your LLC to your first award, one checklist that ticks itself off as you work.', chips: ['LLC', 'SAM.gov', 'First bid', 'First award'] },
    { a: 'mark', cls: 'pl-mark', eyebrow: 'Core Edition', mid: 'Win compliant bids, fast.' },
    { a: 'xray', icon: 'scan-eye', h: 'Competition X\u2011Ray', p: 'Who won it before, and for how much' },
    { a: 'easy', icon: 'trophy', tone: 'blue', h: 'Easy Wins Feed', p: 'Quick RFQs and buyers to call' },
    { a: 'ten', eyebrow: 'Up to', pill: '10', pillCls: 'pl-pill-blue', h: 'proposals a month' },
    { a: 'crm', icon: 'square-kanban', h: 'Visual Bid CRM', p: 'Every bid on one board' },
    { a: 'rec', icon: 'radar', tone: 'red', h: 'Recompete Radar', p: 'Contracts ending soon in your NAICS (preview)' },
    { a: 'amd', icon: 'bell-ring', tone: 'blue', h: 'Amendment Watch', p: 'Daily checks, plain\u2011English changes' },
    { a: 'coach', icon: 'graduation-cap', h: 'GovCon Coach', pill: '25', pillCls: 'pl-pill-mix pl-pill-sm', p: 'questions a day' },
    { a: 'ss', icon: 'megaphone', h: 'Sources\u2011Sought Responder', p: 'Get on the buyer’s radar early' },
    { a: 'subs', cls: 'pl-wide', eyebrow: 'Subs and pricing', h: 'Find the subs. Price for profit.', sub: [
      ['truck', 'blue', 'Smart Vendor Scraper', 'Local subs from SAM.gov'], ['send', 'red', '1-Click Outreach', 'Quote requests, written'],
      ['calculator', 'red', 'Profit Pricing Matrix', 'Your margin, built in'], ['folder-search', 'blue', 'FOIA Automator', 'Get past winning bids']] },
    { a: 'pf', icon: 'clipboard-check', tone: 'blue', h: 'Submission Preflight', p: 'Pass, warn, fail before you send' },
    { a: 'plus', cls: 'pl-left', eyebrow: 'Also included', list: ['Milestone tracker', 'SF-1034 invoicing', 'Capability statement', 'CMMC Level 1 readiness', 'FAR 52.219-14 checker', 'SAM.gov checklist', 'Deadline alerts + calendar'] },
  ];
  var ENT = [
    { a: 'ap', cls: 'pl-hero pl-mix', icon: 'bot', tone: 'white', eyebrow: 'GovCon Autopilot', big: 'Finds. Quotes. Prices. Writes.',
      p: 'It learns your business, surfaces public SAM.gov opportunities on your daily quota, emails vendors for quotes from your mailbox, checks real market prices and prices the bid from your profit margin.', chips: ['Learns your NAICS', 'Vendor quotes', 'Market price check', 'Your margin'] },
    { a: 'match', icon: 'target', tone: 'blue', h: 'Predictive Bid Matchmaker', p: 'Daily matches for your NAICS' },
    { a: 'secm', icon: 'list-checks', tone: 'red', h: 'Section M Grader', p: 'Self-audits against the evaluation criteria' },
    { a: 'legal', icon: 'scale', tone: 'red', h: 'Auto-Teaming Legal', p: 'NDAs and teaming agreements, ready to sign' },
    { a: 'rfi', icon: 'file-question', tone: 'blue', h: 'RFI Ghostwriter', p: 'Sharp questions to the CO' },
    { a: 'mark', cls: 'pl-mark', eyebrow: 'Enterprise Edition', mid: 'Your GovCon command center.' },
    { a: 'fifty', eyebrow: 'Up to', pill: '50', pillCls: 'pl-pill-mix', h: 'proposals a month', p: '5x Core' },
    { a: 'sub', icon: 'shield-check', h: 'Sub-Safe Vetting', p: 'Screens subs against SAM.gov exclusions' },
    { a: 'wd', icon: 'shield-alert', tone: 'red', h: 'Compliance Watchdog', p: 'Weekly re-checks of every sub' },
    { a: 'tpf', icon: 'handshake', tone: 'blue', h: 'Teaming Partner Finder', p: 'Primes and partners in your lane' },
    { a: 'cash', cls: 'pl-hero pl-blue pl-vc', eyebrow: 'Cash-Flow Autopilot', num: '30', unit: 'days', p: 'Tracks the Prompt Payment clock on every invoice, what you owe your subs and when, and your biggest cash gap.' },
    { a: 'core', icon: 'layers', h: 'Everything in Core', p: 'All Core tools, with the full Recompete Radar and Fringe/G&A pricing' },
    { a: 'pp', cls: 'pl-hero pl-red pl-vc', icon: 'award', tone: 'white', mid: 'Past Performance Portfolio Builder', p: 'Turns won contracts into case studies, and Winning Voice writes new bids in the style of your past winners.' },
    { a: 'plus', cls: 'pl-wide', eyebrow: 'Also in Enterprise', sub: [
      ['activity', 'red', 'Compliance Pulse', 'Federal Register changes'], ['map', 'blue', 'Per-State Directory', 'Plus state and local'],
      ['radar', 'blue', 'Full Recompete Radar', 'Every expiring contract'], ['graduation-cap', 'red', 'GovCon Coach', '75 questions a day']] },
    { a: 'team', icon: 'user-plus', h: 'Team Login', pill: '+1', pillCls: 'pl-pill-red pl-pill-sm', p: 'seat for a VA or partner' },
  ];
  // [name, kind, note]: kind 'ent' = Enterprise only, 'more' = both, more on Enterprise.
  var GROUPS = [
    ['Find work', 'search-check', [['First Win Path'], ['Easy Wins Feed + buyers to call'], ['Competition X\u2011Ray'], ['Sources-Sought Responder'],
      ['Recompete Radar', 'more', 'Core: 3-result preview'], ['GovCon Autopilot', 'ent'], ['Predictive Bid Matchmaker', 'ent'], ['Per-State Directory + state/local', 'ent']]],
    ['Win work', 'sparkles', [['AI Proposal Engine', 'more', '10 vs 50 a month'], ['PDF and Word export'], ['AI Bid Decryptor'], ['Go/No-Go Indicator'], ['Visual Bid CRM'],
      ['GovCon Coach', 'more', '25 vs 75 a day'], ['SAM.gov browser extension'], ['Winning Voice from past bids', 'ent']]],
    ['Subs and pricing', 'calculator', [['Smart Vendor Scraper'], ['1-Click Outreach'], ['Profit Pricing Matrix', 'more', '+ Fringe/G&A on Enterprise'], ['FOIA Automator'],
      ['Auto-Teaming Legal Engine', 'ent'], ['Teaming Partner Finder', 'ent'], ['Sub-Safe SAM.gov Vetting', 'ent']]],
    ['Review and submit', 'clipboard-check', [['Submission Preflight'], ['Amendment Watch'], ['Section M Compliance Grader', 'ent'], ['RFI Ghostwriter', 'ent']]],
    ['After the award', 'trophy', [['Post-Award Milestone Tracker'], ['SF-1034/1035 invoicing'], ['Capability Statement Generator'],
      ['Past Performance Portfolio', 'ent'], ['Cash-Flow Autopilot', 'ent'], ['Team Login (1 seat)', 'ent']]],
    ['Compliance and alerts', 'shield-check', [['SAM.gov checklist + key reminders'], ['Deadline alerts + calendar sync'], ['CMMC Level 1 readiness'], ['FAR 52.219-14 checker'],
      ['Live Compliance Pulse', 'ent'], ['Compliance Watchdog', 'ent']]],
  ];

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function tile(t) {
    var h = '';
    if (t.icon) h += ico(t.icon, t.tone, t.cls && t.cls.indexOf('pl-hero') >= 0 ? 'pl-ico-lg' : '');
    if (t.eyebrow) h += '<p class="pl-eyebrow">' + esc(t.eyebrow) + '</p>';
    if (t.big) h += '<p class="pl-big">' + esc(t.big) + '</p>';
    if (t.mid && t.cls === 'pl-mark') h = '<span class="pl-halo" aria-hidden="true"></span><img class="pl-mark-img" src="/assets/gpp-logo-mark.png" alt="" width="480" height="499" loading="lazy" />' + h;
    if (t.mid) h += '<p class="pl-mid">' + esc(t.mid) + '</p>';
    if (t.num) h += '<p class="pl-num"><span>' + esc(t.num) + '</span> ' + esc(t.unit) + '</p>';
    if (t.pill && !t.icon) h += '<span class="pl-pill ' + t.pillCls + '">' + esc(t.pill) + '</span>';
    if (t.h) h += '<h3 class="pl-h">' + esc(t.h) + '</h3>';
    if (t.pill && t.icon) h += '<span class="pl-pill ' + t.pillCls + '">' + esc(t.pill) + '</span>';
    if (t.p) h += '<p class="pl-p">' + esc(t.p) + '</p>';
    if (t.chips) h += '<div class="pl-chips">' + t.chips.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>';
    if (t.sub) h += '<div class="pl-sub">' + t.sub.map(function (s) { return '<div>' + ico(s[0], s[1]) + '<p><b>' + esc(s[2]) + '</b><span>' + esc(s[3]) + '</span></p></div>'; }).join('') + '</div>';
    if (t.list) h += '<ul class="pl-list">' + t.list.map(function (x) { return '<li>' + ico('check', 'blue') + esc(x) + '</li>'; }).join('') + '</ul>';
    var cls = t.cls || 'pl-center';
    if (!t.cls && (t.icon || t.pill)) cls = 'pl-center';
    return '<div class="pl-t ' + cls + '" data-a="' + t.a + '">' + h + '</div>';
  }

  function compare() {
    var ent = '<span class="pl-badge-ent">Enterprise</span>';
    var rows = [['Proposals a month', '10', '50'], ['Coach questions a day', '25', '75'], ['Recompete Radar', 'Preview', 'Full'], ['Team logins', '—', '+1']];
    var h = '<div class="pl-t pl-hero pl-blue pl-top" data-a="pc"><p class="pl-eyebrow">Core Edition · The Launchpad</p><p class="pl-price">$97<small>/month</small></p><p class="pl-p">You pick the solicitation and upload it. GovProposalPro does the rest.</p></div>' +
      '<div class="pl-t pl-hero pl-mix pl-top" data-a="pe"><p class="pl-eyebrow">Enterprise Edition · The Command Center</p><p class="pl-price">$297<small>/month</small></p><p class="pl-p">Everything in Core, plus the Autopilot that finds, quotes, prices and writes.</p></div>' +
      '<div class="pl-t pl-left" data-a="st"><div class="pl-glance"><span class="pl-eyebrow">At a glance</span><span class="pl-eyebrow pl-c-blue">Core</span><span class="pl-eyebrow pl-c-red">Enterprise</span>' +
      rows.map(function (r) { return '<span>' + r[0] + '</span><b>' + r[1] + '</b><b class="pl-grad">' + r[2] + '</b>'; }).join('') +
      '</div><p class="pl-legend">' + ent + ' Enterprise only <span class="pl-badge-more">Note</span> More on Enterprise</p></div>';
    h += GROUPS.map(function (g, i) {
      return '<div class="pl-t pl-left pl-group" data-a="g' + i + '"><div class="pl-gh">' + ico(g[1], i % 2 ? 'red' : 'blue') + '<h3 class="pl-h">' + g[0] + '</h3></div><ul class="pl-rows">' +
        g[2].map(function (r) {
          var tag = r[1] === 'ent' ? ent : r[1] === 'more' ? '<span class="pl-badge-more">' + esc(r[2]) + '</span>' : '';
          return '<li><span>' + ico(r[1] === 'ent' ? 'crown' : 'check', r[1] === 'ent' ? 'red' : 'blue') + esc(r[0]) + '</span>' + tag + '</li>';
        }).join('') + '</ul></div>';
    }).join('');
    return h;
  }

  var TABS = {
    core: { label: 'Core', price: '$97', title: 'Core Edition', grid: 'pl-grid-core', html: function () { return CORE.map(tile).join(''); },
      pdf: '/assets/site/one-pagers/GovProposalPro_Core_OnePager.pdf' },
    enterprise: { label: 'Enterprise', price: '$297', title: 'Enterprise Edition', grid: 'pl-grid-ent', html: function () { return ENT.map(tile).join(''); },
      pdf: '/assets/site/one-pagers/GovProposalPro_Enterprise_OnePager.pdf' },
    compare: { label: 'Compare', price: '', title: 'Core vs Enterprise', grid: 'pl-grid-cmp', html: compare,
      pdf: '/assets/site/one-pagers/GovProposalPro_Core_vs_Enterprise_QuickReference.pdf' },
  };

  function hrefFor(key, fallback) {
    var a = document.querySelector('[data-checkout="' + key + '"]');
    return a ? a.getAttribute('href') : fallback;
  }

  function build() {
    var coreHref = hrefFor('core-monthly', '#editions');
    var entHref = hrefFor('enterprise-monthly', '#editions');
    var d = document.createElement('dialog');
    d.id = 'plans';
    d.className = 'pl';
    d.setAttribute('aria-labelledby', 'pl-title');
    var tabs = Object.keys(TABS).map(function (k) {
      var t = TABS[k];
      return '<button type="button" role="tab" class="pl-tab" data-tab="' + k + '" aria-selected="false">' + t.label + (t.price ? ' <span>' + t.price + '</span>' : '') + '</button>';
    }).join('');
    var panels = Object.keys(TABS).map(function (k) {
      return '<div class="pl-grid ' + TABS[k].grid + '" role="tabpanel" data-panel="' + k + '" hidden>' + TABS[k].html() + '</div>';
    }).join('');
    d.innerHTML =
      '<svg class="pl-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
      '<linearGradient id="pl-g-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4DA3FF"/><stop offset="1" stop-color="#FF5A6E"/></linearGradient>' +
      '<linearGradient id="pl-g-blue" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7BBEFF"/><stop offset="1" stop-color="#2F7BFF"/></linearGradient>' +
      '<linearGradient id="pl-g-red" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FF8A98"/><stop offset="1" stop-color="#FF2D46"/></linearGradient>' +
      '<linearGradient id="pl-g-white" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D2D2D7"/></linearGradient>' +
      '</defs></svg>' +
      '<div class="pl-shell">' +
      '<div class="pl-top-bar"><div class="pl-brand"><img src="/assets/gpp-logo-mark.png" alt="" width="480" height="499" /><p id="pl-title">Everything you get</p></div>' +
      '<div class="pl-tabs" role="tablist" aria-label="Editions">' + tabs + '</div>' +
      '<button type="button" class="pl-x" data-pl-close aria-label="Close">' + ico('x', 'white') + '</button></div>' +
      '<div class="pl-body" tabindex="-1" autofocus>' + panels +
      '<p class="pl-fine">Software only. No contract award is guaranteed. Opportunities come from public SAM.gov and USAspending.gov data. <a class="pl-pdf" href="#" download>' + ico('download', 'blue') + 'Download this one-pager (PDF)</a></p></div>' +
      '<div class="pl-buy"><div class="pl-buy-txt"><p class="pl-buy-h"></p><p class="pl-buy-p">Cancel anytime · 7-day money-back guarantee</p></div><div class="pl-buy-btns">' +
      '<a href="' + entHref + '" data-checkout="enterprise-monthly" class="btn-lg pl-btn-ent"><span class="pl-lg">Get </span>Enterprise · $297<span class="pl-lg">/mo</span></a>' +
      '<a href="' + coreHref + '" data-checkout="core-monthly" class="btn-lg-grad btn-shine pl-btn-core"><span class="pl-lg">Start </span>Core · $97<span class="pl-lg">/mo</span></a>' +
      '</div></div></div>';
    document.body.appendChild(d);
    return d;
  }

  var dlg;
  function select(key) {
    if (!TABS[key]) key = 'core';
    dlg.dataset.tab = key;
    dlg.querySelectorAll('.pl-tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === key)); });
    dlg.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== key; });
    dlg.querySelector('.pl-buy-h').textContent = key === 'compare' ? 'Start with Core, upgrade anytime' : TABS[key].title + ' · ' + TABS[key].price + '/month';
    dlg.querySelector('.pl-pdf').setAttribute('href', TABS[key].pdf);
    var body = dlg.querySelector('.pl-body');
    if (body) body.scrollTop = 0;
  }
  function open(key) {
    select(key);
    if (dlg.open) return;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    document.body.classList.add('co-lock');
    if (typeof window.fbq === 'function') { try { window.fbq('track', 'ViewContent', { content_name: 'plans-' + key }); } catch (e) { /* fine */ } }
  }
  function close() {
    if (dlg.open && typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }

  function init() {
    dlg = build();
    dlg.addEventListener('close', function () { document.body.classList.remove('co-lock'); if (/^#plans/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('[data-pl-close]')) { close(); return; }
      var tab = e.target.closest('.pl-tab');
      if (tab) { select(tab.dataset.tab); return; }
      // A buy button: site.js opens the embedded checkout on top; this sheet steps aside.
      if (e.target.closest('[data-checkout]')) setTimeout(close, 0);
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-plans]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      open(a.getAttribute('data-plans') || 'core');
    });
    var m = /^#plans(?:-(core|enterprise|compare))?$/.exec(location.hash);
    if (m) open(m[1] || 'core');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
