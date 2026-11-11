/*
 * Preview language: ?lang=<code> (default: the page's <html lang>), then the
 * bundled catalogue the theme header would load for it (zh-Hant → zh-tw,
 * pt-BR → pt-br, de-AT → de). Loaded synchronously before carbon.js; the
 * catalogue directory comes from data-i18n so build-demo.py can rewrite it.
 * CATALOGUES lists htdocs/luci-static/carbon/i18n/*.js; the browser tests
 * fail if a catalogue is missing here.
 */
(function () {
	var CATALOGUES = ['de', 'es', 'fr', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'vi', 'zh-cn', 'zh-tw'];
	var ALIAS = { 'zh-hans': 'zh-cn', 'zh-sg': 'zh-cn', 'zh-hant': 'zh-tw', 'zh-hk': 'zh-tw', 'zh-mo': 'zh-tw' };
	var root = document.documentElement;
	var m = /[?&]lang=([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)(?:&|$)/.exec(location.search);
	if (m) root.lang = m[1];
	var lang = root.lang.toLowerCase(), base = lang.split('-')[0];
	var code = [ALIAS[lang] || lang, base].filter(function (c) { return CATALOGUES.indexOf(c) >= 0; })[0];
	if (code) document.write('<script src="' + document.currentScript.getAttribute('data-i18n') + code + '.js"><\/script>');
})();
