import React, { useEffect } from 'react'
import { setCanonical } from '../lib/seo'
import { SkyLogo } from './LandingPage'

// Публична страница /blog — статия „Колко струва един пропуснат наем?".
// Стилът следва landing-а (ink + brass). Снимките са от демо организацията.

const INK = '#15151e', CREAM = '#ece7dc', BRASS = '#c9a24b', BRASS2 = '#e0bd6e'
const MUTED = 'rgba(236,231,220,.64)'

const JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Колко струва един пропуснат наем? Сметката на дигиталния наемодател',
  description: 'Реални цифри: какво печели наемодателят със софтуер за управление на наеми — спестено време, уловени просрочия, индексация и готова данъчна справка.',
  inLanguage: 'bg',
  image: 'https://app.skycapital.pro/blog/2-naematelil.png',
  datePublished: '2026-07-16',
  author: { '@type': 'Organization', name: 'Скай Кепитъл ООД', url: 'https://skycapital.pro' },
  publisher: { '@type': 'Organization', name: 'Скай Кепитъл ООД', url: 'https://skycapital.pro' },
  mainEntityOfPage: 'https://app.skycapital.pro/blog',
}

const Shot = ({ src, alt, caption }) => (
  <figure style={{ margin: '28px 0' }}>
    <img src={src} alt={alt} loading="lazy" style={{ width: '100%', borderRadius: 12, border: `1px solid rgba(224,189,110,.25)`, display: 'block' }} />
    <figcaption style={{ fontSize: 13, color: MUTED, marginTop: 8, textAlign: 'center' }}>{caption}</figcaption>
  </figure>
)

const H2 = ({ children }) => (
  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px, 3.2vw, 30px)', color: CREAM, margin: '42px 0 14px', lineHeight: 1.25 }}>{children}</h2>
)

const P = ({ children }) => (
  <p style={{ margin: '0 0 16px', lineHeight: 1.75 }}>{children}</p>
)

const B = ({ children }) => <strong style={{ color: BRASS2 }}>{children}</strong>

