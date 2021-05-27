const url = 'ws://localhost:${WS_PORTNUM}'
const connection = new WebSocket(url)

connection.onerror = (error) => {
	console.log("WebSocket error: " + error)
}

connection.onmessage = (e) => {
	if (e.data = 'refresh') {
		window.location.reload()
	}
}
window.parent.postMessage({command:"update-path","text":window.location.pathname}, "*");

window.addEventListener('message', function () {
	if (this.event.data == 'refresh') {
		window.location.reload()
	}
}
, false);

var l = document.getElementsByTagName('a')
for (var i=0; i<l.length; i++)
{
	l[i].onclick = (e) => {
		const linkTarget = e.target.href
		if (!linkTarget.startsWith("http://localhost:")){
			e.preventDefault()
			window.parent.postMessage({command:"open-external-link","text":linkTarget}, "*");
		}
	}
}


window.addEventListener('message', event => {
	if (event.data.command != 'update-path'){
		window.parent.postMessage(event.data, "*");
	}
});
