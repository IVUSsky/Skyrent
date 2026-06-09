# Skyrent — Monetization & Optimization Memo (v4)
**Asof:** 2026-06-09 · **Source:** `/api/metrics/portfolio` (production)
**Промени спрямо v3:** Cash-on-Cash формула коригирана (cost basis вместо market) + appreciation analysis + revised strategic verdict

---

## Изпълнително резюме

След корекция на CoC формулата (стандартна real-estate дефиниция: Net CF ÷ реално вложен капитал), Skyrent се оказва **значително по-добра инвестиция отколкото показваше v3**: portfolio CoC скача от 1.83% на **3.89%** — приличeн за низко-leveraged residential. По-важно — анализът разкрива **1.44M EUR скрит appreciation gain** (paper wealth), който в момента не генерира yield. Реалните Top performers носят 18-40% CoC върху вложения капитал (Иширков ап.66 → 40.4%). Top 3 lever-а остават същите (Фонтани 4А+5, refi ПК-3, активиране на гаражи), но добавя се **#4: appreciation realization strategy** — как да extract-неш paper wealth-а през refi/sale за по-високодоходна реинвестиция.

---

## Реалните числа (v4 — корекция на CoC)

### Portfolio overview

| Метрика | Стойност | Бележка |
|---|---|---|
| Properties total | 39 (33 active + 2 furnishing + 4 pre-construction) | |
| **Asset base (market)** | **3,752,998 EUR** | |
| **Total cost basis (купуня+ремонт)** | **2,313,358 EUR** | |
| **🆕 Hidden appreciation** | **+1,439,640 EUR** (62% gain over cost) | paper wealth — не носи yield |
| **Total debt** | **1,026,847 EUR** | |
| **Off-plan obligations** | **448,000 EUR** | Симеоново 12 до 2027 |
| **Equity (market)** | 2,726,151 EUR | оптично |
| **🆕 Cash invested** | **1,286,511 EUR** | реално сложени пари (cost − дълг) |
| **Real equity** | 2,278,151 EUR | equity − off-plan |
| LTV (debt-only) | 27.4% | |
| Real LTV | 39.3% | |
| Rent contracted | 119,016 EUR/год | |
| Rent received (bank) | 67,361 EUR за 12м | разлика през cash/Stripe |
| Opex annual | 15,212 EUR (12.78% ratio) | |
| NOI annual | 103,805 EUR | |
| Debt service | 53,798 EUR/год | |
| DSCR | 1.93 | здраво |
| Cap rate (market) | 2.77% | |
| **🆕 Cap rate (cost basis)** | **4.49%** | NOI / 2,313K cost |
| Net cash flow | 50,007 EUR/год | |
| **🆕 Cash-on-Cash (TRUE)** | **3.89%** | net_cf / cash_invested |
| Equity yield (market) | 1.83% | старата CoC — сега secondary metric |

### Защо разликата CoC v3 → v4 е голяма

**v3 (грешна формула):** CoC = Net CF / (asset − debt) = 50,007 / 2,726,151 = **1.83%**
**v4 (стандартна формула):** CoC = Net CF / (cost basis − debt) = 50,007 / 1,286,511 = **3.89%**

Разликата (2.06 pp) се обяснява с **1.44M EUR appreciation** който v3 третираше като "вложен капитал". Реално това е paper wealth — не си го извадил от джоба си, не генерира yield. CoC спрямо реално вложения капитал е стандартът за real-estate анализ.

---

## 🆕 Hidden Appreciation Analysis

**1.44M EUR paper gain** (62% appreciation върху cost basis) — недостъпен капитал докато не realize-неш.

### Топ 10 имота по CoC (cost basis)

| Имот | Cost | Asset | Debt | Net CF | **CoC** | CoC market |
|---|---|---|---|---|---|---|
| Иширков 24, ап.66 | 39K | 90K | 33K | 2,431 | **40.4%** | 4.3% |
| Иширков 24, ПМ 10 | 10K | 25K | 9K | 265 | **31.6%** | 1.7% |
| Иширков 24, ап.9 | 76K | 165K | 60K | 4,003 | **25.7%** | 3.8% |
| Иширков 24, ап.1 | 79K | 165K | 60K | 3,762 | **20.8%** | 3.6% |
| Мл.2 бл.214 | 49K | 120K | 35K | 2,683 | **20.0%** | 3.2% |
| Пз. Илион 4, ап.9 | 20K | 60K | 0 | 3,773 | **18.9%** | 6.3% |
| Мл.1 бл.64 ап.142 | 75K | 148K | 51K | 4,441 | **18.5%** | 4.6% |
| Дружба 2, бл.275 | 73K | 140K | 59K | 2,545 | **18.4%** | 3.1% |
| Мл.3 бл.305 | 49K | 120K | 35K | 2,700 | **18.1%** | 3.2% |
| Пз. Илион 4, ап.8 | 25K | 60K | 0 | 2,956 | **11.8%** | 4.9% |

