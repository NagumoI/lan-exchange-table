/* ─── 交換テーブル フロントエンドロジック ─── */

// ─── DOM refs ─────────────────────────────────────────────────────────────
const fileInput    = document.getElementById('file-input');
const fileDrop     = document.getElementById('file-drop');
const fileNameEl   = document.getElementById('file-name');
const fileSizeEl   = document.getElementById('file-size');
const clearBtn     = document.getElementById('clear-btn');
const titleInput   = document.getElementById('title-input');
const bodyInput    = document.getElementById('body-input');
const labelSelect  = document.getElementById('label-select');
const submitBtn    = document.getElementById('submit-btn');
const formError    = document.getElementById('form-error');
const searchInput  = document.getElementById('search-input');
const exchangeList = document.getElementById('exchange-list');
const segAll       = document.getElementById('seg-all');
const segImp       = document.getElementById('seg-imp');
const logoutBtn    = document.getElementById('logout-btn');
const toast        = document.getElementById('toast');
const hostDisplay  = document.getElementById('host-display');

// ─── 状態 ─────────────────────────────────────────────────────────────────
let allItems       = [];
let filterImportant = false;

// ─── トースト通知 ──────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = 'toast show' + (isError ? ' error' : '');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── ホスト表示 ───────────────────────────────────────────────────────────
hostDisplay.textContent = location.host;

// ─── ファイルドロップ ─────────────────────────────────────────────────────
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = `${Math.ceil(file.size / 1024)} KB`;
});

fileDrop.addEventListener('dragover', e => {
  e.preventDefault();
  fileDrop.style.borderColor = 'var(--accent)';
});
fileDrop.addEventListener('dragleave', () => {
  fileDrop.style.borderColor = '';
});
fileDrop.addEventListener('drop', e => {
  e.preventDefault();
  fileDrop.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (!file) return;
  // DataTransfer から input に差し込む
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = `${Math.ceil(file.size / 1024)} KB`;
});

// ─── クリア ───────────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  titleInput.value  = '';
  bodyInput.value   = '';
  fileInput.value   = '';
  fileNameEl.textContent = 'ファイルを選択';
  fileSizeEl.textContent = '画像、PDF、メモなど';
  formError.style.display = 'none';
  labelSelect.selectedIndex = 0;
});

// ─── 投稿送信 ─────────────────────────────────────────────────────────────
submitBtn.addEventListener('click', async () => {
  formError.style.display = 'none';

  if (!titleInput.value.trim()) {
    formError.textContent = 'タイトルを入力してください。';
    formError.style.display = 'block';
    titleInput.focus();
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = '送信中…';

  const fd = new FormData();
  fd.append('title', titleInput.value.trim());
  fd.append('body',  bodyInput.value.trim());
  fd.append('label', labelSelect.value);
  if (fileInput.files[0]) {
    fd.append('file', fileInput.files[0]);
  }

  try {
    const res = await fetch('/api/items', { method: 'POST', body: fd });
    if (res.status === 401) { location.href = '/login'; return; }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || `エラー: ${res.status}`);
    }

    const newItem = await res.json();
    allItems.unshift(newItem);
    renderList();
    clearBtn.click();
    showToast('テーブルに置きました ✓');
  } catch (err) {
    formError.textContent = err.message;
    formError.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'テーブルに置く';
  }
});

// ─── 削除 ─────────────────────────────────────────────────────────────────
async function deleteItem(id) {
  if (!confirm('この項目を削除しますか？')) return;

  try {
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    if (res.status === 401) { location.href = '/login'; return; }
    if (!res.ok) throw new Error('削除に失敗しました。');
    allItems = allItems.filter(i => i.id !== id);
    renderList();
    showToast('削除しました');
  } catch (err) {
    showToast(err.message, true);
  }
}

// ─── ファイルを開く ───────────────────────────────────────────────────────
function openFile(storedName) {
  window.open(`/api/files/${encodeURIComponent(storedName)}`, '_blank');
}

