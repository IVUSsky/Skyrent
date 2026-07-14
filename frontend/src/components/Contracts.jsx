import { apiFetch } from '../api'
import React, { useState, useEffect, useCallback, useRef } from 'react'

const STATUS_LABELS = {
  draft:      { label: 'Чернова',     color: 'bg-gray-100 text-gray-600' },
  active:     { label: 'Активен',     color: 'bg-green-100 text-green-700' },
  terminated: { label: 'Прекратен',  color: 'bg-red-100 text-red-700' },
  archived:   { label: 'Архивиран',  color: 'bg-blue-100 text-blue-700' },
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('bg-BG')
}

const DEFAULT_TEMPLATE = `# ДОГОВОР ЗА НАЕМ НА НЕДВИЖИМ ИМОТ / RESIDENTIAL LEASE AGREEMENT
## № {{ДОГОВОР_НОМЕР}}

Днес, {{ДАТА_ДНЕС}}, в гр. София, между страните:
Today, {{ДАТА_ДНЕС}}, in Sofia, between the parties:

**НАЕМОДАТЕЛ / LANDLORD:** {{НАЕМОДАТЕЛ_ДАННИ_BG}}
{{НАЕМОДАТЕЛ_ДАННИ_EN}}

тел: {{НАЕМОДАТЕЛ_ТЕЛЕФОН}} / Tel: {{НАЕМОДАТЕЛ_ТЕЛЕФОН}}, IBAN: {{НАЕМОДАТЕЛ_IBAN}}

и / and

**НАЕМАТЕЛ / TENANT:** {{НАЕМАТЕЛ_ИМЕ}}, с адрес / address: {{НАЕМАТЕЛ_АДРЕС}}, ЕГН / ID No: {{НАЕМАТЕЛ_ЕГН}}, {{НАЕМАТЕЛ_ДОКУМЕНТ}} № {{НАЕМАТЕЛ_ДОКУМЕНТ_ДАТА}}, издаден в / issued in {{НАЕМАТЕЛ_ДОКУМЕНТ_СТРАНА}}, роден / born: {{НАЕМАТЕЛ_РОДЕН}}, тел: {{НАЕМАТЕЛ_ТЕЛЕФОН}}, имейл / email: {{НАЕМАТЕЛ_ИМЕЙЛ}}

се сключи настоящият договор / the following agreement is concluded:

## РАЗДЕЛ I. ПРЕДМЕТ НА ДОГОВОРА / SUBJECT MATTER

Чл. 1. Наемодателят предоставя на Наемателя за временно и възмездно ползване следния недвижим имот: {{ИМОТ_ОПИСАНИЕ}}, намиращ се на адрес: {{ИМОТ_АДРЕС}}, с площ {{ИМОТ_ПЛОЩ}} кв.м.

Art. 1. The Landlord provides the Tenant with temporary and paid use of the following real estate property: {{ИМОТ_ОПИСАНИЕ}}, located at: {{ИМОТ_АДРЕС}}, with an area of {{ИМОТ_ПЛОЩ}} sq.m.

Чл. 2. Имотът се предава на Наемателя на {{ДАТА_ПРЕДАВАНЕ}}.
Art. 2. The property is handed over to the Tenant on {{ДАТА_ПРЕДАВАНЕ}}.

## РАЗДЕЛ II. НАЕМНА ЦЕНА И НАЧИН НА ПЛАЩАНЕ / RENT AND PAYMENT

Чл. 3. Месечната наемна цена е {{НАЕМ}} {{ВАЛУТА}} ({{НАЕМ_ДУМИ}} {{ВАЛУТА_EN}}).
Art. 3. The monthly rent is {{НАЕМ}} {{ВАЛУТА}} ({{НАЕМ_ДУМИ}} {{ВАЛУТА_EN}}).

Чл. 4. Наемната цена се заплаща до {{ПАДЕЖ_ДЕН}}-то число на текущия месец по банков път на IBAN: {{НАЕМОДАТЕЛ_IBAN}}.
Art. 4. The rent is payable by the {{ПАДЕЖ_ДЕН}}th of each month by bank transfer to IBAN: {{НАЕМОДАТЕЛ_IBAN}}.

Чл. 5. При подписване на договора Наемателят заплаща депозит в размер на {{ДЕПОЗИТ}} {{ВАЛУТА}} ({{ДЕПОЗИТ_ДУМИ}} {{ВАЛУТА_EN}}), който се връща в 7-дневен срок след освобождаване на имота при липса на задължения и щети.
Art. 5. Upon signing, the Tenant pays a deposit of {{ДЕПОЗИТ}} {{ВАЛУТА}} ({{ДЕПОЗИТ_ДУМИ}} {{ВАЛУТА_EN}}), refundable within 7 days after vacating the property, subject to no outstanding obligations or damages.

## РАЗДЕЛ III. СРОК / DURATION

Чл. 6. Договорът се сключва за срок от {{ДАТА_НАЧАЛО}} до {{ДАТА_КРАЙ}}.
Art. 6. This Agreement is concluded for the period from {{ДАТА_НАЧАЛО}} to {{ДАТА_КРАЙ}}.

Чл. 7. При желание за прекратяване всяка от страните уведомява другата в 30-дневен срок предварително.
Art. 7. Either party wishing to terminate shall give 30 days' advance written notice.

## РАЗДЕЛ IV. ПРАВА И ЗАДЪЛЖЕНИЯ / RIGHTS AND OBLIGATIONS

Чл. 8. Наемателят се задължава да:
1. Заплаща наема в уговорения срок;
2. Ползва имота по предназначение;
3. Не извършва промени без писменото съгласие на Наемодателя;
4. Поддържа имота в добро техническо и санитарно-хигиенно състояние.

Art. 8. The Tenant undertakes to:
1. Pay the rent on the agreed dates;
2. Use the property for its intended purpose;
3. Not make alterations without the written consent of the Landlord;
4. Maintain the property in good technical and sanitary condition.

Чл. 9. Наемодателят се задължава да осигури спокойното ползване на имота за уговорения срок.
Art. 9. The Landlord undertakes to ensure the Tenant's quiet enjoyment of the property for the agreed term.

## РАЗДЕЛ V. ДОПЪЛНИТЕЛНИ УСЛОВИЯ / ADDITIONAL CONDITIONS

{{УСЛОВИЯ}}

---

Договорът се подписа в два еднакви екземпляра — по един за всяка от страните.
This Agreement is signed in two identical copies — one for each party.

**НАЕМОДАТЕЛ / LANDLORD:** {{НАЕМОДАТЕЛ_ПОДПИС_BG}}
{{НАЕМОДАТЕЛ_ПОДПИС_EN}}

**НАЕМАТЕЛ / TENANT:** {{НАЕМАТЕЛ_ИМЕ}}

_________________________                    _________________________`

