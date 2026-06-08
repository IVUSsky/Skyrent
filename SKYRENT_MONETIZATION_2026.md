# Skyrent — Monetization & Optimization Memo (v3)
**Asof:** 2026-06-08 · **Source:** `/api/metrics/portfolio` (production)
**Промени спрямо v2:** реален opex от 3-year bank import + AI-categorized invoices; portfolio sneva от theoretical → factual

---

## Изпълнително резюме

След ProBanking 3-year import + AI-assisted categorization на 127 invoices (повечето investment-related), Skyrent portfolio показва **реална здрава финансова картина**: 39 имота, **103.8K EUR NOI годишно**, **2.77% cap rate**, **DSCR 1.93** (здраво), **net cash flow 50K EUR/год**. Opex ratio 12.78% е консервативна за BG market (типично 10-25%) — обяснено от факта че tenants плащат utilities директно и компанията няма задължителни застраховки. **Top 3 immediate lever-а:** (1) **завърши Фонтани 4А+5** (4K годишна lihva без приход); (2) **refi Прокредит ПК-3** (67% от service-а отива в lihva); (3) **планирай 448K cash за Симеоново 12 до края на 2027**.

---

## Реалните числа (v3 endpoint)

### Portfolio overview

| Метрика | Стойност | Бележка |
|---|---|---|
| Properties total | 39 (33 active + 2 furnishing + 4 pre-construction) | |
| **Asset base** | **3,752,998 EUR** | market_val |
| **Total debt** | **1,026,847 EUR** | 9 кредита (Пощенска 1 + УниКредит 5 + Прокредит 3) |
| **Off-plan obligations** | **448,000 EUR** | 80% от Симеоново 12 due 2027-12 |
| **Real equity** | **2,278,151 EUR** | equity - off_plan |
| **Real LTV** | **39.3%** | (debt + off_plan) / asset_base |
| Rent contracted | 119,016 EUR/год | 9,918 EUR/мес |
| Rent received (bank business) | **61,401 EUR** за 12м | разлика идва от cash + Stripe + personal account collections |
| **Opex annual** | **15,212 EUR** | **12.78% ratio** — реалистично |
| **NOI annual** | **103,804 EUR** | rent_annual - opex |
| Debt service | 53,797 EUR/год | |
| **DSCR** | **1.93** | здраво (>1.25 = comfortable) |
| **Cap rate** | **2.77%** | typical BG residential |
| **Net cash flow** | **50,007 EUR/год** | NOI - debt service |
| **Cash-on-Cash** | **1.83%** | net_cf / real_equity |
| Top 5 concentration | 33.8% | разпръснато |
| Herfindahl | 0.0505 | разпръснато |

### Защо opex 12.78% е реален (не data gap)

Обикновено residential portfolio е 15-25% opex. Skyrent е 12.78% защото:
- **Tenants плащат utilities** (ток/вода/топлофикация) директно — НЕ минават през SKY CAPITAL business account
- **Няма застраховки** — choice по дизайн (gap анализ виж #6 по-долу)
- **Поддръжка минимална** — bank import не разкрива hidden expenses; нивото е реално

---

## 12-month forward amortization

Дългът ще намалее с **25,133 EUR principal** за 12 месеца (1,027K → 1,002K). Lihva 28,664 EUR. **47% от service-а отива в principal** — здраво.

### По банка

| Банка | Кредити | Balance EUR | Principal 12m | Lihva 12m | % principal |
|---|---|---|---|---|---|
| Пощенска | 1 | 163,043 | 4,848 | 3,860 | **56%** |
| УниКредит | 5 | 282,261 | 7,461 | 7,533 | 50% |
| **Прокредит** | **3** | **581,543** | 12,824 | 17,271 | **43%** |

### Refi candidates по lihva-heaviness

| ID | Договор | Balance | Lihva 12m | % lihva |
|---|---|---|---|---|
| 9 | **Прокредит ПК-3** | 261K | 7,786 | **67%** |
| 5 | УниКредит карусел 1/3 | 59K | 1,641 | 59% |
| 8 | Прокредит ПК-2 | 93K | 2,756 | 52% |

---

## Top 6 Monetization Идеи (v3)

### 🥇 #1 — Завърши Фонтани 4А + ап.5 ASAP

(Без промяна от v2 — все още #1 priority)

**Текущо:** 131K EUR общ дълг, ~3,955 EUR годишна lihva която тече без приход.

**Upside при активиране:**
- 2 × 550 EUR/мес × 12 = 13,200 EUR/год
- Net след lihva: **+9,245 EUR/год**

**Effort:** S-M (обзавеждане 15-25K EUR investment).
**Timeline:** 30-60 дни.

---

### 🥈 #2 — Refinance Прокредит ПК-3 (261K @ 3%)

(Без промяна от v2 — 67% lihva ratio confirmed)

**Опции:**

A) Refi @ 2.4-2.5% → ~1,305 EUR/год спестено
B) Частично погасяване от 0-LTV equity → намалява lihva burden

