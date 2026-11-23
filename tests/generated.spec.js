import { test, expect } from '@playwright/test';

const URL = 'https://practiceautomatedtesting.com/webelements';
const SUCCESS_MESSAGE = 'Form submitted successfully!';

/**
 * Verified live via accessibility snapshot + DOM inspection:
 *  - Sidebar buttons: data-testid link-textbox / link-checkbox (role=button)
 *  - Simple Input Form: input-fullname, input-email, textarea-current-address,
 *    textarea-permanent-address, btn-submit (inside form[data-testid="simple-form"])
 *  - Check Box: checkbox-1 / checkbox-2 / checkbox-3 (role=checkbox)
 *  - Submit fires a NATIVE window.alert; no navigation; values are retained.
 *  - Email input is type="email" => native HTML5 constraint validation is ACTIVE.
 *    (This contradicts plan item N2 — see the N2 test below.)
 *  - type="email" also applies the HTML value-sanitization algorithm, which strips
 *    leading/trailing whitespace, so a whitespace-only email normalizes to ''.
 *  - No maxlength on the text inputs (520-char value accepted verbatim).
 *  - Known console noise: 404 on /login?_rsc=... and /favicon.ico (ignored).
 */

async function fillForm(page, { fullName, email, currentAddress, permanentAddress }) {
  if (fullName !== undefined) await page.getByTestId('input-fullname').fill(fullName);
  if (email !== undefined) await page.getByTestId('input-email').fill(email);
  if (currentAddress !== undefined) await page.getByTestId('textarea-current-address').fill(currentAddress);
  if (permanentAddress !== undefined) await page.getByTestId('textarea-permanent-address').fill(permanentAddress);
}

/**
 * Clicks Submit and asserts the native dialog message.
 * Uses a persistent `dialog` listener (rather than waitForEvent) so the dialog is
 * accepted/dismissed as soon as it opens — this avoids deadlocking the click when
 * the alert blocks the page's main thread.
 */
async function submitAndExpectAlert(page, { accept = true } = {}) {
  let message;
  const handler = async (dialog) => {
    message = dialog.message();
    if (accept) await dialog.accept();
    else await dialog.dismiss();
  };
  page.on('dialog', handler);
  try {
    await page.getByTestId('btn-submit').click();
    await expect.poll(() => message, { timeout: 5000 }).toBe(SUCCESS_MESSAGE);
  } finally {
    page.off('dialog', handler);
  }
  return message;
}