**Insight:** Старите имоти от Иширков (купени отдавна на ниски цени) са **financial superstars** по CoC. Иширков ап.66 връща 40% на год на вложените 6K cash equity. По-новите по-малко доходни, защото пазарната apprecация е по-ниска relative към cost.

### Топ 5 имота с highest appreciation (skрит paper gain)

| Имот | Cost | Market | Hidden gain | % appreciation |
|---|---|---|---|---|
| Иширков 24, ап.66 | 39K | 90K | +51K | +131% |
| Пз. Илион 4, ап.9 | 20K | 60K | +40K | +200% |
| Пз. Илион 4, ап.8 | 25K | 60K | +35K | +140% |
| Мл.3 бл.305 | 49K | 120K | +71K | +143% |
| Иширков 24, ап.9 | 76K | 165K | +89K | +117% |

Това са **realization candidates** — имоти где можеш да извадиш appreciation чрез refi или sale.

---

## 12-month forward amortization

(Без промяна от v3 — данните са същите)

Дългът ще намалее с **25,133 EUR principal** за 12 месеца. Lihva 28,664 EUR. **47% от service-а** отива в principal — здраво.

| Банка | Кредити | Balance EUR | Principal 12m | Lihva 12m | % principal |
|---|---|---|---|---|---|
| Пощенска | 1 | 163,043 | 4,848 | 3,860 | **56%** |
| УниКредит | 5 | 282,261 | 7,461 | 7,533 | 50% |
| **Прокредит** | **3** | **581,543** | **12,824** | **17,271** | **43%** |

---

## Top 7 Monetization Идеи (v4 — преподредени с appreciation lens)

### 🥇 #1 — Завърши Фонтани 4А + 5 ASAP

(Без промяна от v3 — все още #1 priority)

**Текущо:** 131K EUR общ дълг, ~3,955 EUR годишна lihva тече без приход.

**Upside при активиране:** 2 × 550 × 12 = 13,200 EUR/год.
**Effort:** S-M (15-25K EUR обзавеждане).
**Timeline:** 30-60 дни.

---

### 🥈 #2 — Refinance Прокредит ПК-3 (261K @ 3%)

Без промяна. 67% lihva ratio confirmed. Refi @ 2.4-2.5% спестява ~1,305 EUR/год.

---

### 🥉 #3 — План за 448K cash за Симеоново 12 (до 2027-12)

Без промяна. **Source диversification** — operating CF (~50K/год × 18м = 90K), equity loan от 920K unleveraged, refi-cashout от Прокредит, личен капитал.

---

### 🥉 #4 — 🆕 Realize hidden appreciation за reinvestment

**Концепция:** Имаш **1.44M EUR paper wealth** който не генерира yield. При cost-basis CoC 3.89%, новата покупка с 5-6% cap rate би била по-доходна от текущото "sitting capital".

**3 пътя за realization:**

A) **Refi cash-out на top appreciation имоти** (Иширков ап.66, Илион ап.9, ап.8)
- Текущо asset 210K, дълг ~50K = 160K extra equity capacity
- При нов кредит до 65% LTV → можеш да extract ~85K cash
- Cost на това capital: новата ипотека 2.5-3% lihva = ~2,125 EUR/год
- Ако reinvest-неш в имот с 5% cap → +4,250 EUR/год нов NOI
- **Net swing: +2,125 EUR/год** + увеличаваш portfolio NOI base

B) **Sale на 1-2 low-CoC имота с high appreciation** + reinvest
- Илион ап.9 cost 20K → market 60K = 40K paper gain
- Продажба → 50K net след costs → reинvest в 90-100K имот с по-добра доходност
- Risk: губиш appreciation момент в Илион район

C) **Sale на 1 имот за финансиране на Симеоново 12 balance**
- Вместо да теглиш equity loan → продаваш 1 имот за 200-300K
- Net cash покрива част от 448K Симеоново balance
- Загубата на rent компенсиран от новите Симеоново имота (когато се активират)

**Препоръка:** A е най-малко-risk подход. B е agressive. C само ако Симеоново cash sourcing е проблем.

**Effort:** L (банкови преговори, due diligence)
**Timeline:** Q4 2026 — Q1 2027

---

### 🥉 #5 — 6-те Фонтани гаражи без приход

Без промяна. Активирай (+5,477 EUR/год) или продай (200K cash, погасява 40% от ПК-3).

---

### 🥉 #6 — Sell-and-redeploy на Симеоново 12 след доставка (2027+)

**Нова стратегическа идея (опционална):**

