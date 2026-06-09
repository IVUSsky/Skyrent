# Skyrent — Monetization & Optimization Memo (v5)
**Asof:** 2026-06-09 · **Source:** `/api/metrics/portfolio` (production)
**Промени спрямо v4:**
- CoC формула коригирана (cost basis вместо market) → реален 3.89% не 1.83%
- Hidden appreciation 1.44M EUR identified
- **Симеоново 12 reframed: leveraged appreciation play вместо liability**
- **Bank credit constraint accepted:** strategies без apport, без нов кредит
- **Master lease като primary scaling lever** (вместо refi cash-out)
- Add-on services + external management като paralelni paths
- Levered Yield метрика добавена

---

## Изпълнително резюме

Skyrent е **по-силно portfolio отколкото изглеждаше**: true CoC 3.89% (не 1.83%), скрит appreciation **+1.44M EUR** (62% over cost), здраво DSCR 1.93. **Топ performers Иширков 24 апартаментите носят 20-40% CoC** върху вложен капитал. Симеоново 12 не е "448K obligation" а **leveraged appreciation play** — 20% deposit на 560K + 3.5 г. runway = 10-30% IRR depending on market. Главните блокери са structural, не financial: **банките отказват нов кредит** (DSCR от bank perspective = 1.13, защото 8 имота са на физическо лице), apport е твърде труден + reduces sale flexibility. **#1 lever: master lease arrangement** — премести 8-те имота operationally в Sky Capital, преди да преместиш ownership.

---

## Реалните числа (v5)

### Portfolio overview

| Метрика | Стойност | Бележка |
|---|---|---|
| Properties total | 40 (33 active + 2 furnishing + 4 pre-construction + 1 duplicate flag) | |
| **Asset base (market)** | **3,752,998 EUR** | |
| **Total cost basis** | **2,313,358 EUR** | покупна + ремонт |
| **🆕 Hidden appreciation** | **+1,439,640 EUR** (62% gain) | paper wealth — не носи yield |
| **Total debt** | **1,026,847 EUR** | 9 кредита |
| **Pre-construction obligation** | **448,000 EUR** | Симеоново 12 due ~2029 |
| **Equity (market)** | 2,726,151 EUR | оптично |
| **Cash invested** | **1,286,511 EUR** | реално вложени пари |
| **Real equity** | 2,278,151 EUR | equity − off-plan |
| LTV (debt-only) | 27.4% | |
| Real LTV | 39.3% | |
| Rent contracted | 119,016 EUR/год | |
| **Rent received (bank business)** | **61,401 EUR/год** | разлика 58K идва от 8-те имота на физ. лице + cash |
| Opex annual | 15,212 EUR (12.78%) | |
| NOI annual | 103,805 EUR | |
| Debt service | 53,798 EUR/год | |
| DSCR (operational) | 1.93 | здраво |
| **🆕 DSCR (bank-visible)** | **~1.13** | САМО fizичеs тr bank account view |
| Cap rate (market) | 2.77% | |
| Cap rate (cost basis) | 4.49% | NOI / cost |
| Net cash flow | 50,007 EUR/год | |
| **🆕 Cash-on-Cash (TRUE)** | **3.89%** | net_cf / cash_invested |
| Equity yield (market) | 1.83% | старата формула — secondary |

### 🚨 Защо банките те виждат "рисков"

**Това е the unlock-ът.** Банките гледат само официалните данни на Sky Capital OOD:

```
Bank-visible rent:        61K EUR/год  (само 33 имота − 8 на физ. лице)
Bank-visible debt service: 54K EUR/год
─────────────────────────────────────────
Bank DSCR:                 1.13  ← ПОД 1.25 threshold
```

Резултат: board approval needed + лични гарантии + рestrictive offers.

Реалното DSCR (включително 8-те имота): **1.93** — здраво. Но банката не го вижда.

---

## 🆕 Hidden Appreciation Analysis

**1.44M EUR paper gain** (62% над cost basis). Това е недостъпен капитал докато не realize-неш.

### Top 10 имота по true CoC (cost basis)

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

