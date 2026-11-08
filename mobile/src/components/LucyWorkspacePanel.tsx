import React, {useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {AdaptiveModal} from './AdaptiveModal';
import {useAuth} from '../context/AuthContext';
import {useLang} from '../context/LanguageContext';
import {api} from '../services/api';
import {LucyWorkspaceController, PreferenceKey, preferenceOptions} from '../services/lucyWorkspace';
import {nativeLucyReportSharing} from '../services/lucyReportSharing';
import type {LucyWorkMode} from '../utils/lucyWorkReport';
import LucySourceEvidence from './LucySourceEvidence';

// Uses the existing selected app language; machine preference keys never change.
const copy: Record<string,[string,string,string]> = {
 title:['Lucy workspace','Espacio de Lucy','Espace Lucy'], preferences:['Saved preferences','Preferencias guardadas','Préférences enregistrées'],
 policy:['Personal presentation choices only. They never authorize actions. Your current language takes priority.','Solo preferencias personales de presentación. Nunca autorizan acciones. Tu idioma actual tiene prioridad.','Préférences personnelles de présentation uniquement. Elles n’autorisent aucune action. Votre langue actuelle est prioritaire.'],
 retention:['Save keeps this choice for 30 days.','Guardar conserva esta preferencia durante 30 días.','Enregistrer conserve ce choix pendant 30 jours.'],
 save:['Save for 30 days','Guardar por 30 días','Enregistrer pour 30 jours'], forget:['Forget','Olvidar','Oublier'], expires:['Expires','Vence','Expire'], unsaved:['Not saved','Sin guardar','Non enregistré'],
 work:['Background research','Investigación en segundo plano','Recherche en arrière-plan'],
 workPolicy:['Reads accessible work records only. It cannot send messages, change records, or make payments.','Solo lee registros de trabajo accesibles. No puede enviar mensajes, modificar registros ni realizar pagos.','Lit uniquement les données de travail accessibles. Ne peut envoyer de messages, modifier des données ou effectuer des paiements.'],
 disabled:['This research mode is not enabled on this server.','Este modo de investigación no está habilitado en este servidor.','Ce mode de recherche n’est pas activé sur ce serveur.'],
 unknown:['Background research availability could not be verified.','No se pudo verificar la disponibilidad de la investigación.','La disponibilité de la recherche n’a pas pu être vérifiée.'],
 placeholder:['What should Lucy research?','¿Qué debe investigar Lucy?','Que doit rechercher Lucy ?'],
 submit:['Start read-only research','Iniciar investigación de solo lectura','Lancer une recherche en lecture seule'],
 empty:['No background research yet.','Todavía no hay investigaciones.','Aucune recherche pour le moment.'],
 loadError:['Could not load current data. Reconnect and refresh.','No se pudieron cargar los datos. Reconecta y actualiza.','Impossible de charger les données. Reconnectez-vous et actualisez.'],
 saveError:['Could not confirm the change. Your draft is retained; retrying the same research will not create a duplicate.','No se pudo confirmar el cambio. Se conserva el borrador; reintentar la misma investigación no crea duplicados.','Modification non confirmée. Votre brouillon est conservé ; réessayer la même recherche ne crée pas de doublon.'],
 mode:['Research mode','Modo de investigación','Mode de recherche'],
 record_search:['Company-record search (no AI model)','Búsqueda de registros de la empresa (sin modelo de IA)','Recherche de données de l’entreprise (sans modèle d’IA)'],
 ai_research:['AI research','Investigación con IA','Recherche avec IA'],
 recordHint:['Search accessible work records and documents with a short keyword query. No AI model is called.','Busca registros y documentos accesibles con una consulta breve de palabras clave. No se utiliza ningún modelo de IA.','Recherchez des données et documents accessibles avec une courte requête par mots-clés. Aucun modèle d’IA n’est utilisé.'],
 aiHint:['Investigate accessible work records with the enabled AI research service.','Investiga registros de trabajo accesibles con el servicio de investigación con IA habilitado.','Analysez les données de travail accessibles avec le service de recherche avec IA activé.'],
 recordPlaceholder:['Keywords to find in company records','Palabras clave para buscar en registros','Mots-clés à rechercher dans les données'],
 recordSubmit:['Start record search','Iniciar búsqueda de registros','Lancer la recherche de données'],
 tooLong:['Shorten your query to the selected mode’s limit. Your draft has been kept.','Acorta la consulta al límite del modo seleccionado. Se ha conservado el borrador.','Raccourcissez la requête selon la limite du mode sélectionné. Votre brouillon a été conservé.'],
 share:['Share report (.txt)','Compartir informe (.txt)','Partager le rapport (.txt)'],
 sharePartial:['Share partial report (.txt)','Compartir informe parcial (.txt)','Partager le rapport partiel (.txt)'],
 sharePolicy:['The report includes your query, result and source excerpts. Choose where to save or share it in your device’s share sheet.','El informe incluye tu consulta, el resultado y extractos de las fuentes. Elige dónde guardarlo o compartirlo en el menú de tu dispositivo.','Le rapport inclut votre requête, le résultat et des extraits des sources. Choisissez où l’enregistrer ou le partager dans le menu de votre appareil.'],
 shareError:['Could not prepare or share this report safely. Refresh the task and try again.','No se pudo preparar o compartir este informe de forma segura. Actualiza la tarea y vuelve a intentarlo.','Impossible de préparer ou partager ce rapport en toute sécurité. Actualisez la tâche et réessayez.'],
 shareUnavailable:['File sharing is unavailable on this device.','No se pueden compartir archivos en este dispositivo.','Le partage de fichiers n’est pas disponible sur cet appareil.'],
 partialRecord:['Partial search: some matching records may be missing. The report is labeled incomplete. Narrow the query for more detail.','Búsqueda parcial: pueden faltar registros coincidentes. El informe está marcado como incompleto. Limita la consulta para obtener más detalles.','Recherche partielle : des données correspondantes peuvent manquer. Le rapport est indiqué comme incomplet. Précisez la requête pour plus de détails.'],
 partialAI:['This AI task is partial. A completed result is required to share a report.','Esta tarea de IA es parcial. Se necesita un resultado completo para compartir un informe.','Cette tâche d’IA est partielle. Un résultat terminé est nécessaire pour partager un rapport.'],
 response_style:['Response style','Estilo de respuesta','Style de réponse'], detail_level:['Detail level','Nivel de detalle','Niveau de détail'], focus_area:['Work focus','Enfoque de trabajo','Priorité de travail'], language:['Preferred language','Idioma preferido','Langue préférée'], week_start:['Week starts on','Inicio de semana','Début de semaine'], time_format:['Time format','Formato de hora','Format horaire'],
 concise:['Concise','Conciso','Concis'], conversational:['Conversational','Conversacional','Conversationnel'], formal:['Formal','Formal','Formel'], summary:['Summary','Resumen','Résumé'], balanced:['Balanced','Equilibrado','Équilibré'], detailed:['Detailed','Detallado','Détaillé'], tasks:['Tasks','Tareas','Tâches'], schedules:['Schedules','Horarios','Plannings'], projects:['Projects','Proyectos','Projets'], approvals:['Approvals','Aprobaciones','Approbations'], en:['English','Inglés','Anglais'], es:['Spanish','Español','Espagnol'], fr:['French','Francés','Français'], pt:['Portuguese','Portugués','Portugais'], monday:['Monday','Lunes','Lundi'], sunday:['Sunday','Domingo','Dimanche'], '12h':['12-hour','12 horas','12 heures'], '24h':['24-hour','24 horas','24 heures'],
 queued:['Queued','En cola','En attente'], running:['Running','En curso','En cours'], completed:['Completed','Completado','Terminé'], partial:['Partial result','Resultado parcial','Résultat partiel'], failed:['Failed','Fallido','Échec'], cancelled:['Cancelled','Cancelado','Annulé'],
};

export default function LucyWorkspacePanel({visible,onClose}: {visible:boolean;onClose:()=>void}) {
 const {user}=useAuth(); const {t,lang}=useLang(); const focused=useIsFocused();
 const label=(key:string)=>copy[key]?.[lang==='es'?1:lang==='fr'?2:0] ?? t(key);
 const [foreground,setForeground]=useState(AppState.currentState==='active');
 const scope=JSON.stringify([user?.id,user?.companyId,user?.role]);
 const liveScope=useRef({scope,available:false});
 // Invalidate old handlers during render, before effect cleanup, on account/role/navigation changes.
 liveScope.current={scope,available:visible&&focused&&foreground&&Boolean(user?.id)};
 const controller=useMemo(()=>new LucyWorkspaceController(api,nativeLucyReportSharing,()=>liveScope.current.scope===scope&&liveScope.current.available),[user?.id,user?.companyId,user?.role]);
 const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
 const promptLimit=state.mode==='record_search'?200:4000;
 const placeholder=label(state.mode==='record_search'?'recordPlaceholder':'placeholder');
 useEffect(()=>{
  const subscription=AppState.addEventListener('change',next=>{if(next!=='active')controller.close();setForeground(next==='active');});
  return()=>{subscription.remove();controller.close();};
 },[controller]);
 useEffect(()=>{
  if(visible&&focused&&foreground&&user?.id)controller.open();else controller.close();
  return()=>controller.close();
 },[controller,visible,focused,foreground,user?.id]);
 const close=()=>{controller.close();onClose();};
 const button=(text:string,action:()=>void,disabled=false)=><TouchableOpacity accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={action} style={[styles.button,disabled&&styles.disabled]}><Text style={styles.buttonText}>{text}</Text></TouchableOpacity>;
 return <AdaptiveModal visible={visible&&focused&&foreground&&Boolean(user?.id)} animationType="slide" onRequestClose={close}>
  <View style={styles.panel}>
   <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{label('title')}</Text>{button(t('Close'),close)}</View>
   {state.error?<Text accessibilityRole="alert" style={styles.error}>{label(state.error)}</Text>:null}
   {state.loading||state.busy?<ActivityIndicator color="#67E8F9"/>:null}
   <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.heading}>{label('preferences')}</Text>
    <Text style={styles.copy}>{label('policy')}</Text><Text style={styles.copy}>{label('retention')}</Text>
    {(Object.keys(preferenceOptions) as PreferenceKey[]).map(key=>{
     const saved=state.preferences.find(item=>item.key===key&&Date.parse(item.expiresAt)>Date.now());
     const selected=state.choices[key]??saved?.value??preferenceOptions[key][0];
     return <View key={key} style={styles.card}>
      <Text style={styles.heading}>{label(key)}</Text>
      <View style={styles.choices}>{preferenceOptions[key].map(value=><TouchableOpacity key={value} accessibilityRole="radio" accessibilityLabel={`${label(key)}: ${label(value)}`} accessibilityState={{checked:selected===value,disabled:state.busy||!state.ready}} disabled={state.busy||!state.ready} onPress={()=>controller.choose(key,value)} style={[styles.option,selected===value&&styles.selected]}><Text style={styles.copy}>{label(value)}</Text></TouchableOpacity>)}</View>
      <Text style={styles.copy}>{saved?`${label('expires')}: ${new Date(saved.expiresAt).toLocaleString(lang)}`:label('unsaved')}</Text>
      <View style={styles.choices}>{button(label('save'),()=>void controller.save(key),state.busy||!state.ready)}{saved?button(label('forget'),()=>void controller.forget(key),state.busy):null}</View>
     </View>;
    })}
    <Text accessibilityRole="header" style={styles.heading}>{label('work')}</Text><Text style={styles.copy}>{label('workPolicy')}</Text>
    {state.enabled!==true?<Text style={styles.copy}>{label(state.enabled===false?'disabled':'unknown')}</Text>:null}
    <Text accessibilityRole="header" style={styles.heading}>{label('mode')}</Text>
    <View style={styles.choices}>{(['record_search','ai_research'] as LucyWorkMode[]).filter(mode=>mode==='ai_research'||state.modes?.explicit).map(mode=>{
     const disabled=state.busy||state.loading||state.modes?.[mode]!==true;
     return <TouchableOpacity key={mode} accessibilityRole="radio" accessibilityLabel={label(mode)} accessibilityState={{checked:state.mode===mode,disabled}} disabled={disabled} onPress={()=>controller.setMode(mode)} style={[styles.option,state.mode===mode&&styles.selected,disabled&&styles.disabled]}><Text style={styles.copy}>{label(mode)}</Text></TouchableOpacity>;
    })}</View>
    <Text style={styles.copy}>{label(state.mode==='record_search'?'recordHint':'aiHint')}</Text>
    <TextInput accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor="#94A3B8" multiline maxLength={promptLimit} value={state.prompt} onChangeText={value=>controller.setPrompt(value)} editable={!state.busy} style={styles.input}/>
    <Text style={styles.copy}>{state.prompt.length}/{promptLimit}</Text>
    {state.prompt.length>promptLimit?<Text accessibilityRole="alert" style={styles.error}>{label('tooLong')}</Text>:null}
    {button(label(state.mode==='record_search'?'recordSubmit':'submit'),()=>void controller.create(),state.busy||state.loading||state.enabled!==true||!state.prompt.trim()||state.prompt.length>promptLimit)}
    {state.enabled!==null&&!state.jobs.length?<Text style={styles.copy}>{label('empty')}</Text>:null}
    {state.jobs.map(job=><View key={job.id} style={styles.card}>
     <Text selectable style={styles.heading}>{job.prompt}</Text><Text style={styles.copy}>{label(job.status)} · {new Date(job.createdAt).toLocaleString(lang)}</Text>
     <Text style={styles.copy}>{label(job.mode==='record_search'?'record_search':'ai_research')}</Text>
     {job.result?.text?<Text selectable style={styles.copy}>{job.result.text}</Text>:null}
     <LucySourceEvidence evidence={job.result?.evidence} language={lang}/>
     {job.status==='partial'?<Text accessibilityRole="alert" style={styles.error}>{label(job.mode==='record_search'?'partialRecord':'partialAI')}</Text>:null}
     {job.status==='completed'||(job.status==='partial'&&job.mode==='record_search')?<View>
      <Text style={styles.copy}>{label('sharePolicy')}</Text>
      {button(label(job.status==='partial'?'sharePartial':'share'),()=>void controller.shareReport(job,lang,label(job.status==='partial'?'sharePartial':'share')),state.busy||state.loading)}
     </View>:null}
     {job.error?<Text selectable style={styles.error}>{job.error}</Text>:null}
     {job.status==='queued'||job.status==='running'?button(t('Cancel'),()=>void controller.cancel(job.id),state.busy):null}
    </View>)}
    {button(t('Refresh'),()=>void controller.refresh(),state.busy||state.loading)}
   </ScrollView>
  </View>
 </AdaptiveModal>;
}
const styles=StyleSheet.create({panel:{flex:1,backgroundColor:'#0A1520',paddingHorizontal:18},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},title:{color:'#FFF',fontSize:23,fontWeight:'700',flexShrink:1},heading:{color:'#FFF',fontSize:17,fontWeight:'600',marginVertical:8},content:{paddingBottom:30},copy:{color:'#CBD5E1',fontSize:15,lineHeight:22,marginVertical:4},card:{backgroundColor:'#172432',borderRadius:12,padding:14,marginVertical:8},choices:{flexDirection:'row',flexWrap:'wrap',gap:8},option:{minHeight:44,paddingHorizontal:12,paddingVertical:6,borderWidth:1,borderColor:'#64748B',borderRadius:8,justifyContent:'center'},selected:{borderColor:'#67E8F9',backgroundColor:'#164E63'},button:{minHeight:48,padding:12,justifyContent:'center'},buttonText:{color:'#67E8F9',fontSize:16,fontWeight:'600'},disabled:{opacity:.45},error:{color:'#FDA4AF',lineHeight:21,marginVertical:8},input:{minHeight:100,backgroundColor:'#172432',color:'#FFF',padding:14,borderRadius:10,fontSize:16,textAlignVertical:'top',marginVertical:10}});
