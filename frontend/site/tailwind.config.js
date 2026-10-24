/** Landing page build: same design tokens as the rest of the site, scanning only the landing page. */
const base = require('../tailwind.config.js');

module.exports = { ...base, content: [__dirname + '/index.html', __dirname + '/site.js', __dirname + '/terms.html', __dirname + '/privacy.html'] };
