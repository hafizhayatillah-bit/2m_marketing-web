STACK: HTML + Tailwind (standalone CLI, no Node) + vanilla JS. Build via build_css.py.
COLORS: primary #0766AD | secondary #29ADB2 | accent #C5E898 | surface #FFF | canvas #F3F3F3 | ink #1A1A1A | ink-muted #6B6B6B
FONTS: font-display=Poppins (headings/nav/button) | font-body=Inter (paragraf/caption)
ICONS: Iconify CDN, <iconify-icon icon="lucide:xxx"> | Brand/social (WA, IG, TikTok) & map pin = Flaticon UIcons (<i class="fi fi-brands-xxx">, fi-sr-marker), warna ikut currentColor token (text-white/text-primary/text-ink/dst)
BREAKPOINT: mobile<768px, tablet 768-1279px, desktop≥1280px
LAYOUT: header/footer = partial via partials.js, injected ke #site-header/#site-footer
NAV ACTIVE: <body data-page="xxx"> → partials.js set class "active"
LARANGAN GLOBAL (semua halaman): cart, login, search bar, harga di produk, order toggle
CTA WA: format wa.me/62XXXXXXXXXX — nomor final masih open item, pakai placeholder