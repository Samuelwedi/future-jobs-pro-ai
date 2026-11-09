import React from 'react';
import {act,render,screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import OwnerOperations from './OwnerOperations';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const snapshot=id=>({data:{jobs:[{id,department:'it',status:'review',instruction:`Instruction ${id}`,created_at:'2026-11-08T12:00:00Z'}],repairs:[],audit:[],schedules:[],leads:[],snapshot:{}}});
test('changing owner credentials clears history and ignores late old-account reads',async()=>{
 const old=deferred(),api={get:jest.fn(()=>old.promise)},first=()=>api;
 const current={get:jest.fn().mockResolvedValue(snapshot('current'))},second=()=>current;
 const view=render(<OwnerOperations client={first}/>);view.rerender(<OwnerOperations client={second}/>);
 expect(await screen.findByText('Instruction current')).toBeInTheDocument();expect(api.get.mock.calls[0][1].signal.aborted).toBe(true);
 await act(async()=>old.resolve(snapshot('private old account')));expect(screen.queryByText('Instruction private old account')).not.toBeInTheDocument();
});
test('Strict Mode replay starts a fresh history request and unauthorized refresh removes data',async()=>{
 const old=deferred(),api={get:jest.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot('current'))};const client=()=>api;
 render(<React.StrictMode><OwnerOperations client={client}/></React.StrictMode>);expect(await screen.findByText('Instruction current')).toBeInTheDocument();expect(api.get).toHaveBeenCalledTimes(2);expect(api.get.mock.calls[0][1].signal.aborted).toBe(true);
 api.get.mockRejectedValue({response:{status:403}});await act(async()=>screen.getByRole('button',{name:'Refresh'}).click());expect(screen.queryByText('Instruction current')).not.toBeInTheDocument();expect(screen.getByRole('alert')).toHaveTextContent('platform-owner access changed');
});
