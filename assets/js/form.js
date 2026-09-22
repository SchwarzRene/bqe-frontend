/**
 * Form Validation Module - WCAG Compliant
 * Handles form validation, error messages, and accessibility
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    validateAndSubmitForm(form);
  });
});

/**
 * Validate form and display errors if any
 */
function validateAndSubmitForm(form) {
  const errors = {};
  const formData = new FormData(form);

  // Validate each field
  for (const [key, value] of formData.entries()) {
    const error = validateField(key, value);
    if (error) {
      errors[key] = error;
    }
  }

  if (Object.keys(errors).length > 0) {
    // Show errors
    displayValidationErrors(form, errors);
  } else {
    // Form is valid - submit it (mock)
    submitForm(form, formData);
  }
}

/**
 * Validate individual fields
 */
function validateField(fieldName, value) {
  const trimmedValue = value.trim();

  switch (fieldName) {
    case 'name':
      if (!trimmedValue) return 'Please enter your full name.';
      if (trimmedValue.length < 2) return 'Name must be at least 2 characters.';
      return null;

    case 'email':
      if (!trimmedValue) return 'Please enter your email address.';
      if (!isValidEmail(trimmedValue)) return 'Please enter a valid email address (e.g., name@domain.com).';
      return null;

    case 'subject':
      if (!trimmedValue) return 'Please select a subject.';
      return null;

    case 'message':
      if (!trimmedValue) return 'Please enter your message.';
      if (trimmedValue.length < 10) return 'Message must be at least 10 characters.';
      if (trimmedValue.length > 2000) return 'Message must not exceed 2000 characters.';
      return null;

    default:
      return null;
  }
}

/**
 * Check if email is valid (simple regex)
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Display validation errors (WCAG 3.3.1, 3.3.4)
 */
function displayValidationErrors(form, errors) {
  const errorSummary = document.getElementById('error-summary');
  const errorList = document.getElementById('error-list');
  const formStatus = document.getElementById('form-status');

  // Clear previous errors
  errorList.innerHTML = '';
  clearAllFieldErrors(form);

  // Build error list
  const fieldNames = {
    name: 'Full Name',
    email: 'Email Address',
    subject: 'Subject',
    message: 'Message',
  };

  for (const [fieldName, errorMessage] of Object.entries(errors)) {
    // Add to error summary
    const listItem = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${fieldName}`;
    link.textContent = `${fieldNames[fieldName] || fieldName}: ${errorMessage}`;
    listItem.appendChild(link);
    errorList.appendChild(listItem);

    // Show field-level error (aria-describedby points to this)
    const errorSpan = document.getElementById(`${fieldName}-error`);
    if (errorSpan) {
      errorSpan.textContent = `❌ ${errorMessage}`;
      errorSpan.hidden = false;
      errorSpan.setAttribute('role', 'alert');
    }

    // Focus first error field
    if (!form.dataset.focused) {
      const field = form.elements[fieldName];
      if (field) {
        field.focus();
        field.setAttribute('aria-invalid', 'true');
      }
      form.dataset.focused = 'true';
    }
  }

  // Show error summary and scroll to top
  errorSummary.hidden = false;
  errorSummary.scrollIntoView({ behavior: 'smooth' });

  delete form.dataset.focused;
}

/**
 * Clear all field-level errors
 */
function clearAllFieldErrors(form) {
  form.querySelectorAll('.field-error').forEach((error) => {
    error.hidden = true;
    error.textContent = '';
  });

  form.querySelectorAll('[aria-invalid]').forEach((field) => {
    field.removeAttribute('aria-invalid');
  });
}

/**
 * Submit form (mocked - in real app, would send to backend)
 */
function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[440, 0, 0.15], [660, 0.18, 0.15]].forEach(([freq, start, duration]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.18, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    });
  } catch (_) {}
}

function submitForm(form, formData) {
  const formStatus = document.getElementById('form-status');
  const errorSummary = document.getElementById('error-summary');

  // Hide error summary
  errorSummary.hidden = true;

  // Show loading state
  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = 'Sending...';

  // Simulate API call (in real app, would send to server)
  setTimeout(() => {
    // Success message
    formStatus.innerHTML = `
      <div style="background-color: var(--color-black-muted); border: 2px solid var(--color-success); border-radius: var(--radius-md); padding: var(--space-4); margin-bottom: var(--space-6);">
        <p style="color: var(--color-success); margin: 0;">
          <strong>✓ Success!</strong> Your message has been sent. We'll get back to you within 5 business days.
        </p>
      </div>
    `;
    playSuccessSound();
    formStatus.hidden = false;
    formStatus.scrollIntoView({ behavior: 'smooth' });

    // Reset form
    form.reset();
    clearAllFieldErrors(form);

    // Reset button
    setTimeout(() => {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
      formStatus.hidden = true;
    }, 5000);
  }, 1000);
}

/**
 * Real-time validation on blur (optional enhancement)
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.querySelectorAll('input, textarea, select').forEach((field) => {
    field.addEventListener('blur', () => {
      const error = validateField(field.name, field.value);
      const errorSpan = document.getElementById(`${field.name}-error`);

      if (errorSpan) {
        if (error) {
          errorSpan.textContent = `❌ ${error}`;
          errorSpan.hidden = false;
          field.setAttribute('aria-invalid', 'true');
        } else {
          errorSpan.hidden = true;
          field.removeAttribute('aria-invalid');
        }
      }
    });
  });
});
