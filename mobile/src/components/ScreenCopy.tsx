import React from 'react';
import {useLang} from '../context/LanguageContext';
// Only authored screen literals use this component. User/provider content stays untouched.
// Return a fragment to preserve the parent Text's native styling and accessibility.
export default function ScreenCopy({value,leading='',trailing=''}:{value:string;leading?:string;trailing?:string}){
 const{t}=useLang();return <>{leading}{t(value)}{trailing}</>;
}
