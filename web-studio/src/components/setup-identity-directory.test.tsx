// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SetupIdentityDirectory } from './setup-identity-directory'

const mocks = vi.hoisted(() => ({
  health: vi.fn(),
  accounts: vi.fn(),
  users: vi.fn(),
}))
vi.mock('#/lib/connection/health', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  fetchConnectionHealth: mocks.health,
}))
vi.mock('#/lib/admin', () => ({
  fetchAdminAccounts: mocks.accounts,
  fetchAdminUserDirectory: mocks.users,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
const connection = {
  serviceSelection: 'opensource' as const,
  baseUrl: 'https://service.test',
  apiKey: 'user-secret',
  adminApiKey: 'root-secret',
  accountId: 'team',
  userId: 'alice',
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.accounts.mockResolvedValue([
    { accountId: 'team', userCount: 1 },
    { accountId: 'other', userCount: 1 },
  ])
  mocks.users.mockResolvedValue([
    { accountId: 'team', userId: 'alice', role: 'user' },
  ])
})
afterEach(cleanup)
it('loads root accounts and a credential-free user directory without changing identity on load', async () => {
  mocks.health.mockResolvedValue({
    version: 'test',
    role: 'root',
    auth_mode: 'api_key',
    account_id: 'default',
    user_id: 'default',
  })
  const onSelect = vi.fn()
  render(
    <SetupIdentityDirectory
      connection={connection}
      disabled={false}
      onSelect={onSelect}
    />,
  )
  await screen.findByRole('combobox', { name: 'directoryAccount' })
  await waitFor(() => expect(mocks.users).toHaveBeenCalled())
  expect(mocks.health).toHaveBeenCalledWith(
    expect.objectContaining({ apiKey: '', adminApiKey: 'root-secret' }),
    expect.any(AbortSignal),
  )
  expect(mocks.users).toHaveBeenCalledWith(
    expect.objectContaining({ apiKey: 'root-secret' }),
    'team',
  )
  expect(onSelect).not.toHaveBeenCalled()
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'directoryAccount' }))
  await user.click(screen.getByRole('option', { name: 'other' }))
  expect(onSelect).toHaveBeenCalledWith({ accountId: 'other', userId: '' })
})
it('restricts an admin key to its authoritative account instead of listing all accounts', async () => {
  mocks.health.mockResolvedValue({
    version: 'test',
    role: 'admin',
    account_id: 'bound-account',
    user_id: 'default',
  })
  const onSelect = vi.fn()
  render(
    <SetupIdentityDirectory
      connection={connection}
      disabled={false}
      onSelect={onSelect}
    />,
  )
  await screen.findByRole('combobox', { name: 'directoryAccount' })
  expect(mocks.accounts).not.toHaveBeenCalled()
  expect(mocks.users).not.toHaveBeenCalled()
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'directoryAccount' }))
  expect(screen.queryByRole('option', { name: 'team' })).toBeNull()
  await user.click(screen.getByRole('option', { name: 'bound-account' }))
  expect(mocks.users).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: 'bound-account' }),
    'bound-account',
  )
})
it('discards directory results after the control key changes', async () => {
  let resolveOld!: (value: unknown) => void
  mocks.health
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    .mockResolvedValueOnce({ version: 'test', role: 'user' })
  const { rerender } = render(
    <SetupIdentityDirectory
      connection={connection}
      disabled={false}
      onSelect={vi.fn()}
    />,
  )
  rerender(
    <SetupIdentityDirectory
      connection={{ ...connection, adminApiKey: 'new-key' }}
      disabled={false}
      onSelect={vi.fn()}
    />,
  )
  await screen.findByText('directoryControlRequired')
  await act(async () => resolveOld({ version: 'test', role: 'root' }))
  expect(mocks.accounts).not.toHaveBeenCalled()
  expect(screen.queryByRole('combobox')).toBeNull()
})
