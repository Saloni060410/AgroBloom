// Sign-up rules, kept in one place so the form and the server cannot drift apart again: the form said eight
// characters were enough while the server needed ten, so a nine-character password passed the form and then
// failed with a bare "Validation failed".
export const PASSWORD_MIN_LENGTH = 10

const FIELD_MESSAGES = {
  name: 'Full name is required.',
  email: 'Enter a valid email address.',
  password: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
}

/**
 * Turns the server's validation answer ({ fieldErrors: { password: ['...'] } }) into one plain message per
 * field of the form. A field the form does not know keeps the server's own first message.
 */
export function serverFieldErrors(details) {
  const fieldErrors = details && typeof details === 'object' ? details.fieldErrors : null
  if (!fieldErrors || typeof fieldErrors !== 'object') return {}
  const out = {}
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (!Array.isArray(messages) || messages.length === 0) continue
    out[field] = FIELD_MESSAGES[field] || String(messages[0])
  }
  return out
}