const GARAGE_TEMPLATE = `# ДОГОВОР ЗА НАЕМ НА НЕДВИЖИМ ИМОТ / LEASE AGREEMENT FOR REAL ESTATE
## № {{ДОГОВОР_НОМЕР}}

Днес, {{ДАТА_ДНЕС}}, в гр. София, на основание чл. 228-239 от ЗЗД се сключи настоящият договор за наем на недвижим имот между страните:
Today, {{ДАТА_ДНЕС}}, in Sofia, pursuant to Art. 228-239 of the Obligations and Contracts Act, the following lease agreement is concluded between:

**НАЕМОДАТЕЛ / LANDLORD:** {{НАЕМОДАТЕЛ_ДАННИ_BG}}
{{НАЕМОДАТЕЛ_ДАННИ_EN}}

тел / Tel: {{НАЕМОДАТЕЛ_ТЕЛЕФОН}}, IBAN: {{НАЕМОДАТЕЛ_IBAN}}, ел.поща / e-mail: {{НАЕМОДАТЕЛ_ИМЕЙЛ}}

и / and

**НАЕМАТЕЛ / TENANT:** {{НАЕМАТЕЛ_ИМЕ}}, ЕИК/ЕГН / ID: {{НАЕМАТЕЛ_ЕГН}}, с адрес / address: {{НАЕМАТЕЛ_АДРЕС}}, представлявано от / represented by: {{НАЕМАТЕЛ_МОЛ}}, тел / Tel: {{НАЕМАТЕЛ_ТЕЛЕФОН}}, ел.поща / e-mail: {{НАЕМАТЕЛ_ИМЕЙЛ}}

## I. ПРЕДМЕТ НА ДОГОВОРА / SUBJECT MATTER

Чл.1. Наемодателят предоставя на Наемателя за временно и възмездно ползване следния недвижим имот: {{ИМОТ_ОПИСАНИЕ}}, находящ се на адрес: {{ИМОТ_АДРЕС}}.
Art. 1. The Landlord provides the Tenant with temporary paid use of the following real estate: {{ИМОТ_ОПИСАНИЕ}}, located at: {{ИМОТ_АДРЕС}}.

Чл.2. Наемодателят декларира, че притежава в пълен обем правото на собственост върху имота и че същият не е обременен с вещни или облигационни тежести, които биха възпрепятствали спокойното му използване от Наемателя.
Art. 2. The Landlord declares full ownership of the property and that it is free from any encumbrances that would prevent the Tenant's quiet enjoyment.

Чл.3. Имотът ще бъде използван за съхранение на лека кола или друго моторно превозно средство. Промяна на предназначението може да се извършва само с предварително писмено съгласие на Наемодателя.
Art. 3. The property shall be used for parking/storage of a passenger car or other motor vehicle. Change of use requires prior written consent of the Landlord.

Чл.4. Не се допуска преотдаване на имота под наем или преотстъпването му на трети лица без изрично писмено съгласие на Наемодателя.
Art. 4. Sub-letting or transfer of the property to third parties is not permitted without the Landlord's explicit written consent.

## II. ЦЕНА И НАЧИН НА ПЛАЩАНЕ / RENT AND PAYMENT

Чл.5. Наемателят заплаща месечен наем в размер на {{НАЕМ}} {{ВАЛУТА}} ({{НАЕМ_ДУМИ}} {{ВАЛУТА_EN}}) с включено ДДС.
Art. 5. The Tenant shall pay a monthly rent of {{НАЕМ}} {{ВАЛУТА}} ({{НАЕМ_ДУМИ}} {{ВАЛУТА_EN}}) inclusive of VAT.

Чл.6. Месечната наемна цена е твърда и подлежи на ежегодно индексиране от минимум 3%, но не по-малко от официално обявената за страната инфлация от НСИ.
Art. 6. The monthly rent is fixed and subject to annual indexation of minimum 3%, but not less than the officially announced inflation rate by the National Statistics Institute.

Чл.7. Наемателят заплаща наема предварително от 1-во до {{ПАДЕЖ_ДЕН}}-то число на всеки месец по банков път на IBAN: {{НАЕМОДАТЕЛ_IBAN}}.
Art. 7. The Tenant pays the rent in advance from the 1st to the {{ПАДЕЖ_ДЕН}}th of each month by bank transfer to IBAN: {{НАЕМОДАТЕЛ_IBAN}}.

Чл.8. При подписване на договора Наемателят заплаща гаранционен депозит в размер на {{ДЕПОЗИТ}} {{ВАЛУТА}} ({{ДЕПОЗИТ_ДУМИ}} {{ВАЛУТА_EN}}). Депозитът се връща в срок до 30 дни след прекратяване на договора при спазване на всички задължения.
Art. 8. Upon signing, the Tenant pays a security deposit of {{ДЕПОЗИТ}} {{ВАЛУТА}} ({{ДЕПОЗИТ_ДУМИ}} {{ВАЛУТА_EN}}). The deposit shall be refunded within 30 days after termination, subject to all obligations being fulfilled.

## III. ПРЕДАВАНЕ НА ИМОТА / HANDOVER

Чл.9. Имотът се предава на Наемателя на {{ДАТА_ПРЕДАВАНЕ}}, за което страните подписват Приемо-предавателен протокол.
Art. 9. The property is handed over to the Tenant on {{ДАТА_ПРЕДАВАНЕ}}, evidenced by a signed Handover Protocol.

Чл.10. В 7-дневен срок след прекратяването на договора Наемателят е длъжен да предаде обратно имота на Наемодателя в същото състояние, в което е бил приет. При неспазване Наемателят дължи неустойка от 0,5% на ден от размера на месечния наем.
Art. 10. Within 7 days of termination the Tenant must return the property in the same condition as received. Non-compliance entails a penalty of 0.5% per day of the monthly rent.

## IV. ПРАВА И ЗАДЪЛЖЕНИЯ НА НАЕМОДАТЕЛЯ / LANDLORD'S RIGHTS AND OBLIGATIONS

Чл.11. Наемодателят се задължава да предаде имота в състояние, годно за ползване, и да осигури безпрепятственото му ползване за срока на договора.
Art. 11. The Landlord undertakes to deliver the property in a condition suitable for use and to ensure the Tenant's unobstructed enjoyment throughout the lease term.

## V. ПРАВА И ЗАДЪЛЖЕНИЯ НА НАЕМАТЕЛЯ / TENANT'S RIGHTS AND OBLIGATIONS

Чл.12. Наемателят се задължава да:
1. Заплаща в срок уговорения месечен наем;
2. Ползва имота по предназначение и да полага грижата на добрия стопанин;
3. Заплаща разходите по отстраняването на дребни повреди при обикновено ползване;
4. Уведомява незабавно Наемодателя за възникнали аварии;
5. Осигурява достъп на Наемодателя с цел констатиране спазването на условията по договора;
6. Заплаща всички такси и режийни разноски по имота, включително за електроенергия.

Art. 12. The Tenant undertakes to:
1. Pay the agreed monthly rent on time;
2. Use the property for its intended purpose with due care;
3. Cover costs for minor repairs arising from ordinary use;
4. Immediately notify the Landlord of any emergencies or defects;
5. Provide the Landlord access for inspection purposes;
6. Pay all utility charges, including electricity.

## VI. ПОДДЪРЖАНЕ И РЕМОНТИ / MAINTENANCE AND REPAIRS

Чл.13. Всички разходи, свързани с ползването на имота, включително за електроенергия, са изцяло за сметка на Наемателя.
Art. 13. All costs related to the use of the property, including electricity, are entirely at the Tenant's expense.

Чл.14. Ремонти и подобрения могат да се извършват само след писмено съгласие на Наемодателя. Наемодателят не дължи обезщетение за направени подобрения след прекратяване на договора.
Art. 14. Repairs and improvements may only be carried out with the Landlord's written consent. The Landlord owes no compensation for improvements upon termination.

Абонатни номера / Subscriber numbers:
ЕЛЕКТРИЧЕСТВО / ELECTRICITY: {{АБОНАТ_ТОК}}

## VII. СРОК И ПРЕКРАТЯВАНЕ / DURATION AND TERMINATION

Чл.15. Договорът се сключва за срок от {{ДАТА_НАЧАЛО}} до {{ДАТА_КРАЙ}}.
Art. 15. This Agreement is concluded from {{ДАТА_НАЧАЛО}} to {{ДАТА_КРАЙ}}.

Чл.16. Договорът се прекратява: а) с изтичане на срока — при липса на едномесечно предизвестие преди края на срока, договорът се счита продължен за нов 12-месечен срок; б) с едномесечно предизвестие от всяка страна след 11-ия месец; в) незабавно от Наемодателя при неплащане на наема или консумативи за повече от 20 дни.
Art. 16. This Agreement terminates: a) upon expiry — if no one-month notice is given before expiry, it is automatically renewed for a new 12-month term; b) upon one-month written notice by either party after the 11th month; c) immediately by the Landlord in case of non-payment of rent or utilities for more than 20 days.

Чл.17. При предсрочно прекратяване без спазване на предизвестието, неизправната страна дължи обезщетение в размер на един месечен наем. При предсрочно прекратяване от Наемателя депозитът не се възстановява.
Art. 17. Early termination without notice entitles the other party to compensation equal to one month's rent. In case of early termination by the Tenant, the deposit is non-refundable.

## VIII. НЕУСТОЙКИ / PENALTIES

Чл.18. При забава в плащането на наем Наемателят дължи неустойка от 0,5% на ден от незаплатената сума, но не повече от размера на годишния наем.
Art. 18. For late payment of rent, the Tenant owes a penalty of 0.5% per day on the unpaid amount, not exceeding the annual rent.

## IX. ОБЩИ РАЗПОРЕДБИ / GENERAL PROVISIONS

Чл.19. Всички изменения и допълнения към договора са валидни само в писмена форма и подписани от двете страни.
Art. 19. All amendments to this Agreement are valid only in written form and signed by both parties.

Чл.20. За всички спорове страните уреждат отношенията си чрез споразумение. При непостигане на съгласие спорът се решава от компетентния съд.
Art. 20. All disputes shall first be resolved by mutual agreement. Failing that, the competent court shall have jurisdiction.

{{УСЛОВИЯ}}

---

Договорът се подписа в два еднообразни екземпляра — по един за всяка от страните.
This Agreement is signed in two identical copies — one for each party.

**НАЕМОДАТЕЛ / LANDLORD:** {{НАЕМОДАТЕЛ_ПОДПИС_BG}}
{{НАЕМОДАТЕЛ_ПОДПИС_EN}}

**НАЕМАТЕЛ / TENANT:** {{НАЕМАТЕЛ_ИМЕ}}

_________________________                    _________________________`

