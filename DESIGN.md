# InsiderTrades — Design System v3

> **Brief DA** : "Dark Analyst Terminal" — l'esthétique d'un outil professionnel pour traders et analystes. Précision de Bloomberg, modernité de Koyfin, ambiance d'un terminal de données propriétaire. Chaque pixel doit respirer l'intelligence financière.

---

## 1. Direction Artistique

### Concept
**"Midnight Intelligence"** — Un outil conçu par des analystes, pour des analystes. L'interface doit donner le sentiment d'accéder à des données privilégiées. Fond presque noir (navy profond), accents électriques, typographie rigoureuse, données qui respirent.

### Inspirations
- **Koyfin** — densité de données, grille propre, turquoise
- **Visible Alpha** — dark premium, courbes violettes
- **TradingView** — ergonomie terminale, lisibilité maximale
- **Linear** — micro-animations, typographie précise
- **Bloomberg Terminal** — autorité des données (sans l'aspect rétro)

### Anti-patterns à éviter
- ❌ Purple-black backgrounds (trop "crypto")
- ❌ Gradients trop flashy
- ❌ Cards avec trop d'ombres
- ❌ Texte trop petit sur fond sombre
- ❌ Typo "tech startup" générique (Space Grotesk isolé)

---

## 2. Palette de couleurs

### Backgrounds (Navy profond, pas violet-noir)
```
--bg-base:     #050C18   /* Midnight navy — fond de page */
--bg-surface:  #0A1628   /* Surface — cards principales */
--bg-raised:   #0F1E36   /* Raised — dropdown, inner cards */
--bg-hover:    #152644   /* Hover state */
--bg-active:   #1A2E52   /* Active / selected */
```

### Borders
```
--border:        rgba(99, 155, 255, 0.08)   /* très subtil, teinté bleu */
--border-med:    rgba(99, 155, 255, 0.12)
--border-strong: rgba(99, 155, 255, 0.22)
```

### Brand Colors
```
/* Indigo électrique (Primary) */
--c-indigo:    #5B8AF6   /* Bleu électrique — plus "finance" que violet */
--c-indigo-2:  #7BA3FF   /* Hover state */
--c-indigo-3:  #3B6AD4   /* Light mode */
--c-indigo-bg: rgba(91, 138, 246, 0.10)
--c-indigo-bd: rgba(91, 138, 246, 0.22)

/* Emerald signal (Achat / Positif) */
--c-emerald:    #10B981   /* Emerald — plus lisible que le mint précédent */
--c-emerald-2:  #34D399
--c-emerald-bg: rgba(16, 185, 129, 0.10)
--c-emerald-bd: rgba(16, 185, 129, 0.22)

/* Crimson (Vente / Négatif) */
--c-crimson:    #F43F5E   /* Rose-rouge vif, plus lisible */
--c-crimson-2:  #FB7185
--c-crimson-bg: rgba(244, 63, 94, 0.10)
--c-crimson-bd: rgba(244, 63, 94, 0.22)

/* Amber (Score moyen / Warning) */
--c-amber:      #F59E0B
--c-amber-bg:   rgba(245, 158, 11, 0.10)
--c-amber-bd:   rgba(245, 158, 11, 0.22)

/* Violet (Score élevé / Premium) */
--c-violet:     #A78BFA
--c-violet-bg:  rgba(167, 139, 250, 0.10)
--c-violet-bd:  rgba(167, 139, 250, 0.22)
```

### Text
```
--tx-1: #E8F0FE   /* Blanc légèrement teinté bleu (pas blanc pur) */
--tx-2: #8BA6CC   /* Secondaire — labels, sous-titres */
--tx-3: #4D6A8A   /* Tertiaire — placeholders, metadata */
--tx-4: #2C3F5C   /* Quaternaire — très discret */
```

---

## 3. Typographie

### Hiérarchie
```
Display / Hero:    Banana Grotesk Pro 2, 700, -0.04em tracking, 1.0 lh
Headlines (H1-H3): Banana Grotesk Pro 2, 600-700, -0.03em
Labels/UI:         Inter, 500-600, 0em
Body:              Inter, 400, 0.01em
Data/Numbers:      Banana Grotesk Pro 2, 700, tabular-nums, -0.04em  
Mono (ISIN/code):  JetBrains Mono, 400-500
```

### Imports à ajouter
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
```

### Scale typographique
```
--text-xs:   0.72rem  (11.5px)
--text-sm:   0.8125rem (13px)   
--text-base: 0.9375rem (15px)
--text-md:   1.0625rem (17px)
--text-lg:   1.25rem   (20px)
--text-xl:   1.5rem    (24px)
--text-2xl:  2rem      (32px)
--text-3xl:  2.5rem    (40px)
--text-4xl:  3.5rem    (56px)
--text-hero: clamp(3rem, 6vw, 5.5rem)
```

**Règle des nombres** : Toujours `font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1, "zero" 1;` pour les valeurs financières.

---

## 4. Système de cards

### Card Standard
```
background: var(--bg-surface)
border: 1px solid var(--border-med)
border-radius: 16px
padding: 20-24px
box-shadow: 0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,155,255,0.04)
```

### Card KPI (avec accent top)
```
border-top: 2px solid {accent-color}
+ gradient subtle en background (10% de l'accent)
```

### Card Signal
```
+ barre gauche 3px colorée (emerald=achat, crimson=vente)
+ badge score en top-right
+ hover: légère elevation + border plus visible
```

### Card Data Dense
```
Nouvell type pour signaux/déclarations
padding interne réduit (12-16px)
Montants en mono, plus grand
```

---

## 5. Composants UI

### Badges
```
Score ≥ 75 : badge-premium (violet, gradient)
Score 55-74 : badge-strong (emerald)
Score 40-54 : badge-neutral (amber)
Score < 40  : badge-weak (gris)
```

### Boutons
```
Primary : Fond indigo avec glow subtil
Secondary: Outline avec hover teinté
Ghost: Transparent avec hover bg-raised
CTA Marketing: Gradient indigo→violet
```

### Tableaux
```
En-têtes: tx-3, uppercase, 0.68rem, tabspacing 0.1em
Lignes: alternance bg-surface / bg-raised (zebra)
Hover: bg-hover
Valeurs positives: c-emerald
Valeurs négatives: c-crimson
```

---

## 6. Layout & Grille

### Sidebar
```
Compacte 60px → expanded 200px
Brand accent: gradient vertical indigo→emerald sur bord gauche
Logo: logomark compact (SVG inline)
```

### Topbar
```
Height: 52px
Blur: backdrop-filter blur(24px)
Border bottom: border-med
Contenu: recherche + user + theme
```

### Content
```
max-width: 1280px (plus large)
padding: 32px 32px
gap entre sections: 48px
```

---

## 7. Illustrations & Visuels

### 6 visuels prévus
1. **Hero illustration** — Réseau de connexions financières, candlesticks stylisés, fond bleu profond
2. **Signal card bg** — Fond abstrait pour cards de signaux (ondulations de données)
3. **Backtest viz** — Courbe de performance equity, fond sombre, lignes précises
4. **Insider network** — Graphe de connexions dirigeants/sociétés
5. **Data flow** — Flux de données AMF→algorithme→signal
6. **Empty state** — Illustration pour états vides (telescope ou radar)

### Logo v3
- Wordmark "InsiderTrades" en Banana Grotesk Pro 2 Bold
- Logomark: Deux initiales "IT" stylisées avec une flèche upward intégrée dans le T
- Couleur: gradient indigo→emerald ou flat indigo
- Déclinaisons: horizontal, carré (favicon), monochrome

---

## 8. Micro-interactions & Animations

### Principles
- Durée: 150ms (UI) / 300ms (transitions) / 500ms (reveals)
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (spring-like)
- Hover: translateY(-1px) + glow subtil sur CTA
- Numbers: counter animation sur KPIs
- Charts: draw-in progressif (ligne tracée)

### States
```
Loading: skeleton shimmer (teinte bleue, pas grise)
Empty: illustration + message contextualisé
Error: rouge discret, message actionnable
Success: flash emerald
```

---

## 9. Contraste & Accessibilité

- tx-1 sur bg-base: ratio > 7:1 ✓
- tx-2 sur bg-surface: ratio > 4.5:1 ✓
- Badges colorés: valeur texte renforcée en light mode
- Focus visible: outline 2px indigo
- Taille minimale texte: 13px

---

## 10. Tokens CSS complets

Voir `src/app/globals.css` — section `DESIGN TOKENS v3`.

---

*Version 3.0 — Avril 2026 — InsiderTrades DA*
