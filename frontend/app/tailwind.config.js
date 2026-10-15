/** Dashboard build: same design tokens as the signup page, scanning the dashboard sources. */
const base = require('../tailwind.config.js');

module.exports = { ...base, content: [__dirname + '/index.html', __dirname + '/app.js', __dirname + '/../admin/index.html', __dirname + '/../admin/admin.js'] };