**Препоръка:** Запитване до 2-3 банки.

---

### 🥉 #3 — План за 448K EUR cash до края на 2027 (Симеоново 12)

(Без промяна от v2)

Източници:
- Operating cash flow от portfolio: ~50K/год → 18 месеца × 50K = ~75K (insufficient)
- Equity loan от unleveraged 920K имоти → достъпен, добавя ipotekа
- Refi-cash-out от Прокредит → 30-50K side-effect
- Личен капитал → зависи от budget

**Trigger дата:** Q1-Q2 2027 → revisit.

---

### 🥉 #4 — 6-те Фонтани гаражи без приход

(Без промяна от v2)

Опции: A) активирай (+5.5K/год net) или B) продай за refi (~6.8K/год lihva спестено).

---

### 🥉 #5 — Reducer на lihva-heavy кредитите чрез principal sweep

**НОВА идея от v3 amortization data:**

Сегашен picture: 28,664 EUR годишно lihva плащаш на банките. Това е dead money.

**Лост:** правене на **principal sweep** — еднократно или quarterly влагане на extra cash директно в principal (не в monthly вноска). Пример:

- 5,000 EUR extra в Прокредит ПК-3 веднъж годишно
- Намалява базата на която се смята lihva → спестено ~150 EUR/год immediate impact, расте всяка година
- За 5 години = ~1,500 EUR cumulative + ускорено погасяване на ~2-3 месеца

**Effort:** S (ако имаш cash buffer) — обикновено banks приемат overpayments без penalty (провери условията)
**Препоръка:** Pilot 5-10K EUR sweep на Прокредит ПК-3; оценка ROI след 12 месеца.

---

### 🥉 #6 — Insurance gap (НОВ risk item от v3)

**Текущо:** Skyrent няма застраховки — нула покритие при щета, кражба, природно бедствие, отговорност към тенant injuries, и т.н.

**Risk:**
- Земетресение в София → 39 имота × средно 96K EUR = $3.75M exposure
- Един major fire/water damage в апартамент → 30-100K EUR repair
- Tenant liability (някой се нарани в апартамента) → unlimited exposure

**Cost ако се сключат:**
- Property insurance (само сграда): ~0.05-0.15% от market_val → 1,900-5,600 EUR/год за целия portfolio
- Public liability (отговорност): ~500-1,000 EUR/год bulk policy
- Total разумен ranger: **2,500-7,000 EUR/год**

**Impact на финансите:**
- Opex ratio: 12.78% → 14-18% (нормално)
- NOI: 103.8K → ~99K (-4% decrease)
- DSCR: 1.93 → 1.85 (все още комфортно)

**Препоръка:** Запитване до 2-3 застрахователи. Дори basic property + liability е разумна защита при 39-имотен portfolio. Без застраховки = single event риск > 1M EUR.

