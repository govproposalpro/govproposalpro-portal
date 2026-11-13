// GovProposalPro for SAM.gov: shows a "Send to GovProposalPro" button on opportunity pages.
// It reads nothing from the page but the notice id in the address bar, needs no permissions, and
// opens GovProposalPro in a new tab, where the member is already signed in.
(() => {
  const APP = 'https://govproposalpro.com/app/import?notice=';
  const ID = /\/opp\/([a-f0-9]{32})\//i;
  let btn = null;

  function sync() {
    const m = location.pathname.match(ID);
    if (!m) { if (btn) { btn.remove(); btn = null; } return; }
    if (!btn) {
      btn = document.createElement('a');
      btn.className = 'gpp-send';
      btn.target = '_blank';
      btn.rel = 'noopener';
      const dot = document.createElement('span');
      dot.className = 'gpp-dot';
      btn.append(dot, document.createTextNode('Send to GovProposalPro'));
      document.body.appendChild(btn);
    }
    btn.href = APP + m[1].toLowerCase();
  }

  // SAM.gov is a single-page app: watch for in-page navigation.
  sync();
  let last = location.href;
  setInterval(() => { if (location.href !== last) { last = location.href; sync(); } }, 800);
})();
