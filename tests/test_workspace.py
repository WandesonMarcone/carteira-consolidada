import pathlib
import re
import unittest
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parents[1]

class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.pages = set()
        self.screens = set()
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs: self.ids.append(attrs["id"])
        if "data-page" in attrs: self.pages.add(attrs["data-page"])
        if "data-screen" in attrs: self.screens.add(attrs["data-screen"])

class WorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.page = Page()
        self.page.feed((ROOT / "index.html").read_text())
    def test_unique_ids(self):
        self.assertEqual(len(self.page.ids), len(set(self.page.ids)))
    def test_navigation_matches_screens(self):
        self.assertEqual(self.page.pages, self.page.screens)
        self.assertEqual(len(self.page.pages), 9)
    def test_static_dom_references(self):
        code = "\n".join((ROOT / p).read_text() for p in ["assets/app.js", "assets/workspace.js"])
        ids = set(re.findall(r'\$\("#([^"]+)"\)', code))
        self.assertEqual(ids - set(self.page.ids), {"logout"}) # criado após login

    def test_theme_switch(self):
        self.assertIn("theme-toggle", self.page.ids)
        html = (ROOT / "index.html").read_text()
        self.assertIn('src="./assets/theme.js"', html)
        css = (ROOT / "assets/styles.css").read_text()
        self.assertIn('[data-theme="light"]', css)

    def test_approved_layout(self):
        html = (ROOT / "index.html").read_text()
        self.assertIn('class="desktop-nav"', html)
        self.assertIn('class="bottom-nav"', html)
        self.assertIn('assets/approved-layout.css', html)
        self.assertIn('id="method-class" type="hidden" value="stock"', html)
        self.assertIn('id="asset-method-section"', html)
        self.assertIn("dash-wealth", self.page.ids)