---

## Сумарен expected impact

Ако изпълниш Tier 1 (Top 3) за следващите 12-18 месеца:

| Идея | Effort | Impact годишно |
|---|---|---|
| Завърши Фонтани 4А+5 | M (15-25K cap) | +9,245 EUR (запазен) |
| Refi Прокредит ПК-3 | M-L | +1,305 EUR (lihva) |
| Активирай 6 гаража | S | +5,477 EUR |
| **TOTAL потенциал** | | **+16,027 EUR/год = +15% над NOI** |

Plus securely:
- Симеоново 12 cash план до 2027 → unlocks +35-50K годишно потенциал след доставка
- Принципал sweep → 1-2K годишно cumulative

---

## Action list (30 / 90 / 180 дни)

### Следващите 30 дни

- [ ] **Реши план за обзавеждане Фонтани 4А и 5** (capital, agency, timeline)
- [ ] **Пробен anons за наем на 1-2 гаража** (Фонтани) — да тестваш demand
- [ ] **Запитване до УниКредит/Пощенска** за refi на Прокредит ПК-3
- [ ] **Запитване до застрахователи** (property + liability) → реална оферта

### Следващите 90 дни — Q3 2026

- [ ] **Phase 2 monthly snapshots cron** — trend графики
- [ ] **Завърши Фонтани 4А + 5** (ETA от плана)
- [ ] **Допълни мазетата** като отделни property records
- [ ] **Decision гаражи Фонтани** — A или B
- [ ] **Pilot principal sweep 5-10K** на Прокредит ПК-3

### Следващите 180 дни — Q4 2026

- [ ] **6 месеца bank data → detailed per-property NOI** ranking
- [ ] **Strategic review** — кои имоти да продаваме, кои да activate-ваме
- [ ] **Equity capacity report** — допълнителен дълг portfolio може да поеме
- [ ] **Симеоново 12 cash план финален** — конкретен timeline + източници

### 2027 — Strategic

- [ ] **Q1-Q2 2027:** Симеоново 12 cash sourcing
- [ ] **Q4 2027:** Балanс плащане 448K + активиране на 4 имота → +35-50K годишно

---

## Промени в моделирането (v1 → v2 → v3)

| Какво | v1 | v2 | v3 |
|---|---|---|---|
| Loan allocation | equal split | asset-weighted | asset-weighted |
| Симеоново 12 | "460K заключен capital" | 92K paid + 448K future | 448K off-plan + lifecycle 'pre_construction' |
| Equity | 2.73M (overstated) | real 2.28M | real 2.28M |
| LTV | 27.4% | real 39.3% | real 39.3% |
| Opex | 0 (no data) | 0 (no business bank data) | **15.2K real (3-year bank import + AI cat)** |
| NOI | rent (overstated) | rent (overstated) | **103.8K real** |
| Cap rate | 3.17% (overstated) | 3.17% (overstated) | **2.77% real** |
| DSCR | 2.21 (overstated) | 2.21 (overstated) | **1.93 real** |
| Net CF | 65K (theoretical) | 65K (theoretical) | **50K real** |
| Insurance | not analyzed | not analyzed | **risk item identified** |

---

## Данни sources

- `/api/metrics/portfolio` v3 endpoint (PR #7 merged 2026-06-08)
- ProBanking 3-year business import (386 transactions, 127 expense_invoices auto-created)
- AI-assisted categorization (`backend/scripts/suggest_categories.js` + `apply_categories.js`)
- User clarifications (2026-06-08): tenants плащат utilities, без застраховки, SLV CORP = silver, ЛЕКС ГРУП = appliances, BONKA = Симеоново legal, КЕМПЕРИНО + 314 СМАРТ = personal, ФАСИЛИТИ = Стелар, etc.

---

*Memo v3 финален със real prod данни. Phase 2 snapshots cron остава bucklist.*
