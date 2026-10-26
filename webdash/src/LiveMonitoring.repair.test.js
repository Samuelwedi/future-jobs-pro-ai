import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LiveMonitoring from './LiveMonitoring';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const response = summary => ({ data: { incidents: [
  { id: 'incident', component: 'web', severity: 'warning', status: 'open', summary },
] } });

test('restarts polling immediately and ignores completion of the cancelled request', async () => {
  const old = deferred();
  const current = deferred();
  const api = { get: jest.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise) };
  const client = () => api;
  render(<LiveMonitoring client={client} isOwner={false} onUnauthorized={jest.fn()} />);
  const oldSignal = api.get.mock.calls[0][1].signal;

  fireEvent.click(screen.getByText('Pause updates'));
  expect(oldSignal.aborted).toBe(true);
  expect(api.get).toHaveBeenCalledTimes(2);

  // A transport may settle after abort. It must not release the newer request's lock.
  await act(async () => { old.resolve(response('Stale incident')); });
  fireEvent.click(screen.getByText('Refresh now'));
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Stale incident')).not.toBeInTheDocument();

  await act(async () => { current.resolve(response('Current incident')); });
  expect(screen.getByText('Current incident')).toBeInTheDocument();
  api.get.mockResolvedValue(response('Refreshed incident'));
  await act(async () => { fireEvent.click(screen.getByText('Refresh now')); });
  expect(api.get).toHaveBeenCalledTimes(3);
  expect(screen.getByText('Refreshed incident')).toBeInTheDocument();
});

test('starts a replacement request during Strict Mode effect replay', async () => {
  const old = deferred();
  const api = { get: jest.fn().mockReturnValueOnce(old.promise).mockResolvedValue(response('Live incident')) };
  const client = () => api;
  render(<React.StrictMode><LiveMonitoring client={client} isOwner={false} onUnauthorized={jest.fn()} /></React.StrictMode>);
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.get.mock.calls[0][1].signal.aborted).toBe(true);
  expect(await screen.findByText('Live incident')).toBeInTheDocument();
  await act(async () => { old.resolve(response('Stale incident')); });
  expect(screen.queryByText('Stale incident')).not.toBeInTheDocument();
  expect(screen.getByText('Live incident')).toBeInTheDocument();
});