**Insight:** Иширков 24 е твоят cashflow engine. 5 от Top 10 са там. Купени на ниски цени отдавна → 20-40% CoC сега. Не ги продавай — те генерират несравнима възвращаемост.

---

## 🆕 Симеоново 12 — Reframed като Leveraged Appreciation Play

**Старо четене (v3/v4):** "448K obligation, нужен cash план до 2027"
**Реално (v5):** "20% deposit на 560K + 3.5 г. runway + optionality at delivery"

### Параметрите

```
Total purchase contract:  560,000 EUR (4 имота)
Down payment (платен):    112,000 EUR (20%)
Balance due (2029):       448,000 EUR
Carrying cost:            0 EUR/год  (без вноска, без данък)
```

### IRR analysis на твоята позиция

| Scenario | Annual appreciation | Market value 2029 | Net equity | ROI на 112K | IRR |
|---|---|---|---|---|---|
| **Bear** | 2% | 600K | 152K | +36% | ~10% |
| **Base** | 5% | 666K | 218K | +95% | **~21%** |
| **Bull** | 8% | 733K | 285K | +154% | **~31%** |

**Дори в pessimistic scenario е 10% IRR** — bie всяка alternative БГ инвестиция. Развойщикът ефективно ти дава **0% lihva кредит за 80% от стойността за 3.5 години**.

### 4 опции при доставка (2029)

| Опция | Cash нужен | Резултат | Кога има смисъл |
|---|---|---|---|
| **A) Assignment** | 0 | Cash gain 100-150K, нула operational | Hot market 2028-29 |
| **B) Sell at delivery** | 448K → recover | Cash gain след sale costs | Стабилен пазар |
| **C) Hold + rent** | 448K | +28K годишно CF + продължаваща appreciation | Long-term holder mindset |
| **D) Hybrid** (sell 2, hold 2) | 224K | Половин cash, половин rental | Balanced |

### Cash планиране — relax-нато

**3.5 години runway** + operating cash flow accumulation:
- Сегашен CF: 50K × 3.5 = **175K**
- С master lease + optimizations: 70K × 3.5 = **245K**
- Plus refi opportunity при delivery (новите имоти = perfect collateral за банка)

**Net cash потребен в 2029 може да бъде само ~150-200K** (не 448K) ако комбинираш с partial refi или sale на 1 от 4-те.

---

## 🚨 Structural Constraints (важно за стратегията)

### Constraint #1: Bank credit недостъпен

Банките виждат Sky Capital с DSCR 1.13 → считат "рисков" → отказват кредит или искат board approval + лични гарантии + restrictive terms.

**Не можеш да:** refi cash-out, equity loan, нов acquisition credit
**Можеш да:** restructure existing loans (същата сума, по-добри условия)

### Constraint #2: Apport не е viable

Прехвърляне на 8-те лични имота в Sky Capital чрез apport е:
- Административно сложно
- Reduces sale flexibility (продажба после изисква board, special procedures)
- Tax implications спрямо лично vs фирмено облагане
- → **OFF the table**

### Constraint #3: 8 имота генерират наеми за физ. лице

Около 58K EUR/год rent не минава през Sky Capital → не подобрява bank-visible DSCR.

### Constraint #4: Insurance gap

Все още не сключени. User indicated "много скоро".

---

## Top Monetization Идеи (v5 — преподредени)

### 🥇 #1 — Master Lease Arrangement (8-те имота)

**Заместник на apport.** Sky Capital НЕ става собственик — става **оператор**.

**Структура:**
- Физическо лице (ти) дава 8-те имота на Sky Capital под **master lease** (60-75% от market rent)
- Sky Capital ги пресдадава на финалните tenants по market price
- Spread = чиста печалба за Sky

**Числа:**
```
Личен наем сегашен:     ~4,800 EUR/мес (8 × 600 EUR avg)
Master lease (70%):     3,360 EUR/мес → ти лично
Sublease (market):      4,800 EUR/мес → Sky Capital
Sky spread:             1,440 EUR/мес = 17,280 EUR/год
```

**Impact:**
- Sky NOI: 50K → **~65K** (+30%)
- Bank-visible DSCR: 1.13 → **1.35** (преминава threshold!)
- Sale flexibility: запазена (имотите остават на физ. лице)
- Cash flow visibility: 50% → 95%

