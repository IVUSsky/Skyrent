# Skyrent — Monetization & Optimization Memo
**Asof:** 2026-06-07 · **Source:** `/api/metrics/portfolio` (production)

---

## Изпълнително резюме

Портфолиото от 39 имота (33 активни) с **3.75M EUR asset base** е здраво капитализирано (LTV 27.4%) и носи **~119K EUR/година contracted rent**. **Около 1M EUR обаче лежи в 6+ неактивни имоти и 5 неработещи гаража** — това е най-големият неизползван лост. Реалният NOI/Cap Rate ще се види едва след като импортираш бизнес банковата сметка (Прокредит SKY CAPITAL OOD) — момента opex данните липсват и Cap Rate (3.17% portfolio-wide) най-вероятно е завишен.

---

## Контекст — какво знаем и какво НЕ знаем

### Знаем (real prod data)

| Метрика | Стойност | Бележка |
|---|---|---|
| Properties | 39 (33 active) | 6 inactive: 2 Фонтани ап.4А/5 + 4 Симеоново 12 |
| Asset base | 3,752,998 EUR | market_val попълнено за повечето имоти |
| Total debt | 1,026,847 EUR | 9 кредита (Пощенска 1, УниКредит 5, Прокредит 3) |
| LTV портфолио | **27.4%** | здраво капитализирано |
| Equity | 2,726,151 EUR | |
| Rent contracted | 119,016 EUR/год | 9,918 EUR/мес |
| Debt service | 53,797 EUR/год | |
| Top 5 concentration | 33.8% | умерено разпръснато |
| Herfindahl | 0.0505 | разпръснато ✓ |

### НЕ знаем (gap-ове)

| Какво | Защо |
|---|---|
| Реален opex per имот | Бизнес банка не е импортирана; `transactions` има само лични |
| Vacancy rate | bank Кт за наем дава само 5,960 EUR/12м — bank данните са оскъдни |
| Истински NOI / Cap Rate / DSCR | Зависи от opex |
| Loan principal vs interest split | `loans` няма original_principal; calcCurrentBalance работи forward от balance_date |

**Следствие за memo-то:** Идеите базирани на opex/Cap Rate анализ са flag-нати като "verify after bank import". Останалите идеи са immediately actionable.

---

## Top 5 Monetization Идеи (ranked by impact/effort)

### 🥇 #1 — Активирай 6-те имота на пауза (Симеоново 12 + Фонтани 4А/5)

**Текущо:** 6 имота със статус `❌` или `🔶`, обща оценка ~580K EUR (Симеоново) + 275K EUR (Фонтани) = **~855K EUR неактивен capital**.

```
ID 26: Фонтани ап.4А бл.15 — 155K EUR, дълг 33K (LTV 21%), 🔶 наем 0
ID 27: Фонтани ап.5 бл.15  — 120K EUR, дълг 33K (LTV 27%), 🔶 наем 0
ID 34: Симеоново 12 ап.B71 — 230K EUR, дълг 0,             ❌ наем 0
ID 35: Симеоново 12 ап.B81 — 230K EUR, дълг 0,             ❌ наем 0
ID 36: Симеоново 12 ПМ 13  — 50K EUR,  дълг 0,             ❌ наем 0
ID 37: Симеоново 12 ПМ 14  — 50K EUR,  дълг 0,             ❌ наем 0
```

**Потенциален upside:**
- Симеоново 12 (2 апартамента × ~6.5% pace = ~30K EUR/год): **30,000 EUR/год**
- Симеоново 12 ПМ (2 × 50-70 EUR/мес): **1,500 EUR/год**
- Фонтани 4А+5 (1- и 2-стаен в София ~5% gross): **15,000 EUR/год**
- **Общо: ~46,500 EUR/год = +39% върху текущия contracted rent**

**Effort:** **M** — зависи от защо са неактивни. Ако причината е "още не са довършени" → wait + повторен анализ. Ако са активни но без наематели → агенция + marketing → 30-90 дни.

**Blockers:** строителство, документи, ремонт, наемател search.

**Препоръка:** Идентифицирай конкретната причина за всеки от 6-те имота. Активирай в следните 30-60 дни тези които technically могат да бъдат отдадени.

