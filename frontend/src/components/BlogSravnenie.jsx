import React, { useEffect } from 'react'
import { setCanonical } from '../lib/seo'
import { SkyLogo } from './LandingPage'
import PublicNav from './PublicNav'

// Публична статия /blog/sravnenie-softuer-naemi — обективно сравнение
// Rentila / ИМОТко / Skyrent. Фактите са от публичните ценови страници
// на конкурентите към юли 2026. Стил: ink + brass като останалите публични.

const INK = '#15151e', CREAM = '#ece7dc', BRASS = '#c9a24b', BRASS2 = '#e0bd6e'
const MUTED = 'rgba(236,231,220,.64)'

const JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Rentila, ИМОТко или Skyrent — кой софтуер за управление на наеми да избера (2026)',
  description: 'Обективно сравнение на софтуерите за управление на имоти под наем в България: цени, банков импорт, данъчна справка чл. 50, портал за наематели, договори.',
  inLanguage: 'bg',
  datePublished: '2026-07-16',
  author: { '@type': 'Organization', name: 'Скай Кепитъл ООД', url: 'https://skycapital.pro' },
  publisher: { '@type': 'Organization', name: 'Скай Кепитъл ООД', url: 'https://skycapital.pro' },
  mainEntityOfPage: 'https://app.skycapital.pro/blog/sravnenie-softuer-naemi',
}

const H2 = ({ children }) => (
  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(21px, 3vw, 28px)', color: CREAM, margin: '38px 0 12px', lineHeight: 1.25 }}>{children}</h2>
)
const P = ({ children }) => <p style={{ margin: '0 0 15px', lineHeight: 1.75 }}>{children}</p>
const B = ({ children }) => <strong style={{ color: BRASS2 }}>{children}</strong>

const ROWS = [
  ['Безплатен план', '1 имот, 2 наематели', '1 имот', '5 имота, без ограничение на наемателите'],
  ['Цена за 6 имота', '€9.90/мес (Gold)', '€14.99/мес (Експерт, до 10)', '€24/мес (Pro, неограничени)'],
  ['Български банков импорт (xlsx/PDF извлечения)', 'частично (Open Banking връзка)', '—', '✓ вкл. разпознаване на наемател и месец'],
  ['Данъчна справка чл. 50 + авансови чл. 55', '—', '—', '✓ автоматично'],
  ['Портал за наематели', '—', '—', '✓ с AI асистент на 4 езика'],
  ['Онлайн плащания (карта / SEPA автодебит)', '—', '—', '✓ директно към сметката на наемодателя'],
  ['Договори на български + двуезични (BG/EN)', 'шаблони (превод от френски)', '—', '✓ вкл. AI архив на стари договори'],
  ['Фактури със „словом" + експорт към счетоводство', '—', '—', '✓'],
  ['Индексация на наема', 'по френските индекси IRL/ILC', '—', 'по НСИ (българска инфлация)'],
  ['Създаден за българския пазар', 'не (Франция)', 'да', 'да'],
]

