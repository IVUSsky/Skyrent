# Skyrent — Monetization & Optimization Memo (v2)
**Asof:** 2026-06-08 · **Source:** `/api/metrics/portfolio` (production)
**Промени спрямо v1:** asset-weighted loan split, lifecycle stages, pre-construction финансово моделиране, 12m forward amortization

---

## Изпълнително резюме

Портфолиото от 39 имота (33 активни + 2 furnishing + 4 pre-construction) с **3.75M EUR asset base** е по-силно задлъжено отколкото изглеждаше: **real LTV е 39.3%** (не 27.4%) когато се включи 448K EUR обвързаност за Симеоново 12 при доставка 2027. Реалното equity е **2.28M EUR** (не 2.73M). Top 3 immediate lever-а: (1) **завърши 2 furnishing имота Фонтани 4А+5** — текат ~4K EUR/год lihva без приход; (2) **refi на Прокредит ПК-3** (lihva-heavy, 67% от service-а); (3) **план за 448K cash до края на 2027** за Симеоново balance. NOI/Cap Rate числата остават тентативни докато не се импортира бизнес банковата сметка.

---

## Реални числа (v2 endpoint)

### Portfolio overview

| Метрика | Стойност | Бележка |
|---|---|---|
| Properties total | 39 | |
| Лifecycle: active | 33 | носят 119,016 EUR/год contracted rent |
| Лifecycle: furnishing | 2 | Фонтани 4А (155K) + ап.5 (120K) |
| Лifecycle: pre_construction | 4 | Симеоново 12 (~560K total market) |
| **Asset base** | **3,752,998 EUR** | market_val (повечето попълнени) |
| **Total debt** | **1,026,847 EUR** | 9 кредита |
| **Off-plan obligations** | **448,000 EUR** | 80% от Симеоново 12 due 2027-12 |
| **Equity (на book)** | 2,726,151 EUR | asset_base - debt |
| **Real equity** | **2,278,151 EUR** | equity - off_plan |
| LTV (debt-only) | 27.4% | стара картина |
| **Real LTV** | **39.3%** | (debt + off_plan) / asset_base |
| Rent contracted | 119,016 EUR/год | 9,918 EUR/мес |
| Debt service | 53,797 EUR/год | |
| Top 5 concentration | 33.8% | разпръснато |

### Какво още не знаем

Opex данните остават 0 защото на prod има 1500+ транзакции но всички с `scope='personal'` (личен бюджет — заплати, храна, кеш). Бизнес сметката Прокредит SKY CAPITAL OOD не е импортирана още. Без нея:
- NOI = rent (overstated, defacto Cap Rate 3.17% е оптимистичен)
- Vacancy = 0 (приемаме 100% заетост, реално bank shows само 5,960 EUR / 12м постъпили)
- Tenant payment failure detection — невъзможна

---

## 12-month forward amortization (от endpoint-а)

Дългът ще падне с **25,133 EUR principal** за следващите 12 месеца (от 1.03M → 1.00M). Lihva за периода: **28,664 EUR**. Това значи че **47% от месечната вноска отива в principal** — здраво съотношение, не lihva-heavy portfolio.

### По банка

| Банка | Кредити | Balance EUR | Principal 12m | Lihva 12m | % principal |
|---|---|---|---|---|---|
| Пощенска | 1 | 163,043 | 4,848 | 3,860 | **56%** ← най-добро |
| УниКредит | 5 | 282,261 | 7,461 | 7,533 | 50% |
| **Прокредит** | **3** | **581,543** | **12,824** | **17,271** | **43%** ← lihva-heavy |

### Top 3 lihva-heavy кредити (refi candidates)

| ID | Договор | Balance | Lihva 12m | % lihva | Препоръка |
|---|---|---|---|---|---|
| 9 | **Прокредит ПК-3** | 261K | 7,786 | **67%** | refi candidate №1 |
| 5 | УниКредит карусел 1/3 | 59K | 1,641 | 59% | small |
| 8 | Прокредит ПК-2 | 93K | 2,756 | 52% | refi candidate №2 |

---

## Top 5 Monetization Идеи (v2 — преподредени)

### 🥇 #1 — Завърши 2 furnishing имота Фонтани (4А + 5) ASAP

**Корекция спрямо v1:** Тези НЕ са "заключен capital" — те са в активна инвестиция (обзавеждане). Проблемът: текат разходи без приход.

