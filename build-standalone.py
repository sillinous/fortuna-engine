#!/usr/bin/env python3
"""Build a single standalone HTML file with all CSS and JS inlined."""
import os, re

dist = os.path.join(os.path.dirname(__file__), 'dist')
html_path = os.path.join(dist, 'index.html')

with open(html_path, 'rb') as f:
    html = f.read().decode('utf-8')

# Find and inline CSS
for css_match in re.finditer(r'<link[^>]+href="(/assets/[^"]+\.css)"[^>]*>', html):
    css_href = css_match.group(1)
    css_file = os.path.join(dist, css_href.lstrip('/'))
    if os.path.exists(css_file):
        with open(css_file, 'rb') as f:
            css_content = f.read().decode('utf-8')
        html = html.replace(css_match.group(0), f'<style>{css_content}</style>')

# Find and inline JS
for js_match in re.finditer(r'<script[^>]+src="(/assets/[^"]+\.js)"[^>]*></script>', html):
    js_href = js_match.group(1)
    js_file = os.path.join(dist, js_href.lstrip('/'))
    if os.path.exists(js_file):
        with open(js_file, 'rb') as f:
            js_content = f.read()
        # Use binary concat to avoid template literal issues
        tag_open = b'<script type="module">'
        tag_close = b'</script>'
        before = html[:html.index(js_match.group(0))].encode('utf-8')
        after = html[html.index(js_match.group(0)) + len(js_match.group(0)):].encode('utf-8')
        result = before + tag_open + js_content + tag_close + after
        # Write binary output
        out_path = os.path.join(os.path.dirname(__file__), '..', 'fortuna-engine-v9.1.html')
        out_path2 = '/mnt/user-data/outputs/fortuna-engine-v9.1.html'
        for p in [out_path, out_path2]:
            with open(p, 'wb') as f:
                f.write(result)
        print(f"Standalone HTML: {os.path.getsize(out_path2):,} bytes → {out_path2}")
        break
else:
    print("ERROR: No JS file found to inline")
