import './styles.css';
import { DrivingGame } from './game/DrivingGame';

const host = document.querySelector<HTMLElement>('#app');

if (!host) {
  throw new Error('Application host #app is missing.');
}

if (new URLSearchParams(location.search).get('editor') === 'city') {
  void import('./editor/CityMapEditor').then(({ CityMapEditor }) => {
    const editor = new CityMapEditor(host);
    window.addEventListener('pagehide', () => editor.dispose(), { once: true });
  }).catch(error => { console.error(error); host.textContent = `City Editor 无法启动：${String(error)}`; });
} else try {
  const game = new DrivingGame(host);
  game.start();
  window.addEventListener('beforeunload', () => game.dispose(), { once: true });
} catch (error) {
  console.error(error);
  host.innerHTML = `
    <main style="display:grid;place-items:center;height:100%;padding:32px;background:#090d0f;color:#eef2ed;font:14px/1.6 Segoe UI,sans-serif">
      <section style="max-width:560px;padding:26px;border:1px solid #ffffff24;border-radius:12px;background:#111719">
        <h1 style="margin:0 0 10px;font-size:22px">无法启动 3D 驾驶场景</h1>
        <p style="margin:0;color:#eef2ed99">请确认浏览器已启用 WebGL 2 与硬件加速，然后刷新页面。详细错误已写入开发者控制台。</p>
      </section>
    </main>`;
}
