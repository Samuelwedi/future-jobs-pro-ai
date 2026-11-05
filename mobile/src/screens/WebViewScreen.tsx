import { useLang } from '../context/LanguageContext';
import React, {useState,useRef} from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

export default function WebViewScreen() {
 const {t,lang}=useLang();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { url, title } = route.params || {};
  const mainUrl=useRef(url);
  const [failed,setFailed]=useState(false);
  const [loading,setLoading]=useState(true);
  const [attempt,setAttempt]=useState(0);
  const valid=typeof url==='string' && /^https?:\/\/[^\s/]+(?:[/?#]|$)/i.test(url);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Go back")} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title || t('Web')}</Text>
        <View style={{ width: 24 }} />
      </View>
      {!valid || failed ? <View style={styles.error}>
        <Text accessibilityRole="alert" style={styles.errorText}>{t(valid?'Could not load this page. Check your connection and try again.':'This link is not available.')}</Text>
        {valid && <TouchableOpacity accessibilityRole="button" style={styles.retry} onPress={()=>{setFailed(false);setLoading(true);setAttempt(value=>value+1);}}><Text>{t('Retry')}</Text></TouchableOpacity>}
      </View> : <>
        {loading && <ActivityIndicator accessibilityLabel={t('Loading...')} color="#67E8F9" />}
        <WebView key={attempt} source={{ uri: url }} style={styles.webview}
          onLoadStart={({nativeEvent})=>{mainUrl.current=nativeEvent.url;setLoading(true);}} onLoadEnd={()=>setLoading(false)}
          onError={()=>{setFailed(true);setLoading(false);}}
          onHttpError={({nativeEvent})=>{if((nativeEvent.url===url || nativeEvent.url===mainUrl.current) && nativeEvent.statusCode>=400){setFailed(true);setLoading(false);}}} />
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  webview: { flex: 1 },
  error:{flex:1,justifyContent:"center",padding:24},
  errorText:{color:"#fff",fontSize:16,lineHeight:24},
  retry:{backgroundColor:"#67E8F9",padding:16,marginTop:16,borderRadius:8},
});