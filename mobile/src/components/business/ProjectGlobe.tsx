import React,{useMemo} from 'react';
import {WebView} from 'react-native-webview';
import {useLang} from '../../context/LanguageContext';
import {projectGlobeHtml} from '../../utils/projectGlobeHtml';
export default function ProjectGlobe({sites}:{sites:any[]}){const{t}=useLang();const globeTitle=t('Saved project sites globe'),rotation=t('Rotate longitude'),prompt=t('Select a saved project site.');const html=useMemo(()=>projectGlobeHtml(sites,{title:globeTitle,rotation,prompt}),[sites,globeTitle,rotation,prompt]);return <WebView style={{height:390,backgroundColor:'#102035'}} source={{html}} incognito allowFileAccess={false} setSupportMultipleWindows={false} onShouldStartLoadWithRequest={request=>request.url==='about:blank'} originWhitelist={['about:blank']}/>;}
