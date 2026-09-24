const form = document.getElementById('reset-form');
const message = document.getElementById('message');
const button = document.getElementById('submit');
const token = new URLSearchParams(window.location.search).get('token');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = document.getElementById('password').value;
  const confirmation = document.getElementById('confirm-password').value;
  message.className = '';
  if (!token) {
    message.textContent = 'This reset link is missing its token.';
    message.className = 'error';
    return;
  }
  if (password !== confirmation) {
    message.textContent = 'Passwords do not match.';
    message.className = 'error';
    return;
  }
  button.disabled = true;
  try {
    const response = await fetch(`/api/auth/reset-password/${encodeURIComponent(token)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Password reset failed.');
    form.reset();
    message.textContent = 'Password reset successful. You can now log in.';
    message.className = 'success';
  } catch (error) {
    message.textContent = error.message;
    message.className = 'error';
  } finally {
    button.disabled = false;
  }
});
