# Skyrent — Monetization & Optimization Memo (v6)
**Asof:** 2026-06-09 · **Source:** `/api/metrics/portfolio` (production)
**Промени спрямо v5:**
- Добавена пълна **legal & accounting analysis** на master lease arrangement под БГ законодателство
- Pre-flight checklist преди implementation
- Risk matrix + mitigations
- Финансова симулация в 2 scenarios (ДДС exempt vs облагаемо)
- Implementation timeline + costs estimate
- Алтернативна "Operational Management Contract" структура като fallback

---

## Изпълнително резюме

Skyrent е **по-силно portfolio отколкото изглеждаше**: true CoC 3.89% (не 1.83%), скрит appreciation **+1.44M EUR** (62% over cost), здраво DSCR 1.93. **Топ performers Иширков 24 апартаментите носят 20-40% CoC** върху вложен капитал. Симеоново 12 не е "448K obligation" а **leveraged appreciation play** — 20% deposit на 560K + 3.5 г. runway = 10-31% IRR. Главните блокери са structural, не financial: банките отказват кредит, apport е too painful. **#1 lever: master lease arrangement** — премести 8-те имота operationally в Sky Capital. ⚠️ **Critical:** ДДС tретиране на master lease между свързани лица трябва да се verifyира с tax expert преди implementation (тълкуване B може да унищожи цялата схема).

---

## Реалните числа (v6)

### Portfolio overview

| Метрика | Стойност | Бележка |
|---|---|---|
| Properties total | 40 (33 active + 2 furnishing + 4 pre-construction + 1 duplicate flag) | |
| **Asset base (market)** | **3,752,998 EUR** | |
| **Total cost basis** | **2,313,358 EUR** | покупна + ремонт |
| **Hidden appreciation** | **+1,439,640 EUR** (62% gain) | paper wealth — не носи yield |
| **Total debt** | **1,026,847 EUR** | 9 кредита |
| **Pre-construction obligation** | **448,000 EUR** | Симеоново 12 due ~2029 |
| **Cash invested** | **1,286,511 EUR** | реално вложени пари |
| **Real equity** | 2,278,151 EUR | equity − off-plan |
| Real LTV | 39.3% | |
| Rent contracted | 119,016 EUR/год | |
| **Rent received (bank business)** | **61,401 EUR/год** | 58K минават през лично лице |
| Opex annual | 15,212 EUR (12.78%) | |
| NOI annual | 103,805 EUR | |
| DSCR (operational) | 1.93 | здраво |
| **DSCR (bank-visible)** | **~1.13** | под 1.25 → блок за кредит |
| Cap rate (cost basis) | 4.49% | |
| **Cash-on-Cash (TRUE)** | **3.89%** | net_cf / cash_invested |
| Net cash flow | 50,007 EUR/год | |

---

## Симеоново 12 — Leveraged Appreciation Play

**Параметрите:**
- Total contract: 560K EUR
- Down payment paid: 112K EUR (20%)
- Balance due: 448K EUR
- Delivery: ~2029 (3.5 г. runway)
- Carrying cost: 0 EUR/год

**IRR analysis:**

| Scenario | Annual appreciation | Market value 2029 | ROI на 112K | IRR |
|---|---|---|---|---|
| Bear (2%) | 600K | +36% | ~10% |
| **Base (5%)** | **666K** | **+95%** | **~21%** |
| Bull (8%) | 733K | +154% | ~31% |

**4 опции при доставка:**
- **A) Assignment** — преотстъпване преди delivery, cash gain 100-150K
- **B) Sell at delivery** — плати balance, продай веднага, recover gain
- **C) Hold + rent** — +28K годишно CF + продължаваща appreciation
- **D) Hybrid** — sell 2, hold 2

**Cash планиране — relax-нато.** 3.5 години runway + 175-245K operating CF accumulation + refi opportunity при delivery = net cash потребен в 2029 може да бъде ~150-200K (не 448K).

---