const INTERNET_TEMPLATE = `# ИНДИВИДУАЛЕН ДОГОВОР ЗА ДОСТЪП ДО ИНТЕРНЕТ
## № {{ДОГОВОР_НОМЕР}}

Днес, {{ДАТА_ДНЕС}}, между:

**ДОСТАВЧИК:** {{НАЕМОДАТЕЛ_ИМЕ}}, ЕИК: {{НАЕМОДАТЕЛ_ЕГН}}, със седалище и адрес на управление: {{НАЕМОДАТЕЛ_АДРЕС}}, представлявано от {{НАЕМОДАТЕЛ_МОЛ}}, наричано за краткост ДОСТАВЧИК,

и

**АБОНАТ:** {{НАЕМАТЕЛ_ИМЕ}}, ЕГН (ЕИК): {{НАЕМАТЕЛ_ЕГН}}, с адрес: {{НАЕМАТЕЛ_АДРЕС}}, тел.: {{НАЕМАТЕЛ_ТЕЛЕФОН}}, наричан/а за краткост АБОНАТ,

се сключи настоящият договор при общи условия, за следното:

## I. ПРЕДМЕТ НА ДОГОВОРА

Чл. 1. (1) АБОНАТЪТ възлага, а ДОСТАВЧИКЪТ приема да предоставя на АБОНАТА чрез своята далекосъобщителна мрежа информационна услуга (високоскоростен достъп до интернет) на адрес за предоставяне на услугата: {{ИМОТ_АДРЕС}}, срещу което АБОНАТЪТ се задължава да заплаща месечна абонаментна такса съгласно условията на този договор.
(2) Доставчикът предоставя връзка по абонаментен план: {{УСЛОВИЯ}}, подробно описан в Приложение №1 към настоящия договор.
(3) Интернет достъп се предоставя чрез технологии FTTH/FTTB и LAN.

## II. ЦЕНА И НАЧИН НА ПЛАЩАНЕ

Чл. 2. (1) АБОНАТЪТ заплаща месечна такса в размер на {{НАЕМ}} {{ВАЛУТА}} ({{НАЕМ_ДУМИ}}). Таксата се дължи авансово за всеки следващ месец, до {{ПАДЕЖ_ДЕН}}-то число на месеца, без да е необходима покана за това.
(2) Плащането се извършва в брой при ДОСТАВЧИКА, по банков път на IBAN: {{НАЕМОДАТЕЛ_IBAN}}, или чрез онлайн портала на ДОСТАВЧИКА.

## III. ПРАВА И ЗАДЪЛЖЕНИЯ НА ДОСТАВЧИКА

Чл. 3. ДОСТАВЧИКЪТ се задължава:
1. Да доставя услугата качествено и своевременно;
2. Да уведомява предварително за планирани профилактични мероприятия, които могат да доведат до временно преустановяване или влошаване на качеството на услугата.

Чл. 4. ДОСТАВЧИКЪТ има право:
1. Да получава уговорената в този договор такса;
2. Да прилага мерки за управление на трафика с оглед запазване на целостта и сигурността на мрежата;
3. Да инсталира при АБОНАТА техническо оборудване, което е част от мрежата.

## IV. ПРАВА И ЗАДЪЛЖЕНИЯ НА АБОНАТА

Чл. 5. АБОНАТЪТ се задължава:
1. Да изпълнява задълженията си по този договор точно и в срок;
2. Да заплаща отстраняването на повреди, възникнали вследствие на негово виновно поведение;
3. Да не предоставя или споделя услугата с трети лица извън своето домакинство.

Чл. 6. АБОНАТЪТ има право да получава и ползва услугата, предмет на този договор, при спазване на предвидените ограничения.

## V. СРОК НА ДОГОВОРА

Чл. 7. Договорът влиза в сила с подписването му и се сключва без срок (безсрочен).

## VI. НЕИЗПЪЛНЕНИЕ. САНКЦИИ. ОТГОВОРНОСТ

Чл. 8. (1) При неплащане в срок АБОНАТЪТ дължи неустойка за забава в размер на 1% от дължимата сума за всеки ден забава до окончателното изпълнение.
(2) ДОСТАВЧИКЪТ има право да преустанови доставянето на услугата при забава.
(3) При забава над 14 календарни дни ДОСТАВЧИКЪТ има право едностранно и без предизвестие да прекрати договора.

## VII. ПРЕКРАТЯВАНЕ

Чл. 9. Договорът може да бъде прекратен от всяка от страните чрез едномесечно писмено предизвестие.

## VIII. ЗАЩИТА НА ЛИЧНИТЕ ДАННИ

Чл. 10. АБОНАТЪТ дава съгласие ДОСТАВЧИКЪТ да обработва, съхранява и използва предоставените лични данни, включително ЕГН, за нуждите на сключения договор, при спазване на Регламент (ЕС) 2016/679 (GDPR) и Закона за защита на личните данни.

---

За ДОСТАВЧИКА: ____________________          За АБОНАТА: ____________________
({{НАЕМОДАТЕЛ_ИМЕ}})                            ({{НАЕМАТЕЛ_ИМЕ}})

## ПРИЛОЖЕНИЕ №1 — СПЕЦИФИКАЦИЯ НА УСЛУГАТА

Абонаментен план: {{УСЛОВИЯ}}
Минимална скорост (download/upload): .............. / .............. Mbps
Обичайно налична скорост (download/upload): .............. / .............. Mbps
Максимална скорост (download/upload): .............. / .............. Mbps
Месечен трафик: неограничен
Брой свързани устройства: неограничен

За ДОСТАВЧИКА: ____________________          За АБОНАТА: ____________________`

const PLACEHOLDER_HELP = [
  ['{{ДОГОВОР_НОМЕР}}', 'Номер на договора'],
  ['{{ДАТА_ДНЕС}}', 'Днешна дата'],
  ['{{ДАТА_НАЧАЛО}}', 'Начална дата'],
  ['{{ДАТА_КРАЙ}}', 'Крайна дата'],
  ['{{ДАТА_ПРЕДАВАНЕ}}', 'Дата на предаване'],
  ['{{НАЕМОДАТЕЛ_ДАННИ_BG}}', 'Наемодател BG (авто)'],
  ['{{НАЕМОДАТЕЛ_ДАННИ_EN}}', 'Наемодател EN (авто)'],
  ['{{НАЕМОДАТЕЛ_ПОДПИС_BG}}', 'Подпис BG (авто)'],
  ['{{НАЕМОДАТЕЛ_ПОДПИС_EN}}', 'Подпис EN (авто)'],
  ['{{НАЕМОДАТЕЛ_ИМЕ}}', 'Иле/фирма наемодател'],
  ['{{НАЕМОДАТЕЛ_АДРЕС}}', 'Адрес наемодател'],
  ['{{НАЕМОДАТЕЛ_ЕГН}}', 'ЕГН/ЕИК наемодател'],
  ['{{НАЕМОДАТЕЛ_IBAN}}', 'IBAN'],
  ['{{НАЕМОДАТЕЛ_ТЕЛЕФОН}}', 'Тел. наемодател'],
  ['{{НАЕМАТЕЛ_ИМЕ}}', 'Наемател'],
  ['{{НАЕМАТЕЛ_ЕГН}}', 'ЕГН наемател'],
  ['{{НАЕМАТЕЛ_ТЕЛЕФОН}}', 'Тел. наемател'],
  ['{{НАЕМАТЕЛ_ДОКУМЕНТ}}', 'Вид документ (паспорт/ЛК)'],
  ['{{НАЕМАТЕЛ_ДОКУМЕНТ_ДАТА}}', 'Номер на документа'],
  ['{{НАЕМАТЕЛ_ДОКУМЕНТ_СТРАНА}}', 'Страна издател'],
  ['{{НАЕМАТЕЛ_РОДЕН}}', 'Дата на раждане'],
  ['{{ИМОТ_АДРЕС}}', 'Адрес на имота'],
  ['{{ИМОТ_ПЛОЩ}}', 'Площ кв.м'],
  ['{{НАЕМ}}', 'Наем (число)'],
  ['{{НАЕМ_ДУМИ}}', 'Наем с думи'],
  ['{{ДЕПОЗИТ}}', 'Депозит (число)'],
  ['{{ДЕПОЗИТ_ДУМИ}}', 'Депозит с думи'],
  ['{{ВАЛУТА}}', 'Валута (€/лв.)'],
  ['{{ВАЛУТА_EN}}', 'Валута EN (euros/leva)'],
  ['{{НАЕМАТЕЛ_МОЛ}}', 'МОЛ на наемател (фирма)'],
  ['{{АБОНАТ_ТОК}}', 'Абонатен № ток'],
  ['{{ПАДЕЖ_ДЕН}}', 'Ден за плащане'],
  ['{{УСЛОВИЯ}}', 'Допълн. условия'],
]

