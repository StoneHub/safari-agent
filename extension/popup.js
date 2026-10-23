const status = document.getElementById('status');
async function send(kind) {
  try {
    const result = await browser.runtime.sendMessage({kind,token:document.getElementById('token').value,port:Number(document.getElementById('port').value)});
    status.textContent = `${result.status}; ${result.granted} tabs allowed`;
    if (kind === 'pair') document.getElementById('token').value = '';
  } catch (error) { status.textContent = error.message; }
}
for (const kind of ['pair','grant','stop']) document.getElementById(kind).addEventListener('click',() => send(kind));
send('status');
