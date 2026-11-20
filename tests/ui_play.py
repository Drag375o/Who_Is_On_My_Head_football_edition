"""
Plays the real page in Chrome (Playwright) and fails on any page error.

    python tests/ui_play.py            # vs Computer, pass & play, phone width
    python tests/ui_play.py online     # 3 devices through the real PeerJS server (needs internet)

Screenshots go to tests/out/ (git-ignored).
"""
import pathlib
import random
import sys
import time

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'tests' / 'out'
OUT.mkdir(exist_ok=True)
URL = (ROOT / 'index.html').as_uri()
random.seed(7)


def watch(page, errors, label):
    page.on('pageerror', lambda e: errors.append(f'{label}: {e}'))
    page.on('console', lambda m: errors.append(f'{label} console: {m.text}') if m.type == 'error' else None)
    page.on('dialog', lambda d: d.accept())


def tap(page, sel):
    """Click if it's still there: the game moves on by itself (computers answer, majorities settle)."""
    try:
        page.click(sel, timeout=1500)
        return True
    except PlaywrightTimeout:
        return False


def visible(page, sel):
    loc = page.locator(sel)
    return loc.count() > 0 and loc.first.is_visible()


def setup(page, play, extra=()):
    page.goto(URL)
    page.evaluate('localStorage.clear()')
    page.reload()
    page.click(f'[data-action="set"][data-key="play"][data-value="{play}"]')
    for key, value in extra:
        page.click(f'[data-action="set"][data-key="{key}"][data-value="{value}"]')


def cpu_step(page, shots, asked):
    """One look at the vs Computer screen. Returns the move count, negative when the game is over."""
    if visible(page, '.final'):
        return -max(asked, 1)
    if visible(page, '[data-action="next-round"]'):
        if 'roundend' not in shots:
            page.screenshot(path=str(OUT / 'cpu-round-end.png'), full_page=True)
            shots.add('roundend')
        tap(page, '[data-action="next-round"]')
        return asked
    if visible(page, '[data-action="vote"][data-v="yes"]'):
        rec = page.locator('.records b')
        truth = rec.inner_text() if rec.count() else 'YES'
        if 'vote' not in shots:
            page.screenshot(path=str(OUT / 'cpu-answering.png'))
            shots.add('vote')
        tap(page, f'[data-action="vote"][data-v="{"yes" if truth == "YES" else "no"}"]')
        return asked
    if visible(page, '.panel .tabs'):
        if 'turn' not in shots:
            page.screenshot(path=str(OUT / 'cpu-my-turn.png'))
            shots.add('turn')
        if asked and asked % 7 == 0:
            page.click('[data-action="tab"][data-tab="guess"]')
            page.fill('[data-model="guessText"]', 'Ronaldo')
            page.click('[data-action="guess"]')
            page.wait_for_timeout(300)
            if visible(page, '.notice'):
                page.click('[data-action="dismiss"]')
                page.fill('[data-model="guessText"]', 'Pelé')
                page.click('[data-action="guess"]')
            asked += 1
            return asked
        page.click('[data-action="tab"][data-tab="deck"]')
        if asked == 2:
            page.fill('[data-model="search"]', 'real madrid')
            page.wait_for_timeout(200)
        items = page.locator('.q-item:not([disabled])')
        if items.count() == 0:
            page.fill('[data-model="search"]', '')
            return asked
        items.nth(random.randrange(min(items.count(), 6))).click()
        asked += 1
    return asked


def vs_computer(browser, errors):
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    watch(page, errors, 'cpu')
    setup(page, 'cpu', [('cpus', 3), ('level', 'hard'), ('mode', 'points'), ('rounds', 3), ('timer', 30)])
    page.screenshot(path=str(OUT / 'cpu-setup.png'), full_page=True)
    page.click('[data-action="start"]')
    page.click('[data-action="roll"]')
    page.wait_for_timeout(900)
    page.click('[data-action="deal"]')
    shots, asked, start = set(), 0, time.time()
    page.set_default_timeout(3000)
    while time.time() - start < 400:
        page.wait_for_timeout(250)
        try:
            asked = cpu_step(page, shots, asked)
        except PlaywrightTimeout:
            continue
        if asked < 0:
            break
    asked = abs(asked)
    assert visible(page, '.final'), 'vs Computer game did not finish'
    page.screenshot(path=str(OUT / 'cpu-final.png'), full_page=True)
    print(f'vs Computer: finished in {time.time() - start:.0f}s, {asked} moves by the human')
    page.close()


def pass_step(page, shots, label):
    """One look at the pass & play screen. True when the game is over."""
    if visible(page, '.final'):
        return True
    if visible(page, '[data-action="next-round"]'):
        tap(page, '[data-action="next-round"]')
        return False
    if visible(page, '[data-action="show-card"]'):
        if 'handover' not in shots:
            page.screenshot(path=str(OUT / f'{label}-handover.png'))
            shots.add('handover')
        tap(page, '[data-action="show-card"]')
        return False
    if visible(page, '[data-action="spoken"]'):
        if 'card' not in shots:
            page.wait_for_timeout(400)
            page.screenshot(path=str(OUT / f'{label}-forehead.png'), full_page=True)
            shots.add('card')
        r = random.random()
        if r < 0.15:
            page.click('[data-action="judge"][data-correct="1"]')
        elif r < 0.2:
            page.click('[data-action="judge"][data-correct="0"]')
        else:
            page.click(f'[data-action="spoken"][data-v="{random.choice(["yes", "no"])}"]')
    return False


