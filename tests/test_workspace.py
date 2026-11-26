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
        self.desktop_tooltips = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs: self.ids.append(attrs["id"])
        if "data-page" in attrs: self.pages.add(attrs["data-page"])
        if "data-screen" in attrs: self.screens.add(attrs["data-screen"])
        if "data-tooltip" in attrs: self.desktop_tooltips.append(attrs["data-tooltip"])

class WorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.page = Page()
        self.page.feed((ROOT / "index.html").read_text())
    def test_unique_ids(self):
        self.assertEqual(len(self.page.ids), len(set(self.page.ids)))
    def test_navigation_matches_screens(self):
        self.assertTrue(self.page.pages.issubset(self.page.screens))
        self.assertEqual(self.page.screens - self.page.pages, {"ativo"})
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

    def test_desktop_navigation_explains_hover_actions(self):
        self.assertEqual(len(self.page.desktop_tooltips), 5)
        self.assertTrue(all(text.strip() for text in self.page.desktop_tooltips))
        css = (ROOT / "assets/approved-layout.css").read_text()
        self.assertIn(".desktop-nav a[data-tooltip]:hover::after", css)
        self.assertIn(".desktop-nav button[data-tooltip]:focus-visible::after", css)

    def test_asset_analysis_stays_inside_workspace(self):
        html = (ROOT / "index.html").read_text()
        self.assertLess(html.index('id="asset-screen"'), html.index('<dialog id="nav-sheet"'))
        code = (ROOT / "assets/app.js").read_text()
        self.assertIn("renderAssetPage(currentAsset)", code)

    def test_no_global_period_selector(self):
        html = (ROOT / "index.html").read_text()
        code = (ROOT / "assets/app.js").read_text()
        self.assertNotIn("data-period-days", html)
        self.assertIn("const selectedDays = 120;", code)

    def test_lazy_asset_sections(self):
        for name in ["asset-price-chart","asset-wealth-chart","asset-income-panel","asset-events-panel","catalog-retry"]:
            self.assertIn(name, self.page.ids)
        html = (ROOT / "index.html").read_text()
        self.assertNotIn('id="asset-dialog"', html)
        self.assertNotIn('id="performance-dialog"', html)

    def test_performance_requests_are_batched(self):
        code = (ROOT / "assets/app.js").read_text()
        self.assertIn("for(let offset=0;offset<assets.length;offset+=4)", code)
        self.assertNotIn("Promise.all(positions.filter(p => apiTypes.has(p.asset_type)).map", code)

    def test_projected_profit_can_use_dividend_yield_ceiling(self):
        code = (ROOT / "assets/workspace.js").read_text()
        self.assertIn('data-param="basis"><option value="earnings">', code)
        self.assertIn('<option value="dividend">DPA projetado ÷ yield desejado', code)
        self.assertIn('dpaProjected/(v.yield/100)', code)
        self.assertIn('input("yield","Yield desejado para preço-teto por dividendos (%)"', code)
        self.assertIn('LPA projetado: ', code)

    def test_transaction_composer_has_trade_fields_and_costs(self):
        html = (ROOT / "index.html").read_text()
        code = (ROOT / "assets/app.js").read_text()
        self.assertIn('id="transaction-category"', html)
        self.assertIn('id="transaction-asset-search"', html)
        self.assertIn('data-transaction-mode="buy"', html)
        self.assertIn('data-transaction-mode="sell"', html)
        self.assertIn('id="transaction-brokerage"', html)
        self.assertIn('id="transaction-fees"', html)
        self.assertIn('id="transaction-total-preview"', html)
        self.assertIn('id="transaction-operation" type="hidden"', html)
        self.assertIn('assets/transaction.css', html)
        self.assertIn('gross+costs', code)
        self.assertIn('gross-costs', code)