# PART 1: Master Lease — Legal & Accounting Deep Dive (НОВО)

⚠️ **Disclaimer:** Тази analiz е general framework. **Преди реално изпълнение задължително консултирай счетоводител (ЗДДС + ЗКПО expertise) + правен консултант (търговско право)**. Структурата има подводни камъни.

## 1. Правна рамка под БГ законодателство

### Юридическа структура

**Двойна договорна:**
1. **Главен договор за наем** (master lease): ти (физ. лице) → Sky Capital OOD
2. **Подналог (sublease)**: Sky Capital OOD → физически тенанти

**Правна основа:** ЗЗД чл. 228-239 (наем) + чл. 234 (подналог разрешен).

### Свързани лица — КРИТИЧНО

**ЗКПО чл. 15, т. 1:** Физическо лице с дружество (>25% участие) = свързани лица.

**НАП проверява:** Pricing на между-свързани сделки да бъде "**arm's length**" (пазарно). При оспорване → доначислява данък + лихви + санкции.

### Pricing benchmark (защитна линия)

| Master lease като % от пазарен наем | Defensibility | НАП risk |
|---|---|---|
| 60-65% | Слаба | Висок |
| 70-75% | Добра | Среден |
| **75-85%** | **Защитима** | **Низък** ✓ |
| 85%+ | Excellent | Нула |

**Justification под-market:**
- Sky поема vacancy риск
- Sky прави management + marketing
- Sky поема maintenance/repair
- Sky носи tenant default risk

### Подготовка преди подписване

- Сравнителен анализ от 5-10 подобни имота (Imot.bg, broker quotes)
- Документация за operational stake на Sky (защо master rate е под market)
- Експертно становище (formal letter) от licensed valuer — ~300 EUR

---

## 2. Данъчна анализа — Лична страна (ти)

### Данък общ доход (ЗДДФЛ)

| Параметър | Стойност |
|---|---|
| Облагаем доход | Master lease наем |
| Нормативни разходи | 10% автоматично (чл. 26 ал. 4) |
| Данъчна ставка | 10% плосък |
| **Effective tax rate** | **9% от брутно** |

### Социални осигуровки

**Доходът от наем НЕ е облагаем с осигуровки** ако не е trading activity. Засега си в зоната на passive rental — **не плащаш осигуровки на наема**.

### Деклариране

- Декларация по чл. 50 (ГДД) до **30 април всяка година**
- Авансово плащане до 15 април

### Конкретни числа

**Сегашно (8 имота директен наем, 4,800 EUR/мес × 12 = 57,600 EUR/год):**
```
Брутен наем годишен:     57,600 EUR
10% разходи (норм.):     −5,760 EUR
Облагаем доход:          51,840 EUR
Данък 10%:               −5,184 EUR
NET лично:               52,416 EUR
```

**При master lease 70% (3,360 EUR/мес × 12 = 40,320 EUR):**
```
Брутен наем годишен:     40,320 EUR
10% разходи:             −4,032 EUR
Облагаем доход:          36,288 EUR
Данък 10%:               −3,629 EUR
NET лично:               36,691 EUR
```

**Разлика лично:** −15,725 EUR/год (приемaш по-нисък наем, but Sky прибира spread-а)

---

## 3. Данъчна анализа — Sky Capital OOD

### Корпоративен данък (ЗКПО)

- **Ставка:** 10%
- **Облагаема печалба:** sub-lease приходи − master lease разход − operational opex

### Конкретни числа

| Поток | Годишно |
|---|---|
| Sub-lease приход (market) | +57,600 EUR |
| Master lease разход (към теб) | −40,320 EUR |
| Operational opex | −3,000 EUR |
| **Облагаема печалба** | **14,280 EUR** |
| Корпоративен данък 10% | −1,428 EUR |
| **NET в Sky** | **12,852 EUR** |

### Разпределение към теб (като собственик)

