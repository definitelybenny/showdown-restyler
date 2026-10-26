// Two passes: the page-context bundle (src/page/boot.js) is built first and
// embedded as a string in the sandbox-side entry (src/index.js), which injects it
// into the page. The result is one .user.js with the userscript header on top.
import { build, context } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist/showdown-restyler.user.js');
const common = { bundle: true, format: 'iife', target: 'es2020', write: false, logLevel: 'info' };

function header() {
	const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
	return readFileSync(resolve(root, 'src/header.txt'), 'utf8').replace('{{version}}', version);
}

const pageOptions = { ...common, entryPoints: [resolve(root, 'src/page/boot.js')] };

function sandboxOptions(pageCode) {
	return {
		...common,
		entryPoints: [resolve(root, 'src/index.js')],
		define: { __PAGE_CODE__: JSON.stringify(pageCode) },
	};
}

function emit(sandboxResult) {
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, header() + '\n' + sandboxResult.outputFiles[0].text);
	console.log(`wrote ${out}`);
}

async function buildOnce() {
	const page = await build(pageOptions);
	emit(await build(sandboxOptions(page.outputFiles[0].text)));
}

async function watch() {
	const rebuild = {
		name: 'rebuild',
		setup(b) {
			b.onEnd(async result => {
				if (result.errors.length) return;
				try {
					emit(await build(sandboxOptions(result.outputFiles[0].text)));
				} catch (err) {
					console.error(err.message);
				}
			});
		},
	};
	const ctx = await context({ ...pageOptions, plugins: [rebuild] });
	await ctx.watch();
	console.log('watching src/ (page bundle); restart after editing src/index.js or src/header.txt');
}

if (process.argv.includes('--watch')) {
	await watch();
} else {
	await buildOnce();
}
