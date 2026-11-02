import React,{useMemo} from 'react';
import {WebView} from 'react-native-webview';
import {projectGlobeHtml} from '../../utils/projectGlobeHtml';
export default function ProjectGlobe({sites}:{sites:any[]}){const html=useMemo(()=>projectGlobeHtml(sites),[sites]);return <WebView style={{height:390,backgroundColor:'#102035'}} source={{html}} incognito allowFileAccess={false} setSupportMultipleWindows={false} onShouldStartLoadWithRequest={request=>request.url==='about:blank'} originWhitelist={['about:blank']}/>;}