export default function Blog() {
  useEffect(() => {
    document.title = 'Колко струва един пропуснат наем? | Skyrent'
    setCanonical('/blog')
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: INK, color: CREAM, fontFamily: "'Manrope', sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }} />

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px clamp(20px, 5vw, 56px)', borderBottom: '1px solid rgba(236,231,220,.08)' }}>
        <a href="/" aria-label="Начало"><SkyLogo height={30} /></a>
        <a href="/" style={{ color: INK, background: `linear-gradient(135deg, ${BRASS}, ${BRASS2})`, padding: '10px 20px', borderRadius: 999, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          Пробвай безплатно
        </a>
      </header>

      <article style={{ maxWidth: 760, margin: '0 auto', padding: '48px clamp(20px, 5vw, 32px) 80px', fontSize: 17 }}>
        <div style={{ color: BRASS2, fontSize: 13, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 14 }}>Skyrent · Блог</div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(30px, 5vw, 44px)', lineHeight: 1.18, margin: '0 0 18px' }}>
          Колко струва един пропуснат наем? Сметката на дигиталния наемодател
        </h1>
        <div style={{ color: MUTED, fontSize: 14, marginBottom: 34 }}>16 юли 2026 · Скай Кепитъл</div>

        <P>Повечето наемодатели в България управляват имотите си с тетрадка, Excel и памет. Работи — докато имотите станат три, наемателите започнат да плащат в различни дни по различни сметки, а НАП поиска годишна декларация. Ето реалната сметка какво печели наемодателят, който мине на софтуер — с цифри.</P>

        <Shot src="/blog/1-tablo.png" alt="Таблото на Skyrent — месечен наем, брой имоти, нетен кешфлоу и годишна прогноза" caption="Таблото: целият портфейл в един поглед — наем, кешфлоу, годишна прогноза." />

        <H2>Пример: наемодател с 6 имота, среден наем 550 €</H2>

        <P><B>1. Времето за администрация: от 3 часа на 20 минути месечно.</B> Ръчното засичане „кой е платил" по банково извлечение при 6 наемателя отнема около половин час, плюс напомняния на закъснелите, плюс фактури, плюс папката с договори. Skyrent чете банковото извлечение и сам отбелязва кой месец на кой имот е платен — включително предплащания и частични суми. Оставащата работа: 20 минути преглед. <B>Спестени: ~33 часа годишно.</B></P>

        <P><B>2. Пропуснатите плащания: 550 € уловени навреме.</B> Истината от практиката: при повече имоти поне веднъж годишно някой наем „се изплъзва" — наемателят изостава, а наемодателят забелязва след месец-два. Месечната матрица „платено/неплатено" показва просрочието на 6-о число, не на 60-о. Един уловен навреме наем покрива софтуера за години напред.</P>

        <Shot src="/blog/2-naematelil.png" alt="Наематели — плащания: очакван наем, платили, неплатили и събираемост за месеца" caption="Матрицата на плащанията: кой е платил, кой не е — с бутон „Изпрати напомняния до всички«." />

        <P><B>3. Годишната индексация: +231 € годишно, които иначе се губят.</B> Малко наемодатели индексират наемите ежегодно — просто забравят. При официална инфлация от 3,5% и наем 550 €, неприложената индексация струва 19,25 € на месец — 231 € годишно на имот. Софтуерът пази клаузата в договора и напомня.</P>

        <P><B>4. Данъчната декларация: от 200 лв при счетоводител до готова справка.</B> Доходите от наем се декларират по чл. 50 до 30 април, с тримесечни авансови вноски по чл. 55. Счетоводителска услуга за това: 150–300 лв годишно. Skyrent смята справката автоматично от реалните постъпления.</P>

        <Shot src="/blog/4-fakturi.png" alt="Фактури в Skyrent с експорт към счетоводен софтуер" caption="Фактурите се издават и изпращат към счетоводството с едно натискане." />

        <P><B>5. Договорите: от „търся docx-а от 2022" до 2 минути.</B> Нов наемател = договор + приемо-предавателен протокол, генерирани от шаблон — включително двуезичен вариант (БГ/EN) за чуждестранни наематели. Анексите се номерират и изпращат по имейл сами. Старите договори се качват като снимки — системата сама разчита имена, суми и срокове.</P>

        <H2>Общата сметка за годината</H2>

        <div style={{ overflowX: 'auto', margin: '18px 0 26px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15.5 }}>
            <tbody>
              {[
                ['Спестено време (33 ч × 25 €/ч)', '~825 €'],
                ['Един уловен навреме наем', '550 €'],
                ['Индексация на 6 имота', '~1 386 €'],
                ['Данъчна справка', '~100 €'],
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom: '1px solid rgba(236,231,220,.1)' }}>
                  <td style={{ padding: '10px 8px' }}>{k}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: BRASS2, fontWeight: 700 }}>{v}</td>
                </tr>
              ))}
              <tr style={{ borderBottom: `1px solid ${BRASS}` }}>
                <td style={{ padding: '12px 8px', fontWeight: 800 }}>Общо ползи</td>
                <td style={{ padding: '12px 8px', textAlign: 'right', color: BRASS2, fontWeight: 800 }}>~2 860 €</td>
              </tr>
              <tr>
                <td style={{ padding: '12px 8px' }}>Цена на Skyrent Pro</td>
                <td style={{ padding: '12px 8px', textAlign: 'right' }}>288 €/год</td>
              </tr>
            </tbody>
          </table>
        </div>

        <P><B>Съотношение ползи/разход: близо 10:1.</B> А до 5 имота Skyrent е изцяло безплатен — без карта, без срок.</P>

        <H2>Какво печели всеки</H2>

        <P><B>Наемодателят с 1–3 имота</B> — ред и спокойствие безплатно: договор за 2 минути, автоматична данъчна справка, напомняния.</P>
        <P><B>Наемодателят с 10+ имота</B> — контрол: банков импорт, матрица на плащанията, P&L по имот, депозити, разходи, фактури към счетоводството.</P>

        <Shot src="/blog/3-imoti.png" alt="Портфолио от имоти в Skyrent — адреси, наематели, наеми, статуси" caption="Портфолиото: имоти, наематели и наеми — винаги актуални." />

        <P><B>Агенцията</B> — мащаб: много собственици в една система, отчети към всеки, собствен бранд върху документите.</P>
        <P><B>И наемателят печели</B> — собствен портал: вижда си фактурите, плаща с карта или автоматично със SEPA, подава заявка за ремонт, а асистентът отговаря на въпросите му на 4 езика по всяко време.</P>

        <H2>Кои сме ние</H2>
        <P>Skyrent е създаден от Скай Кепитъл ООД — наемодатели, които управляват собствен портфейл от имоти в София и Пазарджик. Софтуерът не е писан в офис по презумпции — всяка функция идва от реален проблем, който сами сме имали.</P>
        <P>Още от блога: <a href="/blog/sravnenie-softuer-naemi" style={{ color: BRASS2 }}>Rentila, ИМОТко или Skyrent — кой софтуер за наеми да избера?</a></P>

        {/* CTA */}
        <div style={{ marginTop: 44, padding: '28px 26px', borderRadius: 16, border: `1px solid rgba(224,189,110,.35)`, background: 'rgba(224,189,110,.06)', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, marginBottom: 10 }}>Пробвайте със собствените си имоти</div>
          <div style={{ color: MUTED, marginBottom: 18 }}>Безплатно до 5 имота — завинаги, без карта.</div>
          <a href="/" style={{ display: 'inline-block', color: INK, background: `linear-gradient(135deg, ${BRASS}, ${BRASS2})`, padding: '13px 30px', borderRadius: 999, fontWeight: 800, textDecoration: 'none' }}>
            Създай акаунт → app.skycapital.pro
          </a>
        </div>
      </article>

      <footer style={{ borderTop: '1px solid rgba(236,231,220,.08)', padding: '22px clamp(20px, 5vw, 56px)', display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', color: MUTED, fontSize: 13 }}>
        <div>© {new Date().getFullYear()} Скай Кепитъл ООД</div>
        <div style={{ display: 'flex', gap: 18 }}>
          <a href="/remonti" style={{ color: 'inherit', textDecoration: 'none' }}>Ремонти до ключ</a>
          <a href="/usloviya" style={{ color: 'inherit', textDecoration: 'none' }}>Общи условия</a>
          <a href="/poveritelnost" style={{ color: 'inherit', textDecoration: 'none' }}>Поверителност</a>
        </div>
      </footer>
    </div>
  )
}
