// dashboard-supervisor-upcoming.js
(async function(){
  const mount = document.getElementById('eventsCalendarSupervisor');
  const grid = document.getElementById('eventsGridSupervisor');
  const eventSelect = document.getElementById('eventSelect');
  if (!mount || !grid) return;

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DOW = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

  function parseDMY(s){
    if (!s) return null;
    const m = String(s).match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
    if (!m) return null;
    const d = parseInt(m[1],10), mo = parseInt(m[2],10)-1, y = parseInt(m[3],10);
    const dt = new Date(y, mo, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function extractDeadlines(){
    const map = new Map();
    const cards = Array.from(grid.querySelectorAll('.event-card'));
    for (const card of cards){
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
    const startDay = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month+1, 0).getDate();

    for (let i=0;i<startDay;i++){
      const blank = document.createElement('div');
      blank.className = 'cal-cell blank';
      body.appendChild(blank);
    }
    for (let day=1; day<=daysInMonth; day++){
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
          Array.from(grid.querySelectorAll('.event-card.pulse-focus')).forEach(el => el.classList.remove('pulse-focus'));
          cards[0].scrollIntoView({behavior:'smooth', block:'center'});
          for (const c of cards) c.classList.add('pulse-focus');
          setTimeout(() => { for (const c of cards) c.classList.remove('pulse-focus'); }, 1000);
        });
      }
      body.appendChild(cell);
    }
    mount.appendChild(body);

    const [prevBtn, , nextBtn] = header.children;
    prevBtn.addEventListener('click', () => { const d = new Date(year, month-1, 1); render(d.getFullYear(), d.getMonth()); });
    nextBtn.addEventListener('click', () => { const d = new Date(year, month+1, 1); render(d.getFullYear(), d.getMonth()); });
  }

  async function renderEvents(){
    const events = await window.GCP.apiFetch('/events/upcoming', { method:'GET' });
    grid.innerHTML = '';
    for (const ev of (events || [])) {
      const card = document.createElement('div');
      card.className = 'event-card';
      const deadline = window.GCP.formatDate(ev.deadline_date) || '';
      const country = ev.country_name_en || '';
      const task = ev.task || ev.occasion || '';
      const title = window.GCP.escapeHtml(ev.title || '');
      card.innerHTML = `
        <div class="row1">
          <button class="openmini openmini-top" type="button">Open</button>
          <div>
            <div class="title">${title}</div>
            <div class="meta">
              <span class="badge primary">${window.GCP.escapeHtml(country)}</span>
              ${deadline ? `<span class="badge">Deadline: ${window.GCP.escapeHtml(deadline)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="task">${window.GCP.escapeHtml(task)}</div>
      `;
      card.querySelector('button.openmini').addEventListener('click', () => {
        if (eventSelect){
          eventSelect.value = String(ev.id);
          eventSelect.dispatchEvent(new Event('change'));
          eventSelect.scrollIntoView({behavior:'smooth', block:'start'});
        }
      });
      grid.appendChild(card);
    }
  }

  async function render(year, month){
    const deadlineMap = extractDeadlines();
    buildCalendar(year, month, deadlineMap);
  }

  try{
    await renderEvents();
    const now = new Date();
    render(now.getFullYear(), now.getMonth());
  }catch(e){
    console.error('Failed to render supervisor upcoming events', e);
  }
})();