| Опция | Total tax burden | Net в твоя джоб |
|---|---|---|
| Запази в Sky (retained earnings) | 10% корп. | 0 веднага, но balance sheet расте |
| **Дивидент** | **10% + 5% = 14.5%** | **8,572 EUR от 12,852** |
| Заплата управител | Пълни данъци + ос. | НЕ препоръчвам |

**Препоръка:** Retain в Sky → подобрява balance sheet → подобрява bank story.

---

## 4. ⚠️ ДДС анализа — НАЙ-КРИТИЧНИЯТ въпрос

### Праг на регистрация (вече надминат)

**ЗДДС чл. 96:** Задължителна ДДС регистрация при оборот > **100,000 лв (~51,130 EUR)** за 12 месеца.

**Sky Capital сега:** Bank-visible rent ~61K EUR = 120K лв = **вече над прага**.

⚠️ **Action item:** Провери незабавно с твоя счетоводител дали Sky е ДДС регистриран. Ако НЕ → подложен на санкции от НАП.

### Освободени доставки (Чл. 45 ЗДДС)

**Жилищни наеми за физически лица** са **освободени** от ДДС.

| Тип сделка | ДДС режим |
|---|---|
| Sky → тенант (физическо лице, жилищно) | ✅ ОСВОБОДЕНО |
| Sky → тенант (юридическо лице, офис) | ❌ Облагаемо 20% |
| **Ти → Sky (master lease)** | **⚠️ ДВЕ ТЪЛКУВАНИЯ** |

### Master lease ДДС тълкувания

**Тълкуване A (favorable):** Освободено като жилищно настаняване
- Аргумент: Крайното use е residential
- Sky няма ДДС burden
- Schema работи както описано

**Тълкуване B (unfavorable):** Облагаемо с ДДС 20%
- Аргумент: Сделка B2B (физ. лице → юр. лице), не директно жилищно настаняване
- Sky дължи 20% × 40,320 = **8,064 EUR/год**
- **Унищожава цялата печалба на схемата!**

### Симулация при Тълкуване B (worst case)

```
Sky печели spread:              17,280
−ДДС върху master lease:        −8,064
−Extra accounting:              −1,500
Net spread:                     7,716

Net total (лично + Sky):
  Лично NET:                    36,691
  Sky NET:                       7,716 (вместо 12,852)
  TOTAL:                        44,407 EUR

Сегашно (без master lease):     52,416 + Sky existing
LOSS:                           ~8K годишно
```

**При Тълкуване B schema не е profitable.**

### Какво да направиш

**Задължително:** Получи **писмено становище** (writing) от ДДС-специализиран счетоводител с цитати на ЗДДС практика. Без това положителен outcome — не пристъпвай.

**Признаци за тълкуване A:**
- Краен ползвател е физическо лице
- Имот e категория "жилище"
- Use е "постоянно жилище" не "временен туризъм"

**Признаци за тълкуване B:**
- Master tenant е юр. лице
- Sky има commercial use
- Подналог е business activity

В практиката за БГ често се прилага освобождаване за такива structures, но НЕ универсално. Decision rests на specific facts.

---

## 5. Алтернатива при ДДС блок: Operational Management Contract

Ако ДДС консултантът каже "тълкуване B → не препоръчвам", **fallback структура:**

### Концепция

Не master lease. Sky Capital е **управител**, не наемател:

- Ти запазваш собствеността И наемните договори
- Sky Capital ти таксува **management fee** (15-20% от gross rent)
- Sky прави операциите за теб (тенант management, repairs, bookkeeping, etc.)

### Конкретни числа

| Поток | Годишно |
|---|---|
| Тенанти плащат на тебе директно | +57,600 EUR |
| Sky management fee (17%) | −9,792 EUR за теб → +9,792 EUR за Sky |
| Твой облагаем доход | 57,600 − 9,792 = 47,808 |
| Твой ДОД 10% | −4,303 EUR |
| NET лично | 43,505 EUR |
| Sky приход | +9,792 EUR |
| Sky opex | −2,000 EUR |
| Sky корп. данък 10% | −779 EUR |
| Sky NET | 7,013 EUR |

