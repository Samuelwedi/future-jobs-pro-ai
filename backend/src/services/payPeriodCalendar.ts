export type PayPeriod = { start: string; end: string; label: string; schedule: string; timezone: string };
export type CalendarSettings = { schedule: string; timezone: string; anchor?: string; weekStart?: number };
const day = 86400000;
const iso = (value: Date) => value.toISOString().slice(0, 10);
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && iso(new Date(value)) === value;
}
export function validateRange(start: string, end: string) {
  if (!validDate(start) || !validDate(end) || start > end || (Date.parse(end)-Date.parse(start))/day > 366) throw new Error('Use valid dates in order, covering no more than 367 days');
}
export function companyDate(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(now);
  const get=(key:string)=>parts.find(p=>p.type===key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function resolveCalendar(settings: CalendarSettings, requested = 'this pay period', now = new Date()): PayPeriod {
  const timezone=settings.timezone || 'UTC';
  const today=new Date(companyDate(timezone,now)+'T00:00:00Z');
  const text=requested.trim().toLowerCase();
  const explicit=text.match(/^(\d{4}-\d{2}-\d{2})\s+(?:to|through|–|-)\s+(\d{4}-\d{2}-\d{2})$/);
  const wrap=(start:Date,end:Date,schedule:string):PayPeriod=>({start:iso(start),end:iso(end),label:`${iso(start)} through ${iso(end)}`,schedule,timezone});
  if(explicit){validateRange(explicit[1],explicit[2]);return wrap(new Date(explicit[1]),new Date(explicit[2]),'custom');}
  if(!/^(this|current|last|previous) (pay period|week|month)$/.test(text)) throw new Error('Choose this or previous pay period, week, month, or YYYY-MM-DD through YYYY-MM-DD');
  const previous=/^(last|previous)/.test(text);
  const schedule=/ month$/.test(text)?'monthly':/ week$/.test(text)?'weekly':settings.schedule;
  if(schedule==='monthly'){
    const month=today.getUTCMonth()-(previous?1:0),year=today.getUTCFullYear();
    return wrap(new Date(Date.UTC(year,month,1)),new Date(Date.UTC(year,month+1,0)),schedule);
  }
  if(schedule==='semimonthly'){
    if(previous)today.setUTCDate(today.getUTCDate()<=15?0:15);
    const y=today.getUTCFullYear(),m=today.getUTCMonth(),first=today.getUTCDate()<=15;
    return wrap(new Date(Date.UTC(y,m,first?1:16)),new Date(Date.UTC(y,m+(first?0:1),first?15:0)),schedule);
  }
  if(!['weekly','biweekly'].includes(schedule))throw new Error('Configure the company payroll schedule first');
  let start:number;
  const length=schedule==='biweekly'?14:7;
  if(schedule==='biweekly'){
    if(!settings.anchor || !validDate(settings.anchor))throw new Error('Set the company biweekly period start (anchor date) in Command Center settings');
    const anchor=Date.parse(settings.anchor); start=anchor+Math.floor((today.getTime()-anchor)/(length*day))*length*day;
  }else{
    const weekStart=settings.weekStart??1;
    if(!Number.isInteger(weekStart)||weekStart<0||weekStart>6)throw new Error('Week start must be from Sunday (0) to Saturday (6)');
    start=today.getTime()-((today.getUTCDay()-weekStart+7)%7)*day;
  }
  if(previous)start-=length*day;
  return wrap(new Date(start),new Date(start+(length-1)*day),schedule);
}
