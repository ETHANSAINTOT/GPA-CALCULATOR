export async function api(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && url !== '/api/login') location.href = '/connection';
    throw new Error(data?.error ?? `Erreur ${response.status}`);
  }
  return data;
}

// Submits `form` through `handler` and shows any thrown error in the form's .form-error box.
export function onSubmit(form, handler) {
  const errorBox = form.querySelector('.form-error');
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    submitButton.disabled = true;
    try {
      await handler(Object.fromEntries(new FormData(form)));
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  });
}