### Сравнение с master lease

| Метрика | Master lease (Тълкуване A) | Management Contract |
|---|---|---|
| TOTAL net (лично + Sky) | 49,543 EUR | 50,518 EUR |
| Bank visibility (Sky) | +17K extra | +10K extra |
| DSCR boost | 1.13 → 1.46 | 1.13 → 1.32 |
| ДДС риск | Висок | Низък |
| Документация complexity | Висока | Средна |

**Compromise:** Management Contract — по-малък bank impact, но по-нисък tax risk.

### Структура

- Договор за управление: 1 master agreement
- Power of attorney от тебе към Sky за управление на наемните отношения
- НЕ е свързано лице на pricing basis (стандарт market 10-15%)

---

## 6. Счетоводна обработка — Sky Capital

### Месечни записи (за master lease scenario)

**Приходи (от тенант):**
```
Дт 411 Клиенти                          EUR 4,800
Кт 703 Приходи от наеми                 EUR 4,800
```

**Master lease разход (към теб):**
```
Дт 605 Външни услуги (наем)             EUR 3,360
Кт 401 Доставчици (физ. лице)           EUR 3,360
```

**Плащане към теб:**
```
Дт 401 Доставчици                       EUR 3,360
Кт 502 Разплащателни сметки             EUR 3,360
```

### Допълнителна работа за счетоводителя

- 9 нови договора (1 master + 8 sublease за нови тенанти)
- ~50-80 нови фактури/мес
- ДДС complexity (ако applicable)
- Related-party documentation
- Annual НАП справки за свързани лица

### Очаквана нова такса

| Сегашна Н.Д.А. Такс Консулт | 230 EUR/мес = 2,760 EUR/год |
| Допълнителна работа | +100-150 EUR/мес |
| **Total accounting cost** | **~3,960-4,560 EUR/год** |

---

## 7. Required Documents Checklist

### Phase 1: Pre-flight (1-2 месеца, преди подписване)

- [ ] Сравнителен пазарен анализ за 8-те имота (broker reports / Imot.bg)
- [ ] Експертно становище от licensed valuer (~300 EUR)
- [ ] **Писмено становище от ДДС-специализиран счетоводител** ⚠️ КРИТИЧНО
- [ ] Правно становище от данъчен адвокат за structuring
- [ ] Финансово моделиране (Excel) на и двата сценария
- [ ] Approval от Управителния орган на Sky Capital

### Phase 2: Документация (1 месец)

- [ ] **Master lease договор** (1 общ за всичките 8 или 8 отделни)
- [ ] **Anex 1:** Property descriptions + rents per имот
- [ ] **Anex 2:** Permitted use (residential subletting)
- [ ] **Anex 3:** Maintenance/repair distribution
- [ ] **Sublease template** за бъдещи тенанти (Sky → тенант)

### Phase 3: Tenant communication + signing (1 месец)

- [ ] Уведомяване на тенантите за смяната
- [ ] Подписване нови sublease договори (или novation на текущите)
- [ ] Update на ProBanking + Skyrent settings
- [ ] Update на ProBanking IBAN на тенант notifications
- [ ] Update на ДДС регистрите ако applicable

---

## 8. Implementation Timeline & Costs

| Phase | Duration | Cost |
|---|---|---|
| Validation + consultants | 1 месец | 500-1,500 EUR |
| Документация (legal + tax) | 1 месец | 800-1,500 EUR |
| Signing + transitions | 1 месец | ~300 EUR notarial |
| **Total upfront** | **3 месеца** | **1,600-3,300 EUR** |
| **Ongoing additional accounting** | yearly | **+1,200-1,800 EUR/год** |

---

## 9. Risk Matrix