След доставка на Симеоново 12 (2027), имаш 4 нови имота. Ако пазарната им стойност при доставка е > 560K (плащаш 460K total cost) → можеш да продадеш веднага и да realize gain без да ги опериращ.

**Пример:**
- Total cost 460K (92K paid + 368K balance)
- Pre-construction → completion gain ~15-25% типично
- Market value at delivery: 560-575K
- Net sale (след costs): 480-490K
- **Profit:** 20-30K EUR — без операционен risk

**Alternative:** Hold и rent — operating cash flow ~30K/год = 4-5% yield.

**Препоръка:** Decision tree след доставка. Ако rental demand слаба → продай. Силна → hold.

---

### 🥉 #7 — Insurance gap (без промяна от v3)

3.75M asset, 0 застраховки. Добави 2,500-7,000 EUR/год за basic property + liability покритие.

---

## Сумарен expected impact

Tier 1 (Top 3) за 12-18 месеца:

| Идея | Effort | Impact годишно |
|---|---|---|
| Завърши Фонтани 4А+5 | M | +9,245 EUR |
| Refi Прокредит ПК-3 | M-L | +1,305 EUR |
| Активирай 6 гаража | S | +5,477 EUR |
| **TOTAL Tier 1** | | **+16,027 EUR/год = +32% над текущ NOI** |

Tier 2 (12-24 месеца):

| Идея | Effort | Impact |
|---|---|---|
| Refi cash-out + reinvest | L | +2-3K EUR/год + NOI base growth |
| Симеоново 12 cash план | L | unlocks +35-50K годишно от 2027+ |
| Insurance protection | S | -2.5-7K opex но защитава 3.75M asset |

---

## Strategic verdict — обновен с CoC корекция

Старият verdict (v3): "Solid foundation, mediocre yields, one big drain (ПК-3) and one big risk (insurance)."

**v4 verdict:** Портфолиото е **значително по-добро отколкото изглеждаше** — true CoC 3.89% е приличeн за консервативен residential. Но **1.44M paper appreciation спи в имотите**. С refi или sale strategy можеш да го превърнеш в продуктивен capital и да увеличиш portfolio NOI base с 30-40% за 2-3 години.

**Ключово prozrenie:** Иширков 24 апартаментите са твоите cashflow engines — 20-40% CoC. Те носят несравнима възвращаемост на вложения капитал. Не ги продавай. Refi cash-out върху тях за нови покупки = оптималната стратегия.

---

## Action list (30 / 90 / 180 дни) — обновен

### Следващите 30 дни

- [ ] **Завърши плана за Фонтани 4А+5** + capital allocation
- [ ] **Пробен anons** за 2-3 Фонтани гаража
- [ ] **Запитване refi** на ПК-3 към УниКредит/Пощенска
- [ ] **Запитване застраховки** — основни property + liability quote
- [ ] **🆕 Запитване за equity loan/refi cashout** на Иширков имотите (top CoC)

### Следващите 90 дни — Q3 2026

- [ ] **Активиране Фонтани 4А + 5**
- [ ] **Phase 2 monthly snapshots cron** — trend данни за бъдещи v5 анализи
- [ ] **Decision гаражи** — A (активирай) или B (продай)
- [ ] **🆕 Pilot principal sweep 5-10K** на Прокредит ПК-3
- [ ] **🆕 Decision на appreciation realization** — pursue path A (refi), B (sell+reинvest) или wait

### Следващите 180 дни — Q4 2026

- [ ] **Реално NOI per имот** след 6м bank data в production
- [ ] **🆕 Realize 1 имот appreciation** като pilot (refi или sale)
- [ ] **Symeonovo 12 cash план финален**

### 2027 — Strategic

- [ ] **H1 2027:** Симеоново 12 cash sourcing finalization
- [ ] **Q4 2027:** Плащане 448K balance + activate 4 имота
- [ ] **🆕 Sell-or-hold decision** на Симеоново 12 immediately after доставка

---

## Промени в моделирането (v1 → v2 → v3 → v4)

| Какво | v1 | v2 | v3 | v4 |
|---|---|---|---|---|
| Loan allocation | equal | asset-weighted | asset-weighted | asset-weighted |
| Симеоново 12 | "460K заключен" | 92K + 448K future | 92K + 448K future | + sell-or-hold strategy |
| Opex | 0 (no data) | 0 | 15.2K real | 15.2K real |
| Cap rate | 3.17% | 3.17% | 2.77% market | 2.77% market + **4.49% cost** |
| Cash-on-Cash | 2.39% | 2.39% | 1.83% market | **3.89% cost (TRUE)** |
| Hidden appreciation | not tracked | not tracked | not tracked | **+1.44M EUR identified** |
| Refi strategy | basic | refi ПК-3 | refi ПК-3 | + appreciation realization |

---

*Memo v4 финален. Phase 2 snapshots cron остава bucklist.*
