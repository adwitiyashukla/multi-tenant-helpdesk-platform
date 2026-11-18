import { expect, test } from '@playwright/test';

const password = 'playwright-password-1';

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function signUp(page: import('@playwright/test').Page) {
  const email = `${unique('owner')}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Workspace name').fill('Playwright Support');
  await page.getByLabel('Your name').fill('Casey Owner');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/inbox/);
  return email;
}

async function openConversation(page: import('@playwright/test').Page, subject: string) {
  await page.getByTitle('New conversation').click();
  await page.getByLabel('Customer name').fill('Jamie Rivers');
  await page.getByLabel('Customer email').fill(`${unique('jamie')}@customer.test`);
  await page.getByLabel('Subject').fill(subject);
  await page.getByLabel('First message').fill('The export button does nothing when I click it.');
  await page.getByRole('button', { name: 'Open conversation' }).click();
  await expect(page.getByRole('heading', { name: subject })).toBeVisible();
}

test('a new workspace can sign up, open a conversation and reply to it', async ({ page }) => {
  await signUp(page);
  const subject = unique('Export button is broken');
  await openConversation(page, subject);

  const thread = page.getByRole('log', { name: 'Conversation messages' });
  await expect(thread.getByText('The export button does nothing')).toBeVisible();

  await page.getByPlaceholder('Write a reply to the customer').fill('Taking a look right now.');
  await page.getByRole('button', { name: 'Send reply' }).click();

  await expect(thread.getByText('Taking a look right now.')).toBeVisible();
  await expect(page.getByLabel('Conversation status')).toBeVisible();
});

test('an internal note stays marked as internal', async ({ page }) => {
  await signUp(page);
  await openConversation(page, unique('Note test'));

  await page.getByRole('button', { name: 'Internal note' }).click();
  await page.getByPlaceholder('Write a note only your team can see').fill('Checking with billing.');
  await page.getByRole('button', { name: 'Save note' }).click();

  const thread = page.getByRole('log', { name: 'Conversation messages' });
  await expect(thread.getByText('Checking with billing.')).toBeVisible();
  await expect(thread.getByText('internal note')).toBeVisible();
});

test('status changes and search both work from the inbox', async ({ page }) => {
  await signUp(page);
  const subject = unique('Searchable refund request');
  await openConversation(page, subject);

  await page.getByLabel('Conversation status').selectOption('closed');
  await expect(page.getByLabel('Conversation status')).toHaveValue('closed');

  await page.getByPlaceholder('Search conversations').fill('refund');
  await expect(page.getByRole('link', { name: /refund/i })).toBeVisible();

  await page.getByPlaceholder('Search conversations').fill('kubernetes');
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
});

test('analytics reflects the conversations in the workspace', async ({ page }) => {
  await signUp(page);
  await openConversation(page, unique('Analytics check'));

  await page.getByRole('navigation').getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await expect(page.getByText('Median first response')).toBeVisible();
  await expect(page.getByRole('img', { name: /Conversations created and resolved/ })).toBeVisible();
});

test('settings shows the inbound address and can create an invite link', async ({ page }) => {
  await signUp(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Settings' }).click();

  await expect(page.getByText(/@inbox\./)).toBeVisible();

  await page.getByLabel('Invite by email').fill(`${unique('teammate')}@example.com`);
  await page.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByText(/\/invite\?token=/)).toBeVisible();
});

test('signing out sends the user back to the login page', async ({ page }) => {
  await signUp(page);
  await page.getByTitle('Sign out').click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto('/inbox');
  await expect(page).toHaveURL(/\/login/);
});