test.describe('Simple Input Form & Check Box', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL);
    // Scenario 1, step 1: Simple Input Form is the default panel.
    await expect(page.getByRole('heading', { name: 'Simple Input Form', level: 2 })).toBeVisible();
    await expect(
      page.getByText('Work Instruction: Use the following input fields for testing.')
    ).toBeVisible();
  });

  test.describe('Simple Input Form', () => {
    test('Scenario 1 — submit a fully populated form', async ({ page }) => {
      await fillForm(page, {
        fullName: 'Jane Doe',
        email: 'jane.doe@example.com',
        currentAddress: '123 Main St, Springfield',
        permanentAddress: '456 Oak Ave, Shelbyville',
      });

      await expect(page.getByTestId('input-fullname')).toHaveValue('Jane Doe');
      await expect(page.getByTestId('input-email')).toHaveValue('jane.doe@example.com');
      await expect(page.getByTestId('textarea-current-address')).toHaveValue('123 Main St, Springfield');
      await expect(page.getByTestId('textarea-permanent-address')).toHaveValue('456 Oak Ave, Shelbyville');

      await submitAndExpectAlert(page);

      // Dialog closes, no navigation, values retained.
      await expect(page).toHaveURL(URL);
      await expect(page.getByTestId('input-fullname')).toHaveValue('Jane Doe');
      await expect(page.getByTestId('input-email')).toHaveValue('jane.doe@example.com');
      await expect(page.getByTestId('textarea-current-address')).toHaveValue('123 Main St, Springfield');
      await expect(page.getByTestId('textarea-permanent-address')).toHaveValue('456 Oak Ave, Shelbyville');
    });

    test('N1 — submitting an empty form still fires the success alert (no validation)', async ({ page }) => {
      await expect(page.getByTestId('input-fullname')).toHaveValue('');
      await expect(page.getByTestId('input-email')).toHaveValue('');

      await submitAndExpectAlert(page);

      await expect(page).toHaveURL(URL);
    });

    test('N2 — invalid email is blocked by native HTML5 validation (no success alert)', async ({ page }) => {
      // NOTE: The test plan expected the success alert to fire for an invalid email.
      // Live behavior differs: the email input is type="email", so the browser's
      // native constraint validation blocks submission and NO dialog appears.
      let dialogFired = false;
      const handler = async (d) => {
        dialogFired = true;
        await d.accept();
      };
      page.on('dialog', handler);

      try {
        await fillForm(page, { fullName: 'Invalid Email', email: 'not-an-email' });
        await page.getByTestId('btn-submit').click();

        // The browser populates validationMessage once it blocks the submit.
        await expect
          .poll(() => page.getByTestId('input-email').evaluate((el) => el.validationMessage))
          .not.toBe('');

        expect(dialogFired).toBe(false);
        await expect(page).toHaveURL(URL);
      } finally {
        page.off('dialog', handler);
      }
    });

    test('N3 — whitespace-only values are accepted and fire the success alert', async ({ page }) => {
      await fillForm(page, { fullName: '   ', email: '   ', currentAddress: '   ' });

      // type="email" applies the HTML value-sanitization algorithm, which strips
      // leading/trailing whitespace — so the email field normalizes to ''.
      await expect(page.getByTestId('input-email')).toHaveValue('');

      await submitAndExpectAlert(page);

      // No trimming for text/textarea: values are retained verbatim.
      await expect(page.getByTestId('input-fullname')).toHaveValue('   ');
      await expect(page.getByTestId('textarea-current-address')).toHaveValue('   ');
      await expect(page).toHaveURL(URL);
    });

    test('N4 — very long input is accepted and persists after submit', async ({ page }) => {
      const longName = 'A'.repeat(520);
      await fillForm(page, { fullName: longName, email: 'long@example.com' });

      await expect(page.getByTestId('input-fullname')).toHaveValue(longName);

      await submitAndExpectAlert(page);

      await expect(page.getByTestId('input-fullname')).toHaveValue(longName);
      await expect(page).toHaveURL(URL);
    });

    test('N5 — special characters / Unicode / emoji are preserved verbatim', async ({ page }) => {
      const unicode = 'José Müller 日本語 🚀';
      await fillForm(page, {
        fullName: unicode,
        email: 'unicode@example.com',
        currentAddress: unicode,
        permanentAddress: unicode,
      });

      await expect(page.getByTestId('input-fullname')).toHaveValue(unicode);
      await expect(page.getByTestId('textarea-current-address')).toHaveValue(unicode);

      await submitAndExpectAlert(page);

      await expect(page.getByTestId('input-fullname')).toHaveValue(unicode);
      await expect(page.getByTestId('textarea-current-address')).toHaveValue(unicode);
      await expect(page.getByTestId('textarea-permanent-address')).toHaveValue(unicode);
    });

    test('N6 — rapid double-click on Submit does not break the page', async ({ page }) => {
      let dialogCount = 0;
      const handler = async (d) => {
        dialogCount += 1;
        await d.accept();
      };
      page.on('dialog', handler);

      try {
        await fillForm(page, { fullName: 'Double Click', email: 'dbl@example.com' });

        // Two rapid activations of Submit. Each opens a native alert; the listener
        // accepts it before the next click is dispatched. (A literal dblclick() can
        // deadlock because the first click's alert blocks the second click.)
        const submit = page.getByTestId('btn-submit');
        await submit.click();
        await expect.poll(() => dialogCount).toBe(1);
        await submit.click();
        await expect.poll(() => dialogCount).toBe(2);

        // Page remains functional after the queued dialog(s).
        await page.getByTestId('link-checkbox').click();
        await expect(page.getByRole('heading', { name: 'Checkboxes', level: 2 })).toBeVisible();
      } finally {
        page.off('dialog', handler);
      }
    });

    test('N7 — dismissing the alert leaves the page functional', async ({ page }) => {
      await fillForm(page, { fullName: 'Dismiss Test', email: 'dismiss@example.com' });

      await submitAndExpectAlert(page, { accept: false });

      await expect(page).toHaveURL(URL);

      // Navigation still works and state is intact.
      await page.getByTestId('link-checkbox').click();
      await expect(page.getByRole('heading', { name: 'Checkboxes', level: 2 })).toBeVisible();
      await page.getByTestId('link-textbox').click();
      await expect(page.getByTestId('input-fullname')).toHaveValue('Dismiss Test');
    });

    test('N8 — values persist when switching sections mid-entry', async ({ page }) => {
      await fillForm(page, { fullName: 'Persist Test', email: 'persist@example.com' });

      await page.getByTestId('link-checkbox').click();
      await expect(page.getByRole('heading', { name: 'Checkboxes', level: 2 })).toBeVisible();

      await page.getByTestId('link-textbox').click();
      await expect(page.getByRole('heading', { name: 'Simple Input Form', level: 2 })).toBeVisible();

      // Component state is retained across panel switches.
      await expect(page.getByTestId('input-fullname')).toHaveValue('Persist Test');
      await expect(page.getByTestId('input-email')).toHaveValue('persist@example.com');
    });

    test('N10 — keyboard-only interaction reaches each field and Submit', async ({ page }) => {
      await page.getByTestId('input-fullname').focus();
      await expect(page.getByTestId('input-fullname')).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.getByTestId('input-email')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('textarea-current-address')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('textarea-permanent-address')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('btn-submit')).toBeFocused();

      // Enter on Submit triggers the alert.
      await fillForm(page, { fullName: 'Keyboard User', email: 'kb@example.com' });

      let message;
      const handler = async (d) => {
        message = d.message();
        await d.accept();
      };
      page.on('dialog', handler);
      try {
        await page.getByTestId('btn-submit').press('Enter');
        await expect.poll(() => message, { timeout: 5000 }).toBe(SUCCESS_MESSAGE);
      } finally {
        page.off('dialog', handler);
      }
    });
  });

  test.describe('Check Box', () => {
    test.beforeEach(async ({ page }) => {
      await page.getByTestId('link-checkbox').click();
      await expect(page.getByRole('heading', { name: 'Checkboxes', level: 2 })).toBeVisible();
      await expect(
        page.getByText('Work Instruction: Use the following checkboxes for testing.')
      ).toBeVisible();
    });

    test('Scenario 2 — toggle a checkbox independently', async ({ page }) => {
      // Initial state: all unchecked.
      await expect(page.getByTestId('checkbox-1')).not.toBeChecked();
      await expect(page.getByTestId('checkbox-2')).not.toBeChecked();
      await expect(page.getByTestId('checkbox-3')).not.toBeChecked();

      // Check Checkbox 1.
      await page.getByTestId('checkbox-1').check();
      await expect(page.getByTestId('checkbox-1')).toBeChecked();
      await expect(page.getByTestId('checkbox-2')).not.toBeChecked();
      await expect(page.getByTestId('checkbox-3')).not.toBeChecked();

      // Uncheck Checkbox 1.
      await page.getByTestId('checkbox-1').uncheck();
      await expect(page.getByTestId('checkbox-1')).not.toBeChecked();
    });

    test('N9 — select all three, then uncheck all (independent, not mutually exclusive)', async ({ page }) => {
      await page.getByTestId('checkbox-1').check();
      await page.getByTestId('checkbox-2').check();
      await page.getByTestId('checkbox-3').check();

      await expect(page.getByTestId('checkbox-1')).toBeChecked();
      await expect(page.getByTestId('checkbox-2')).toBeChecked();
      await expect(page.getByTestId('checkbox-3')).toBeChecked();

      await page.getByTestId('checkbox-1').uncheck();
      await page.getByTestId('checkbox-2').uncheck();
      await page.getByTestId('checkbox-3').uncheck();

      await expect(page.getByTestId('checkbox-1')).not.toBeChecked();
      await expect(page.getByTestId('checkbox-2')).not.toBeChecked();
      await expect(page.getByTestId('checkbox-3')).not.toBeChecked();
    });

    test('N11 — Space toggles a focused checkbox', async ({ page }) => {
      await page.getByTestId('checkbox-1').focus();
      await expect(page.getByTestId('checkbox-1')).toBeFocused();

      await page.keyboard.press('Space');
      await expect(page.getByTestId('checkbox-1')).toBeChecked();

      await page.keyboard.press('Space');
      await expect(page.getByTestId('checkbox-1')).not.toBeChecked();
    });
  });
});
