# Test Plan — Simple Input Form & Check Box (practiceautomatedtesting.com/webelements)

**Target:** https://practiceautomatedtesting.com/webelements
**Scope:** Simple Input Form (primary) + Check Box (secondary, verified for element roles)
**Verified live:** All elements below were confirmed via accessibility snapshot; no elements were assumed.

---

## 1. Happy Path

### Scenario 1 — Submit a fully populated Simple Input Form
| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Navigate to `https://practiceautomatedtesting.com/webelements` | Page loads; sidebar shows "Simple Input Form" selected by default; `h2` "Simple Input Form" visible |
| 2 | Fill **Full Name** = `Jane Doe` | Textbox accepts value |
| 3 | Fill **Email** = `jane.doe@example.com` | Textbox accepts value |
| 4 | Fill **Current Address** = `123 Main St, Springfield` | Textarea accepts value |
| 5 | Fill **Permanent Address** = `456 Oak Ave, Shelbyville` | Textarea accepts value |
| 6 | Click **Submit** | Native browser `alert` dialog appears with message **"Form submitted successfully!"** |
| 7 | Accept the dialog | Dialog closes; page remains on `/webelements`; form values are **retained** (no reset) |

> ⚠️ Automation note: the confirmation is a **native `window.alert`**, not DOM text. Playwright must register `page.on('dialog', …)` (or `browser_handle_dialog`) *before* clicking Submit, otherwise the click hangs.

### Scenario 2 — Toggle a checkbox in the Check Box section
| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Click sidebar button **Check Box** | Panel switches; `h2` "Checkboxes" + instruction paragraph visible |
| 2 | Verify initial state of **Checkbox 1 / 2 / 3** | All three unchecked |
| 3 | Click **Checkbox 1** | Checkbox 1 becomes `checked`; Checkbox 2 and 3 remain unchecked (independent state) |
| 4 | Click **Checkbox 1** again | Checkbox 1 returns to unchecked |

---

## 2. Negative / Edge Cases

| # | Case | Observed / Expected Behavior |
|---|------|------------------------------|
| N1 | Submit the form with **all fields empty** | **Verified:** alert "Form submitted successfully!" still fires — there is **no client-side validation** and no required-field enforcement. Flag as a defect/risk if validation is intended. |
| N2 | Submit with **invalid email** (e.g. `not-an-email`) | No format validation observed; success alert fires. Assert only that no error state is rendered. |
| N3 | Submit with **whitespace-only** values | No trimming/validation observed; success alert fires. |
| N4 | Very long input (e.g. 500+ chars in Full Name) | Field accepts text; verify no layout break and value persists after submit. |
| N5 | Special characters / Unicode / emoji in name & address | Values accepted verbatim; no encoding corruption on re-read. |
| N6 | Double-click **Submit** rapidly | Two alerts may queue; verify dialog handler is registered per-dialog and page does not error. |
| N7 | Dismiss (cancel) the alert instead of accepting | Page remains functional; no navigation or state corruption. |
| N8 | Switch sections mid-entry (Simple Input Form → Check Box → back) | Verify whether entered values persist or reset (component remount behavior). |
| N9 | Check Box section: select all three, then uncheck all | Each checkbox toggles independently; no mutual exclusivity (they are checkboxes, not radios). |
| N10 | Keyboard-only interaction | Tab order reaches each field and Submit; Space toggles checkboxes; Enter on Submit triggers alert. |

**Known console noise (pre-existing, unrelated to these sections):** `404` on `/login?_rsc=…` and `/favicon.ico`. Do not fail tests on these.

---

## 3. Observed Element Roles & Labels

### Sidebar navigation (`complementary` → `list`)
| Role | Accessible name | Notes |
|------|-----------------|-------|
| button | `Simple Input Form` | Default active panel |
| button | `Check Box` | Switches to Checkboxes panel |
| button | `Radio Button`, `Web Tables`, `Links`, `Broken Links/Images`, `Upload and Download`, `Shadow DOM`, `Select Box` | Out of scope |
| button | `Elements expand_less` / `Widgets expand_more` / `Interactions expand_more` | Accordion headers |

### Simple Input Form panel
| Role | Accessible name | Placeholder | `data-testid` |
|------|-----------------|-------------|---------------|
| heading (h2) | `Simple Input Form` | — | — |
| paragraph | `Work Instruction: Use the following input fields for testing.` | — | — |
| textbox | `Full Name` | `Enter your full name` | `input-fullname` |
| textbox | `Email` | `Enter your email` | `input-email` |
| textbox | `Current Address` | `Enter your current address` | `textarea-current-address` |
| textbox | `Permanent Address` | `Enter your permanent address` | `textarea-permanent-address` |
| button | `Submit` | — | `btn-submit` |

> Labels are rendered as plain `generic` text (not `<label for>`), so **prefer `getByTestId` or `getByPlaceholder`** over `getByLabel` for reliable location.

### Check Box panel
| Role | Accessible name | `data-testid` |
|------|-----------------|---------------|
| heading (h2) | `Checkboxes` | — |
| paragraph | `Work Instruction: Use the following checkboxes for testing.` | — |
| checkbox | `Checkbox 1` | `checkbox-1` |
| checkbox | `Checkbox 2` | `checkbox-2` |
| checkbox | `Checkbox 3` | `checkbox-3` |

> No Submit button in this section — state is asserted directly on the checkbox `checked` property. Each checkbox is wrapped in a clickable `generic` container, so clicking the label text also toggles it.

---

## Suggested Assertions (Playwright)
```js
// Scenario 1
page.once('dialog', d => { expect(d.message()).toBe('Form submitted successfully!'); d.accept(); });
await page.getByTestId('input-fullname').fill('Jane Doe');
await page.getByTestId('input-email').fill('jane.doe@example.com');
await page.getByTestId('textarea-current-address').fill('123 Main St, Springfield');
await page.getByTestId('textarea-permanent-address').fill('456 Oak Ave, Shelbyville');
await page.getByTestId('btn-submit').click();

// Scenario 2
await page.getByTestId('link-checkbox').click();
await expect(page.getByRole('heading', { name: 'Checkboxes' })).toBeVisible();
await page.getByTestId('checkbox-1').check();
await expect(page.getByTestId('checkbox-1')).toBeChecked();
await expect(page.getByTestId('checkbox-2')).not.toBeChecked();
