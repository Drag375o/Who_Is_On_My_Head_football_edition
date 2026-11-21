"""
Retakes the pictures in the README by playing the real page in Chrome (Playwright).

    python tests/readme_shots.py

Pictures go to docs/screenshots/. Stamps and confetti are hidden so they don't cover the cards.
"""
import base64
import pathlib
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'screenshots'
OUT.mkdir(parents=True, exist_ok=True)
TMP = ROOT / 'tests' / 'out' / 'theme-tiles'
TMP.mkdir(parents=True, exist_ok=True)
URL = (ROOT / 'index.html').as_uri()
HIDE = '.stamp-layer, .confetti { display: none !important; }'
errors = []


def new(b, w, h, dsf=1):
    page = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=dsf)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda d: d.accept())
    return page


def setup(page, play, opts, theme):
    page.goto(URL); page.evaluate('localStorage.clear()'); page.reload()
    page.click(f'[data-action="set"][data-key="play"][data-value="{play}"]')
    for k, v in opts + [('theme', theme)]:
        page.click(f'[data-action="set"][data-key="{k}"][data-value="{v}"]')


def start(page):
    page.click('[data-action="start"]'); page.click('[data-action="roll"]')
    page.wait_for_timeout(900); page.click('[data-action="deal"]')
    page.add_style_tag(content=HIDE)


def step(page):
    """Answer truthfully or ask the first open question. Returns what was on screen."""
    return page.evaluate("""() => {
      const rec = document.querySelector('.records b');
      const v = document.querySelector(`[data-action="vote"][data-v="${rec && rec.textContent === 'NO' ? 'no' : 'yes'}"]`);
      if (v) { v.click(); return 'vote'; }
      const next = document.querySelector('[data-action="next-round"]');
      if (next) return 'roundEnd';
      const qs = [...document.querySelectorAll('.q-item:not([disabled])')];
      if (qs.length) { qs[Math.floor(Math.random() * Math.min(qs.length, 5))].click(); return 'turn'; }
      return 'wait';
    }""")


def until(page, want, limit, min_clues=0, act=True):
    """Play on until the screen shows `want` (with at least min_clues answers logged)."""
    t = time.time()
    while time.time() - t < limit:
        page.wait_for_timeout(250)
        state = page.evaluate("""() => {
          if (document.querySelector('[data-action="next-round"]')) return 'roundEnd';
          if (document.querySelector('[data-action="vote"]')) return 'vote';
          if (document.querySelector('.panel .tabs')) return 'turn';
          return 'wait'; }""")
        pips = page.locator('.seats-grid .pip').count()
        if state == want and pips >= min_clues:
            page.wait_for_timeout(700)
            return True
        if act:
            step(page)
    return False


with sync_playwright() as pw:
    b = pw.chromium.launch(channel='chrome')

    # 1. setup screen
    page = new(b, 1280, 860)
    setup(page, 'cpu', [('cpus', 3)], 'board')
    page.fill('[data-name="0"]', 'Sam')
    page.evaluate('document.activeElement.blur(); scrollTo(0, 0)')
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / 'setup.png'))
    page.close()

    # 2. the table, answering a question; 3. your turn; 4. round end
    page = new(b, 1280, 860)
    setup(page, 'cpu', [('cpus', 4), ('level', 'hard'), ('mode', 'points'), ('rounds', 3), ('timer', 0)], 'board')
    page.fill('[data-name="0"]', 'Sam')
    start(page)
    assert until(page, 'vote', 120, min_clues=8), 'never reached an answer with clues'
    page.screenshot(path=str(OUT / 'table.png'))
    assert until(page, 'turn', 120, min_clues=10), 'never reached my turn'
    page.evaluate("""document.querySelector('[data-action="qcat"][data-cat="club"]').click()""")
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / 'your-turn.png'))
    # give up so the round can finish without me
    page.click('[data-action="giveup"]')
    page.wait_for_timeout(400)
    if page.locator('[data-action="dismiss"]').count():
        page.click('[data-action="dismiss"]')
    assert until(page, 'roundEnd', 300), 'round never ended'
    page.wait_for_timeout(1200)
    page.set_viewport_size({'width': 1280, 'height': page.evaluate('document.documentElement.scrollHeight')})
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / 'round-end.png'))
    page.close()

    # 5. phone
    page = new(b, 390, 844, dsf=2)
    setup(page, 'cpu', [('cpus', 3), ('timer', 60)], 'midnight')
    page.fill('[data-name="0"]', 'Sam')
    start(page)
    until(page, 'vote', 120, min_clues=5)
    page.screenshot(path=str(OUT / 'phone.png'))
    page.close()

    # 6. pass & play: the card held to your forehead
    page = new(b, 1280, 860)
    setup(page, 'pass', [('mode', 'points'), ('timer', 60)], 'chalkboard')
    for i, n in enumerate(['Sam', 'Alex', 'Jordan']):
        page.fill(f'[data-name="{i}"]', n)
    start(page)
    page.click('[data-action="show-card"]')
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / 'pass-and-play.png'))
    page.close()

    # 7. the six board styles, as one picture
    themes = [('board', 'Classic Board'), ('midnight', 'Midnight'), ('whiteboard', 'Whiteboard'),
              ('chalkboard', 'Chalkboard'), ('pitch', 'Football pitch'), ('sketchbook', 'Sketchbook')]
    tiles = []
    for tid, name in themes:
        page = new(b, 1280, 800)
        setup(page, 'cpu', [('cpus', 3), ('timer', 0)], tid)
        page.fill('[data-name="0"]', 'Sam')
        start(page)
        until(page, 'vote', 90, min_clues=4)
        f = TMP / f'{tid}.png'
        page.screenshot(path=str(f))
        tiles.append((name, base64.b64encode(f.read_bytes()).decode()))
        page.close()
    cells = ''.join(f'<figure><img src="data:image/png;base64,{d}"><figcaption>{n}</figcaption></figure>' for n, d in tiles)
    page = new(b, 1600, 900)
    page.set_content(f"""<style>
      body {{ margin: 0; padding: 24px; background: #1b1d21; font: 600 22px system-ui, sans-serif; color: #eee; }}
      main {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }}
      figure {{ margin: 0; }} img {{ display: block; width: 100%; border-radius: 8px; }}
      figcaption {{ margin-top: 8px; text-align: center; }}</style><main>{cells}</main>""")
    page.wait_for_timeout(300)
    page.locator('body').screenshot(path=str(OUT / 'board-styles.png'))
    page.close()
    b.close()

print('errors:', errors)
for f in sorted(OUT.iterdir()):
    print(f.name, f.stat().st_size // 1024, 'KB')