**Effort:** M (данъчен консултант + 9 нови договора)
**Timeline:** 2-3 месеца
**Risk:** НАП monitor на свързани лица — master lease price трябва да е "defensibly market"

**Препоръка:** Консултация с данъчник първи стъпка. Това е THE unlock.

---

### 🥈 #2 — Activate Фонтани 4А + ап.5 (когато токът дойде)

**Текущо:** Чакат external blocker (ток до 1 месец). 131K дълг тече ~3,955 EUR годишна lihva без приход.

**При активиране:**
- 2 × 550 EUR/мес × 12 = 13,200 EUR/год
- Net след lihva: **+9,245 EUR/год**

**Action items:**
- След като токът пристигне → стартирай ремонт + обзавеждане (15-25K EUR cap)
- Agency за тенант търсене
- Очаквана активация: 60-90 дни от ток connection

---

### 🥉 #3 — Add-on Services Revenue

Sky Capital инфраструктурата позволява монетизация на услуги към съществуващи tenants.

**Какво вече имаш:**
- Internet reselling (Phase 1 deployed) — start billing
- Smart home devices — потенциал за rental
- Cameras (планирани)
- Maintenance tickets (Support tab)

**Конкретно:**
```
33 active tenants × €15/мес avg add-on = 495 EUR/мес
Internet 33 × €10/мес net           = 330 EUR/мес
─────────────────────────────────────────────
Sky add-on revenue:                   825 EUR/мес = 9,900 EUR/год
```

**Effort:** S-M
**Timeline:** 1-3 месеца pilot

---

### 🥉 #4 — Insurance (risk hedge — НЕ growth)

3.75M asset, 0 застраховки. User indicated planning soon.

**Cost:** 2,500-7,000 EUR/год за basic property + liability
**Impact:** Cap rate 2.77% → 2.7%, DSCR 1.93 → 1.85 (все още здраво)
**Why:** Един major event (земетресение, fire) може да изтрие 3+ години cash flow

---

### 🥉 #5 — Активиране на 6 Фонтани гаража

**Текущо:** Гаражи 28-33 (Фонтани) с 0 наем, 129K дълг allocated.

**Опции:**
- A) Активирай (130-150 EUR/мес × 6) → **+5,477 EUR/год net**
- B) Продажба → 200K cash → погаси 40% от ПК-3

---

### 🥉 #6 — External Property Management (паралел path)

**Концепция:** Skyrent инфраструктурата + 12 г. опит = product за други малки landlords в БГ.

**Бизнес модел:**
- 5-10 external portfolios × 10-30 имота
- Charge 8-12% от gross rent + setup fee
- Sky Capital = full operator

**Числа:**
```
5 portfolios × 15 имота × €450 rent × 10% = €3,375/мес = €40,500/год
```

**Effort:** L (sales effort, customer service infrastructure)
**Timeline:** 6-12 месеца
**Pros:** Decoupled от твоя capital и от твоя bank credit story
**Cons:** Operational risk, reputation exposure

---

### 🥉 #7 — Skyrent SaaS (long-term play)

(Вече обсъждано) — €15-50K MRR потенциал за 12-18 месеца build + launch.

**Decoupling value:** Cash source independent от banks → дългосрочна negotiating power.

---

### 🥉 #8 — Refi на Прокредит ПК-3 (САМО ако bank story се отключи)

ПК-3 = 261K @ 3%, 67% lihva ratio. Refi @ 2.4-2.5% спестява ~1,305 EUR/год.

**Зависи от:** Master lease реализиран → бanки готови за refi.
**Без master lease:** не става.

---

## Сумарен Expected Impact (12-18 месеца)

| Идея | Effort | Импакт годишно | Bank impact |
|---|---|---|---|
| Master lease | M | +17K (Sky) | ✓ DSCR 1.13 → 1.35 |
| Активирай Фонтани 4А+5 | S-M | +9.2K | weak |
| Add-on services | S-M | +10K | weak |
| Активирай 6 гаража | S | +5.5K | weak |
| Insurance | S | -2.5-7K opex (risk hedge) | weak |
| **TIER 1 TOTAL** | | **+34K net (cumulative)** | **DSCR unlocks** |

