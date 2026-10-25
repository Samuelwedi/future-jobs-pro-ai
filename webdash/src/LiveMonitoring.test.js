import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import LiveMonitoring from './LiveMonitoring';

const incident = { id:'test-incident', component:'mobile', severity:'warning', summary:'Recording interrupted', status:'open', occurrences:4 };
const response = { data:{ incidents:[incident] } };

test('requires verification before resolving and never marks an incident resolved on refresh', async () => {
  const api = { get:jest.fn().mockResolvedValue(response), patch:jest.fn().mockResolvedValue({}) };
  const client = () => api;
  render(<LiveMonitoring client={client} isOwner={false} onUnauthorized={jest.fn()} />);
  await screen.findByText('Recording interrupted');
  expect(api.patch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Verify resolution'));
  expect(screen.getByText('Mark resolved')).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByText('Mark resolved'));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/system-reliability/incidents/test-incident', { status:'resolved' }));
});

test('polls, preserves last received data on failure, and stops when unmounted', async () => {
  jest.useFakeTimers();
  const api = { get:jest.fn().mockResolvedValueOnce(response).mockRejectedValue(new Error('offline')) };
  const { unmount } = render(<LiveMonitoring client={() => api} isOwner={false} onUnauthorized={jest.fn()} />);
  await act(async () => {});
  expect(screen.getByText('Recording interrupted')).toBeInTheDocument();
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(screen.getByRole('alert')).toHaveTextContent('Live error feed unavailable');
  expect(screen.getByText('Recording interrupted')).toBeInTheDocument();
  unmount();
  const count = api.get.mock.calls.length;
  await act(async () => { jest.advanceTimersByTime(15000); });
  expect(api.get).toHaveBeenCalledTimes(count);
  jest.useRealTimers();
});

test('shows IT recommendations as review activity rather than completed fixes', async () => {
  const api = { get:jest.fn(url => Promise.resolve(url.includes('incidents') ? response : { data:{ workerEnabled:true, apiConfigured:true, jobs:[{id:'job',department:'it',status:'accepted',instruction:'Investigate audio',result:'Proposed changes'}] } })) };
  render(<LiveMonitoring client={() => api} isOwner onUnauthorized={jest.fn()} />);
  await screen.findByText('Recommendation accepted');
  expect(screen.getByText(/Accepted recommendations do not execute code/)).toBeInTheDocument();
  expect(screen.getByText('Recording interrupted')).toBeInTheDocument();
});