export default function Contracts({ API }) {
  const [tab, setTab] = useState('list') // list | templates | new
  const [contracts, setContracts] = useState([])
  const [templates, setTemplates] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  // Filters
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')

  // Template editor
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [templateForm, setTemplateForm] = useState({ name: '', content: DEFAULT_TEMPLATE })
  const [logoFile, setLogoFile] = useState(null)
  const logoInputRef = useRef()

  // New contract form
  const [newForm, setNewForm] = useState({
    template_id: '', property_id: '',
    landlord_type: 'физическо',
    landlord_name: '', landlord_address: '', landlord_egn: '', landlord_phone: '',
    landlord_lk: '', landlord_lk_date: '',
    tenant_name: '', tenant_address: '', tenant_egn: '', tenant_phone: '', tenant_email: '',
    tenant_mol: '',
    tenant_doc: 'лична карта', tenant_doc_date: '', tenant_doc_country: 'България', tenant_dob: '',
    id_front_path: '', id_back_path: '',
    property_address: '', property_description: '', property_area: '',
    monthly_rent: '', currency: 'EUR', deposit: '', payment_day: '5',
    start_date: '', end_date: '', delivery_date: '', conditions: '', notes: '',
  })
  const [creating, setCreating] = useState(false)
  const [idFront, setIdFront] = useState(null)
  const [idBack, setIdBack] = useState(null)
  const [extractingId, setExtractingId] = useState(false)
  const [directory, setDirectory] = useState([])   // указател на наематели
  const [savingParty, setSavingParty] = useState(false)

  // Архив на съществуващи договори (качен скан → AI extract → apply)
  const [scanFiles, setScanFiles] = useState([])
  const [scanBusy, setScanBusy] = useState(false)
  const [scanResult, setScanResult] = useState(null)  // { scan_file, extracted, suggested_property }
  const [scanPropId, setScanPropId] = useState('')
  const [scanUpdateProp, setScanUpdateProp] = useState(true)

  const scanExtract = async () => {
    if (!scanFiles.length) { showToast('Избери PDF или снимки на договора', 'error'); return }
    setScanBusy(true); setScanResult(null)
    try {
      const fd = new FormData()
      for (const f of scanFiles) fd.append('files', f)
      const r = await apiFetch(`${API}/api/contract-scans/extract`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) { showToast(d.error || 'Грешка при разчитане', 'error'); setScanBusy(false); return }
      setScanResult(d)
      setScanPropId(d.suggested_property ? String(d.suggested_property.id) : '')
      setScanBusy(false)
    } catch (e) { showToast('Сървърна грешка', 'error'); setScanBusy(false) }
  }

  const scanApply = async () => {
    if (!scanResult) return
    setScanBusy(true)
    try {
      const r = await apiFetch(`${API}/api/contract-scans/apply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scan_file: scanResult.scan_file, ...scanResult.extracted,
          property_id: scanPropId || null, update_property: scanUpdateProp,
        }),
      })
      const d = await r.json()
      if (!r.ok) { showToast(d.error || 'Грешка', 'error'); setScanBusy(false); return }
      showToast('Договорът е архивиран' + (scanUpdateProp && scanPropId ? ' + имотът е актуализиран' : ''))
      setScanFiles([]); setScanResult(null); setScanBusy(false)
      load(); setTab('list')
    } catch (e) { showToast('Сървърна грешка', 'error'); setScanBusy(false) }
  }

  const setExtractedField = (k, v) => setScanResult(s => ({ ...s, extracted: { ...s.extracted, [k]: v } }))

  // Извличане на данни от снимки на лична карта (Claude Vision) → попълва полетата
  const extractId = async () => {
    if (!idFront) { showToast('Качи поне лицевата страна на личната карта', 'error'); return }
    setExtractingId(true)
    try {
      const fd = new FormData()
      fd.append('front', idFront)
      if (idBack) fd.append('back', idBack)
      const r = await apiFetch(`${API}/api/contracts/extract-id`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) { showToast(d.error || 'Грешка при извличане', 'error'); return }
      const x = d.data || {}
      setNewForm(f => ({
        ...f,
        tenant_name:        x.tenant_name      || f.tenant_name,
        tenant_egn:         x.egn              || f.tenant_egn,
        tenant_address:     x.permanent_address|| f.tenant_address,
        tenant_dob:         x.birth_date       || f.tenant_dob,
        tenant_doc:         'лична карта',
        tenant_doc_date:    x.id_issued_date   || f.tenant_doc_date,
        tenant_doc_country: f.tenant_doc_country || 'България',
        id_front_path:      d.id_front_path    || '',
        id_back_path:       d.id_back_path     || '',
      }))
      showToast('Данните са извлечени — прегледай ги (особено ЕГН) преди запазване')
    } catch (e) {
      showToast('Грешка при извличане', 'error')
    } finally { setExtractingId(false) }
  }

  // Указател на наематели — преизползваеми контакти
  const loadDirectory = () => apiFetch(`${API}/api/contracts/parties`)
    .then(r => r.ok ? r.json() : []).then(d => setDirectory(Array.isArray(d) ? d : [])).catch(() => {})

  const applyParty = (id) => {
    const p = directory.find(x => x.id === Number(id))
    if (!p) return
    setNewForm(f => ({
      ...f,
      tenant_name: p.name || '', tenant_egn: p.egn || '', tenant_address: p.address || '',
      tenant_phone: p.phone || '', tenant_email: p.email || '', tenant_dob: p.dob || '',
      tenant_doc: p.doc_type || f.tenant_doc, tenant_doc_date: p.doc_date || '',
      tenant_doc_country: p.doc_country || f.tenant_doc_country,
    }))
  }

  const saveParty = async () => {
    if (!newForm.tenant_name) { showToast('Първо въведи име на наемател', 'error'); return }
    setSavingParty(true)
    try {
      const body = {
        name: newForm.tenant_name, egn: newForm.tenant_egn, address: newForm.tenant_address,
        phone: newForm.tenant_phone, email: newForm.tenant_email, doc_type: newForm.tenant_doc,
        doc_date: newForm.tenant_doc_date, doc_country: newForm.tenant_doc_country, dob: newForm.tenant_dob,
      }
      const r = await apiFetch(`${API}/api/contracts/parties`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { showToast(d.error || 'Грешка', 'error'); return }
      showToast('Наемателят е запазен в указателя ✓')
      loadDirectory()
    } catch (e) { showToast('Грешка', 'error') } finally { setSavingParty(false) }
  }

  // Actions
  const [sending, setSending] = useState(null)
  const [termModal, setTermModal] = useState(null)
  const [termDate, setTermDate] = useState(new Date().toISOString().slice(0,10))
  const [annexModal, setAnnexModal] = useState(null)
  const [annexForm, setAnnexForm] = useState({ annex_date: '', new_end_date: '', new_monthly_rent: '', new_currency: 'EUR', notes: '' })
  const [annexes, setAnnexes] = useState([])
  const [creatingAnnex, setCreatingAnnex] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(() => {
    setLoading(true)
    const q = new URLSearchParams()
    if (filterStatus) q.set('status', filterStatus)
    if (search) q.set('q', search)
    Promise.all([
      apiFetch(`${API}/api/contracts?${q}`).then(r => r.json()),
      apiFetch(`${API}/api/contracts/templates`).then(r => r.json()),
      apiFetch(`${API}/api/properties`).then(r => r.json()),
    ]).then(([c, t, p]) => {
      setContracts(Array.isArray(c) ? c : [])
      setTemplates(Array.isArray(t) ? t : [])
      setProperties(p)
      setLoading(false)
    }).catch(e => { setLoading(false); showToast(e.message, 'error') })
  }, [API, filterStatus, search])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadDirectory() }, [])

  // Auto-fill form fields when property is selected
  const onPropertyChange = (propId) => {
    const prop = properties.find(p => p.id === Number(propId))
    if (prop) {
      setNewForm(f => ({
        ...f,
        property_id:      propId,
        property_address: prop['адрес'] || f.property_address,
        property_area:    prop['площ']  || f.property_area,
        tenant_name:      prop['наемател'] || f.tenant_name,
        tenant_phone:     prop['телефон']  || f.tenant_phone,
        tenant_email:     prop['email']    || f.tenant_email,
        monthly_rent:     prop['наем']     || f.monthly_rent,
        абонат_ток:       prop['абонат_ток']  || f.абонат_ток  || '',
        абонат_вода:      prop['абонат_вода'] || f.абонат_вода || '',
        абонат_тец:       prop['абонат_тец']  || f.абонат_тец  || '',
        абонат_вход:      prop['абонат_вход'] || f.абонат_вход || '',
      }))
    } else {
      setNewForm(f => ({ ...f, property_id: propId }))
    }
  }

  const saveTemplate = async () => {
    const fd = new FormData()
    fd.append('name', templateForm.name)
    fd.append('content', templateForm.content)
    if (logoFile) fd.append('logo', logoFile)

    const url    = editingTemplate ? `${API}/api/contracts/templates/${editingTemplate.id}` : `${API}/api/contracts/templates`
    const method = editingTemplate ? 'PUT' : 'POST'
    const r = await apiFetch(url, { method, body: fd })
    const d = await r.json()
    if (d.id || d.ok) { showToast('Шаблонът е запазен'); load(); setEditingTemplate(null); setTemplateForm({ name: '', content: DEFAULT_TEMPLATE }); setLogoFile(null) }
    else showToast('Грешка: ' + d.error, 'error')
  }

  const deleteTemplate = (t) => {
    if (!window.confirm(`Изтриване на шаблон "${t.name}"?`)) return
    apiFetch(`${API}/api/contracts/templates/${t.id}`, { method: 'DELETE' }).then(() => { load(); showToast('Изтрито') })
  }

  const createContract = () => {
    if (!newForm.template_id) { showToast('Изберете шаблон', 'error'); return }
    if (!newForm.tenant_name) { showToast('Въведете наемател', 'error'); return }
    setCreating(true)
    apiFetch(`${API}/api/contracts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newForm),
    })
      .then(r => r.json())
      .then(d => {
        setCreating(false)
        if (d.ok) { showToast(`Договор ${d.contract_number} създаден`); load(); setTab('list') }
        else showToast('Грешка: ' + d.error, 'error')
      })
      .catch(e => { setCreating(false); showToast(e.message, 'error') })
  }

  const activateContract = (c) => {
    if (!window.confirm(`Активиране ще обнови портфолиото и ще създаде онлайн профил за наемателя. Продължи?`)) return
    const issueInvoice = window.confirm(
      'Да се фактурира ли този имот?\n\n' +
      'OK — включва фактурирането за имота и издава първата фактура (изпраща се и към счетоводството)\n' +
      'Отказ — без фактура'
    )
    apiFetch(`${API}/api/contracts/${c.id}/activate`, { method: 'POST', body: JSON.stringify({ issue_invoice: issueInvoice }) })
      .then(r => r.json())
      .then(d => {
        if (!d.ok) return showToast('Грешка: ' + d.error, 'error')
        let msg = 'Договорът е активен — портфолиото е обновено'
        if (d.tenant_account?.created) msg += d.tenant_account.email_sent ? ' • покана изпратена на наемателя' : ' • профил създаден (email не е изпратен)'
        if (d.invoice?.invoice_number) msg += ` • фактура № ${d.invoice.invoice_number} издадена`
        else if (d.invoice?.skipped === 'duplicate') msg += ' • фактура за месеца вече съществува'
        showToast(msg)
        load()
      })
  }

  const inviteTenant = (c) => {
    if (!window.confirm(`Изпращане на нова покана с временна парола до ${c.tenant_email}?`)) return
    apiFetch(`${API}/api/contracts/${c.id}/invite-tenant`, { method: 'POST' })
      .then(r => r.json())
      .then(d => d.ok ? showToast(`Покана изпратена — потребител ${d.username}`) : showToast('Грешка: ' + d.error, 'error'))
  }

  const sendContract = (c) => {
    const email = c.tenant_email || window.prompt('Въведете email адрес на наемателя:')
    if (!email) return
    setSending(c.id)
    apiFetch(`${API}/api/contracts/${c.id}/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
      .then(r => r.json())
      .then(d => { setSending(null); d.ok ? (showToast('Договорът е изпратен'), load()) : showToast('Грешка: ' + d.error, 'error') })
      .catch(e => { setSending(null); showToast(e.message, 'error') })
  }

  const terminateContract = () => {
    apiFetch(`${API}/api/contracts/${termModal.id}/terminate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ end_date: termDate }),
    })
      .then(r => r.json())
      .then(d => { d.ok ? (setTermModal(null), showToast('Договорът е прекратен'), load()) : showToast(d.error, 'error') })
  }

  const deleteContract = (c) => {
    if (!window.confirm(`Изтриване на договор ${c.contract_number}?`)) return
    apiFetch(`${API}/api/contracts/${c.id}`, { method: 'DELETE' }).then(() => { load(); showToast('Изтрито') })
  }

  const openAnnex = (c) => {
    setAnnexModal(c)
    // Default: extend 1 year from current end_date or today
    const base = c.end_date || new Date().toISOString().slice(0,10)
    const d = new Date(base)
    d.setFullYear(d.getFullYear() + 1)
    const newEnd = d.toISOString().slice(0,10)
    setAnnexForm({
      annex_date: new Date().toISOString().slice(0,10),
      new_end_date: newEnd,
      new_monthly_rent: c.monthly_rent || '',
      new_currency: c.currency || 'EUR',
      notes: '',
    })
    apiFetch(`${API}/api/contracts/${c.id}/annexes`).then(r => r.json()).then(setAnnexes)
  }

  const createAnnex = () => {
    setCreatingAnnex(true)
    apiFetch(`${API}/api/contracts/${annexModal.id}/annexes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(annexForm),
    })
      .then(r => r.json())
      .then(async d => {
        setCreatingAnnex(false)
        if (d.ok) {
          showToast(`Анекс ${d.annex_number} създаден`)
          // Авто-изпращане към наемателя, ако е чекнато
          if (annexSendAfter && d.id) {
            const sr = await apiFetch(`${API}/api/contracts/${annexModal.id}/annexes/${d.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
            const sd = await sr.json()
            showToast(sr.ok ? '✉️ Анексът е изпратен на наемателя' : 'Анексът е създаден, но: ' + (sd.error || 'изпращането не мина'), sr.ok ? 'success' : 'error')
          }
          apiFetch(`${API}/api/contracts/${annexModal.id}/annexes`).then(r => r.json()).then(setAnnexes)
          load()
        } else showToast('Грешка: ' + d.error, 'error')
      })
      .catch(e => { setCreatingAnnex(false); showToast(e.message, 'error') })
  }

  const [annexSendAfter, setAnnexSendAfter] = useState(false)
  const [annexUploadBusy, setAnnexUploadBusy] = useState(false)

  const sendAnnex = async (a) => {
    let email = annexModal.tenant_email
    if (!email) { email = window.prompt('Договорът няма имейл — въведи имейл на наемателя:') ; if (!email) return }
    if (!window.confirm(`Изпращане на анекс ${a.annex_number} до ${email}?`)) return
    const r = await apiFetch(`${API}/api/contracts/${annexModal.id}/annexes/${a.id}/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(annexModal.tenant_email ? {} : { email }),
    })
    const d = await r.json()
    showToast(r.ok ? '✉️ Изпратено' : 'Грешка: ' + (d.error || ''), r.ok ? 'success' : 'error')
  }

  const uploadOldAnnex = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setAnnexUploadBusy(true)
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    const dateStr = window.prompt('Дата на анекса (ГГГГ-ММ-ДД), или празно за днес:') || ''
    if (dateStr) fd.append('annex_date', dateStr)
    const r = await apiFetch(`${API}/api/contracts/${annexModal.id}/annexes/upload`, { method: 'POST', body: fd })
    const d = await r.json()
    setAnnexUploadBusy(false)
    if (r.ok) {
      showToast(`Архивен анекс ${d.annex_number} качен`)
      apiFetch(`${API}/api/contracts/${annexModal.id}/annexes`).then(r2 => r2.json()).then(setAnnexes)
    } else showToast('Грешка: ' + (d.error || ''), 'error')
  }

  const deleteAnnex = (a) => {
    if (!window.confirm(`Изтриване на анекс ${a.annex_number}?`)) return
    apiFetch(`${API}/api/contracts/${annexModal.id}/annexes/${a.id}`, { method: 'DELETE' })
      .then(() => setAnnexes(ax => ax.filter(x => x.id !== a.id)))
  }

  return (
    <div className="fin-surface">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header tabs */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-800">📋 Договори</h2>
        <div className="flex gap-2">
          {[['list','📁 Архив'],['new','+ Нов договор'],['upload','📎 Качи съществуващ'],['templates','📝 Шаблони']].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-lg ${tab===t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── UPLOAD TAB — архив на съществуващ (подписан) договор ─── */}
      {tab === 'upload' && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-6 max-w-3xl">
          <h3 className="text-lg font-bold text-gray-800 mb-1">📎 Качи съществуващ договор</h3>
          <p className="text-sm text-gray-500 mb-4">
            PDF, Word (.docx) или снимки от телефона (заедно с протокола, ако е в същия файл). AI разчита данните —
            преглеждаш, избираш имота и запазваш. Договорът влиза в архива, а данните на наемателя се актуализират.
          </p>

          {!scanResult ? (
            <>
              <input type="file" multiple accept=".pdf,.docx,image/*"
                onChange={e => setScanFiles(Array.from(e.target.files || []))}
                className="block w-full text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-semibold hover:file:bg-blue-100 mb-4" />
              {scanFiles.length > 0 && (
                <div className="text-xs text-gray-500 mb-3">{scanFiles.length} файл(а): {scanFiles.map(f => f.name).join(', ')}</div>
              )}
              <button onClick={scanExtract} disabled={scanBusy || !scanFiles.length}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {scanBusy ? '🔍 Разчитане… (10–30 сек)' : '🔍 Разчети договора'}
              </button>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 mb-4 text-sm text-green-800">
                ✓ Разчетено — прегледай и коригирай преди запис
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {[['tenant_name','Наемател *'],['tenant_egn','ЕГН'],['tenant_lk','Лична карта №'],['tenant_lk_date','ЛК издадена на'],
                  ['tenant_phone','Телефон'],['tenant_email','Имейл'],['tenant_address','Адрес на наемателя'],['property_address','Адрес на имота'],
                  ['monthly_rent','Наем/мес'],['currency','Валута (BGN/EUR)'],['deposit','Депозит'],['payment_day','Плащане до число'],
                  ['start_date','От дата'],['end_date','До дата'],['абонат_ток','Абонат № ток'],['абонат_вода','Абонат № вода'],
                  ['абонат_газ','Абонат № газ'],['абонат_тец','Абонат № ТЕЦ']].map(([k, label]) => (
                  <div key={k}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <input value={scanResult.extracted[k] ?? ''} onChange={e => setExtractedField(k, e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                ))}
              </div>

              <div className="mb-3">
                <label className="block text-xs text-gray-500 mb-1">Свържи с имот</label>
                <select value={scanPropId} onChange={e => setScanPropId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— без връзка с имот —</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.адрес}{p.наемател ? ` · ${p.наемател}` : ''}{scanResult.suggested_property?.id === p.id ? '  ⭐ предложено' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 mb-5 cursor-pointer">
                <input type="checkbox" checked={scanUpdateProp} onChange={e => setScanUpdateProp(e.target.checked)} />
                Актуализирай данните на имота (наемател, имейл, телефон, абонатни номера)
              </label>

              <div className="flex gap-2">
                <button onClick={scanApply} disabled={scanBusy || !scanResult.extracted.tenant_name}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                  {scanBusy ? 'Запис…' : '💾 Запази в архива'}
                </button>
                <button onClick={() => { setScanResult(null); setScanFiles([]) }}
                  className="px-4 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Откажи</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── LIST TAB ─────────────────────────────────────────────── */}
      {tab === 'list' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Търси по №, наемател, адрес..."
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[200px]" />
            <div className="flex gap-1">
              {[['','Всички'],['draft','Черновa'],['active','Активни'],['terminated','Прекратени']].map(([v,l]) => (
                <button key={v} onClick={() => setFilterStatus(v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${filterStatus===v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {Object.entries(STATUS_LABELS).map(([st, { label, color }]) => {
              const count = contracts.filter(c => c.status === st).length
              return (
                <div key={st} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
                  <div className="text-2xl font-bold text-gray-800 mt-1">{count}</div>
                </div>
              )
            })}
          </div>

          {loading ? <div className="text-center py-12 text-gray-400">Зарежда...</div> :
           contracts.length === 0 ? (
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-10 text-center text-gray-400">
              <div className="text-4xl mb-2">📋</div>
              <div>Няма договори. Натиснете "+ Нов договор".</div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['№','Наемател','Имот','Наем/мес','Период','Статус','Изпратен','Действия'].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contracts.map((c, i) => {
                    const st = STATUS_LABELS[c.status] || STATUS_LABELS.draft
                    return (
                      <tr key={c.id} className={i % 2 === 0 ? 'bg-white hover:bg-blue-50/20' : 'bg-gray-50 hover:bg-blue-50/20'}>
                        <td className="px-3 py-2 font-mono text-xs font-bold text-blue-700">{c.contract_number}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800 text-xs">{c.tenant_name}</div>
                          {c.tenant_phone && <div className="text-gray-400 text-xs">{c.tenant_phone}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 max-w-[120px] truncate">{c.property_address}</td>
                        <td className="px-3 py-2 text-xs font-medium text-blue-700 whitespace-nowrap">
                          {Number(c.monthly_rent||0).toLocaleString('bg-BG')} {c.currency}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                          {fmtDate(c.start_date)}{c.end_date ? ` → ${fmtDate(c.end_date)}` : ' →'}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {c.sent_at ? <span className="text-green-600">✅ {fmtDate(c.sent_at)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex gap-1 flex-wrap">
                            <button onClick={() => apiFetch(`${API}/api/contracts/${c.id}/pdf`).then(r => r.blob()).then(b => window.open(URL.createObjectURL(b), '_blank'))}
                              className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded" title="Договор PDF">📄</button>
                            <button onClick={() => apiFetch(`${API}/api/contracts/${c.id}/protocol/pdf`).then(r => r.blob()).then(b => window.open(URL.createObjectURL(b), '_blank'))}
                              className="px-2 py-1 text-xs bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded" title="Приемо-предавателен протокол PDF">📋</button>
                            {c.id_front_path && (
                              <button onClick={() => apiFetch(`${API}/api/contracts/id-image/${c.id_front_path}`).then(r => r.blob()).then(b => window.open(URL.createObjectURL(b), '_blank'))}
                                className="px-2 py-1 text-xs bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded" title="Лична карта — лице">🪪</button>
                            )}
                            {c.id_back_path && (
                              <button onClick={() => apiFetch(`${API}/api/contracts/id-image/${c.id_back_path}`).then(r => r.blob()).then(b => window.open(URL.createObjectURL(b), '_blank'))}
                                className="px-2 py-1 text-xs bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded" title="Лична карта — гръб">🪪↩</button>
                            )}
                            <button onClick={() => sendContract(c)} disabled={sending===c.id}
                              className="px-2 py-1 text-xs bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 rounded disabled:opacity-50" title="Изпрати по мейл">
                              {sending===c.id ? '...' : '📧'}
                            </button>
                            {c.status === 'draft' && (
                              <button onClick={() => activateContract(c)}
                                className="px-2 py-1 text-xs bg-green-50 border border-green-300 text-green-700 hover:bg-green-100 rounded" title="Активирай">
                                ✅
                              </button>
                            )}
                            {c.status === 'active' && (
                              <button onClick={() => { setTermModal(c); setTermDate(new Date().toISOString().slice(0,10)) }}
                                className="px-2 py-1 text-xs bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 rounded" title="Прекрати">
                                ⛔
                              </button>
                            )}
                            {c.status === 'active' && c.tenant_email && (
                              <button onClick={() => inviteTenant(c)}
                                className="px-2 py-1 text-xs bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded" title="Изпрати покана за tenant портал (нова парола)">
                                🔑
                              </button>
                            )}
                            <button onClick={() => openAnnex(c)}
                              className="px-2 py-1 text-xs bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 rounded" title="Анекс">📎</button>
                            <button onClick={() => deleteContract(c)}
                              className="px-2 py-1 text-xs bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 rounded">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── NEW CONTRACT TAB ─────────────────────────────────────── */}
      {tab === 'new' && (
        <div className="max-w-3xl">
          {templates.length === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
              <div className="text-2xl mb-2">📝</div>
              <div className="text-yellow-800 font-medium">Първо създайте шаблон в таб "Шаблони"</div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Template & property */}
              <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
                <h3 className="font-bold text-gray-800 mb-3">Основни</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Шаблон *</label>
                    <select value={newForm.template_id} onChange={e => setNewForm(f=>({...f,template_id:e.target.value}))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Изберете шаблон —</option>
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Имот (по желание)</label>
                    <select value={newForm.property_id} onChange={e => onPropertyChange(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Изберете имот —</option>
                      {properties.map(p => <option key={p.id} value={p.id}>#{p.id} {p['адрес']}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Landlord */}
              <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
                <h3 className="font-bold text-gray-800 mb-3">Наемодател</h3>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Страна по договора</label>
                  <div className="flex gap-3">
                    {[['физическо','👤 Физическо лице'],['дружество','🏢 Дружество']].map(([val,lbl]) => (
                      <label key={val} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${newForm.landlord_type===val ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300'}`}>
                        <input type="radio" name="landlord_type" value={val} checked={newForm.landlord_type===val}
                          onChange={e => setNewForm(f=>({...f,landlord_type:e.target.value}))} className="hidden" />
                        {lbl}
                      </label>
                    ))}
                  </div>
                </div>
                {newForm.landlord_type === 'физическо' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 p-3 bg-blue-50 rounded-lg">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Номер на ЛК</label>
                      <input type="text" value={newForm.landlord_lk} onChange={e=>setNewForm(f=>({...f,landlord_lk:e.target.value}))}
                        placeholder="123456789"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Дата на издаване на ЛК</label>
                      <input type="text" value={newForm.landlord_lk_date} onChange={e=>setNewForm(f=>({...f,landlord_lk_date:e.target.value}))}
                        placeholder="01.01.2020"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
                    </div>
                    <div className="md:col-span-2 text-xs text-blue-600">
                      Останалите данни (ЕГН, адрес, IBAN, телефон) се вземат от Настройки → Данни на издателя
                    </div>
                  </div>
                )}
                {newForm.landlord_type === 'дружество' && (
                  <div className="mt-3 p-3 bg-green-50 rounded-lg text-xs text-green-700">
                    Ще се използват данните на дружеството от <strong>Настройки → Данни на издателя</strong> (име, ЕИК, адрес, МОЛ, IBAN)
                  </div>
                )}
              </div>

              {/* Tenant */}
              <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
                <h3 className="font-bold text-gray-800 mb-3">Наемател</h3>

                {/* Указател на наематели — избор на съществуващ + запазване */}
                <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-semibold text-emerald-900 mb-1">📇 Избери от указателя</label>
                    <select defaultValue="" onChange={e => { applyParty(e.target.value); e.target.value = '' }}
                      className="w-full border border-emerald-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="">— нов наемател —</option>
                      {directory.map(p => <option key={p.id} value={p.id}>{p.name}{p.egn ? ` (${p.egn})` : ''}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={saveParty} disabled={savingParty || !newForm.tenant_name}
                    className="px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg whitespace-nowrap"
                    title="Запази въведения наемател за бъдеща употреба">
                    {savingParty ? 'Запазва…' : '💾 Запази в указателя'}
                  </button>
                </div>

                {/* Авто-попълване от лична карта */}
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <div className="text-sm font-semibold text-blue-900 mb-2">📷 Попълни автоматично от лична карта</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <label className="text-xs text-gray-600">Лице (задължително)
                      <input type="file" accept="image/*" onChange={e => setIdFront(e.target.files[0] || null)}
                        className="block w-full text-xs mt-1 file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-blue-100 file:text-blue-700" />
                    </label>
                    <label className="text-xs text-gray-600">Гръб (по желание)
                      <input type="file" accept="image/*" onChange={e => setIdBack(e.target.files[0] || null)}
                        className="block w-full text-xs mt-1 file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-blue-100 file:text-blue-700" />
                    </label>
                  </div>
                  <button type="button" onClick={extractId} disabled={extractingId || !idFront}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg">
                    {extractingId ? 'Извличане…' : '✨ Извлечи данните'}
                  </button>
                  {newForm.id_front_path && <span className="ml-2 text-xs text-green-700">✓ снимките са прикачени към досието</span>}
                  <p className="text-[11px] text-amber-700 mt-2">⚠️ Прегледай извлечените данни (особено ЕГН) преди да запазиш. Снимките на ЛК се пазят към досието на договора.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    ['tenant_name','Пълно иmе / Фирма *','Иван Иванов / Римаунт ЕООД'],
                    ['tenant_egn','ЕГН / ЕИК','8501011234'],
                    ['tenant_mol','МОЛ (за фирми)','Йото Райчев'],
                    ['tenant_address','Адрес','гр. София, ул. ...'],
                    ['tenant_phone','Телефон','+359...'],
                    ['tenant_email','Имейл','ivan@example.com'],
                    ['tenant_dob','Дата на раждане (физически лица)','01.01.1985'],
                  ].map(([k,l,ph]) => (
                    <div key={k}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                      <input type="text" value={newForm[k]} onChange={e=>setNewForm(f=>({...f,[k]:e.target.value}))}
                        placeholder={ph}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Вид документ</label>
                    <select value={newForm.tenant_doc} onChange={e=>setNewForm(f=>({...f,tenant_doc:e.target.value}))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="лична карта">Лична карта</option>
                      <option value="паспорт">Паспорт</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Номер на документа</label>
                    <input type="text" value={newForm.tenant_doc_date} onChange={e=>setNewForm(f=>({...f,tenant_doc_date:e.target.value}))}
                      placeholder="123456789"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Страна на издаване</label>
                    <input type="text" value={newForm.tenant_doc_country} onChange={e=>setNewForm(f=>({...f,tenant_doc_country:e.target.value}))}
                      placeholder="България"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>

              {/* Property details */}
              <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
                <h3 className="font-bold text-gray-800 mb-3">Данни за имота</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    ['property_address','Адрес','гр. София, ул. ...'],
                    ['property_description','Описание','Двустаен апартамент, ет. 3'],
                    ['property_area','Площ (кв.м.)','65'],
                  ].map(([k,l,ph]) => (
                    <div key={k}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                      <input type="text" value={newForm[k]} onChange={e=>setNewForm(f=>({...f,[k]:e.target.value}))}
                        placeholder={ph}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial & dates */}
              <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
                <h3 className="font-bold text-gray-800 mb-3">Финансови условия и срок</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    ['monthly_rent','Наем/месец (€)','667','number'],
                    ['deposit','Депозит (€)','1334','number'],
                    ['payment_day','Ден за плащане','5','number'],
                    ['start_date','Начална дата','','date'],
                    ['end_date','Крайна дата (или празно)','','date'],
                    ['delivery_date','Дата на предаване','','date'],
                  ].map(([k,l,ph,type]) => (
                    <div key={k}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                      <input type={type||'text'} value={newForm[k]} onChange={e=>setNewForm(f=>({...f,[k]:e.target.value}))}
                        placeholder={ph}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Допълнителни условия / Бележки</label>
                  <textarea value={newForm.conditions} onChange={e=>setNewForm(f=>({...f,conditions:e.target.value}))}
                    rows={2} placeholder="Допълнителни клаузи..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="text-xs font-semibold text-gray-700 mb-2">⚡💧🔥🏢 Абонатни номера <span className="text-gray-400 font-normal">(попълват се автоматично от имота)</span></div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['абонат_ток',  '⚡ Ток',          '3102846561113'],
                        ['абонат_вода', '💧 Вода',         '123456789'],
                        ['абонат_тец',  '🔥 ТЕЦ',          '987654321'],
                        ['абонат_вход', '🏢 Входна такса', '456789123'],
                      ].map(([k, l, ph]) => (
                        <div key={k}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>
                          <input type="text" value={newForm[k] || ''} onChange={e => setNewForm(f => ({ ...f, [k]: e.target.value }))}
                            placeholder={ph}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={createContract} disabled={creating}
                  className="px-6 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl shadow">
                  {creating ? 'Генерира PDF...' : '📋 Създай договор'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TEMPLATES TAB ────────────────────────────────────────── */}
      {tab === 'templates' && (
        <div>
          {/* Template list */}
          {templates.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {templates.map(t => (
                <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-gray-800">{t.name}</div>
                      {t.is_default && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">По подразбиране</span>}
                      {t.logo_path && <div className="text-xs text-green-600 mt-1">✅ Лого качено</div>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingTemplate(t); setTemplateForm({ name: t.name, content: t.content }); setLogoFile(null) }}
                        className="text-xs px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded hover:bg-blue-100">✏️ Редактирай</button>
                      <button onClick={() => deleteTemplate(t)}
                        className="text-xs px-2 py-1 bg-red-50 border border-red-200 text-red-600 rounded hover:bg-red-100">🗑️</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Template editor */}
          <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
            <h3 className="font-bold text-gray-800 mb-4">
              {editingTemplate ? `✏️ Редактиране: ${editingTemplate.name}` : '+ Нов шаблон'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Наименование</label>
                <input type="text" value={templateForm.name} onChange={e => setTemplateForm(f=>({...f,name:e.target.value}))}
                  placeholder="Стандартен договор за наем"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Лого (PNG/JPG)</label>
                <div className="flex gap-2">
                  <button onClick={() => logoInputRef.current?.click()}
                    className="flex-1 border border-dashed border-gray-300 rounded-lg px-2 py-2 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 text-center">
                    {logoFile ? logoFile.name : '📎 Качи лого'}
                  </button>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => setLogoFile(e.target.files[0])} />
                </div>
              </div>
            </div>

            {/* Placeholder reference */}
            <details className="mb-3">
              <summary className="text-xs text-blue-600 cursor-pointer hover:underline">📖 Налични плейсхолдъри</summary>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-1">
                {PLACEHOLDER_HELP.map(([ph, desc]) => (
                  <div key={ph} className="flex items-center gap-1 text-xs">
                    <code className="bg-gray-100 px-1 rounded text-blue-700 cursor-pointer hover:bg-blue-100"
                      onClick={() => setTemplateForm(f => ({ ...f, content: f.content + ph }))}>{ph}</code>
                    <span className="text-gray-500">{desc}</span>
                  </div>
                ))}
              </div>
            </details>

            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">
                Текст на договора (използвайте # за заглавие, ## за подзаглавие, **текст** за получер)
              </label>
              <div className="flex gap-2">
                <button onClick={() => setTemplateForm(f=>({...f, content: DEFAULT_TEMPLATE, name: f.name || 'Договор двуезичен (с чужденец)'}))}
                  className="text-xs px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded hover:bg-blue-100">
                  🌐 Договор двуезичен (BG+EN)
                </button>
                <button onClick={() => setTemplateForm(f=>({...f, content: GARAGE_TEMPLATE, name: f.name || 'Договор на английски'}))}
                  className="text-xs px-2 py-1 bg-green-50 border border-green-200 text-green-700 rounded hover:bg-green-100">
                  📋 Договор на английски (EN)
                </button>
                <button onClick={() => setTemplateForm(f=>({...f, content: INTERNET_TEMPLATE, name: f.name || 'Договор за интернет'}))}
                  className="text-xs px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded hover:bg-blue-100">
                  🌐 Договор за интернет
                </button>
              </div>
            </div>
            <textarea
              value={templateForm.content}
              onChange={e => setTemplateForm(f => ({...f, content: e.target.value}))}
              rows={24}
              className="w-full font-mono text-xs border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Поставете текста на договора тук с {{ПЛЕЙСХОЛДЪРИ}}"
            />
            <div className="flex justify-between mt-3">
              {editingTemplate && (
                <button onClick={() => { setEditingTemplate(null); setTemplateForm({ name: '', content: DEFAULT_TEMPLATE }) }}
                  className="px-4 py-2 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">
                  Отказ
                </button>
              )}
              <button onClick={saveTemplate} disabled={!templateForm.name || !templateForm.content}
                className="ml-auto px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg">
                💾 Запази шаблона
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Annex modal */}
      {annexModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-bold text-gray-900">📎 Анекс към договор</h3>
                <p className="text-xs text-gray-500 mt-0.5">Договор № {annexModal.contract_number} — {annexModal.tenant_name}</p>
              </div>
              <button onClick={() => setAnnexModal(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
              {/* New annex form */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
                <div className="text-sm font-semibold text-purple-800">Нов анекс</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Дата на анекса</label>
                    <input type="date" value={annexForm.annex_date}
                      onChange={e => setAnnexForm(f => ({ ...f, annex_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Нова крайна дата</label>
                    <input type="date" value={annexForm.new_end_date}
                      onChange={e => setAnnexForm(f => ({ ...f, new_end_date: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Нова наемна цена</label>
                    <input type="number" value={annexForm.new_monthly_rent} min="0" step="1"
                      onChange={e => setAnnexForm(f => ({ ...f, new_monthly_rent: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Валута</label>
                    <select value={annexForm.new_currency}
                      onChange={e => setAnnexForm(f => ({ ...f, new_currency: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500">
                      <option value="EUR">EUR €</option>
                      <option value="BGN">BGN лв.</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Допълнителни бележки (по избор)</label>
                  <textarea value={annexForm.notes} rows={2}
                    onChange={e => setAnnexForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="напр. наемателят поема разходите за..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                {annexForm.new_monthly_rent && Number(annexForm.new_monthly_rent) !== Number(annexModal.monthly_rent) && (
                  <div className={`text-xs font-medium px-3 py-2 rounded-lg ${Number(annexForm.new_monthly_rent) > Number(annexModal.monthly_rent) ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {Number(annexForm.new_monthly_rent) > Number(annexModal.monthly_rent) ? '▲' : '▼'} Промяна от {Number(annexModal.monthly_rent).toLocaleString('bg-BG')} → {Number(annexForm.new_monthly_rent).toLocaleString('bg-BG')} {annexForm.new_currency}
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={annexSendAfter} onChange={e => setAnnexSendAfter(e.target.checked)} />
                  ✉️ Изпрати на наемателя веднага след генериране{annexModal.tenant_email ? ` (${annexModal.tenant_email})` : ' (няма имейл — добави в договора)'}
                </label>
                <button onClick={createAnnex} disabled={creatingAnnex || !annexForm.annex_date || !annexForm.new_end_date || !annexForm.new_monthly_rent}
                  className="w-full py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg">
                  {creatingAnnex ? 'Генерира...' : '📎 Създай анекс и PDF'}
                </button>
              </div>

              {/* Existing annexes — пълен архив */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-gray-700">Съществуващи анекси {annexes.length > 0 && `(${annexes.length})`}</div>
                  <label className={`text-xs font-medium px-2 py-1 rounded-lg cursor-pointer ${annexUploadBusy ? 'bg-gray-100 text-gray-400' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>
                    {annexUploadBusy ? 'Качва…' : '📎 Качи стар анекс'}
                    <input type="file" multiple accept=".pdf,.docx,image/*" className="hidden" disabled={annexUploadBusy}
                      onChange={e => { uploadOldAnnex(e.target.files); e.target.value = '' }} />
                  </label>
                </div>
                {annexes.length === 0 ? (
                  <div className="text-xs text-gray-400">Няма анекси. Създай нов горе или качи стар (подписан) — PDF, Word или снимки.</div>
                ) : (
                  <div className="space-y-2">
                    {annexes.map(a => (
                      <div key={a.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <div>
                          <div className="text-xs font-bold text-purple-700">{a.annex_number}{(a.notes || '').includes('качен архивен') ? ' 📎' : ''}</div>
                          <div className="text-xs text-gray-500">{fmtDate(a.annex_date)} · до {fmtDate(a.new_end_date)} · {Number(a.new_monthly_rent).toLocaleString('bg-BG')} {a.new_currency}</div>
                        </div>
                        <div className="flex gap-2">
                          <button title="Отвори"
                            onClick={() => apiFetch(`${API}/api/contracts/${annexModal.id}/annexes/${a.id}/pdf`).then(r => r.blob()).then(b => window.open(URL.createObjectURL(b), '_blank'))}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded">📄</button>
                          <button title="Изпрати на наемателя" onClick={() => sendAnnex(a)}
                            className="px-2 py-1 text-xs bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded">✉️</button>
                          <button onClick={() => deleteAnnex(a)}
                            className="px-2 py-1 text-xs bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 rounded">🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 px-6 py-3 border-t border-gray-200 flex justify-end">
              <button onClick={() => setAnnexModal(null)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Затвори</button>
            </div>
          </div>
        </div>
      )}

      {/* Terminate modal */}
      {termModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-900 mb-3">Прекратяване на договор</h3>
            <p className="text-sm text-gray-600 mb-4">Договор № {termModal.contract_number} с {termModal.tenant_name}</p>
            <label className="block text-xs font-medium text-gray-700 mb-1">Дата на прекратяване</label>
            <input type="date" value={termDate} onChange={e => setTermDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setTermModal(null)} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg">Отказ</button>
              <button onClick={terminateContract} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg">Прекрати</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
