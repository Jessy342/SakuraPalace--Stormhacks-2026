// Journey: Goals (bigger ambitions with a living note), Ideas (offers the companion came up with) and the Feed
// (short real news cards about what you care about). One drawer with three tabs; the backend half is backend/journey.py.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time (the backend's day)

const CATEGORIES = [['Health', '♡'], ['Relationships', '👥'], ['Finance', '$'], ['Career', '🏢'], ['Interests', '🎨'], ['Productivity', '💻']];
const STATUS = { tracking: 'Tracking', paused: 'Paused', done: 'Done' };

/**
 * ctx (from app.js): post, state() -> S, setState(S), sendChat(text), say(text, opts), addMsg(role, text),
 *                    petals(n) small reward effect, goalDone(reward, goal) the big celebration
 */
export function initJourney(ctx) {
  let pane = 'goals';
  let pickedCat = null, creating = false, menuFor = null;   // goals
  let ideasBusy = false;                                     // ideas
  let feedBusy = false, editing = false;                     // feed
  const S = () => ctx.state();
  const guard = async fn => { try { await fn(); } catch (e) { ctx.addMsg('sys', '⚠ ' + (e.message || e)); } };

  // ---------------- Goals ----------------
  function goalsHtml() {
    const goals = S().goals || [];
    const groups = ['tracking', 'paused', 'done'].map(st => [st, goals.filter(g => g.status === st)]).filter(([, list]) => list.length);
    return `<h2 class="j-h">Goals</h2>` + groups.map(([st, list]) => `
      <div class="j-status ${st}"><i></i>${STATUS[st]}</div>
      ${list.map(g => `
        <div class="j-goal ${st}" data-goal="${g.id}">
          <button class="j-check" data-act="${st === 'done' ? 'reopen' : 'done'}" title="${st === 'done' ? 'Reopen this goal' : 'I reached this goal!'}">${st === 'done' ? '✓' : ''}</button>
          <div class="j-body"><b>${esc(g.title)}</b><p>${esc(g.note)}</p>
            <details><summary>${esc(g.category)} · the plan</summary><p>${esc(g.plan)}</p></details></div>
          <button class="j-more" data-act="menu" title="More">⋮</button>
          ${menuFor === g.id ? `<div class="j-menu">${st !== 'done' ? `<button data-act="${st === 'paused' ? 'resume' : 'pause'}">${st === 'paused' ? 'Resume' : 'Pause'}</button>` : ''}<button data-act="delete" class="danger">Delete</button></div>` : ''}
        </div>`).join('')}`).join('') + `
      <div class="j-create"><b>＋ Create a goal</b><p>Pick a category, tell me a little about what you're after, and I'll build a personalized plan that evolves with you.</p></div>
      ${CATEGORIES.map(([name, icon]) => `
        <button class="j-cat ${pickedCat === name ? 'open' : ''}" data-cat="${name}"><i>${icon}</i><span>${name}</span><em>${pickedCat === name ? '−' : '＋'}</em></button>
        ${pickedCat === name ? `<form class="j-form" id="goal-form"><input id="goal-text" maxlength="400" placeholder="What are you after? (one sentence)" autocomplete="off" ${creating ? 'disabled' : ''} />
          <button type="submit" class="primary" ${creating ? 'disabled' : ''}>${creating ? 'Building your plan…' : 'Create'}</button></form>` : ''}`).join('')}`;
  }

  async function goalAction(id, act) {
    if (act === 'menu') { menuFor = menuFor === id ? null : id; return render(); }
    menuFor = null;
    if (act === 'delete') return ctx.setState(await ctx.post(`/goals/${id}`, undefined, 'DELETE'));
    const status = { done: 'done', reopen: 'tracking', pause: 'paused', resume: 'tracking' }[act];
    const res = await ctx.post(`/goals/${id}/status`, { status });
    await ctx.setState(res.state);
    if (res.reward) ctx.goalDone(res.reward, S().goals.find(g => g.id === id));
  }

  // ---------------- Ideas ----------------
  function ideasHtml() {
    const items = S().ideas?.items || [];
    return `<div class="j-top"><h2 class="j-h">Ideas</h2><button class="chip-btn" data-act="ideas-refresh" ${ideasBusy ? 'disabled' : ''}>${ideasBusy ? 'Thinking…' : '↻ New ideas'}</button></div>` +
      (items.map(i => `
        <div class="j-idea" data-idea="${i.id}"><i>${esc(i.emoji)}</i>
          <div class="j-body"><b>${esc(i.title)}</b><p>${esc(i.body)}</p>
            <div class="j-actions"><button class="primary" data-act="accept">Do it</button><button data-act="dismiss">Dismiss</button></div></div>
        </div>`).join('') || `<p class="j-empty">${ideasBusy ? 'Let me think about what would help you most…' : 'No ideas right now. Ask for new ones, or check back tomorrow!'}</p>`);
  }

  async function refreshIdeas(force, announce) {
    if (ideasBusy) return;
    ideasBusy = true; render();
    try {
      const res = await ctx.post('/ideas/refresh', { force });
      await ctx.setState(res.state);
      const first = res.state.ideas.items[0];
      if (announce && res.new && first) { // the companion says so in its own voice
        ctx.addMsg('sys', `💡 New idea: ${first.title}`);
        ctx.say(`I had an idea for you. ${first.title} Take a look under Journey!`, { emotion: 'happy' });
      }
    } catch (e) { console.warn(e); }
    ideasBusy = false; render();
  }

  // ---------------- Feed ----------------
  const age = at => { const m = (Date.now() / 1000 - at) / 60; return m < 60 ? `${Math.max(1, Math.round(m))}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
  function feedHtml() {
    const feed = S().feed || { items: [], instruction: '' };
    const top = editing ? `
      <form class="j-edit" id="feed-form"><b>Feed instructions</b><small>Your feed is built from the instructions below. Any change applies to the next set of posts.</small>
        <textarea id="feed-text" rows="4" maxlength="600">${esc(feed.instruction)}</textarea>
        <div class="j-actions"><button type="button" data-act="feed-cancel">Cancel</button><button type="submit" class="primary">Save</button></div></form>`
      : `<button class="j-instruction" data-act="feed-edit" title="Change what your feed is about">${esc(feed.instruction)}</button>`;
    const cards = feed.items.map(c => `
      <article class="j-card" data-card="${c.id}"><i>${esc(c.emoji)}</i>
        <div class="j-body"><b>${esc(c.title)}</b><p>${esc(c.body)} <a href="#" data-act="open">${esc(c.source || 'Source')} ↗</a></p>
          <div class="j-actions"><button class="j-heart ${c.liked ? 'on' : ''}" data-act="like" title="Keep this card">${c.liked ? '♥' : '♡'}</button>
            <button data-act="discuss">💬 Discuss</button><small>${age(c.at)}</small></div></div>
      </article>`).join('');
    const earned = feed.earned_day === today() ? feed.earned : 0;
    return `<div class="j-top"><h2 class="j-h">Feed</h2><button class="chip-btn" data-act="feed-refresh" ${feedBusy ? 'disabled' : ''}>${feedBusy ? 'Searching…' : '↻ Refresh'}</button></div>${top}
      ${feedBusy ? '<p class="j-empty j-loading">Finding today\'s stories for you. This takes about half a minute…</p>' : ''}
      ${cards || (feedBusy ? '' : '<p class="j-empty">Nothing here yet. Press Refresh to build your feed.</p>')}
      ${cards ? `<p class="j-foot">Reading earns a few Sakura Petals: ${earned} / 50 today.</p>` : ''}`;
  }

  async function refreshFeed(force) {
    if (feedBusy) return;
    feedBusy = true; render();
    try { await ctx.setState(await ctx.post('/feed/refresh', { force })); } catch (e) { ctx.addMsg('sys', '⚠ ' + (e.message || e)); }
    feedBusy = false; render();
  }

  async function cardAction(id, act) {
    const card = S().feed.items.find(c => c.id === id);
    if (!card) return;
    if (act === 'like') {
      const res = await ctx.post(`/feed/${id}/like`);
      await ctx.setState(res.state);
      if (res.earned) ctx.petals(res.earned);
      return;
    }
    const res = await ctx.post(`/feed/${id}/read`);
    await ctx.setState(res.state);
    if (res.earned) ctx.petals(res.earned);
    if (act === 'open') await ctx.post('/open', { url: card.url });
    if (act === 'discuss') ctx.sendChat(`Let's talk about this from my feed: "${card.title}". ${card.body} What do you think?`);
  }

  // ---------------- the drawer ----------------
  function render() {
    const box = $('journey-body');
    if (!box || !S()) return;
    document.querySelectorAll('#journey-tabs button').forEach(b => b.classList.toggle('active', b.dataset.pane === pane));
    // (don't lose what is being typed when the screen is redrawn)
    const typed = Object.fromEntries(['goal-text', 'feed-text'].filter(id => $(id)).map(id => [id, $(id).value]));
    const focused = document.activeElement?.id;
    box.innerHTML = pane === 'goals' ? goalsHtml() : pane === 'ideas' ? ideasHtml() : feedHtml();
    for (const [id, value] of Object.entries(typed)) if ($(id)) { $(id).value = value; if (focused === id) $(id).focus(); }
  }

  function show(which) {
    pane = which; render();
    if (pane === 'feed' && (S().feed.day !== today() || !S().feed.items.length)) refreshFeed(false);
    if (pane === 'ideas' && S().ideas.day !== today()) refreshIdeas(false, false);
  }

  $('journey-tabs').addEventListener('click', e => { const b = e.target.closest('button[data-pane]'); if (b) show(b.dataset.pane); });
  $('journey-body').addEventListener('click', e => guard(async () => {
    const el = e.target.closest('[data-act], [data-cat]');
    if (!el) return;
    if (el.tagName === 'A') e.preventDefault();
    if (el.dataset.cat) { pickedCat = pickedCat === el.dataset.cat ? null : el.dataset.cat; render(); $('goal-text')?.focus(); return; }
    const act = el.dataset.act;
    const goal = el.closest('[data-goal]'), idea = el.closest('[data-idea]'), card = el.closest('[data-card]');
    if (goal) return goalAction(goal.dataset.goal, act);
    if (idea) {
      if (act === 'dismiss') return ctx.setState(await ctx.post(`/ideas/${idea.dataset.idea}/dismiss`));
      const res = await ctx.post(`/ideas/${idea.dataset.idea}/accept`);
      await ctx.setState(res.state);
      return ctx.sendChat(res.action); // handed to the companion, who carries it out
    }
    if (card) return cardAction(card.dataset.card, act);
    if (act === 'ideas-refresh') return refreshIdeas(true, false);
    if (act === 'feed-refresh') return refreshFeed(true);
    if (act === 'feed-edit') { editing = true; render(); $('feed-text')?.focus(); }
    if (act === 'feed-cancel') { editing = false; render(); }
  }));
  $('journey-body').addEventListener('submit', e => guard(async () => {
    e.preventDefault();
    if (e.target.id === 'goal-form') {
      const text = $('goal-text').value.trim();
      if (!text || creating) return;
      creating = true; render();
      try {
        const res = await ctx.post('/goals', { category: pickedCat, text });
        pickedCat = null;
        await ctx.setState(res.state);
        ctx.addMsg('sys', `🎯 New goal: ${res.goal.title}. I added the first steps to your quests.`);
        ctx.say(res.goal.note, { emotion: 'happy' });
      } finally { creating = false; render(); }
    }
    if (e.target.id === 'feed-form') {
      editing = false;
      await ctx.setState(await ctx.post('/feed/instruction', { text: $('feed-text').value }));
      refreshFeed(true);
    }
  }));

  return {
    render,
    opened: () => show(pane),
    /** Once a day, after the greeting: fresh ideas (announced out loud), fresh goal notes, and the feed fetched in the background. */
    daily: async () => {
      if (S().ideas.day !== today()) await refreshIdeas(false, true);
      if ((S().goals || []).some(g => g.status === 'tracking' && g.note_day !== today())) ctx.post('/goals/refresh', {}).then(ctx.setState).catch(() => {});
      if (S().feed.day !== today()) refreshFeed(false);
    },
    /** A quest that belongs to a goal was finished: the goal's note is rewritten right away. */
    questDone: task => { if (task?.goal) ctx.post('/goals/refresh', { force: true }).then(ctx.setState).catch(() => {}); },
  };
}
