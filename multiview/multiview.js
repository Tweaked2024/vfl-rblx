/* ACFL live multiview — embeds every live Twitch stream from the league's
   stream list (server-checked via /api/live). Re-checks periodically and only
   re-renders when the set of live channels actually changes, so playing
   streams are never interrupted. */
(function () {
  const grid = document.getElementById('mv-grid');
  const statusEl = document.getElementById('mv-status');
  const POLL_MS = 45 * 1000;
  let current = null; // JSON key of the last rendered live set

  function render(data) {
    const live = data.live || [];
    const key = JSON.stringify(live);
    if (key === current) return;
    current = key;

    statusEl.classList.toggle('is-live', live.length > 0);
    statusEl.textContent = live.length
      ? (live.length === 1 ? '1 stream live' : live.length + ' streams live')
      : 'no streams live';

    grid.innerHTML = '';
    grid.classList.toggle('has-multi', live.length > 1);

    if (!live.length) {
      const empty = document.createElement('div');
      empty.className = 'mv-empty';
      const chans = (data.channels || []);
      empty.innerHTML =
        '<span class="mv-empty-title">Nobody is live right now</span>' +
        '<p class="mv-empty-note">Check back when a game is on — this page updates automatically.</p>' +
        (chans.length
          ? '<div class="mv-channel-list">' +
            chans.map(function (c) {
              return '<a href="https://www.twitch.tv/' + encodeURIComponent(c.channel) +
                '" target="_blank" rel="noopener">' + c.channel + '</a>';
            }).join('') + '</div>'
          : '');
      grid.appendChild(empty);
      return;
    }

    live.forEach(function (channel) {
      const card = document.createElement('div');
      card.className = 'mv-card';

      const head = document.createElement('div');
      head.className = 'mv-card-head';
      head.innerHTML =
        '<span class="mv-dot" aria-hidden="true"></span>' +
        '<span class="mv-name">' + channel + '</span>' +
        '<a class="mv-open" href="https://www.twitch.tv/' + encodeURIComponent(channel) +
        '" target="_blank" rel="noopener">open on twitch →</a>';

      const frame = document.createElement('div');
      frame.className = 'mv-frame';
      const iframe = document.createElement('iframe');
      iframe.src = 'https://player.twitch.tv/?channel=' + encodeURIComponent(channel) +
        '&parent=' + encodeURIComponent(location.hostname) + '&muted=true&autoplay=true';
      iframe.allowFullscreen = true;
      iframe.setAttribute('allow', 'autoplay; fullscreen');
      iframe.title = channel + ' live stream';
      frame.appendChild(iframe);

      card.appendChild(head);
      card.appendChild(frame);
      grid.appendChild(card);
    });
  }

  function check() {
    fetch('/api/live')
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok) render(d); })
      .catch(function () {
        if (current === null) {
          grid.innerHTML = '<p class="mv-loading">Couldn\u2019t check live streams. Refresh to try again.</p>';
          statusEl.textContent = 'unavailable';
        }
      });
  }

  /* ---- Wide view (desktop): let the streams fill the full browser width ---- */
  const wideBtn = document.getElementById('mv-wide');
  const main = document.querySelector('.mv-main');
  if (wideBtn && main) {
    function setWide(on) {
      main.classList.toggle('is-wide', on);
      wideBtn.textContent = on ? '⊟ normal view' : '⊞ wide view';
      wideBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      try { localStorage.setItem('afl-mv-wide', on ? '1' : '0'); } catch (e) {}
    }
    let saved = false;
    try { saved = localStorage.getItem('afl-mv-wide') === '1'; } catch (e) {}
    if (saved) setWide(true);
    wideBtn.addEventListener('click', function () {
      setWide(!main.classList.contains('is-wide'));
    });
  }

  /* ---- Fullscreen (desktop): put the whole grid of streams fullscreen ---- */
  const fsBtn = document.getElementById('mv-fs');
  if (fsBtn && grid.requestFullscreen) {
    fsBtn.hidden = false;
    fsBtn.addEventListener('click', function () {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        grid.requestFullscreen().catch(function () {});
      }
    });
    document.addEventListener('fullscreenchange', function () {
      const fs = document.fullscreenElement === grid;
      grid.classList.toggle('is-fs', fs);
      fsBtn.textContent = fs ? '⛶ exit fullscreen' : '⛶ fullscreen';
    });
  }

  /* ---- Live scores: AI reads each stream's scoreboard server-side ---- */
  const scoresWrap = document.getElementById('mv-scores');
  const scoresGrid = document.getElementById('mv-scores-grid');
  const scoresUpdated = document.getElementById('mv-scores-updated');
  const SCORES_POLL_MS = 30 * 1000; // matches the server's refresh cadence
  const SCORES_FAST_MS = 8 * 1000;  // while first results are still pending
  let scoresTimer = null;

  // Match the AI-read team name to an ACFL team by NICKNAME only (the AI
  // may read the wrong city, e.g. "Seattle Evergreens" for the Washington
  // Evergreens). Tries trailing word groups so multi-word nicks like
  // "red devils" still match. Falls back to the name text when unmatched.
  function acflTeam(name) {
    if (!window.ACFL) return null;
    const words = String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const t = window.ACFL.teams[words.slice(i).join(' ')];
      if (t) return t;
    }
    return null;
  }

  function teamEl(name, right) {
    const team = acflTeam(name);
    if (team) {
      const img = document.createElement('img');
      img.className = 'mv-score-logo' + (right ? ' is-right' : '');
      img.src = window.ACFL.pngSrc(team);
      img.alt = team.full;
      img.title = team.full;
      img.loading = 'lazy';
      return img;
    }
    const span = document.createElement('span');
    span.className = 'mv-score-team' + (right ? ' is-right' : '');
    span.textContent = name;
    return span;
  }

  function agoLabel(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 5) return 'updated just now';
    if (s < 90) return 'updated ' + s + 's ago';
    return 'updated ' + Math.round(s / 60) + 'm ago';
  }

  function renderScores(list) {
    if (!scoresWrap || !scoresGrid) return;
    if (!list.length) {
      scoresWrap.hidden = true;
      scoresGrid.innerHTML = '';
      return;
    }
    scoresWrap.hidden = false;
    scoresGrid.innerHTML = '';
    scoresGrid.classList.toggle('has-multi', list.length > 1);

    let newest = 0;
    list.forEach(function (s) {
      const card = document.createElement('div');
      card.className = 'mv-score-card';

      const meta = document.createElement('div');
      meta.className = 'mv-score-meta';
      const chan = document.createElement('span');
      chan.textContent = s.channel;
      meta.appendChild(chan);

      if (s.found && (s.quarter || s.clock)) {
        const phase = document.createElement('span');
        phase.className = 'mv-score-phase';
        phase.textContent = [s.quarter, s.clock].filter(Boolean).join(' · ');
        meta.appendChild(phase);
      }
      card.appendChild(meta);

      if (s.found && s.teams && s.teams.length === 2) {
        if (s.at) newest = Math.max(newest, s.at);
        const row = document.createElement('div');
        row.className = 'mv-score-row';

        const t1 = teamEl(s.teams[0].name, false);

        const n1 = document.createElement('span');
        n1.className = 'mv-score-num' + (s.teams[0].score > s.teams[1].score ? ' is-leading' : '');
        n1.textContent = s.teams[0].score;

        const dash = document.createElement('span');
        dash.className = 'mv-score-dash';
        dash.textContent = '–';

        const n2 = document.createElement('span');
        n2.className = 'mv-score-num' + (s.teams[1].score > s.teams[0].score ? ' is-leading' : '');
        n2.textContent = s.teams[1].score;

        const t2 = teamEl(s.teams[1].name, true);

        row.appendChild(t1);
        row.appendChild(n1);
        row.appendChild(dash);
        row.appendChild(n2);
        row.appendChild(t2);
        card.appendChild(row);
      } else {
        const note = document.createElement('p');
        note.className = 'mv-score-pending';
        note.textContent = s.pending
          ? 'Reading the scoreboard…'
          : 'Scoreboard not visible on this stream right now.';
        card.appendChild(note);
      }

      scoresGrid.appendChild(card);
    });

    if (scoresUpdated) {
      scoresUpdated.textContent = newest ? agoLabel(newest) : '';
    }
  }

  function scheduleScores(ms) {
    clearTimeout(scoresTimer);
    scoresTimer = setTimeout(checkScores, ms);
  }

  function checkScores() {
    fetch('/api/scores')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) { scheduleScores(SCORES_POLL_MS); return; }
        renderScores(d.scores || []);
        const pending = (d.scores || []).some(function (s) { return s.pending; });
        scheduleScores(pending ? SCORES_FAST_MS : SCORES_POLL_MS);
      })
      .catch(function () { scheduleScores(SCORES_POLL_MS); });
  }

  check();
  setInterval(check, POLL_MS);
  checkScores();
  // Re-check immediately when the viewer comes back to this tab.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { check(); checkScores(); }
  });
})();
