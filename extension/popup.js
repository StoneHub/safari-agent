const status = document.getElementById('status');
const stop = document.getElementById('stop');
const resume = document.getElementById('resume');
async function send(kind) {
  try {
    const result = await browser.runtime.sendMessage({kind});
    status.textContent = `${result.status}; ${result.available} open tabs available`;
    stop.hidden = result.stopped;
    resume.hidden = !result.stopped;
    document.getElementById('mode').textContent = result.stopped
      ? 'STOPPED. Agents cannot access Safari tabs. This survives Safari and extension restarts.'
      : 'ON. Agents can read and act in open normal web tabs where Safari permits website access. Private windows are excluded.';
  } catch {
    status.textContent = 'Connection unavailable. Check the Safari Agent app and Safari website access settings.';
  }
}
stop.addEventListener('click',() => send('stop'));
resume.addEventListener('click',() => send('resume'));
send('status');
setInterval(() => send('status'),1000);
