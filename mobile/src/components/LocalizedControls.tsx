import React,{forwardRef} from 'react';
import {TextInput,TouchableOpacity,Pressable,Button,Switch,Text,View,Image,ScrollView} from 'react-native';
import {useLang} from '../context/LanguageContext';
type Copy={placeholder?:string;accessibilityLabel?:string;title?:string};
function localized<T extends React.ElementType>(Native:T){
 const Component=Native as React.ElementType;
 return forwardRef<any,React.ComponentProps<T>&{copy:Copy}>(({copy,...props},ref)=>{
  const{t}=useLang();const translated=Object.fromEntries(Object.entries(copy as Copy).filter(([,value])=>typeof value==='string').map(([key,value])=>[key,t(value as string)]));
  return <Component {...props} {...translated} ref={ref}/>;
 });
}
// The explicit copy prop contains authored literals only. Dynamic labels and user input pass through.
export const LocalizedTextInput=localized(TextInput),LocalizedTouchableOpacity=localized(TouchableOpacity),LocalizedPressable=localized(Pressable),LocalizedButton=localized(Button),LocalizedSwitch=localized(Switch),LocalizedText=localized(Text),LocalizedView=localized(View),LocalizedImage=localized(Image),LocalizedScrollView=localized(ScrollView);
