// Имейл на наемателя за справките и напомнянията.
//
// Бутонът „📧 Изпрати напомняне" праща адреса от ИМОТА (properties.email). При
// половината имоти той е празен, макар договорът да има имейл — тогава бутонът
// връщаше „Липсва email адрес" и не можеше да се изпрати нищо (07.10.2026:
// Хабип и Горкем имат имейл по договора, а по имота нямат).
//
// Тук адресът се допълва от активния договор, без да се пипа имотът.

function contractEmails(db) {
  const map = {};
  try {
    const rows = db.prepare(`
      SELECT property_id, tenant_email, kind, created_at
        FROM contracts
       WHERE status='active' AND property_id IS NOT NULL
         AND COALESCE(tenant_email,'') != ''
       ORDER BY (COALESCE(kind,'наем')='наем') DESC, created_at DESC
    `).all();
    // първият ред за имот печели: наемният договор преди интернет
    for (const r of rows) if (!map[r.property_id]) map[r.property_id] = r.tenant_email.trim();
  } catch { /* няма таблица — връщаме празно */ }
  return map;
}

// Допълва props[].email от договора, когато по имота липсва.
// Добавя и email_source ('имот' | 'договор'), за да се вижда откъде е.
function withTenantEmail(db, props) {
  const map = contractEmails(db);
  return (props || []).map(p => {
    const own = String(p.email || '').trim();
    if (own) return { ...p, email: own, email_source: 'имот' };
    const fromContract = map[p.id ?? p.property_id];
    return fromContract
      ? { ...p, email: fromContract, email_source: 'договор' }
      : { ...p, email: null, email_source: null };
  });
}

module.exports = { withTenantEmail, contractEmails };