def pass_and_play(browser, errors, width=1280, label='pass'):
    page = browser.new_page(viewport={'width': width, 'height': 860})
    watch(page, errors, label)
    setup(page, 'pass', [('mode', 'points'), ('rounds', 3), ('timer', 60), ('deck', 'club'), ('club', 'LIV')])
    page.click('[data-action="add-player"]')
    page.fill('[data-name="0"]', 'Ayesha')
    page.fill('[data-name="1"]', 'Piash')
    page.fill('[data-name="2"]', 'Tanvir')
    page.click('[data-action="start"]')
    page.click('[data-action="roll"]')
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / f'{label}-dice.png'))
    page.click('[data-action="deal"]')
    shots, start = set(), time.time()
    page.set_default_timeout(3000)
    while time.time() - start < 120:
        page.wait_for_timeout(120)
        try:
            if pass_step(page, shots, label):
                break
        except PlaywrightTimeout:
            pass
    assert visible(page, '.final'), 'pass & play game did not finish'
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / f'{label}-final.png'), full_page=True)
    print(f'{label}: finished in {time.time() - start:.0f}s')
    page.close()


def phone(browser, errors):
    page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    watch(page, errors, 'phone')
    setup(page, 'cpu', [('cpus', 4)])
    page.screenshot(path=str(OUT / 'phone-setup.png'))
    page.click('[data-action="start"]')
    page.click('[data-action="roll"]')
    page.wait_for_timeout(900)
    page.click('[data-action="deal"]')
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / 'phone-table.png'), full_page=True)
    width = page.evaluate('document.documentElement.scrollWidth')
    assert width <= 390, f'phone page scrolls sideways ({width}px)'
    page.close()
    pass_and_play(browser, errors, width=390, label='phone-pass')


def online_step(pages):
    """Every device takes one look; the first that can act does. True if someone acted."""
    for p in pages:
        if visible(p, '[data-action="next-round"]'):
            tap(p, '[data-action="next-round"]'); return True
        if visible(p, '[data-action="vote"][data-v="yes"]'):
            rec = p.locator('.records b')
            v = ('yes' if rec.inner_text() == 'YES' else 'no') if rec.count() else random.choice(['yes', 'no'])
            tap(p, f'[data-action="vote"][data-v="{v}"]'); return True
        if visible(p, '.panel .tabs'):
            r = random.random()
            if r < 0.3:
                p.click('[data-action="tab"][data-tab="own"]')
                p.fill('[data-model="qText"]', 'Am I left-footed?')
                p.click('[data-action="ask-text"]')
            elif r < 0.4:
                p.click('[data-action="tab"][data-tab="guess"]')
                p.fill('[data-model="guessText"]', 'Lionel Messi')
                p.click('[data-action="guess"]')
            else:
                p.click('[data-action="tab"][data-tab="deck"]')
                items = p.locator('.q-item:not([disabled])')
                items.nth(random.randrange(min(items.count(), 5))).click()
            return True
    return False


def online(browser, errors):
    ctxs = [browser.new_context(viewport={'width': 1200, 'height': 860}) for _ in range(3)]
    pages = [c.new_page() for c in ctxs]
    for k, p in enumerate(pages):
        watch(p, errors, f'online{k}')
    host, a, b = pages
    setup(host, 'online', [('mode', 'points'), ('rounds', 3), ('fame', 1)])
    host.fill('[data-name="0"]', 'Host')
    host.click('[data-action="create-room"]')
    host.wait_for_selector('.room-code span', timeout=20000)
    code = ''.join(host.locator('.room-code span').all_inner_texts())
    print('room', code)
    for p, name in ((a, 'Amy'), (b, 'Bo')):
        setup(p, 'online')
        p.fill('[data-name="0"]', name)
        p.fill('[data-code]', code)
        p.click('[data-action="join"]')
        p.wait_for_selector('.lobby-board .room-code', timeout=20000)
    host.wait_for_function('document.querySelectorAll(".seats li:not(.empty)").length === 3', timeout=15000)
    host.screenshot(path=str(OUT / 'online-lobby.png'))
    host.click('[data-action="online-start"]')
    host.click('[data-action="roll"]')
    host.wait_for_timeout(900)
    host.click('[data-action="deal"]')
    a.wait_for_selector('.deed', timeout=10000)
    # own card hidden on every device, others visible
    for k, p in enumerate(pages):
        p.wait_for_timeout(300)
        backs = p.locator('.seats-grid .deed-back').count()
        assert backs == 1, f'device {k} sees {backs} hidden cards'
    a.screenshot(path=str(OUT / 'online-guest.png'))

    dropped = False
    start = time.time()
    for p in pages:
        p.set_default_timeout(3000)
    while time.time() - start < 240:
        if visible(host, '.final'):
            break
        acted = False
        try:
            acted = online_step(pages)
        except PlaywrightTimeout:
            pass
        if not dropped and time.time() - start > 20:
            # Bo reloads mid-game: the seat is kept and they rejoin
            dropped = True
            b.reload()
            b.wait_for_selector('[data-action="rejoin"]', timeout=10000)
            b.click('[data-action="rejoin"]')
            b.wait_for_selector('.deed', timeout=20000)
            print('Bo rejoined')
        host.wait_for_timeout(300 if acted else 500)
    assert visible(host, '.final'), 'online game did not finish'
    for k, p in enumerate(pages):
        p.wait_for_selector('.final', timeout=10000)
        p.screenshot(path=str(OUT / f'online-final-{k}.png'), full_page=True)
    print(f'online: finished in {time.time() - start:.0f}s')
    for c in ctxs:
        c.close()


def main():
    errors = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome')
        if 'online' in sys.argv[1:]:
            online(browser, errors)
        else:
            vs_computer(browser, errors)
            pass_and_play(browser, errors)
            phone(browser, errors)
        browser.close()
    if errors:
        print('\n'.join(errors))
        sys.exit(1)
    print('UI OK')


if __name__ == '__main__':
    main()
