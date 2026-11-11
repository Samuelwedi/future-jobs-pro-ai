import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import '@testing-library/jest-dom';
import LucyActivityHistory,{activityRecords} from './LucyActivityHistory';
const time='2026-11-08T12:00:00Z';
test('native candidates and accepted diagnoses never claim publication or executed fixes',()=>{
 render(<LucyActivityHistory data={{jobs:[{id:'a',department:'it',status:'accepted',created_at:time,instruction:'SECRET_INSTRUCTION',result:'SECRET_RESULT'}],repairs:[{id:'b',status:'awaiting_store',created_at:time,workflow_url:'https://github.com/Samuelwedi/future-jobs-pro-ai/actions/runs/123'}],audit:[]}}/>);
 expect(screen.getByText(/Report accepted; no external action implied/)).toBeInTheDocument();expect(screen.getByText(/Native source prepared; store publication not verified/)).toBeInTheDocument();expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();expect(screen.getByRole('link')).toHaveAttribute('href','https://github.com/Samuelwedi/future-jobs-pro-ai/actions/runs/123');
 fireEvent.change(screen.getByLabelText('Activity'),{target:{value:'diagnosis'}});expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
test('history rejects unsafe evidence URLs, invented actions and unrecorded timestamps',()=>{
 const records=activityRecords({repairs:[{id:'a',status:'running',created_at:time,workflow_url:'javascript:alert(1)',base_sha:'not-a-commit'}],audit:[{id:1,created_at:time,action:'secret:PRIVATE'},{id:2,created_at:'invalid',action:'queued'}]});expect(records).toHaveLength(1);expect(records[0].url).toBeNull();expect(records[0].commit).toBeNull();expect(records[0].finished).toBeUndefined();
});
test('records are newest first and bounded without mutating input',()=>{
 const jobs=Array.from({length:150},(_,n)=>({id:String(n),department:'it',status:'review',created_at:new Date(Date.parse(time)+n*1000).toISOString()}));const result=activityRecords({jobs});expect(result).toHaveLength(100);expect(result[0].receipt).toBe('149');expect(jobs[0].id).toBe('0');
});

test('cancelled repairs show cancellation before dispatch rather than unknown outcome',()=>{
 const records=activityRecords({repairs:[{id:'cancelled',status:'cancelled',created_at:time,completed_at:time}]});expect(records[0].outcome).toBe('Cancelled before dispatch');
});