// ─── バッジクラス ─────────────────────────────────────────────────────────
function badgeClass(label) {
  if (label === '重要')    return '';
  if (label === '通常')    return 'neutral';
  if (label === '保存用')  return 'saved';
  return 'neutral';                   // あとで確認
}

// ─── ファイルタイプ表示 ───────────────────────────────────────────────────
function fileTypeLabel(contentType = '', originalName = '') {
  const ext = originalName.split('.').pop().toUpperCase();
  if (ext) return ext;
  if (contentType.includes('pdf'))   return 'PDF';
  if (contentType.includes('image')) return 'IMG';
  return 'FILE';
}

// ─── 日時フォーマット ─────────────────────────────────────────────────────
function formatDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const hm = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  if (+itemDay === +today)     return `今日 ${hm}`;
  if (+itemDay === +yesterday) return `昨日 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

// ─── アイテムHTML生成 ─────────────────────────────────────────────────────
function itemHTML(item) {
  const isImportant = item.label === '重要';
  const attachHTML = item.file ? `
    <div class="attachment">
      <span class="file-type">${fileTypeLabel(item.file.content_type, item.file.original_name)}</span>
      <div>
        <strong>${escHtml(item.file.original_name)}</strong>
        <span>${Math.ceil(item.file.size / 1024)} KB</span>
      </div>
    </div>` : '';

  return `
    <article class="exchange-item${isImportant ? ' important' : ''}"
             data-id="${escHtml(item.id)}"
             data-label="${escHtml(item.label)}">
      <div class="item-main">
        <div class="item-title-row">
          <h3>${escHtml(item.title)}</h3>
          <span class="badge ${badgeClass(item.label)}">${escHtml(item.label)}</span>
        </div>
        ${item.body ? `<p>${escHtml(item.body)}</p>` : '<p style="margin:8px 0 12px"></p>'}
        ${attachHTML}
      </div>
      <aside class="item-meta">
        <span>自分</span>
        <time datetime="${escHtml(item.created_at)}">${formatDate(item.created_at)}</time>
        ${item.file
          ? `<button type="button" onclick="openFile('${escHtml(item.file.stored_name)}')">開く</button>`
          : '<span></span>'}
        <button class="delete-btn" type="button"
                onclick="deleteItem('${escHtml(item.id)}')">削除</button>
      </aside>
    </article>`;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── リスト描画 ───────────────────────────────────────────────────────────
function renderList() {
  const query = searchInput.value.trim().toLowerCase();

  const visible = allItems.filter(item => {
    const matchSearch = !query ||
      item.title.toLowerCase().includes(query) ||
      (item.body && item.body.toLowerCase().includes(query));
    const matchFilter = !filterImportant || item.label === '重要';
    return matchSearch && matchFilter;
  });

  if (visible.length === 0) {
    exchangeList.innerHTML =
      '<div class="loading-overlay">該当する共有がありません</div>';
    return;
  }

  exchangeList.innerHTML = visible.map(itemHTML).join('');
}

// ─── 検索 ─────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', renderList);

// ─── セグメント切り替え ───────────────────────────────────────────────────
segAll.addEventListener('click', () => {
  filterImportant = false;
  segAll.classList.add('active');
  segImp.classList.remove('active');
  renderList();
});

segImp.addEventListener('click', () => {
  filterImportant = true;
  segImp.classList.add('active');
  segAll.classList.remove('active');
  renderList();
});

// ─── ログアウト ───────────────────────────────────────────────────────────
logoutBtn.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.href = '/login';
});

// ─── 初回データ取得 ───────────────────────────────────────────────────────
(async function loadItems() {
  try {
    const res = await fetch('/api/items');
    if (res.status === 401) { location.href = '/login'; return; }
    allItems = await res.json();
    renderList();
  } catch {
    exchangeList.innerHTML =
      '<div class="loading-overlay" style="color:#b91c1c">データの取得に失敗しました</div>';
  }
})();
