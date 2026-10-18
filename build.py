"""Build the Data Skunkworks portfolio from site.json.

    python build.py

Writes index.html, 404.html and one page per piece at <slug>/index.html. Every link is relative,
so the same files work at thomasc91.github.io/dataskunkworks/ and at a custom domain.
Standard library only.
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FONTS = ('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Jersey+15'
         '&family=Space+Mono:wght@400;700&display=swap')
FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' "
           "rx='4' fill='%230f0f10'/%3E%3Crect x='9' y='9' width='14' height='14' fill='%234040ff'/%3E%3C/svg%3E")
PLAY = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11l9-5.5z" fill="currentColor"/></svg>'


def esc(s):
    return html.escape(str(s), quote=True)


def inline(s):
    """Escape, then allow [text](url), **strong** and *em*."""
    s = esc(s)
    s = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', s)
    return s


def code_url(site, p):
    if p.get('code_url'):
        return p['code_url']
    return f"https://github.com/{site['repo']}/tree/{site['branch']}/{p['code']}"


def head(site, title, desc, depth, image=None, path=''):
    up = '../' * depth
    base = site['base_url'].rstrip('/') + '/'
    og_image = f'<meta property="og:image" content="{esc(base + image)}">' if image else ''
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{esc(base + path)}">
<meta property="og:type" content="website">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{esc(base + path)}">
{og_image}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0f0f10">
<meta name="color-scheme" content="dark">
<link rel="icon" href="{FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="{up}assets/site.css">
</head>
<body>
<header class="top"><div class="wrap">
  <a class="mark" href="{up or './'}"><i></i>{esc(site['title'])}</a>
  <nav class="nav"><a href="{up or './'}#work">/work</a><a href="{up or './'}#about">/about</a><a class="hide-sm" href="https://github.com/{esc(site['github'])}">/github</a></nav>
</div></header>
'''


def foot(site, depth, base=None):
    js = f'<script src="{base or "../" * depth}assets/site.js"></script>\n'
    return f'''<footer class="foot"><div class="wrap">
  <span>{esc(site['owner'])}, {esc(site['place'])}</span>
  <span>Every piece runs in your browser. <a href="https://github.com/{esc(site['repo'])}">The code is on GitHub.</a></span>
</div></footer>
{js}</body>
</html>
'''


def kicker(p):
    bits = [str(p['year'])] + p.get('kicker', [])
    return '<p class="kicker">' + ' <span class="dot">/</span> '.join(esc(b) for b in bits) + '</p>'


def thumb(p, up):
    tag = f'<span class="tag">{esc(p["badge"])}</span>' if p.get('badge') else ''
    return (f'<div class="thumb"><img src="{up}{esc(p["thumb"])}" alt="" loading="lazy" '
            f'width="1280" height="800">{tag}</div>')


def build_home(site, pieces):
    feat = next((p for p in pieces if p.get('featured')), pieces[0])
    rest = [p for p in pieces if p is not feat]
    cards = '\n'.join(f'''  <a class="card" href="{esc(p['slug'])}/">
    {thumb(p, '')}
    {kicker(p)}
    <h3>{esc(p['title'])}</h3>
    <p class="sum">{inline(p['summary'])}</p>
  </a>''' for p in rest)
    about = '\n'.join(f'    <p>{inline(t)}</p>' for t in site['about'])
    out = head(site, f"{site['title']}: {site['owner']}", site['description'], 0,
               image=feat['thumb'])
    out += f'''<main class="wrap">
<section class="hero">
  <div class="byline">
    {f'<img class="avatar" src="{esc(site["avatar"])}" alt="{esc(site["owner"])}" width="48" height="48">' if site.get('avatar') else ''}
    <p class="kicker">{esc(site['owner'])} <span class="dot">/</span> {esc(site['place'])}</p>
  </div>
  <h1>{inline(site['headline'])}</h1>
  <p class="lede">{inline(site['lede'])}</p>
</section>

<a class="featured" href="{esc(feat['slug'])}/">
  {thumb(feat, '')}
  <div class="meta">
    {kicker(feat)}
    <h2>{esc(feat['title'])}</h2>
    <p class="sum">{inline(feat['summary'])}</p>
    <span class="go">Explore it</span>
  </div>
</a>

<div class="section-head" id="work"><h2>All work</h2><p class="kicker">{len(pieces)} pieces</p></div>
<section class="grid">
{cards}
</section>

<section class="about" id="about">
  <h2>About</h2>
  <div>
{about}
  </div>
</section>
</main>
'''
    out += foot(site, 0)
    (ROOT / 'index.html').write_text(out, encoding='utf-8', newline='\n')


def build_piece(site, pieces, i):
    p = pieces[i]
    up = '../'
    src = up + p['entry']
    code = code_url(site, p)
    sections = []
    for sec in p['writeup']:
        paras = '\n'.join(f'    <p>{inline(t)}</p>' for t in sec['p'])
        sections.append(f'    <h2>{esc(sec["h"])}</h2>\n{paras}')
    facts = '\n'.join(f'      <div><dt>{esc(k)}</dt><dd>{inline(v)}</dd></div>' for k, v in p['facts'])
    facts += f'\n      <div><dt>Code</dt><dd><a href="{esc(code)}">{esc(p.get("code_label") or p["code"] + " on GitHub")}</a></dd></div>'
    prev_p = pieces[i - 1] if i > 0 else None
    next_p = pieces[i + 1] if i + 1 < len(pieces) else None
    pager = ''
    if prev_p:
        pager += f'<a class="prev" href="../{esc(prev_p["slug"])}/"><span class="kicker">Previous</span><span class="t">{esc(prev_p["title"])}</span></a>'
    else:
        pager += '<span></span>'
    if next_p:
        pager += f'<a class="next" href="../{esc(next_p["slug"])}/"><span class="kicker">Next</span><span class="t">{esc(next_p["title"])}</span></a>'
    note = f'<span class="note">{esc(p["load_note"])}</span>' if p.get('load_note') else ''
    out = head(site, f"{p['title']}: {site['title']}", p['summary'], 1, image=p['thumb'], path=p['slug'] + '/')
    out += f'''<main class="wrap piece">
  <a class="back" href="../">&larr; /all work</a>
  {kicker(p)}
  <h1>{esc(p['title'])}</h1>
  <p class="standfirst">{inline(p['standfirst'])}</p>

  <div class="stage" data-src="{esc(src)}" data-title="{esc(p['title'])}">
    <img class="poster" src="{up}{esc(p['thumb'])}" alt="">
    <a class="start" href="{esc(src)}">{PLAY} Open the interactive</a>
    {note}
    <span class="status" role="status"><i></i>Loading</span>
  </div>
  <div class="stage-bar">
    <a href="{esc(src)}">Open full screen</a>
    <a href="{esc(code)}">View the code on GitHub &#8599;</a>
  </div>

  <div class="body">
    <article class="writeup">
{chr(10).join(sections)}
    </article>
    <aside class="facts"><dl>
{facts}
    </dl></aside>
  </div>

  <nav class="pager">{pager}</nav>
</main>
'''
    out += foot(site, 1)
    d = ROOT / p['slug']
    d.mkdir(exist_ok=True)
    (d / 'index.html').write_text(out, encoding='utf-8', newline='\n')


def build_404(site):
    # GitHub Pages serves 404.html at any depth, so this page uses absolute links to the site root.
    base = site['base_url'].rstrip('/') + '/'
    out = head(site, f"Not found: {site['title']}", site['description'], 0)
    out = out.replace('href="assets/site.css"', f'href="{base}assets/site.css"').replace('href="./', f'href="{base}')
    out += f'''<main class="wrap lost">
  <p class="kicker">404</p>
  <h1>Nothing here.</h1>
  <p>That page doesn't exist. <a href="{base}">Back to all the work.</a></p>
</main>
'''
    out += foot(site, 0, base=base)
    (ROOT / '404.html').write_text(out, encoding='utf-8', newline='\n')


def main():
    data = json.loads((ROOT / 'site.json').read_text(encoding='utf-8'))
    site, pieces = data['site'], data['pieces']
    for p in pieces:
        for k in ('slug', 'title', 'summary', 'standfirst', 'year', 'entry', 'code', 'thumb', 'facts', 'writeup'):
            assert k in p, f"{p.get('slug')}: missing {k}"
        assert (ROOT / p['entry']).exists(), f"{p['slug']}: entry {p['entry']} not found"
        assert '—' not in json.dumps(p, ensure_ascii=False), f"{p['slug']}: no em dashes"
    build_home(site, pieces)
    for i in range(len(pieces)):
        build_piece(site, pieces, i)
    build_404(site)
    print(f'built index.html, 404.html and {len(pieces)} piece pages')


if __name__ == '__main__':
    main()
