const { contactKeys, matchesContact, buildTimeline } = require('./contactHistory');

const party = { name: 'Стефан Петров', egn: '8505051234', phone: '+359 888 123 456', email: 'Stefan@Example.com ' };

describe('разпознаване на същия човек', () => {
  const k = contactKeys(party);

  it('по имейл, без значение от главни букви и интервали', () => {
    expect(matchesContact(k, { tenant_email: 'stefan@example.com' })).toBe(true);
  });

  it('по ЕГН', () => {
    expect(matchesContact(k, { tenant_egn: '8505051234' })).toBe(true);
  });

  it('по телефон — последните 9 цифри, различен формат', () => {
    expect(matchesContact(k, { phone: '0888 123 456' })).toBe(true);
  });

  it('напомнянето се сверява по адреса, на който е пратено', () => {
    expect(matchesContact(k, { sent_to: 'stefan@example.com' })).toBe(true);
    expect(matchesContact(k, { sent_to: 'drug@example.com' })).toBe(false);
  });

  it('само име стига, когато няма нищо по-сигурно', () => {
    expect(matchesContact(k, { tenant_name: 'Петров Стефан' })).toBe(true);
  });

  it('НО съименник с друг имейл не наследява историята', () => {
    expect(matchesContact(k, { tenant_name: 'Стефан Петров', tenant_email: 'other@example.com' })).toBe(false);
  });

  it('чужд запис не съвпада', () => {
    expect(matchesContact(k, { tenant_name: 'Иван Иванов', tenant_egn: '7001011111' })).toBe(false);
  });

  it('празен контакт не хваща всичко', () => {
    const empty = contactKeys({});
    expect(matchesContact(empty, { tenant_name: 'Който и да е' })).toBe(false);
    expect(matchesContact(empty, {})).toBe(false);
  });
});

describe('историята', () => {
  const src = {
    reminders: [{ created_at: '2026-11-10 09:00:00', month: '2026-11', sent_to: 'a@b.bg', subject: 'Напомняне', body: 'текст', sent_by: 'IVUS' }],
    contracts: [{ id: 7, contract_number: '2026-041', created_at: '2026-01-05 10:00:00', property_address: 'Фонтани 4А', status: 'active' }],
    invoices: [{ id: 3, invoice_number: '2026000003', month: '2026-10', sent_at: '2026-10-02 08:00:00', paid_at: '2026-10-04 12:00:00', total: 650, currency: 'EUR' }],
    tickets: [{ id: 2, title: 'Тече кранът', description: 'в банята', created_at: '2026-09-01 15:00:00', resolved_at: '2026-09-03 11:00:00', status: 'resolved' }],
    chats: [
      { role: 'user', content: 'Къде е спирателният кран?', created_at: '2026-08-10 12:00:00' },
      { role: 'assistant', content: 'В банята…', created_at: '2026-08-10 12:00:05' },
      { role: 'user', content: 'Благодаря', created_at: '2026-08-10 12:01:00' },
    ],
  };

  it('подредена е от най-новото надолу', () => {
    const t = buildTimeline(src).map(e => e.at);
    expect(t).toEqual([...t].sort().reverse());
  });

  it('напомнянето казва за кой месец и до кой адрес', () => {
    const e = buildTimeline(src).find(x => x.kind === 'reminder');
    expect(e.title).toBe('Напомняне за наем — ноември 2026');
    expect(e.detail).toBe('до a@b.bg');
    expect(e.by).toBe('IVUS');
  });

  it('фактурата дава две събития — изпратена и платена', () => {
    const k = buildTimeline(src).filter(x => x.kind.startsWith('invoice')).map(x => x.kind);
    expect(k).toContain('invoice_sent');
    expect(k).toContain('invoice_paid');
  });

  it('неплатена фактура не ражда събитие „платена"', () => {
    const t = buildTimeline({ invoices: [{ id: 9, invoice_number: '10', sent_at: '2026-10-02', paid_at: null }] });
    expect(t.filter(x => x.kind === 'invoice_paid')).toHaveLength(0);
  });

  it('разговорът е ЕДИН ред за деня, не по ред на реплика', () => {
    const chats = buildTimeline(src).filter(x => x.kind === 'chat');
    expect(chats).toHaveLength(1);
    expect(chats[0].title).toMatch(/3 съобщения/);
    expect(chats[0].detail).toMatch(/спирателният кран/);
  });

  it('разговорът е отбелязан като с ПОМОЩНИКА, не с Иво', () => {
    expect(buildTimeline(src).find(x => x.kind === 'chat').assistant).toBe(true);
  });

  it('едно съобщение е „съобщение", не „съобщения"', () => {
    const t = buildTimeline({ chats: [{ role: 'user', content: 'Здравей', created_at: '2026-08-11 10:00:00' }] });
    expect(t[0].title).toMatch(/1 съобщение$/);
  });

  it('заявката за поддръжка дава отваряне и затваряне', () => {
    const k = buildTimeline(src).filter(x => x.kind.startsWith('ticket')).map(x => x.kind);
    expect(k).toEqual(expect.arrayContaining(['ticket', 'ticket_done']));
  });

  it('прекратен договор дава второ събитие', () => {
    const t = buildTimeline({ contracts: [{ id: 1, contract_number: 'X', created_at: '2026-01-01', status: 'terminated', terminated_at: '2026-06-30' }] });
    expect(t.map(x => x.kind)).toEqual(['contract_end', 'contract']);
  });

  it('празно влиза, празно излиза — без гърмене', () => {
    expect(buildTimeline()).toEqual([]);
    expect(buildTimeline({ reminders: [{ month: '2026-11' }] })).toEqual([]);  // без дата няма събитие
  });
});