| Risk | Вероятност | Impact | Mitigation |
|---|---|---|---|
| НАП оспорва master lease price | Средна | Висок (доначисляване) | Quality comparables + 75-80% pricing |
| **ДДС облагане на master lease** | **Висока без expert** | **Много висок** (8K/год) | **Експертно становище ПРЕДИ structuring** |
| Тенант refuses новия договор | Ниска | Низък | Запази старите ако transition difficult |
| Bank не е впечатлен от подобрена DSCR | Ниска | Среден | +17K cash flow е benefit дори без credit |
| Tax authorities re-classify scheme | Ниска ако done correctly | Висок | Strong documentation + arm's length |
| Counter-party риск | N/A | N/A | Sky си твое — self-credit |

---

## 10. Pre-flight Decision Criteria

**✅ Continue (master lease)** ако:
- ДДС exempt confirmable в writing от консултант
- Comparables подкрепят 75-80% pricing
- Tax law не се променя в близко бъдеще

**🔄 Pivot към Management Contract** ако:
- ДДС бариера задължителна
- Counsel препоръчва по-проста структура
- Initial financial modeling показва Management по-добро

**❌ Abort** ако:
- Двамата counsel-и казват NO
- ДДС облагаемо + comparables не подкрепят pricing
- Total complexity outweighs +17K годишно

---

# PART 2: Цялостни Стратегически Идеи

## Top Monetization Идеи (v6 — реflectiraт реалните constraints)

### 🥇 #1 — Master Lease Arrangement (8-те имота) — с pre-flight

Виж PART 1 за пълен legal/tax framework. **Pre-flight задължително преди execution.**

**Impact (ако ДДС exempt confirmed):**
- Sky NOI: 50K → ~65K (+30%)
- Bank-visible DSCR: 1.13 → **1.46**
- Bank credit unlock probable

**Effort:** M (3 месеца setup) **Risk:** Висок без consultant input

---

### 🥈 #2 — Activate Фонтани 4А + ап.5 (когато токът дойде)

External blocker: ток до 1 месец. След токът → 60-90 дни обзавеждане + agency.

**Upside:** +9,245 EUR/год net (след lihva)
**Plus:** ПК-3 swings от −12K към +1.5K дори без активиране на гаражите

---

### 🥉 #3 — Add-on Services Revenue

Internet billing + premium care + smart home rental + storage.

**Math:** 33 active tenants × €25/мес avg = **+9,900 EUR/год**

---

### 🥉 #4 — Insurance (risk hedge)

2.5-7K EUR/год за basic property + liability. **User indicated planning soon.**

---

### 🥉 #5 — Активиране на 6 Фонтани гаража

Активирай (+5,477 EUR/год) или продай за principal sweep.

---

### 🥉 #6 — External Property Management (Tier 2)

5-10 portfolios × 15 имота × 10% fee = **+40,500 EUR/год**

---

### 🥉 #7 — Skyrent SaaS (Long-term)

€15-50K MRR за 12-18 месеца build.

---

### 🥉 #8 — Refi Прокредит ПК-3 (САМО ако bank story unlock-нат)

3% → 2.5%, спестено ~1,305 EUR/год. **Зависи от master lease первонач.**

---

## Strategy за Прокредит — конкретно

**Конклузия:** Не пипай Прокредит сега.

| Action | Effort | Impact | Когато |
|---|---|---|---|
| Refi ПК-3 | M-L | +1.3K/год | САМО след master lease успех |
| Principal sweep 5-10K | S | +150-300 EUR/год | САМО ако idle cash > 20K |
| Sell 1-2 Фонтани гаража | M | −2.1K net (загуба!) | НЕ препоръчвам |
| **WAIT + Activate** | **0** | **+20K/год** | **Tier 1** |

**The Прокредит fix is operational, not financial.** Когато Фонтани активира, ПК-3 преминава от −12K към +8K годишно cash flow без да си пипал кредит.

---

## Сумарен Expected Impact (12-18 месеца)

