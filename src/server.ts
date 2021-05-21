var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url')

const port = 3000
var server: any;

export function start(basePath: string): void {

	server = http.createServer(function (req: any, res: any) {

		var parsedURL = url.parse(req.url, true)

		let host = parsedURL.host == null ? "" : parsedURL.host;
		let urlWithoutQueries = host + parsedURL.pathname;
		
		let fileurl = urlWithoutQueries;
	  
		if(urlWithoutQueries == '/'){
		  fileurl = 'index.html';
		} 

		var stream = fs.createReadStream(path.join(basePath, fileurl));

		stream.on('error', function () {
			res.writeHead(404);
			res.end();
		});

		stream.pipe(res);
	}).listen(port);
	console.log("started server")
}

export function end(): void {
	server.close()
	console.log("closed server")
}
