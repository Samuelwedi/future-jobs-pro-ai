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

test('shows installed build details and queues an incident-bound investigation', async () => {
  const recorded={...incident,details:{context:{platform:'android',appVersion:'1.2.8',buildVersion:'9',componentStack:'RecorderScreen'}}};
  const api={get:jest.fn(url=>Promise.resolve({data:url.includes('incidents')?{incidents:[recorded]}:{workerEnabled:true,apiConfigured:true,jobs:[]}})),post:jest.fn().mockResolvedValue({})};
  render(<LiveMonitoring client={()=>api} isOwner onUnauthorized={jest.fn()}/>);
  await screen.findByText('Device and error details');
  expect(screen.getByText(/App: 1.2.8/)).toHaveTextContent('Build: 9');
  fireEvent.click(screen.getByText('Request IT investigation'));
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/api/owner-operations/jobs',expect.objectContaining({incidentId:incident.id,department:'it'})));
});

test('repair execution is disabled until configured and never implies incident resolution', async () => {
  const api={get:jest.fn(url=>Promise.resolve({data:url.includes('incidents')?response.data:{repairEnabled:false,repairs:[{id:'repair',status:'awaiting_store',scope:'mobile-audio'}]}}))};
  render(<LiveMonitoring client={()=>api} isOwner onUnauthorized={jest.fn()}/>);
  await screen.findByText('Fix with Lucy');
  expect(screen.getByText('Fix with Lucy')).toBeDisabled();
  expect(screen.getByText(/Code prepared — native build/)).toBeInTheDocument();
  expect(screen.getByText('Verify resolution')).toBeInTheDocument();
});

test('queues an enabled repair with only the incident identifier', async () => {
  const api={get:jest.fn(url=>Promise.resolve({data:url.includes('incidents')?response.data:{repairEnabled:true,repairs:[]}})),post:jest.fn().mockResolvedValue({})};
  render(<LiveMonitoring client={()=>api} isOwner onUnauthorized={jest.fn()}/>);
  fireEvent.click(await screen.findByText('Fix with Lucy'));
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/api/owner-operations/repairs',{incidentId:incident.id}));
});

test('Fix with Lucy does not queue a repair when fresh diagnostics fail', async () => {
 const api={get:jest.fn(url=>Promise.resolve({data:url.includes('incidents')?response.data:{repairEnabled:true,repairs:[]}})),post:jest.fn().mockRejectedValue({response:{status:503,data:{message:'Diagnostics are unavailable'}}})};
 render(<LiveMonitoring client={()=>api} isOwner onUnauthorized={jest.fn()}/>);
 fireEvent.click(await screen.findByText('Fix with Lucy'));
 await screen.findByText('Diagnostics are unavailable');
 expect(api.post).toHaveBeenCalledTimes(1);
 expect(api.post).toHaveBeenCalledWith('/api/system-reliability/diagnostics',{}, {timeout:15000});
});

test('explains the duplicate repair lock and links to the current workflow', async () => {
 const url='https://github.com/Samuelwedi/future-jobs-pro-ai/actions/runs/123';
 const api={get:jest.fn(path=>Promise.resolve({data:path.includes('incidents')?response.data:{repairEnabled:true,repairs:[{id:'repair',incident_id:incident.id,status:'running',scope:'mobile-audio',workflow_url:url}]}})),post:jest.fn()};
 render(<LiveMonitoring client={()=>api} isOwner onUnauthorized={jest.fn()}/>);
 expect(await screen.findByText('Fix with Lucy')).toBeDisabled();
 expect(screen.getByText(/A repair is already in progress/)).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Track current repair'})).toHaveAttribute('href',url);
 expect(screen.getByText('Repair workflow running — completion pending')).toBeInTheDocument();
 expect(screen.queryByText('Generating, testing and deploying')).not.toBeInTheDocument();
 fireEvent.click(screen.getByText('Fix with Lucy'));
 expect(api.post).not.toHaveBeenCalled();
});

test('mobile review candidates explain the release requirement without claiming deployment', async () => {
 const api={get:jest.fn(path=>Promise.resolve({data:path.includes('incidents')?response.data:{repairEnabled:true,repairs:[{id:'repair',incident_id:incident.id,status:'blocked',scope:'mobile-audio',error:'Owner approval required: candidate ready'}]}}))};
 render(<LiveMonitoring client={()=>api} isOwner onUnauthorized={jest.fn()}/>);
 await screen.findByText('Tested mobile candidate — review and native release required');
 expect(screen.getByText(/Mobile source checks do not update installed apps/)).toBeInTheDocument();
 expect(screen.getByText('Verify resolution')).toBeInTheDocument();
});

