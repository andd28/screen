const qs = new URLSearchParams(location.search);
const sid = qs.get('sid');
if (!sid) alert('No session id');

const img = document.getElementById('frame');
let anim;

async function pull() {
  try {
    img.src = `/api/${sid}/frame.jpg?ts=${Date.now()}`; // no-store
  } catch {}
  anim = requestAnimationFrame(pull);
}
pull();

let isMouseDown = false;
let lastY = 0;

img.addEventListener('wheel', async (e) => {
  e.preventDefault();
  await fetch(`/api/${sid}/scroll`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ deltaY: e.deltaY })});
}, { passive:false });

img.addEventListener('click', async (e) => {
  const rect = img.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  await fetch(`/api/${sid}/click`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ x, y })});
});

document.getElementById('btnShot').onclick = async () => {
  const r = await fetch(`/api/${sid}/screenshot`, { method:'POST' }).then(r=>r.json());
  window.open(r.file, '_blank');
};
document.getElementById('btnRecStart').onclick = async (e) => {
  await fetch(`/api/${sid}/record/start`, { method:'POST' });
  e.target.disabled = true;
  document.getElementById('btnRecStop').disabled = false;
};
document.getElementById('btnRecStop').onclick = async (e) => {
  const r = await fetch(`/api/${sid}/record/stop`, { method:'POST' }).then(r=>r.json());
  e.target.disabled = true;
  document.getElementById('btnRecStart').disabled = false;
  window.open(r.file, '_blank');
};
document.getElementById('btnZip').onclick = async () => {
  const r = await fetch(`/api/${sid}/package`, { method:'POST' }).then(r=>r.json());
  window.open(r.file, '_blank');
};
