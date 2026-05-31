// Малък помощник за in-app известия. Insert + helpers за брой непрочетени.
//
// recipient_type:
//   'admin'        — всички admin акаунти ще го видят (recipient_user_id IS NULL)
//   'tenant_user'  — конкретен потребител (recipient_user_id = N)

function notify(db, { recipient_type, recipient_user_id = null, kind, title, body, link, ref_type, ref_id }) {
  try {
    db.prepare(`
      INSERT INTO notifications (recipient_type, recipient_user_id, kind, title, body, link, ref_type, ref_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(recipient_type, recipient_user_id, kind, title, body || null, link || null, ref_type || null, ref_id || null);
  } catch (err) {
    console.error('notify() failed:', err.message);
  }
}

function notifyAdmin(db, payload) { notify(db, { ...payload, recipient_type: 'admin', recipient_user_id: null }); }
function notifyTenant(db, userId, payload) { notify(db, { ...payload, recipient_type: 'tenant_user', recipient_user_id: userId }); }

module.exports = { notify, notifyAdmin, notifyTenant };
