const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../../media');

fs.copyFileSync(
	path.join(__dirname, '../../node_modules/vscode-codicons/dist/codicon.css'),
	path.join(outDir, 'codicon.css')
);

fs.copyFileSync(
	path.join(__dirname, '../../node_modules/vscode-codicons/dist/codicon.ttf'),
	path.join(outDir, 'codicon.ttf')
);