export default function BlogSravnenie() {
  useEffect(() => {
    document.title = 'Rentila, ИМОТко или Skyrent — сравнение на софтуер за наеми (2026)'
    setCanonical('/blog/sravnenie-softuer-naemi')
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: INK, color: CREAM, fontFamily: "'Manrope', sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }} />

      <PublicNav active="/blog" />

      <article style={{ maxWidth: 860, margin: '0 auto', padding: '48px clamp(20px, 5vw, 32px) 80px', fontSize: 17 }}>
        <div style={{ color: BRASS2, fontSize: 13, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 14 }}>Skyrent · Блог</div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 4.6vw, 40px)', lineHeight: 1.2, margin: '0 0 18px' }}>
          Rentila, ИМОТко или Skyrent — кой софтуер за управление на наеми да избера?
        </h1>
        <div style={{ color: MUTED, fontSize: 14, marginBottom: 34 }}>16 юли 2026 · данните са от публичните ценови страници на платформите към юли 2026</div>

        <P>Изборът на софтуер за управление на имоти под наем в България се свежда до три реални опции: <B>Rentila</B> (френска платформа с българска версия), <B>ИМОТко</B> (българска) и <B>Skyrent</B> (нашата — да, сравнението е от заинтересована страна, затова сме сложили и цените, и слабостите си, проверимо).</P>

        <H2>Сравнителна таблица</H2>
        <div style={{ overflowX: 'auto', margin: '18px 0 8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14.5, minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BRASS}` }}>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}></th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>Rentila</th>
                <th style={{ textAlign: 'left', padding: '10px 8px' }}>ИМОТко</th>
                <th style={{ textAlign: 'left', padding: '10px 8px', color: BRASS2 }}>Skyrent</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([k, a, b, c]) => (
                <tr key={k} style={{ borderBottom: '1px solid rgba(236,231,220,.1)' }}>
                  <td style={{ padding: '10px 8px', color: CREAM, fontWeight: 600 }}>{k}</td>
                  <td style={{ padding: '10px 8px', color: MUTED }}>{a}</td>
                  <td style={{ padding: '10px 8px', color: MUTED }}>{b}</td>
                  <td style={{ padding: '10px 8px', color: CREAM }}>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 26 }}>„—" = функцията не е описана в публичните материали на платформата към юли 2026. Ако забележите неточност — пишете ни и ще коригираме.</div>

        <H2>Кога Rentila е по-добрият избор</H2>
        <P>Ако имате повече от 5 имота и търсите <B>най-ниската цена</B> — Gold планът на Rentila (€9.90/мес, неограничени имоти) е най-евтиният на пазара. Платформата е зряла, с електронен подпис и API. Компромисът: интерфейсът и документите са превод от френски, индексацията е по френските индекси IRL/ILC вместо по НСИ, а българската данъчна декларация си я смятате сами.</P>

        <H2>Кога ИМОТко е по-добрият избор</H2>
        <P>Ако искате максимално прост български инструмент за портфолио и уведомления — ИМОТко е фокусиран точно там, с безплатен старт за 1 имот. Компромисът: платените планове са по-скъпи (€14.99 за до 10 имота), а автоматизациите (банков импорт, плащания, данъци, портал) не са описани в публичните материали.</P>

        <H2>Кога Skyrent е по-добрият избор</H2>
        <P>Ако искате системата <B>сама да върши работата</B>: качвате банковото извлечение и плащанията се отбелязват сами; данъчната справка по чл. 50 излиза готова; наемателят си плаща с карта или SEPA автодебит директно към вашата сметка и си гледа фактурите в собствен портал с AI асистент. Безплатният план е най-щедрият (5 имота). Компромисът: при 6+ имота Pro планът (€24/мес) е по-скъп от Rentila Gold — разликата се изплаща само ако автоматизациите ви спестяват реално време и пропуснати наеми (<a href="/blog" style={{ color: BRASS2 }}>сметката с реални цифри е тук</a>).</P>

        <H2>Итог в едно изречение</H2>
        <P><B>Най-евтино за много имоти:</B> Rentila. <B>Най-просто българско:</B> ИМОТко. <B>Най-автоматизирано и с най-щедър безплатен план:</B> Skyrent.</P>

        <div style={{ marginTop: 40, padding: '28px 26px', borderRadius: 16, border: `1px solid rgba(224,189,110,.35)`, background: 'rgba(224,189,110,.06)', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, marginBottom: 10 }}>Сравнете със собствените си имоти</div>
          <div style={{ color: MUTED, marginBottom: 18 }}>Skyrent е безплатен до 5 имота — завинаги, без карта. Пробата не струва нищо.</div>
          <a href="/" style={{ display: 'inline-block', color: INK, background: `linear-gradient(135deg, ${BRASS}, ${BRASS2})`, padding: '13px 30px', borderRadius: 999, fontWeight: 800, textDecoration: 'none' }}>
            Създай безплатен акаунт
          </a>
        </div>
      </article>

      <footer style={{ borderTop: '1px solid rgba(236,231,220,.08)', padding: '22px clamp(20px, 5vw, 56px)', display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', color: MUTED, fontSize: 13 }}>
        <div>© {new Date().getFullYear()} Скай Кепитъл ООД</div>
        <div style={{ display: 'flex', gap: 18 }}>
          <a href="/blog" style={{ color: 'inherit', textDecoration: 'none' }}>Блог</a>
          <a href="/programa-za-upravlenie-na-imoti" style={{ color: 'inherit', textDecoration: 'none' }}>Програма за управление на имоти</a>
          <a href="/usloviya" style={{ color: 'inherit', textDecoration: 'none' }}>Общи условия</a>
        </div>
      </footer>
    </div>
  )
}
