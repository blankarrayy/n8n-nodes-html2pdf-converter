const fs = require('fs');
const path = require('path');

function copyRecursive(srcDir, destDir) {
	if (!fs.existsSync(srcDir)) return;
	if (!fs.existsSync(destDir)) {
		fs.mkdirSync(destDir, { recursive: true });
	}

	const entries = fs.readdirSync(srcDir, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = path.join(srcDir, entry.name);
		const destPath = path.join(destDir, entry.name);

		if (entry.isDirectory()) {
			copyRecursive(srcPath, destPath);
		} else if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.js.map') && entry.name !== '.DS_Store') {
			fs.copyFileSync(srcPath, destPath);
			console.log(`Copied asset: ${srcPath} -> ${destPath}`);
		}
	}
}

copyRecursive(path.join(__dirname, '..', 'nodes'), path.join(__dirname, '..', 'dist', 'nodes'));
console.log('Asset copying complete.');
