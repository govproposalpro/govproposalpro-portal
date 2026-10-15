'use strict';

// The proposal-writing playbook the AI Proposal Engine reads before every draft (playbook.md,
// distilled from public winning proposals, agency guides and GAO decisions).
const fs = require('fs');
const path = require('path');

const PLAYBOOK = fs.readFileSync(path.join(__dirname, 'playbook.md'), 'utf8').trim();

module.exports = { PLAYBOOK };
