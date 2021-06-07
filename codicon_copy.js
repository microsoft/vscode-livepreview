const fs = require('fs');
const path = require('path');

let outputRoot = __dirname;
const outDir = path.join(outputRoot, 'media');

fs.copyFileSync(
	path.join(__dirname, 'node_modules/vscode-codicons/dist/codicon.css'),
	path.join(outDir, 'codicon.css')
);

fs.copyFileSync(
	path.join(__dirname, 'node_modules/vscode-codicons/dist/codicon.ttf'),
	path.join(outDir, 'codicon.ttf')
);
