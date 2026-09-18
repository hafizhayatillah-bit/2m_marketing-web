STACK: HTML + Tailwind (standalone CLI, no Node) + vanilla JS. Build via build_css.py.
COLORS: primary #0038A8 | secondary #1E40AF | accent #E50000 | surface #FFFFFF | canvas #F8FAFC | ink #0038A8 | ink-muted #475569
FONTS: font-display=Poppins (headings/nav/button) | font-body=Inter (paragraf/caption)
ICONS: Iconify CDN, <iconify-icon icon="lucide:xxx"> | Brand/social (WA, IG, TikTok) & map pin = Flaticon UIcons (<i class="fi fi-brands-xxx">, fi-sr-marker), warna ikut currentColor token (text-white/text-primary/text-ink/dst)
BREAKPOINT: mobile<768px, tablet 768-1279px, desktop≥1280px
LAYOUT: header/footer = partial via partials.js, injected ke #site-header/#site-footer
NAV ACTIVE: <body data-page="xxx"> → partials.js set class "active"
LARANGAN GLOBAL (semua halaman): cart, login, search bar, harga di produk, order toggle
CTA WA: format wa.me/62XXXXXXXXXX — nomor final masih open item, pakai placeholder