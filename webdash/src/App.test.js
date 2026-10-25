import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import App from './App';
jest.mock('axios', () => ({ create: jest.fn(), post: jest.fn() }));
const agent = { id:'staff', role:'agent', firstName:'Test', lastName:'Agent' };
const tickets = ['Alpha','Beta'].map(name => ({ticketId:name,userName:name,assignedAgentId:'staff',status:'open'}));
const deferred = () => { let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve}; };
let api;
beforeEach(() => {
 localStorage.clear(); localStorage.setItem('supportAgentToken','test-session');
 api={get:jest.fn(url=>Promise.resolve({data:url.endsWith('/me')?{agent}:url.endsWith('/tickets')?{tickets}:{messages:[]}})),post:jest.fn()};
 axios.create.mockReturnValue(api);
});
afterEach(()=>{jest.clearAllMocks();localStorage.clear();});
test('preserves valid login on queue outage',async()=>{
 api.get.mockImplementation(url=>url.endsWith('/me')?Promise.resolve({data:{agent}}):Promise.reject(new Error('offline')));
 render(<App/>);
 expect(await screen.findByText(/Support updates unavailable/)).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Sign out'})).toBeInTheDocument();
 expect(localStorage.getItem('supportAgentToken')).toBe('test-session');
});
test('discards previous conversation response and clears its draft',async()=>{
 const alpha=deferred(); const get=api.get.getMockImplementation();
 api.get.mockImplementation(url=>url.includes('/Alpha/messages')?alpha.promise:get(url));
 render(<App/>);
 fireEvent.click(await screen.findByRole('button',{name:/Alpha Ticket/}));
 fireEvent.change(screen.getByPlaceholderText('Write a reply…'),{target:{value:'Alpha private draft'}});
 fireEvent.click(screen.getByRole('button',{name:/Beta Ticket/}));
 await act(async()=>alpha.resolve({data:{messages:[{id:'old',message:'Alpha private conversation'}]}}));
 expect(screen.queryByText('Alpha private conversation')).not.toBeInTheDocument();
 expect(screen.getByPlaceholderText('Write a reply…')).toHaveValue('');
});
test('prevents duplicate send and does not reload old ticket after switching',async()=>{
 const send=deferred(); api.post.mockReturnValue(send.promise);
 render(<App/>);
 fireEvent.click(await screen.findByRole('button',{name:/Alpha Ticket/}));
 fireEvent.change(screen.getByPlaceholderText('Write a reply…'),{target:{value:'Reply to Alpha'}});
 fireEvent.click(screen.getByRole('button',{name:'Send reply'}));
 expect(screen.getByRole('button',{name:'Sending…'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Sending…'}));
 expect(api.post).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:/Beta Ticket/}));
 await act(async()=>send.resolve({data:{}}));
 expect(screen.getByRole('heading',{name:'Beta'})).toBeInTheDocument();
 expect(api.get.mock.calls.filter(([url])=>url.includes('/Alpha/messages'))).toHaveLength(1);
});
test('ignores pending queue response after logout',async()=>{
 const queue=deferred();
 api.get.mockImplementation(url=>url.endsWith('/me')?Promise.resolve({data:{agent}}):queue.promise);
 render(<App/>);
 fireEvent.click(await screen.findByRole('button',{name:'Sign out'}));
 await act(async()=>queue.resolve({data:{tickets}}));
 expect(screen.getByRole('button',{name:'Agent sign in'})).toBeInTheDocument();
 expect(localStorage.getItem('supportAgentToken')).toBeNull();
});
test('clears expired session on unauthorized response',async()=>{
 api.get.mockRejectedValue({response:{status:401}});render(<App/>);
 await waitFor(()=>expect(localStorage.getItem('supportAgentToken')).toBeNull());
 expect(screen.getByRole('button',{name:'Agent sign in'})).toBeInTheDocument();
});