**Data trigger:** `by_property` секцията с `active=false` + `asset_val>0`.

---

### 🥈 #2 — Реши съдбата на 5-те неработещи гаража Фонтани

**Текущо:** Гаражи 34, 37, 38, 45, 62 + 63 (6 общо) — оценка **45K EUR всеки = 270K EUR общо**, **0 наем**. LTV на всеки 72.6% (32.7K дълг на гараж — равно деление на Прокредит ПК-3).

Сравнително: Имот 17 "Фонтани Гараж 6" (другата серия) генерира 129 EUR/мес = 1,548 EUR/год → Cap 3.4%.

**Опции (избор A или B):**

A) **Активирай** — отдай на 130-150 EUR/мес (сходно на работещия гараж).
- 5 × 150 × 12 = **9,000 EUR/год**
- Effort: S (агенция + анонс)
- Изваждаш ~13K EUR от dead capital

B) **Продай** ако пазарната цена > 60K (33% над текущ market_val) и пренасочи към:
- Намаление на високолихвен дълг (Прокредит 3%)
- 270K продажба × ~75% после costs = ~200K → погасява 40% от Прокредит ПК-3
- Спестява ~6,000 EUR/год лихва

**Препоръка:** **A** ако locations имат demand (Фонтани е централен квартал → вероятно имат). Ако след 60 дни нет реакция → **B**.

**Data trigger:** `тип='Гараж' AND active AND rent_monthly=0`.

---

### 🥉 #3 — Refinance Прокредит дълга с УниКредит / Пощенска terms

**Текущо:**

| Банка | Кредити | Тотал EUR | Лихва % | Тегло |
|---|---|---|---|---|
| Пощенска | 1 (HL143709) | 163,840 | 2.4% | 16% |
| УниКредит | 5 кредита | 283,485 | 2.4-2.8% | 28% |
| **Прокредит** | **3 кредита** | **583,643** | **3.0%** | **57%** |

Прокредит = 57% от дълга на най-високата ставка. При refi от 3% → 2.5% (средно) на 583K → спестяване ~**2,900 EUR/година** в interest.

**Effort:** M-L (преговори, due diligence, нови учредители на ипотеки).
**Blocker:** ранно прекратяване penalty (обикновено 1% от остатъка = 5,800 EUR). ROI = ~2 години.

**Препоръка:** Изпрати запитване до УниКредит / Пощенска за условия. Decision след offer.

**Data trigger:** Прокредит loans group sum + interest rate spread.

---

### 🥉 #4 — Преразпредели дълга от 1.2M+ unleveraged equity към high-interest debt

**Текущо:**

Имоти с **0% LTV** (free of debt) и market value: **~1,200,000 EUR** (Илион, Болнична, Стелар, Младост 2/3, Иширков ап, и др.).

В същото време Прокредит ПК-3 е 261,938 EUR при 3% лихва.

**Идея:** Equity loan върху чисти имоти (Илион/Болнична) при 2-2.5% за погасяване на Прокредит ПК-3:
- 261K × (3% - 2.25%) = **1,960 EUR/година** + независимост от консолидирания залог на 8 Фонтани имота

**Но внимание:** Това увеличава общия дълг на portfolio-то. Изпълнимо само ако:
- Имаш план да re-deploy-неш cash от Прокредит (напр. нова покупка)
- Или искаш да разтовариш Фонтани collateral
- Не препоръчвам ако crediting headroom е stretched

**Препоръка:** Hold за момента. Преразгледай след 6-12 месеца ако lichvi се движат и имаш нов проект.

---

### 🥉 #5 — Bank import → vacancy detection + actual NOI

**Текущо:** rent_received_12m = 5,960 EUR vs contracted 119,016 EUR = **5% fill rate в bank data**. 

Това е чисто visibility проблем — реални тенant payments се случват (Skyrent има manual_rent_payments + Stripe), но bank data е incomplete.

**Effort:** M (импорт на business сметка Прокредит SKY CAPITAL за 12-36 месеца, изчакване bank maintenance да приключи).

**Upside:** Не директен €, но критично за:
- Реален opex (днес е 0)
- Vacancy detection (текущо приемаме 100%)
- Tenant payment failure detection
- Cost-per-property analytics
- Real Cap Rate / DSCR / Cash-on-Cash

