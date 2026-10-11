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

// Allowed values for the business profile. Labels are what the sales team sees in GoHighLevel.
const PROFILE_OPTIONS = {
  experienceLevel: { new: 'Brand new (no bids yet)', bidding: 'Bidding, no awards yet', emerging: '1 to 5 contracts won', established: '6+ contracts won' },
  samStatus: { active: 'Active', in_progress: 'In progress', not_started: 'Not started' },
  annualRevenue: { pre_revenue: 'Pre-revenue', under_250k: 'Under $250K', '250k_1m': '$250K to $1M', '1m_5m': '$1M to $5M', over_5m: 'Over $5M' },
  primaryGoal: { first_contract: 'Win first contract', middleman: 'Win and subcontract (Middleman)', win_rate: 'Raise win rate', scale: 'Scale to bigger contracts' },
  certifications: { '8a': '8(a)', wosb: 'WOSB', sdvosb: 'SDVOSB', vosb: 'VOSB', hubzone: 'HUBZone', sdb: 'SDB' },
};

// Trims, collapses control characters and caps length so free text is safe to store and forward.
function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
}

/**
 * Validates the signup business profile. Returns { profile } on success or { error } when a
 * required answer is missing or a value is not one of the allowed options.
 */
function parseProfile(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const pick = (key, required) => {
    const value = typeof raw[key] === 'string' ? raw[key] : '';
    if (!value) return required ? { missing: true } : { value: null };
    return Object.prototype.hasOwnProperty.call(PROFILE_OPTIONS[key], value) ? { value } : { invalid: true };
  };

  const profile = {
    fullName: cleanText(raw.fullName, 120),
    phone: cleanText(raw.phone, 30),
    businessName: cleanText(raw.businessName, 160),
    naics: cleanText(raw.naics, 200),
    capabilities: cleanText(raw.capabilities, 600),
  };
  if (!profile.fullName) return { error: 'Please enter your full name.' };
  if (!/^[0-9+().\-\s]+$/.test(profile.phone) || profile.phone.replace(/\D/g, '').length < 10) {
    return { error: 'Please enter a valid phone number so our team can reach you.' };
  }
  if (!profile.businessName) return { error: 'Please enter your business name.' };

  for (const [key, required] of [['experienceLevel', true], ['samStatus', true], ['primaryGoal', true], ['annualRevenue', false]]) {
    const result = pick(key, required);
    if (result.missing || result.invalid) return { error: 'Please answer every required question.' };
    profile[key] = result.value;
  }

  const certs = Array.isArray(raw.certifications) ? raw.certifications : [];
  if (certs.length > 6 || certs.some((c) => !Object.prototype.hasOwnProperty.call(PROFILE_OPTIONS.certifications, c))) {
    return { error: 'Please choose certifications from the list.' };
  }
  profile.certifications = [...new Set(certs)];
  return { profile };
}

module.exports = { normalizeEmail, isValidEmail, passwordProblem, parseProfile, PROFILE_OPTIONS };