| Идея | Effort | Импакт годишно | Bank impact |
|---|---|---|---|
| Master lease (ако ДДС-exempt) | M | +15-17K Sky NOI | ✓ DSCR 1.13 → 1.46 |
| Активирай Фонтани 4А+5 | S-M | +9.2K | weak |
| Add-on services | S-M | +10K | weak |
| Активирай 6 гаража | S | +5.5K | weak |
| Insurance | S | -2.5-7K opex (hedge) | weak |
| **TIER 1 TOTAL** | | **+27-35K net** | **DSCR unlocks** |

---

## Action List (по фази)

### Фаза 1 (Месеци 1-3) — Foundation

- [ ] **Среща с ДДС-специализиран счетоводител** ⚠️ КРИТИЧНО (master lease ДДС тълкуване)
- [ ] **Среща с данъчен адвокат** за structuring
- [ ] **Сравнителен пазарен анализ** на 8-те имота от licensed valuer
- [ ] **Чакaй ток за Фонтани 4А+5** + подготви agency relationship
- [ ] **Insurance quote** от 3 застрахователи

### Фаза 2 (Месеци 3-6) — Execute Tier 1

- [ ] **Setup master lease** (или fallback Management Contract — според consultant outcome)
- [ ] **Активирай Фонтани 4А + 5** след ремонт
- [ ] **Pilot internet billing** на 5 tenants
- [ ] **Сключи basic insurance** policy

### Фаза 3 (Месеци 6-9) — Bank Re-engagement

- [ ] **3 месеца bank data** с подобрена DSCR
- [ ] **Запитване refi** на ПК-3 с обновени фирмени данни
- [ ] **Decision** за external property management start

### Фаза 4 (Месеци 9-18) — Scaling Decision

- [ ] **Add-on services** to full 33 tenants
- [ ] **External management pilot** ИЛИ **SaaS дeveлoпment**

### 2028-2029 — Симеоново 12 Decision

- [ ] **Q2 2028:** Pre-delivery валuация
- [ ] **Q4 2028:** Decision (assignment / sell / hold / hybrid)
- [ ] **Q3 2029:** Cash sourcing finalization

---

## Strategic Verdict (v6)

**Skyrent е зрял portfolio под structural constraints — но master lease + activation отключват next-stage growth.**

True picture:
- 39 имота × 1.29M вложен + 1.44M appreciation = 3.75M asset
- 50K годишно cash flow растящ към 70-80K с Tier 1
- DSCR 1.13 (bank-visible) → 1.46 (with master lease) → unlock на credit story
- Симеоново 12 = leveraged appreciation play с 3.5г runway
- Tier 1 actions за 12 месеца → +35K годишно cash flow

**Истинският блокер:** ДДС тълкуване на master lease. Без чисто positive becouncил counsel, схемата rolling negative. **С positive ДДС становище → unlock на цялата стратегия.**

**Action #1:** Срещa с ДДС консултант. Това е the gating decision на всичко.

---

## Промени в моделирането (v1 → v6)

| Какво | v1 | v3 | v4 | v5 | **v6** |
|---|---|---|---|---|---|
| Loan allocation | equal | asset-weighted | asset-weighted | asset-weighted | asset-weighted |
| Cap rate | 3.17% | 2.77% | + 4.49% cost | + 4.49% cost | + 4.49% cost |
| Cash-on-Cash | 2.39% | 1.83% market | 3.89% cost | 3.89% cost | 3.89% cost |
| Симеоново 12 | заключен | future debt | future debt | leveraged play | leveraged play |
| Bank credit | assumed | assumed | assumed | constrained | constrained |
| Top monetization | activate | refi | appreciation | master lease | master lease + **full legal framework** |
| Apport | NA | NA | NA | off table | off table |
| **ДДС analysis** | NA | NA | NA | NA | **Full + 2 scenarios** |
| **Management Contract** (fallback) | NA | NA | NA | NA | **Added** |
| **Pre-flight checklist** | NA | NA | NA | NA | **Added** |
| **Risk matrix** | NA | NA | NA | NA | **Added** |

---

*Memo v6 финален с master lease legal framework. Pre-flight criteria documented. ДДС decision = gate.*