**Без това всички Top 1-4 идеи се базират на contracted rent + market_val, а реалният cash flow остава неизмерен.**

**Препоръка:** Tier 1 priority когато банката се върне online. Прокредит business + история 3 години.

---

## Идеи отхвърлени (с причина)

| Идея | Защо отхвърлена |
|---|---|
| STR / Airbnb conversion | Memory `project_skyrent_portfolio_scale.md`: всички LTR; STR конвертиране на едно няма да е значимо (1 имот × 30% upside = 1-2K). Mass STR конвертиране е regulatory headache в София. |
| Geo-clustering anal | 39 имота са в няколко локации (Фонтани, Симеоново, Илион/Болнична, Младост 1/2/3, Иширков, Стелар) — твърде малка вибиока за heatmap insight. |
| Tenant cohort анализ | tenant_history таблица съществува, но без bank данни не можем да корелираме retention с cash flow. |
| Property management software upsell | Skyrent ВЕЧЕ е management system — отказваш external SaaS, не купуваш такъв. |
| IRR / NPV modelling | Hold-forever LTR portfolio — IRR теоретично е useful, но действия идват от Cap Rate / Cash-on-Cash. IRR без exit assumption е vanity metric. |
| Tax-loss harvesting | BG не е US — capital gains tax структура не позволява тази стратегия за LTR. |

---

## Action list (30 / 90 / 180 дни)

### Следващите 30 дни (immediate)

- [ ] **Идентифицирай защо 6 имота (Симеоново 12 + Фонтани 4А/5) са неактивни** — лично обиждане или проверка с агенция
- [ ] **Решение за 5 гаража Фонтани** — пробен анонс за наем (агенция + OLX/Imot.bg)
- [ ] **Bank import** когато Прокредит maintenance свърши — приоритет бизнес сметка
- [ ] **Investigate LTV outliers** — Фонтани Гараж 6 (229% LTV), Иширков ПМ 10 (163%) — възможна грешка в `loans.имоти` allocation или market_val

### Следващите 90 дни (Q3 2026)

- [ ] **Phase 3 UI tab "Инвеститорско view"** за visual dashboard на горните числа
- [ ] **Phase 4 monthly snapshots cron** — trend графики
- [ ] **Refi inquiry към УниКредит / Пощенска** за Прокредит кредитите (3% → 2.5%?)
- [ ] **Активиране на 2-3 имота** от inactive списъка (приоритет Симеоново 12 — без дълг, нула risk)
- [ ] **Допълни мазетата** като отделни property records (memory: предстоят)

### Следващите 180 дни (Q4 2026)

- [ ] **Реално NOI per имот** след минимум 6 месеца bank data → ranking на top/bottom performers по реална печалба
- [ ] **Преоценка на сегашната allocation policy** на дълга — `loans.имоти` equal-split не отразява реалност при колективен ипотечен договор
- [ ] **Strategic review** — да продаваме ли low-yield имоти и да купуваме ли high-yield? Изисква пълен Cap Rate ranking с реален opex
- [ ] **Equity capacity report** — колко допълнителен дълг portfolio-то може да поеме безопасно (DSCR > 1.5 цел)

---

## Числа които ще се напълнят след bank import

При сегашния endpoint:
- `portfolio.opex_annual` → **0** ← ще се напълни
- `portfolio.opex_ratio` → **0%** ← ще покаже реалния (вероятно 15-22% за residential BG)
- `portfolio.noi_annual` → 119,016 EUR (= rent) ← ще падне с opex amount
- `portfolio.cap_rate` → 3.17% ← ще падне към 2.5-2.8%
- `portfolio.dscr` → 2.21 ← ще падне към 1.7-1.9
- `portfolio.cash_on_cash` → 2.39% ← ще падне към 1.5-1.8%
- `portfolio.rent_received_12m` → 5,960 ← ще се изравни с contracted (~95-100%)
- `by_property[*].opex_*` → нула ← ще покаже expense ratio outliers

Тези цифри ТРЯБВА да бъдат re-confirmed след 30+ дни business bank данни. Преди това всеки cap-rate-based decision е тентативен.

---

*Memo генериран автоматично на base на `/api/metrics/portfolio`. Refresh: cron monthly (Phase 2 предстои).*