**Текущо:**
- Фонтани 4А (155K market_val, дълг **74K** — корекция от asset-weighted split, не 33K!)
- Фонтани 5 (120K market_val, дълг **57K**)
- Общ дълг: 131K
- Годишна lihva на този дълг: **~3,955 EUR (текат, без приход)**
- Cash flow drain: -3,955 EUR/год докато не се отдадат

**Потенциален upside при активиране:**
- 1- и 2-стаен в София (Фонтани район) — пazарен наем ~500-600 EUR/мес
- 2 × 550 × 12 = **13,200 EUR/год**
- Минус ~3,955 lihva = **+9,245 EUR/год net**

**Effort:** S-M — само обзавеждане (мебели, бяла техника, decorating).
**Blocker:** капитал за обзавеждане (15-25K EUR for two flats).
**Timeline:** 30-60 дни ако се action-не.

**Препоръка:** **Tier 1.** Всеки месец отлагане = ~330 EUR пропусната печалба.

---

### 🥈 #2 — Refinance Прокредит ПК-3 (261K @ 3%)

**Текущо:** Прокредит ПК-3 = 261K EUR, лихва 3%, **67% от месечната вноска отива в lihva** (само 3,881 EUR principal от 11,667 EUR total service годишно).

**Защо толкова много lihva:** Кредитът е сравнително нов (по-висок balance, по-малко principal погасено) + покрива консолидирано 8 имота Фонтани (5 неработещи гаража + 3 паркинга).

**Опции:**

A) **Refi с УниКредит / Пощенска при 2.4-2.5%**
- 261K × 0.5% разлика = **~1,305 EUR/година спестявания в lihva**
- Effort: M-L (нови учредители ипотека, due diligence)
- Penalty за ранно прекратяване ~1% = 2,610 EUR (ROI ~2 години)

B) **Частично погасяване** с liquidity от 0-LTV имотите (виж #4)
- Намалява balance → расте principal share → плащаш ipotekата по-бързо

C) **Запази, фокусирай на по-доходно place-нане на cash**
- Ако имаш alternative с >3% return → не refi

**Препоръка:** Запитване до 2-3 банки за реални оферти. Decision след offer-ите.

---

### 🥉 #3 — План за 448K EUR cash до края на 2027

**Текущо:** Симеоново 12 (4 имота) е 20% платено (~112K), 80% (~448K) се плаща при доставка ~Q4 2027.

**Източници за 448K cash:**

| Източник | Capacity | Цена | Бележка |
|---|---|---|---|
| Operating cash flow от portfolio | ~65K/год net | 0 | 18 месеца × 65K ≈ 117K (insuficient sam) |
| Equity loan от unleveraged 920K имоти | до 500K при 70% LTV | 2.5-3% | Достъпен но добавя ipoteka |
| Refi-cash-out от Прокредит ПК-3 при refi | 30-50K | 0 | Side-effect от #2 |
| Личен капитал | ? | 0 | Зависи от твоя budget |
| Sale на гаражи без приход (Фонтани 6×45K) | ~200K | 0 (но губиш asset) | Радикална опция |

**Препоръка:** Започни план сега — 18 месеца изглеждат дълго, но 448K не се събират лесно. Запитване до banks за equity loan + калкулация на operating cash flow accumulation.

**Trigger дата:** 2027-06 (12 месеца преди doseam) → revisit с актуални числа.

---

### 🥉 #4 — Оцени 6-те Фонтани гаражи без приход

**Текущо:**
- Гаражи 28, 29, 30, 31, 32, 33 (всеки 45K market_val)
- Дълг per гараж: **21,575 EUR** (LTV 48% — корекция от asset-weighted split, не 72.6%)
- Общ debt: 129K
- Lihva на гаражите/год: **~3,883 EUR** (текат без приход)
- Status: active (✅) но 0 наем

**Опции:**

A) **Активирай ги** — Фонтани е централен квартал, демонd за паркинг съществува
- 6 × 130 EUR/мес × 12 = **9,360 EUR/год**
- Net: 9,360 - 3,883 lihva = **+5,477 EUR/год**
- Effort: S (агенция или собствено marketing)

B) **Продажба** при market price (45K each или по-високо)
- 6 × 45K = 270K bruto, ~225K net (15% costs)
- Погасяване на 225K от Прокредит ПК-3 → спестява ~6,750 EUR/год lihva
- Effort: M (договори + nadenne купувач за 6 гаражи)

**Препоръка:** A. Активирай за тест 60 дни. Ако no demand → B.

---

### 🥉 #5 — Bank import (по-висок приоритет след v2)

