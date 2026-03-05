// calendar-collab.js
// Minimal, non-invasive calendar widget for Collaborator dashboard.
// It reads already-rendered event cards (deadlines) from #eventsGrid and draws a month calendar.
// It does NOT touch existing logic for events or editor launching.

(function(){
  const grid = document.getElementById('eventsGrid');
  const mount = document.getElementById('eventsCalendar');
  if (!grid || !mount) return;

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

  function parseDMY(s){
    // Expect dd/mm/yyyy or d/m/yyyy
    if (!s) return null;
    const m = String(s).match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/);
    if (!m) return null;
    const d = parseInt(m[1],10), mo = parseInt(m[2],10)-1, y = parseInt(m[3],10);
    const dt = new Date(y, mo, d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  function extractDeadlines(){
    // Map 'YYYY-MM-DD' -> array of card elements
    const map = new Map();
    const cards = Array.from(grid.querySelectorAll('.event-card'));
    for (const card of cards){
      // Find badge with "Deadline:"
      const badges = Array.from(card.querySelectorAll('.badge'));
      let deadlineText = '';
      for (const b of badges){
        const t = (b.textContent || '').trim();
        if (/^Deadline:/i.test(t)) { deadlineText = t.replace(/^Deadline:\s*/i,'').trim(); break; }
      }
      const dt = parseDMY(deadlineText);
      if (!dt) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(card);
    }
    return map;
  }

  function buildCalendar(year, month, deadlineMap){
    // month 0-11
    mount.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'cal-head';
    header.innerHTML = `
      <button class="cal-nav" type="button" aria-label="Previous month">‹</button>
      <div class="cal-title">${MONTHS[month]}, ${year}</div>
      <button class="cal-nav" type="button" aria-label="Next month">›</button>
    `;
    mount.appendChild(header);

    const dow = document.createElement('div');
    dow.className = 'cal-dow';
    for (const d of DOW){
      const el = document.createElement('div');
      el.textContent = d;
      dow.appendChild(el);
    }
    mount.appendChild(dow);

    const body = document.createElement('div');
    body.className = 'cal-grid';

    const first = new Date(year, month, 1);
    const startDay = (first.getDay() + 6) % 7; // 0 Monday
    const daysInMonth = new Date(year, month+1, 0).getDate();

    // leading blanks
    for (let i=0;i<startDay;i++){
      const blank = document.createElement('div');
      blank.className = 'cal-cell blank';
      body.appendChild(blank);
    }

    for (let day=1; day<=daysInMonth; day++){
      const dt = new Date(year, month, day);
      const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const has = deadlineMap.has(key);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cal-cell' + (has ? ' has' : '');
      cell.innerHTML = `<span>${day}</span>`;
      if (has){
        cell.addEventListener('click', () => {
          const cards = deadlineMap.get(key) || [];
          if (!cards.length) return;

          // Remove any previous highlights
          Array.from(grid.querySelectorAll('.event-card.pulse-focus')).forEach(el => el.classList.remove('pulse-focus'));

          // Scroll to first and highlight all matching cards
          cards[0].scrollIntoView({behavior:'smooth', block:'center'});
          for (const c of cards){
            c.classList.add('pulse-focus');
          }
          setTimeout(() => {
            for (const c of cards){ c.classList.remove('pulse-focus'); }
          }, 1000);
        });
      }
      body.appendChild(cell);
    }

    mount.appendChild(body);

    // wire nav
    const [prevBtn, , nextBtn] = header.children;
    prevBtn.addEventListener('click', () => {
      const d = new Date(year, month-1, 1);
      render(d.getFullYear(), d.getMonth());
    });
    nextBtn.addEventListener('click', () => {
      const d = new Date(year, month+1, 1);
      render(d.getFullYear(), d.getMonth());
    });
  }

  function render(year, month){
    const deadlineMap = extractDeadlines();
    buildCalendar(year, month, deadlineMap);
  }

  // Wait until eventsGrid is populated; non-invasive observer.
  const obs = new MutationObserver(() => {
    const hasCards = grid.querySelector('.event-card');
    if (hasCards){
      obs.disconnect();
      const now = new Date();
      render(now.getFullYear(), now.getMonth());
    }
  });
  obs.observe(grid, {childList:true, subtree:true});

  // Fallback: in case cards already exist
  if (grid.querySelector('.event-card')){
    const now = new Date();
    render(now.getFullYear(), now.getMonth());
  }
})();
