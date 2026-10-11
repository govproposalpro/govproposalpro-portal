'use strict';

// Pragmatic email check; the real proof of ownership is the Whop purchase + welcome email.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email);
}

/**
 * Returns an error message, or null when the password is acceptable.
 * bcrypt silently ignores bytes past 72, so longer passwords are rejected rather than truncated.
 */
function passwordProblem(password, confirmPassword) {
  if (typeof password !== 'string' || typeof confirmPassword !== 'string') {
    return 'Password is required.';
  }
  if (password.length < 12) return 'Password must be at least 12 characters.';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password is too long (72 bytes max).';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password needs an uppercase letter, a lowercase letter and a number.';
  }
  if (password !== confirmPassword) return 'Passwords do not match.';
  return null;
}

module.exports = { normalizeEmail, isValidEmail, passwordProblem };