С Tier 1 cumulative cash → 245K за 3.5 г. за Симеоново balance.
Plus при delivery — refi opportunity на новите 4 имота → reduce cash to ~150-200K.

---

## Action List (по фази)

### Фаза 1 (Месеци 1-3) — Foundation

- [ ] **Среща с данъчен консултант** — master lease arrangement за 8 имота
- [ ] **Квоти от 3 застрахователи** + сключи basic policy
- [ ] **Чакaй ток за Фонтани 4А+5** + подготви agency relationship
- [ ] **Pilot internet billing** на 5 tenants — test reception

### Фаза 2 (Месеци 3-6) — Execute Tier 1

- [ ] **Setup master lease** (8 договора + 1 master agreement)
- [ ] **Активирай Фонтани 4А + 5** след ремонт
- [ ] **Пробен anons** за 2-3 Фонтани гаража
- [ ] **Add-on services launch** за всички 33 active tenants

### Фаза 3 (Месеци 6-9) — Bank Re-engagement

- [ ] **Запитване refi** на Прокредит ПК-3 с обновени фирмени данни
- [ ] **Възможен equity loan** върху unleveraged 920K имоти (с по-добра bank story)
- [ ] **Decision** за external property management start или delay

### Фаза 4 (Месеци 9-18) — Scaling Decision

- [ ] **External management** pilot (5 portfolios) ИЛИ
- [ ] **SaaS development** начало ИЛИ
- [ ] **Sell-and-redeploy** (продай Иширков ап.66 → купи 2 нови cash)

### 2028-2029 — Симеоново 12 Strategic Decision

- [ ] **Q2 2028:** Pre-delivery валuация и market check
- [ ] **Q4 2028:** Decision tree:
  - Assignment ако market hot (+100-150K cash gain)
  - Sell at delivery ако rental yield слаб
  - Hold + rent ако market стабилен
  - Hybrid (sell 2, hold 2)
- [ ] **Q3 2029:** Cash sourcing finalization за balance plащане

---

## Strategic Verdict (v5)

**Това е zрял consumer credit portfolio под external structural constraints.** Не cashflow машина (3.89% CoC), но не и stagnant — capital deployment работи добре с appreciation. Истинският lever не е "повече credit" — а **structural optimization на perceived risk** (master lease) + **vertical revenue extraction** (add-on services).

**Симеоново 12 е твоят most asymmetric bet — добре направен deal с убежно goodовid runway.** Не го третирай като задължение; третирай го като leveraged exposure с optionality.

**Тримата ти най-силни actions за следващите 12 месеца:**
1. Master lease setup (отключва bank story)
2. Активиране на Фонтани 4А+5 + гаражи (+15K годишно)
3. Add-on services pilot (+10K годишно)

С тези три → Sky на 75K годишно cash → банките те виждат различно → 2027 Тier 2 expansion options се отварят натурално.

---

## Промени в моделирането (v1 → v5)

| Какво | v1 | v3 | v4 | **v5** |
|---|---|---|---|---|
| Loan allocation | equal | asset-weighted | asset-weighted | asset-weighted |
| Cap rate | 3.17% | 2.77% market | + 4.49% cost | + 4.49% cost |
| Cash-on-Cash | 2.39% | 1.83% market | 3.89% cost (TRUE) | 3.89% cost |
| Симеоново 12 | 460K заключен | 448K future debt | 448K future debt | **Leveraged appreciation play** |
| Симеоново runway | NA | 18 мес | 18 мес | **3.5 години** |
| Bank credit | assumed | assumed | assumed | **Constrained — strategies без credit** |
| Top monetization | activate inactive | + insurance | + appreciation realization | **Master lease #1** |
| Apport | not discussed | not discussed | not discussed | **OFF the table** |
| Levered Yield | NA | NA | NA | **Added метрика** |

---

*Memo v5 финален. Cap on cost + Cash-on-Cash + Levered Yield + Симеоново reframing.*