test('cancels queued repairs once and refreshes terminal status', async () => {
 const queued={id:'repair',incident_id:incident.id,status:'queued',scope:'portal-app'};
 let repair=queued,finish;
 const api={get:jest.fn(path=>Promise.resolve({data:path.includes('incidents')?response.data:{repairEnabled:true,repairs:[repair]}})),post:jest.fn(()=>new Promise(resolve=>{finish=()=>{repair={...queued,status:'cancelled'};resolve({data:{success:true}});};}))};
 render(<LiveMonitoring client={()=>api} isOwner onUnauthorized={jest.fn()}/>);
 const cancel=await screen.findByText('Cancel queued repair');
 fireEvent.click(cancel);fireEvent.click(cancel);expect(api.post).toHaveBeenCalledTimes(1);
 expect(api.post).toHaveBeenCalledWith('/api/owner-operations/repairs/repair/cancel',{});
 await act(async()=>finish());
 expect(await screen.findByText('Cancelled before dispatch')).toBeInTheDocument();
 expect(screen.queryByText('Cancel queued repair')).not.toBeInTheDocument();
 expect(screen.getByText('Fix with Lucy')).toBeEnabled();
});

test('running or uncertain dispatch offers no misleading local cancellation', async () => {
 const api={get:jest.fn(path=>Promise.resolve({data:path.includes('incidents')?response.data:{repairEnabled:true,repairs:[{id:'repair',incident_id:incident.id,status:'dispatching',error:'Workflow dispatch is unconfirmed.'}]}}))};
 render(<LiveMonitoring client={()=>api} isOwner onUnauthorized={jest.fn()}/>);
 await screen.findByText('Workflow dispatch is unconfirmed.');
 expect(screen.queryByText('Cancel queued repair')).not.toBeInTheDocument();
 expect(screen.getByText('Fix with Lucy')).toBeDisabled();
 expect(screen.getByText(/Pausing this feed does not stop a repair/)).toBeInTheDocument();
});

test('unmounting while diagnostics are pending prevents a later repair dispatch', async () => {
 let finish;
 const api={get:jest.fn(path=>Promise.resolve({data:path.includes('incidents')?response.data:{repairEnabled:true,repairs:[]}})),post:jest.fn(()=>new Promise(resolve=>{finish=resolve;}))};
 const {unmount}=render(<LiveMonitoring client={()=>api} isOwner onUnauthorized={jest.fn()}/>);
 fireEvent.click(await screen.findByText('Fix with Lucy'));unmount();
 await act(async()=>finish({data:{success:true}}));
 expect(api.post).toHaveBeenCalledTimes(1);
});

test('a post-action refresh supersedes an old in-flight poll', async () => {
 jest.useFakeTimers();let poll=0;const pending=[];
 const active={id:'repair',incident_id:incident.id,status:'queued',scope:'portal-app'};
 const api={get:jest.fn(path=>{
  if(poll===1)return new Promise(resolve=>pending.push(()=>resolve({data:path.includes('incidents')?response.data:{repairEnabled:true,repairs:[active]}})));
  return Promise.resolve({data:path.includes('incidents')?response.data:{repairEnabled:true,repairs:[{...active,status:poll===2?'cancelled':'queued'}]}});
 }),post:jest.fn(async()=>{poll=2;return {data:{success:true}};})};
 const {unmount}=render(<LiveMonitoring client={()=>api} isOwner onUnauthorized={jest.fn()}/>);
 await act(async()=>{});poll=1;await act(async()=>jest.advanceTimersByTime(5000));
 fireEvent.click(screen.getByText('Cancel queued repair'));
 await act(async()=>{});expect(screen.getByText('Cancelled before dispatch')).toBeInTheDocument();
 await act(async()=>pending.forEach(resolve=>resolve()));
 expect(screen.getByText('Cancelled before dispatch')).toBeInTheDocument();
 expect(screen.queryByText('Cancel queued repair')).not.toBeInTheDocument();unmount();jest.useRealTimers();
});

test('non-owner views never fetch repair controls or expose cancellation', async () => {
 const api={get:jest.fn().mockResolvedValue(response),post:jest.fn()};
 render(<LiveMonitoring client={()=>api} isOwner={false} onUnauthorized={jest.fn()}/>);
 await screen.findByText('Recording interrupted');
 expect(api.get).toHaveBeenCalledTimes(1);expect(screen.queryByText('Fix with Lucy')).not.toBeInTheDocument();
 expect(screen.queryByText('Cancel queued repair')).not.toBeInTheDocument();
});
