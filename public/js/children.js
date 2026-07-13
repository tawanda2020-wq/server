/*
 * children.js -- multi-child profile tabs: loads the child list,
 * populates the top-nav selector, handles the "Add Child" modal, and
 * renders the Settings tab's profile management list.
 */

async function loadChildren() {
  const children = await Api.get('/api/children');
  if (!children) return;
  AppState.children = children;

  if (!AppState.currentChildId && children.length > 0) {
    AppState.currentChildId = children[0].id;
  }

  renderChildSelector();
  renderSettingsChildrenList();
  document.dispatchEvent(new CustomEvent('children:loaded'));
}

function renderChildSelector() {
  const sel = document.getElementById('childSelector');
  sel.innerHTML = '';
  if (AppState.children.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'No children yet';
    sel.appendChild(opt);
    return;
  }
  AppState.children.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name + (c.device_mac ? '' : ' (no tracker)');
    if (c.id === AppState.currentChildId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderSettingsChildrenList() {
  const list = document.getElementById('childrenList');
  if (AppState.children.length === 0) {
    list.innerHTML = '<p class="text-muted">No child profiles yet -- use "Add Child" in the top bar.</p>';
    return;
  }
  list.innerHTML = AppState.children.map(c => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
      <div>
        <strong>${escapeHtml(c.name)}</strong>
        <div class="small text-muted">
          Tracker: ${c.device_mac ? escapeHtml(c.device_mac) : '<em>unassigned</em>'} ·
          Phone: ${escapeHtml(c.parent_phone)} ·
          ${c.online ? '<span class="text-success">online</span>' : '<span class="text-muted">offline</span>'}
        </div>
      </div>
      <button class="btn btn-sm btn-outline-danger" data-delete-child="${c.id}">Remove</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-delete-child]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-delete-child'));
      const child = AppState.children.find(c => c.id === id);
      if (!confirm(`Remove ${child.name}'s profile? This frees up their tracker for reassignment.`)) return;
      await Api.delete(`/api/children/${id}`);
      if (AppState.currentChildId === id) AppState.currentChildId = null;
      await loadChildren();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

document.getElementById('childSelector').addEventListener('change', (e) => {
  AppState.currentChildId = Number(e.target.value);
  document.dispatchEvent(new CustomEvent('child:switched'));
});

document.getElementById('addChildBtn').addEventListener('click', () => {
  document.getElementById('addChildError').classList.add('d-none');
  document.getElementById('addChildForm').reset();
  new bootstrap.Modal(document.getElementById('addChildModal')).show();
});

document.getElementById('saveChildBtn').addEventListener('click', async () => {
  const name = document.getElementById('childName').value.trim();
  const dob = document.getElementById('childDob').value;
  const parentPhone = document.getElementById('childPhone').value.trim();
  const deviceMac = document.getElementById('childDeviceMac').value.trim();
  const errBox = document.getElementById('addChildError');
  errBox.classList.add('d-none');

  try {
    const child = await Api.post('/api/children', { name, dob, parentPhone, deviceMac });
    if (!child) return;
    bootstrap.Modal.getInstance(document.getElementById('addChildModal')).hide();
    AppState.currentChildId = child.id;
    await loadChildren();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('d-none');
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (!confirm('Are you sure you want to log out?')) return;
  await Api.post('/api/auth/logout');
  window.location.href = '/login.html';
});
