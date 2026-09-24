document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgotPasswordForm');
  const emailInput = document.getElementById('email');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');
  const alertSuccess = document.getElementById('alertSuccess');
  const alertError = document.getElementById('alertError');

  // Helper to hide all alerts
  const hideAlerts = () => {
    alertSuccess.style.display = 'none';
    alertSuccess.textContent = '';
    alertError.style.display = 'none';
    alertError.textContent = '';
  };

  // Helper to show error
  const showError = (message) => {
    alertError.textContent = message;
    alertError.style.display = 'block';
  };

  // Helper to show success
  const showSuccess = (message) => {
    alertSuccess.textContent = message;
    alertSuccess.style.display = 'block';
  };

  // Helper to set loading state
  const setLoading = (isLoading) => {
    if (isLoading) {
      submitBtn.disabled = true;
      btnSpinner.style.display = 'inline-block';
      btnText.textContent = 'Sending...';
    } else {
      submitBtn.disabled = false;
      btnSpinner.style.display = 'none';
      btnText.textContent = 'Send reset link';
    }
  };

  // Email format validation
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Form submission handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlerts();

    const email = emailInput.value.trim();

    // Client-side validation
    if (!email) {
      showError('Please enter your email address.');
      emailInput.focus();
      return;
    }

    if (!isValidEmail(email)) {
      showError('Please enter a valid email address.');
      emailInput.focus();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showSuccess(data.message || 'Password reset successfully. A temporary password has been sent to your email.');
        form.reset();
      } else {
        showError(data.message || 'Failed to process forgot password request. Please try again.');
      }
    } catch (error) {
      console.error('Fetch error:', error);
      showError('Network error or server unavailable. Please try again later.');
    } finally {
      setLoading(false);
    }
  });
});
