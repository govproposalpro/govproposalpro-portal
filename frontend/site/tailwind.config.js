/** Landing page build: same design tokens as the rest of the site, scanning only the landing page. */
const base = require('../tailwind.config.js');

// The site self-hosts Inter (public/assets/fonts, OFL licence) so type renders the same on every device.
const fontFamily = { sans: ['"Inter Var"', ...base.theme.extend.fontFamily.sans] };

module.exports = {
  ...base,
  content: [__dirname + '/index.html', __dirname + '/site.js', __dirname + '/watch.html', __dirname + '/watch.js', __dirname + '/terms.html', __dirname + '/privacy.html', __dirname + '/earnings-disclaimer.html'],
  theme: { ...base.theme, extend: { ...base.theme.extend, fontFamily } },
};
