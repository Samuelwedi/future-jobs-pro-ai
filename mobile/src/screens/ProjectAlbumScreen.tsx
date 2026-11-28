import { useLang } from '../context/LanguageContext';
import { albumThumbnailSize } from '../utils/responsiveLayout';
import { AdaptiveModal as Modal } from '../components/AdaptiveModal';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  AppState,

} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

const NUM_COLUMNS = 3;
const SPACING = 4;


interface Photo {
  id: string;
  s3_key: string;
  taken_at: string;
  compliance_score: number;
  taken_by?: string;
  project_id?: string;
  album_project_id?: string;
  copied_at?: string | null;
  file_type?: string;
  company_id?: string;
}

export default function ProjectAlbumScreen() {
  const { t } = useLang();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const {user} = useAuth();
  const focused = useIsFocused();
  const projectId: string = typeof route.params?.projectId==='string' ? route.params.projectId : '';
  const owner = user && {id:user.id,companyId:user.companyId,role:user.role};
  const validRoute = !!owner?.id && !!owner.companyId && !!projectId
    && route.params?.ownerId===owner.id && route.params?.companyId===owner.companyId;
  const scope = JSON.stringify([route.key,projectId,owner?.id,owner?.companyId,owner?.role]);
  const projectName: string = validRoute && typeof route.params?.projectName==='string' ? route.params.projectName : t("Project Album");
  const live = useRef<string | null>(null);
  const foreground = useRef(AppState.currentState === 'active');
  const [appActive, setAppActive] = useState(foreground.current);
  live.current = focused && validRoute && appActive ? scope : null;
  const focus = useRef(false);
  const sequence = useRef(0);
  type Preview = { item:Photo };
  const preview = useRef<Preview | null>(null);
  const write = useRef<symbol | null>(null);
  const canManage=!!owner && ['boss','manager','admin'].includes(owner.role.toLowerCase());
  const [gridWidth, setGridWidth] = useState(0);
  const itemSize = albumThumbnailSize(gridWidth, NUM_COLUMNS, SPACING);
  type Album = {sequence:number; scope:string; rows:Photo[]; current?:()=>boolean; error?:boolean};
  type Destination = {id:string;name:string};
  type Filing = {preview:Preview; targets:Destination[]; target:string; running:boolean; message:string; copied:boolean};
  const [album, setAlbum] = useState<Album | null>(null);
  const [selected, setSelected] = useState<Preview | null>(null);
  const [filing, setFiling] = useState<Filing | null>(null);
  const visible = album?.scope===scope && album.sequence===sequence.current && live.current===scope
    && (!album.current || album.current()) ? album : null;
  const photos=visible?.rows || [];
  const chosen=selected && selected===preview.current && photos.includes(selected.item) ? selected : null;
  const selectedPhoto=chosen?.item || null;
  const pickerRef=useRef<Filing | null>(null);
  const updatePicker=(next:Filing | null) => {pickerRef.current=next; setFiling(next);};
  const picker=filing && filing===pickerRef.current && filing.preview===chosen ? filing : null;
  const loading = validRoute && appActive && !visible;

  const closePreview = () => { preview.current=null; write.current=null; setSelected(null); updatePicker(null); };
  const fetchPhotos = useCallback(async () => {
    if (!owner || !focus.current || !foreground.current || live.current!==scope) return;
    const request=++sequence.current;
    const active=()=>focus.current && foreground.current && live.current===scope && sequence.current===request;
    closePreview();
    setAlbum(null);
    try {
      const response=await api.projectPhotos<{success:boolean;photos:Photo[]}>(projectId,owner,active);
      if (!active() || !response.isSessionCurrent()) return;
      if (!response.data.success || !Array.isArray(response.data.photos)) throw new Error('Invalid photo album');
      // Old servers omit album_project_id; then only an original in this project is valid.
      const rows=response.data.photos.filter(p=>p && typeof p.id==='string' && p.company_id===owner.companyId && typeof p.s3_key==='string' && /^https?:\/\//.test(p.s3_key)
        && (!p.album_project_id ? p.project_id===projectId : p.album_project_id===projectId));
      setAlbum({scope,sequence:request,rows,current:response.isSessionCurrent});
    } catch {
      if (active()) setAlbum({scope,sequence:request,rows:[],error:true});
    }
  },[scope,validRoute,appActive]);

  useFocusEffect(useCallback(() => {
    focus.current=true; void fetchPhotos();
    return () => { focus.current=false; sequence.current++; preview.current=null; write.current=null; pickerRef.current=null; };
  }, [fetchPhotos]));

  useEffect(() => {
    const lifecycle=AppState.addEventListener('change', state=>{
      const active=state==='active';
      if (active===foreground.current) return;
      foreground.current=active;
      if (!active) { live.current=null; sequence.current++; closePreview(); setAlbum(null); }
      setAppActive(active);
    });
    return ()=>lifecycle.remove();
  },[]);

  const previewCurrent = (value:Preview) => focus.current && foreground.current && live.current===scope && !!visible
    && visible.sequence===sequence.current && visible.current?.()===true
    && photos.includes(value.item) && preview.current===value;
  const openPreview = (item:Photo) => {
    if (!focus.current || !foreground.current || live.current!==scope || !visible || visible.sequence!==sequence.current
        || visible.current?.()!==true || !photos.includes(item)) return;
    write.current=null; const value={item}; preview.current=value; setSelected(value); updatePicker(null);
  };
  const chooseDestination = async (selection:Preview) => {
    const item=selection.item;
    if (!owner || !canManage || !previewCurrent(selection) || item.project_id!==projectId || item.file_type!=='image' || write.current) return;
    const attempt=Symbol(); write.current=attempt;
    const current=()=>previewCurrent(selection) && write.current===attempt;
    const blank={preview:selection,targets:[],target:'',running:true,message:'',copied:false};
    updatePicker(blank);
    try {
      const result=await api.projectPhotos<{success:boolean;projects:Destination[]}>(projectId,owner,current,'targets');
      if (!current() || !result.isSessionCurrent()) return;
      if (!result.data.success || !Array.isArray(result.data.projects)) throw new Error('Invalid projects');
      const targets=result.data.projects.filter(row=>row && typeof row.id==='string' && /^[0-9a-f-]{36}$/i.test(row.id)
        && row.id!==projectId && typeof row.name==='string' && row.name.trim());
      updatePicker({...blank,targets,running:false,message:targets.length?'':t('No other open projects.')});
    } catch {
      if (current()) updatePicker({...blank,running:false,message:t('Could not load destination projects. Try again.')});
    } finally { if(write.current===attempt) write.current=null; }
  };
  const confirmCopy = async (choice:Filing) => {
    const selection=choice.preview, item=selection.item;
    if (!owner || !canManage || !previewCurrent(selection) || item.project_id!==projectId || item.file_type!=='image' ||
        pickerRef.current!==choice || choice.running || choice.copied || !choice.targets.some(row=>row.id===choice.target) || write.current) return;
    const attempt=Symbol(); write.current=attempt;
    const current=()=>previewCurrent(selection) && write.current===attempt;
    updatePicker({...choice,running:true,message:''});
    try {
      const result=await api.projectPhotos<{success:boolean;reference?:{id:string;source_project_id:string;album_project_id:string;copied_at:string}}>(
        projectId,owner,current,{targetProjectId:choice.target,photoId:item.id},
      );
      if (!current() || !result.isSessionCurrent()) return;
      const receipt=result.data.reference;
      if (!result.data.success || receipt?.id!==item.id || receipt.source_project_id!==projectId ||
          receipt.album_project_id!==choice.target || !receipt.copied_at) throw new Error('Copy not confirmed');
      updatePicker({...choice,running:false,copied:true,message:t('Photo copied. The original is still in this project.')});
    } catch {
      if (current()) updatePicker({...choice,running:false,message:t('Could not confirm the copy. Check the destination or safely retry.')});
    } finally { if(write.current===attempt) write.current=null; }
  };

  const renderPhoto = ({ item }: { item: Photo }) => (
    <TouchableOpacity onPress={() => openPreview(item)}>
      <Image source={{ uri: item.s3_key }} style={[styles.photoThumb, { width: itemSize, height: itemSize }]} resizeMode="cover" />
      {item.compliance_score !== undefined && (
        <View
          style={[
            styles.scoreBadge,
            item.compliance_score >= 70 ? styles.scorePass : styles.scoreFail,
          ]}
        >
          <Text style={styles.scoreText}>{item.compliance_score}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  // ---------- Fallback when no projectId ----------
  if (loading) {
    return (
      <ActivityIndicator size="large" color="#00D4FF" style={{ flex: 1, backgroundColor: '#0A0A0A' }} />
    );
  }

  if (!validRoute) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Go back")} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("Project Album")}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyState}>
          <MaterialIcons name="photo-library" size={64} color="#888" />
          <Text style={styles.emptyText}>{t("No project selected")}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>{t("Go Back")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("Go back")} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.headerTitle}>{projectName}</Text>
          <Text style={styles.headerSubtitle}>
            {t("Photos: {count}", {count: String(photos.length)})}
          </Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        onLayout={event => setGridWidth(event.nativeEvent.layout.width)}
        extraData={gridWidth}
        data={photos}
        renderItem={renderPhoto}
        keyExtractor={item => item.id}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={styles.grid}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={()=>void fetchPhotos()} tintColor="#00D4FF" />
        }
        ListEmptyComponent={
          visible?.error
            ? <TouchableOpacity accessibilityRole="button" onPress={()=>void fetchPhotos()}><Text style={styles.empty}>{t('Could not load project photos. Tap to retry.')}</Text></TouchableOpacity>
            : <Text style={styles.empty}>{t("No photos yet. Take some new photos!")}</Text>
        }
      />

      {/* Full‑screen photo modal */}
      <Modal visible={!!selectedPhoto} onRequestClose={()=>{if(chosen && preview.current===chosen) closePreview();}} animationType="fade" transparent>
        <View style={styles.fullscreenOverlay}>
          <TouchableOpacity style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={t("Close photo preview")} onPress={()=>{if(chosen && preview.current===chosen) closePreview();}}>
            <MaterialIcons name="close" size={30} color="#FFF" />
          </TouchableOpacity>
          {selectedPhoto && !picker && (
            <Image
              source={{ uri: selectedPhoto.s3_key }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
          {selectedPhoto?.copied_at && <Text style={styles.fullscreenBy}>{t('Reference from another project. The original stays there.')}</Text>}
          {selectedPhoto && !picker && canManage && selectedPhoto.project_id===projectId && selectedPhoto.file_type==='image' &&
            <TouchableOpacity accessibilityRole="button" style={styles.photoAction} onPress={()=>chosen && void chooseDestination(chosen)}>
              <Text style={styles.photoActionText}>{t('Copy to another project')}</Text>
            </TouchableOpacity>}
          {picker && <View style={styles.filing}>
            <Text style={styles.photoActionText}>{t('Destination project')}</Text>
            {picker.running && <ActivityIndicator color="#00D4FF" />}
            <ScrollView style={styles.filingScroll} keyboardShouldPersistTaps="handled">
              {picker.targets.map(destination=><TouchableOpacity key={destination.id} accessibilityRole="radio"
                accessibilityState={{selected:picker.target===destination.id,disabled:picker.running}}
                disabled={picker.running} style={[styles.photoAction,picker.target===destination.id&&styles.selectedTarget]}
                onPress={()=>{ if(previewCurrent(picker.preview)&&pickerRef.current===picker&&!write.current) updatePicker({...picker,target:destination.id,message:'',copied:false}); }}>
                <Text style={styles.photoActionText}>{destination.name}</Text>
              </TouchableOpacity>)}
            </ScrollView>
            {!!picker.message && <Text accessibilityLiveRegion="polite" style={styles.photoActionText}>{picker.message}</Text>}
            {!picker.running && !picker.targets.length && !!picker.message &&
              <TouchableOpacity accessibilityRole="button" style={styles.photoAction} onPress={()=>void chooseDestination(picker.preview)}>
                <Text style={styles.photoActionText}>{t('Retry')}</Text>
              </TouchableOpacity>}
            {!!picker.target && !picker.copied &&
              <TouchableOpacity accessibilityRole="button" disabled={picker.running} style={styles.photoAction} onPress={()=>void confirmCopy(picker)}>
                <Text style={styles.photoActionText}>{t('Copy photo reference')}</Text>
              </TouchableOpacity>}
          </View>}
          {selectedPhoto?.taken_by && !picker && (
            <Text style={styles.fullscreenBy}>{t("Taken by:")} {selectedPhoto.taken_by}</Text>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  filing: { width:'90%', maxWidth:520, maxHeight:'70%', padding:16, backgroundColor:'#18232D', borderRadius:14, gap:8 },
  filingScroll: { flexGrow:0, maxHeight:240 },
  photoAction: { minHeight:48, paddingHorizontal:14, paddingVertical:12, justifyContent:'center', borderRadius:10, backgroundColor:'#1B465C', marginBottom:6 },
  photoActionText: { color:'#FFF', fontSize:16 },
  selectedTarget:{ borderWidth:2, borderColor:'#00D4FF' },

  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: { flexShrink: 1, color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  headerSubtitle: { color: '#888', fontSize: 14, marginTop: 2 },
  grid: { padding: SPACING },
  photoThumb: {
    margin: SPACING / 2,
    borderRadius: 6,
  },
  scoreBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  scorePass: { backgroundColor: '#4CAF50' },
  scoreFail: { backgroundColor: '#F44336' },
  scoreText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  empty: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { color: '#888', fontSize: 18, marginTop: 16, marginBottom: 24 },
  backBtn: { minWidth: 48, minHeight: 48, justifyContent: 'center',
    backgroundColor: '#00D4FF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backBtnText: { color: '#0A0A0A', fontSize: 16, fontWeight: '600' },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: { alignSelf: 'flex-end', width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  fullscreenImage: { width: '100%', flex: 1, minHeight: 0 },
  fullscreenBy: { color: '#888', fontSize: 14, marginTop: 12 },
});