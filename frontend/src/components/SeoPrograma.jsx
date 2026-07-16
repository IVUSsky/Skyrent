import React, { useEffect } from 'react'
import { setCanonical } from '../lib/seo'
import { SkyLogo } from './LandingPage'

// SEO страница /programa-za-upravlenie-na-imoti — таргетира търсенията
// „програма за управление на имоти", „софтуер за наеми", „приложение за
// наемодатели". Текстова, без тежки ресурси; стилът следва landing-а.

const INK = '#15151e', CREAM = '#ece7dc', BRASS = '#c9a24b', BRASS2 = '#e0bd6e'
const MUTED = 'rgba(236,231,220,.64)'

const FAQ = [
  ['Колко струва програмата за управление на имоти?', 'Skyrent е безплатен завинаги за до 5 имота (план Basic, без карта). Pro планът е 24 €/месец с неограничени имоти, банков импорт, онлайн плащания и портал за наематели. Agency планът за агенции е 49 €/месец.'],
  ['Как програмата разбира кой наемател е платил?', 'Качвате банковото си извлечение (xlsx или PDF) — системата разпознава преводите, свързва ги с наемателите и имотите и отбелязва платените месеци автоматично. Правилата се самообучават.'],
  ['Мога ли да управлявам апартаменти, гаражи и складове едновременно?', 'Да — всеки имот има собствен профил с наемател, наем, договор, абонатни номера и история на плащанията, независимо от типа му.'],
  ['Прави ли програмата договори за наем?', 'Да — генерира договор и приемо-предавателен протокол от шаблон за 2 минути, включително двуезичен (български/английски) за чуждестранни наематели. Анексите се номерират и изпращат по имейл автоматично.'],
  ['Помага ли за данъчната декларация за доходи от наем?', 'Да — справката по чл. 50 и тримесечните авансови вноски по чл. 55 се изчисляват автоматично от реалните постъпления.'],
]

const JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
}

const H2 = ({ children }) => (
  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(21px, 3vw, 28px)', color: CREAM, margin: '38px 0 12px', lineHeight: 1.25 }}>{children}</h2>
)
const P = ({ children }) => <p style={{ margin: '0 0 15px', lineHeight: 1.75 }}>{children}</p>
const B = ({ children }) => <strong style={{ color: BRASS2 }}>{children}</strong>

export default function SeoPrograma() {
  useEffect(() => {
    document.title = 'Програма за управление на имоти и апартаменти под наем | Skyrent'
    setCanonical('/programa-za-upravlenie-na-imoti')
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: INK, color: CREAM, fontFamily: "'Manrope', sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }} />

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px clamp(20px, 5vw, 56px)', borderBottom: '1px solid rgba(236,231,220,.08)' }}>
        <a href="/" aria-label="Начало"><SkyLogo height={30} /></a>
        <a href="/" style={{ color: INK, background: `linear-gradient(135deg, ${BRASS}, ${BRASS2})`, padding: '10px 20px', borderRadius: 999, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          Пробвай безплатно
        </a>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px clamp(20px, 5vw, 32px) 80px', fontSize: 17 }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 4.6vw, 40px)', lineHeight: 1.2, margin: '0 0 18px' }}>
          Програма за управление на имоти и апартаменти под наем
        </h1>

        <P>Skyrent е български софтуер за наемодатели и агенции: проследява наемите, пази договорите, издава фактурите и смята данъците — за апартаменти, къщи, гаражи, мазета и складове. <B>Безплатно до 5 имота, завинаги.</B></P>

        <H2>Какво прави програмата за управление на наеми</H2>
        <P><B>Следи плащанията автоматично.</B> Качвате банковото извлечение — системата разпознава кой наемател е платил кой месец и показва просрочията веднага, с бутон „Изпрати напомняне".</P>
        <P><B>Пази и създава договорите.</B> Договор за наем + приемо-предавателен протокол от шаблон за 2 минути, двуезичен вариант за чужденци, автоматични анекси, архив на старите договори със снимки, от които данните се разчитат сами.</P>
        <P><B>Издава фактури и смята данъци.</B> Фактури с правилна номерация и сума „словом", експорт към счетоводен софтуер, готова справка по чл. 50 и авансови вноски по чл. 55.</P>
        <P><B>Приема онлайн плащания.</B> Наемателят плаща с карта, Apple Pay / Google Pay или автоматичен SEPA дебит — парите пристигат директно във вашата сметка.</P>
        <P><B>Дава портал на наемателя.</B> Фактури, плащания, заявки за ремонт и асистент, който отговаря на 4 езика — без да ви търсят по телефона.</P>

        <H2>За кого е</H2>
        <P>За <B>собственика с 1–3 апартамента</B>, който иска ред без усилие (безплатно). За <B>наемодателя с 10+ имота</B>, който губи часове в Excel и банкови извлечения. За <B>агенцията</B>, която управлява имоти на много собственици и иска отчети и собствен бранд.</P>

        <H2>Ръчно срещу софтуер</H2>
        <P>Наемодател с 6 имота губи средно 3 часа месечно в администрация и поне един „изплъзнал се" наем годишно. Със Skyrent същата работа отнема 20 минути, а просрочията се виждат на 6-о число. Пълната сметка с реални цифри: <a href="/blog" style={{ color: BRASS2 }}>Колко струва един пропуснат наем?</a></P>

        <H2>Чести въпроси</H2>
        {FAQ.map(([q, a]) => (
          <div key={q} style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 800, color: CREAM, marginBottom: 6 }}>{q}</div>
            <div style={{ color: MUTED, lineHeight: 1.7 }}>{a}</div>
          </div>
        ))}

        <div style={{ marginTop: 40, padding: '28px 26px', borderRadius: 16, border: `1px solid rgba(224,189,110,.35)`, background: 'rgba(224,189,110,.06)', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, marginBottom: 10 }}>Започнете с вашите имоти днес</div>
          <div style={{ color: MUTED, marginBottom: 18 }}>Регистрация за 2 минути. Безплатно до 5 имота — без карта, без срок.</div>
          <a href="/" style={{ display: 'inline-block', color: INK, background: `linear-gradient(135deg, ${BRASS}, ${BRASS2})`, padding: '13px 30px', borderRadius: 999, fontWeight: 800, textDecoration: 'none' }}>
            Създай безплатен акаунт
          </a>
        </div>
      </main>

      <footer style={{ borderTop: '1px solid rgba(236,231,220,.08)', padding: '22px clamp(20px, 5vw, 56px)', display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', color: MUTED, fontSize: 13 }}>
        <div>© {new Date().getFullYear()} Скай Кепитъл ООД</div>
        <div style={{ display: 'flex', gap: 18 }}>
          <a href="/blog" style={{ color: 'inherit', textDecoration: 'none' }}>Блог</a>
          <a href="/dogovor-naem" style={{ color: 'inherit', textDecoration: 'none' }}>Договор за наем</a>
          <a href="/kalkulator-naem" style={{ color: 'inherit', textDecoration: 'none' }}>Калкулатор данък наем</a>
        </div>
      </footer>
    </div>
  )
}