**Текущо:** rent_received_12m = 5,960 EUR vs contracted 119,016 EUR = 5% bank visibility.

**Защо приоритетът се повиши:** Сега portfolio модела показва че real_ltv е 39.3% (с pre-construction). При истински opex от bank import → можем да видим:
- Кои имоти действително губят пари (negative net cash flow)
- Дали Cap Rate ranking е валиден (top performers може да са с високи разходи)
- DSCR realistic (текущо 2.2 е overstated)

**Effort:** M (изчакване bank maintenance + 3-year ProBanking import на бизнес сметка)

**Препоръка:** Tier 1 веднага щом банката се върне online. Без това всички decision-и тук имат ±20% несигурност.

---

## Идеи отхвърлени / отложени

| Идея | Защо |
|---|---|
| STR / Airbnb conversion | LTR-only portfolio per memory; regulatory headache |
| Geo-clustering анализ | 39 имота с няколко локации — твърде малка вибора за heatmap |
| Tenant cohort анализ | tenant_history съществува но без bank data корелация не работи |
| Property management SaaS upsell | Skyrent ВЕЧЕ заменя SaaS |
| IRR / NPV modeling | Hold-forever LTR — IRR без exit assumption е vanity |
| Tax-loss harvesting | BG capital gains структура не позволява |
| Преразпределение на 920K unleveraged equity сега | Hold докато не се определи цел (или Симеоново балance, или нова покупка) |

---

## Action list (30 / 90 / 180 дни)

### Следващите 30 дни — Immediate

- [ ] **Реши план за обзавеждане на Фонтани 4А и 5** — capital, agency, timeline (всеки месец = ~330 EUR пропуск)
- [ ] **Пробен anons за наем на 1-2 от Фонтани гаражите** (agency или OLX) — да тестваш demand
- [ ] **Bank import** когато Прокредит maintenance свърши — приоритет business сметка
- [ ] **Запитване до УниКредит/Пощенска** за refi условия на Прокредит ПК-3 (261K @ 3%)

### Следващите 90 дни — Q3 2026

- [ ] **Phase 3 UI tab "Инвеститорско view"** в Skyrent dashboard
- [ ] **Phase 2 monthly snapshots cron** — trend графики
- [ ] **Активиране на Фонтани 4А и 5** (ETA от плана)
- [ ] **Допълни мазетата** като отделни property records
- [ ] **Decision за гаражите** — A (активирай) или B (продай)

### Следващите 180 дни — Q4 2026

- [ ] **Reall NOI per имот** след поне 6 месеца bank data
- [ ] **Strategic review** — Cap Rate ranking с реален opex; кои имоти да продаваме
- [ ] **Equity capacity report** — колко допълнителен дълг можем да поемем (DSCR > 1.5 цел)
- [ ] **Симеоново 12 cash план** — конкретен timeline + източници

### 2027 — Strategic

- [ ] **H1 2027:** Revisit Симеоново 12 cash план; финализирай equity loan ако нужен
- [ ] **Q4 2027:** Плащане 448K balance due → активиране на 4-те имота → +35-50K EUR/год потенциал

---

## Промени в моделирането (v1 → v2)

| Какво | v1 | v2 |
|---|---|---|
| Loan allocation | equal split per имот | **asset-weighted** (proportional на market_val) |
| Симеоново 12 | "460K заключен capital" | 92K paid + 448K future obligation |
| Equity | 2.73M (overstated) | real_equity 2.28M |
| LTV | 27.4% | real_ltv 39.3% (включва off-plan) |
| Property states | binary active/inactive | 8-state enum (active/listing/furnishing/renovating/pre_construction/...) |
| Debt amortization | не показвано | 12m forward (principal/interest per loan + portfolio) |
| LTV outliers (гаражи 229%) | bug в equal split | fixed → 47.9% (реалистично) |

---

## Числа които ще се напълнят след bank import

- `portfolio.opex_annual` → 0 → реален (вероятно 15-22K годишно)
- `portfolio.noi_annual` → 119K → 95-100K
- `portfolio.cap_rate` → 3.17% → 2.5-2.7%
- `portfolio.dscr` → 2.2 → 1.6-1.8
- `portfolio.cash_on_cash` → 2.4% → 1.5-1.8%
- `portfolio.rent_received_12m` → 5,960 → 110-119K
- `by_property[*].opex_*` → 0 → expense ratio outliers visible

---

*Memo v2 генериран от `/api/metrics/portfolio` v2 endpoint (PR #4 merged 2026-06-08). Phase 3 UI + Phase 2 cron остават bucklist.*
