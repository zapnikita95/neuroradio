const keys = ['backendUrl', 'installId'];

document.getElementById('save').addEventListener('click', async () => {
  const backendUrl = document.getElementById('backendUrl').value.trim();
  const installId = document.getElementById('installId').value.trim();
  await chrome.storage.sync.set({ backendUrl, installId });
  document.getElementById('status').textContent = 'Сохранено';
});

chrome.storage.sync.get(keys, (data) => {
  if (data.backendUrl) document.getElementById('backendUrl').value = data.backendUrl;
  if (data.installId) document.getElementById('installId').value = data.installId;
});
