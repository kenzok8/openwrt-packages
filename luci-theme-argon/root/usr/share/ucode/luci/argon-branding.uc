'use strict';

import * as fs from 'fs';

// Read only package-managed names from the public branding directory.
// Invalid, missing or linked files fall back to the built-in theme assets.
export function get_branding() {
	const dir = '/www/luci-static/argon/branding/';
	let result = {};
	if (fs.lstat(rtrim(dir, '/'))?.type != 'directory')
		return result;
	const state = fs.lstat(dir + 'current.json');
	if (state?.type != 'file' || state.size > 1024)
		return result;
	let config;
	try { config = json(fs.readfile(dir + 'current.json')); }
	catch (e) { return result; }
	if (type(config) != 'object')
		return result;
	for (let kind in ['favicon', 'logo']) {
		let name = config?.[kind];
		if (type(name) != 'string' || !match(name, /^image-[0-9a-f]{64}\.png$/))
			continue;
		let info = fs.lstat(dir + name);
		if (info?.type != 'file' || info.size < 67 || info.size > 1048576)
			continue;
		result[kind] = name;
	}
	if (result.favicon) {
		let manifest = replace(result.favicon, /\.png$/, '.webmanifest');
		if (fs.lstat(dir + manifest)?.type == 'file')
			result.manifest = manifest;
	}
	return result;
};
