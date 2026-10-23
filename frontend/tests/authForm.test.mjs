import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PASSWORD_MIN_LENGTH, serverFieldErrors } from '../src/utils/authForm.js'

test('the form asks for the same password length the server enforces', () => {
  // backend/src/controllers/auth.controller.js: password: z.string().min(10)
  assert.equal(PASSWORD_MIN_LENGTH, 10)
})

test('a server validation answer becomes one plain message per field', () => {
  const details = { formErrors: [], fieldErrors: { password: ['Too small: expected string to have >=10 characters'] } }
  assert.deepEqual(serverFieldErrors(details), { password: 'Password must be at least 10 characters.' })
})

test('every field the sign-up form has is understood', () => {
  const details = { fieldErrors: { name: ['x'], email: ['Invalid email'], password: ['x'] } }
  assert.deepEqual(Object.keys(serverFieldErrors(details)).sort(), ['email', 'name', 'password'])
})

test('a field the form does not know keeps the server message', () => {
  assert.deepEqual(serverFieldErrors({ fieldErrors: { role: ['Invalid option'] } }), { role: 'Invalid option' })
})

test('anything that is not a validation answer gives no field errors', () => {
  assert.deepEqual(serverFieldErrors(null), {})
  assert.deepEqual(serverFieldErrors({ fieldErrors: {} }), {})
  assert.deepEqual(serverFieldErrors({ fieldErrors: { password: [] } }), {})
  assert.deepEqual(serverFieldErrors('nope'), {})
})
