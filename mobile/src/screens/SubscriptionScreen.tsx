import {subscriptionPresentation,localizedPlanFeature} from '../utils/subscriptionPresentation';
import {useLang} from '../context/LanguageContext';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import {
  ErrorCode,
  finishTransaction,
  type ProductSubscription,
  type Purchase,
  useIAP,
} from 'expo-iap';
import { useNavigation } from '@react-navigation/native';
import { api, API_URL } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  FALLBACK_PLAN_COPY,
  STORE_PRODUCT_IDS, ANDROID_STORE_PRODUCT_IDS,
  type PlanKey,
  planKeyForProduct,
} from '../config/subscriptionProducts';

type SubscriptionState = {
  tier?: string;
  plan?: string;
  status?: string;
  provider?: string | null;
  expiresAt?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

type StatusResponse = {
  success: boolean;
  subscription: SubscriptionState;
};

type VerificationResponse = {
  success: boolean;
  message?: string;
  subscription?: SubscriptionState;
};

function friendlyError(error: unknown): string {
  const candidate = error as { response?: { data?: { message?: string } }; message?: string };
  return candidate?.response?.data?.message || candidate?.message || 'The store could not complete this request.';
}

function planLabel(tier?: string): string {
  if (!tier) return 'Plan status unavailable';
  if (tier==='trial') return 'Free trial';
  if (FALLBACK_PLAN_COPY[tier]) return FALLBACK_PLAN_COPY[tier].name;
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export default function SubscriptionScreen() {
  const {t,lang}=useLang();
  const purchaseLock=useRef(false),receiptInFlight=useRef(new Set<string>()),translate=useRef(t);translate.current=t;
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionState>({});
  const [storeError,setStoreError] = useState('');
  const [loadingProducts,setLoadingProducts] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingProductId, setProcessingProductId] = useState<string | null>(null);
  const [billing, setBilling] = useState<{google:boolean;apple:boolean;canPurchase:boolean;canManageBilling:boolean;complimentary:boolean;googleAccountId:string}|null>(null);
  const storeReady = Boolean(billing?.canPurchase && (Platform.OS === 'android' ? billing.google : billing.apple));

  const verifyAndFinish = useCallback(async (purchase: Purchase) => {
    const receiptKey=purchase.transactionId||purchase.id||purchase.purchaseToken||purchase.productId;if(receiptInFlight.current.has(receiptKey))return;receiptInFlight.current.add(receiptKey);
    try {
      const response = await api.post<VerificationResponse>('/subscriptions/verify', {
        platform: Platform.OS,
        productId: purchase.productId,
        purchaseToken: purchase.purchaseToken,
        transactionId: purchase.transactionId || purchase.id,
        transactionDate: purchase.transactionDate,
      });

      if (!response.success) {
        throw new Error(response.message || 'The purchase could not be verified.');
      }

      await finishTransaction({ purchase, isConsumable: false });
      if (response.subscription) setStatus({...response.subscription,tier:response.subscription.tier||response.subscription.plan});
      void api.get<any>('/subscriptions/capabilities').then(c=>{if(c.success)setBilling(c);}).catch(()=>{});
      Alert.alert(translate.current("Subscription activated"), translate.current("Your purchase was verified and your workspace is ready."));
    } catch (error) {
      // Never finish an unverified transaction. The store can safely deliver it again.
      Alert.alert(translate.current("Verification pending"), translate.current(friendlyError(error)));
    } finally {
      receiptInFlight.current.delete(receiptKey);purchaseLock.current=false;setProcessingProductId(null);
    }
  }, []);

  const {
    connected,
    subscriptions,
    availablePurchases,
    fetchProducts,
    getAvailablePurchases,
    requestPurchase,
  } = useIAP({
    onPurchaseSuccess: verifyAndFinish,
    onPurchaseError: (error) => {
      purchaseLock.current=false;setProcessingProductId(null);
      if (error.code !== ErrorCode.UserCancelled) {
        Alert.alert(t("Purchase not completed"), error.message);
      }
    },
    onError: (error) => setStoreError(error.message || 'Store products could not be loaded.'),
  });

  const loadStatus = useCallback(async () => {
    const results = await globalThis.Promise.allSettled([
      api.get<StatusResponse>('/subscriptions/status'), api.get<any>('/subscriptions/capabilities')
    ]);
    if(results[0].status==='fulfilled') {const next=results[0].value.subscription||{};setStatus({...next,tier:next.tier||next.plan});}
    else setStoreError(friendlyError(results[0].reason));
    if(results[1].status==='fulfilled')setBilling(results[1].value.success?results[1].value:null);
    else setStoreError(friendlyError(results[1].reason));
    setLoadingStatus(false);setRefreshing(false);
  }, []);
  useEffect(() => {void loadStatus();}, [loadStatus]);
  const loadProducts = useCallback(async()=>{
    if(!connected)return;
    setLoadingProducts(true);setStoreError('');
    let failed=false;
    for(const key of Object.keys(FALLBACK_PLAN_COPY)){
      try{await fetchProducts({skus:[(Platform.OS==='android'?ANDROID_STORE_PRODUCT_IDS:STORE_PRODUCT_IDS)[key]],type:'subs'});}catch{failed=true;}
    }
    if(failed)setStoreError('Some plans could not be loaded from the store. Retry, or contact support. Purchases require a store-installed build and an available plan.');
    setLoadingProducts(false);
  },[connected,fetchProducts]);
  useEffect(()=>{void loadProducts();},[loadProducts]);

  useEffect(() => {
    if (!availablePurchases.length) return;
    const recover = async () => {
      for (const purchase of availablePurchases) {
        if (planKeyForProduct(purchase.productId)) {
          await verifyAndFinish(purchase);
        }
      }
    };
    void recover();
  }, [availablePurchases, verifyAndFinish]);

  const productsByPlan = useMemo(() => {
    const map = new Map<PlanKey, ProductSubscription>();
    subscriptions.forEach((product) => {
      const key = planKeyForProduct(product.id);
      if (key) map.set(key, product);
    });
    return map;
  }, [subscriptions]);

  const startPurchase = async (plan: PlanKey) => {
    if (!storeReady) {
      Alert.alert(t("Purchases unavailable"), !billing?.canPurchase ? 'Company billing requires the boss or a manager explicitly authorized by the boss.' : 'Store billing is not available yet. Contact billing support. You can remain signed in.');
      return;
    }
    if (status.status === 'active' && status.provider && (!(status.currentPeriodEnd || status.expiresAt) || new Date((status.currentPeriodEnd || status.expiresAt)!).getTime()>Date.now())) {
      Alert.alert(t("Existing subscription"), t("Manage your existing subscription in its billing provider before starting another subscription."));
      return;
    }
    const product = productsByPlan.get(plan);
    if (!connected || !product || !product.displayPrice) {
      Alert.alert(
        t("Plan not available yet"),
        t("This product must be active in App Store Connect or Google Play Console before it can be purchased."),
      );
      return;
    }

    if(purchaseLock.current)return;purchaseLock.current=true;setProcessingProductId(product.id);
    const androidOffer = product.platform === 'android'
      ? product.subscriptionOffers?.find((offer) => Boolean(offer.offerTokenAndroid))
      : undefined;

    if (Platform.OS==='android' && !androidOffer?.offerTokenAndroid) {purchaseLock.current=false;setProcessingProductId(null);Alert.alert(t("Plan unavailable"),t("No eligible monthly offer was returned by Google Play. Retry the store plans or contact support."));return;}
    try {
      await requestPurchase({
        request: {
          apple: { sku: product.id, appAccountToken: user?.id },
          google: {
            skus: [product.id],
            obfuscatedAccountId: billing!.googleAccountId,
            ...(androidOffer?.offerTokenAndroid
              ? { subscriptionOffers: [{ sku: product.id, offerToken: androidOffer.offerTokenAndroid }] }
              : {}),
          },
        },
        type: 'subs',
      });
    } catch (error) {
      purchaseLock.current=false;setProcessingProductId(null);
      Alert.alert(t("Purchase not started"), t(friendlyError(error)));
    }
  };

  const restore = async () => {
    if(purchaseLock.current)return;purchaseLock.current=true;setProcessingProductId('restore');
    try {
      await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
      Alert.alert(t("Restore checked"), t("Any available active store purchases will be verified. If none appear, confirm you are signed into the store account used to purchase."));
    } catch (error) {
      purchaseLock.current=false;setProcessingProductId(null);
      Alert.alert(t("Restore failed"), t(friendlyError(error)));
    } finally {
      purchaseLock.current=false;setProcessingProductId(null);
    }
  };

  const manageSubscription = async () => {
    const url = status.provider === 'apple' ? 'https://apps.apple.com/account/subscriptions'
      : status.provider === 'google' ? 'https://play.google.com/store/account/subscriptions?package=com.samuel33.futurejobspro' : null;
    if (!url) return Alert.alert(t("Web subscription"), t("Manage your existing subscription from Billing in the web workspace."));
    try { await Linking.openURL(url); } catch { Alert.alert(t("Unable to open store"), t("Open your app store subscription settings.")); }
  };
  const {active,expired,trial,renewalDate,dateLabel}=subscriptionPresentation(status);

  return (
    <LinearGradient colors={['#07111F', '#0B1830', '#09101B']} style={styles.background}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#6FE7FF"
            onRefresh={() => {
              setRefreshing(true);
              void loadStatus();
            }}
          />
        }
      >
        <View style={styles.header}>
          <TouchableOpacity accessibilityLabel={t("Go back")} onPress={() => navigation.goBack()} style={styles.iconButton}>
            <MaterialIcons name="arrow-back" size={23} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{t("FUTURE JOBS PRO AI")}</Text>
            <Text style={styles.title}>{t(billing?.canPurchase ? 'Choose your workspace plan' : 'Company subscription')}</Text>
            {billing?.canManageBilling && ['apple','google','stripe'].includes(status.provider||'') && !billing.complimentary && <TouchableOpacity onPress={manageSubscription} accessibilityRole="button"><Text style={styles.restoreText}>{t("Manage existing subscription")}</Text></TouchableOpacity>}
          </View>
          <View style={styles.secureBadge}>
            <Ionicons name="shield-checkmark" size={15} color="#6FE7FF" />
            <Text style={styles.secureText}>{t("Store secured")}</Text>
          </View>
        </View>

        {!!storeError&&<View style={{padding:16}}><Text accessibilityRole="alert" style={{color:'#FDA4AF'}}>{t(storeError)}</Text><TouchableOpacity onPress={()=>void loadProducts()} disabled={loadingProducts} style={{padding:12}}><Text style={{color:'#67E8F9'}}>{t(loadingProducts?'Loading plans…':'Retry store plans')}</Text></TouchableOpacity><TouchableOpacity onPress={()=>navigation.navigate('Support')} style={{padding:12}}><Text style={{color:'#67E8F9'}}>{t("Contact billing support")}</Text></TouchableOpacity></View>}
        {!active&&!loadingStatus&&<View style={{padding:16}}><Text style={{color:'#FFF'}}>{t(expired||['expired','cancelled','canceled'].includes(status.status||'')?'Your trial or subscription has ended. You can still choose a plan, restore a purchase, or contact support here.':'Choose a plan, restore a purchase or contact billing support. You can remain signed in.')}</Text></View>}
        <View style={styles.statusCard}>
          <View style={[styles.statusDot, active ? styles.statusActive : styles.statusInactive]} />
          <View style={styles.statusCopy}>
            <Text style={styles.statusLabel}>{t("CURRENT WORKSPACE")}</Text>
            <Text style={styles.statusTitle}>{t(loadingStatus ? 'Checking entitlement…' : expired&&trial?'Trial ended':planLabel(status.tier))}</Text>
            <Text style={styles.statusMeta}>
              {active ? t('Status: {status}',{status:t(status.status||'')}) : t(billing?.canPurchase ? 'Select a company plan' : 'Contact your boss about company access; no individual payment is required')}
              {renewalDate ? ` · ${t(dateLabel)} ${new Date(renewalDate).toLocaleDateString(lang==='fr'?'fr-CA':lang==='es'?'es-MX':'en-CA')}` : ''}
            </Text>
          </View>
          {loadingStatus && <ActivityIndicator color="#6FE7FF" />}
        </View>

        <View style={styles.promiseRow}>
          <SubscriptionPromise icon="sparkles" text="Store offers shown at checkout" />
          <SubscriptionPromise icon="lock-closed" text="Verified by your app store" />
          <SubscriptionPromise icon="refresh" text="Restore on any signed-in device" />
        </View>

        {billing?.canPurchase && (Object.keys(FALLBACK_PLAN_COPY) as PlanKey[]).map((plan, index) => {
          const copy = FALLBACK_PLAN_COPY[plan];
          const product = productsByPlan.get(plan);
          const selected = active && (status.tier?.toLowerCase() === plan ||
            (plan === 'professional' && status.tier?.toLowerCase() === 'pro'));
          const busy = Boolean(processingProductId);

          return (
            <View key={plan} style={[styles.planCard, copy.featured && styles.featuredCard]}>
              {copy.featured && (
                <View style={styles.featuredPill}>
                  <Ionicons name="flash" size={13} color="#06111D" />
                  <Text style={styles.featuredText}>{t("MOST POPULAR")}</Text>
                </View>
              )}
              <View style={styles.planTopRow}>
                <View style={styles.planIdentity}>
                  <View style={[styles.planIcon, { backgroundColor: copy.tint }]}>
                    <Ionicons name={copy.icon} size={22} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text style={styles.planName}>{copy.name}</Text>
                    <Text style={styles.planAudience}>{t(copy.audience)}</Text>
                  </View>
                </View>
                <View style={styles.priceBox}>
                  <Text style={styles.price}>{product?.displayPrice || t('Unavailable')}</Text>
                  <Text style={styles.interval}>{t("/ month")}</Text>
                </View>
              </View>

              <View style={styles.divider} />
              {copy.features.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={13} color="#07111F" />
                  </View>
                  <Text style={styles.featureText}>{localizedPlanFeature(feature,t)}</Text>
                </View>
              ))}

              <TouchableOpacity
                disabled={selected || busy || loadingProducts || !connected || !storeReady || !product?.displayPrice}
                onPress={() => void startPurchase(plan)}
                style={[styles.purchaseButton, copy.featured && styles.featuredButton, selected && styles.selectedButton]}
              >
                {busy ? (
                  <ActivityIndicator color="#07111F" />
                ) : (
                  <Text style={[styles.purchaseText, !copy.featured && !selected && styles.secondaryPurchaseText]}>
                    {selected ? t('Current plan') : loadingProducts ? t('Loading plans…') : !storeReady || !connected || !product?.displayPrice ? t('Purchases unavailable') : t('Choose {plan}',{plan:copy.name})}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity disabled={!billing?.canPurchase || Boolean(processingProductId)} onPress={() => void restore()} style={styles.restoreButton}>
          {processingProductId === 'restore' ? (
            <ActivityIndicator color="#6FE7FF" />
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={19} color="#6FE7FF" />
              <Text style={styles.restoreText}>{t("Restore previous purchase")}</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{flexDirection:'row',justifyContent:'center',gap:24,marginTop:12}}>
          {['privacy','terms'].map(page=><TouchableOpacity key={page} accessibilityRole="link" onPress={()=>Linking.openURL(API_URL.replace(/\/api\/?$/,'')+'/'+page).catch(()=>Alert.alert(t("Unable to open page"),t('Please open {page} from the website.',{page:t(page==='privacy'?'Privacy policy':'Terms of use')})))}><Text style={styles.restoreText}>{t(page==='privacy'?'Privacy policy':'Terms of use')}</Text></TouchableOpacity>)}
        </View>
        <Text style={styles.legal}>
          {t("More than 110 active accounts? Contact support for a company plan.")}{'\n'}
          {t('Payment is charged by {store}. Subscriptions renew automatically unless cancelled in your store account. Purchases are activated only after secure server verification.',{store:Platform.OS==='ios'?'Apple':Platform.OS==='android'?'Google Play':t('Your app store')})}</Text>
      </ScrollView>
    </LinearGradient>
  );
}

function SubscriptionPromise({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  const{t}=useLang();
  return (
    <View style={styles.promise}>
      <Ionicons name={icon} size={16} color="#6FE7FF" />
      <Text style={styles.promiseText}>{t(text)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, marginLeft: 13 },
  eyebrow: { color: '#6FE7FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontSize: 23, fontWeight: '800', marginTop: 3 },
  secureBadge: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(111,231,255,0.10)', borderWidth: 1, borderColor: 'rgba(111,231,255,0.22)' },
  secureText: { color: '#C8F7FF', fontSize: 10, fontWeight: '700' },
  statusCard: { flexDirection: 'row', alignItems: 'center', padding: 17, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)' },
  statusDot: { width: 11, height: 11, borderRadius: 6, marginRight: 12 },
  statusActive: { backgroundColor: '#42E8A7', shadowColor: '#42E8A7', shadowOpacity: 0.8, shadowRadius: 7 },
  statusInactive: { backgroundColor: '#65758B' },
  statusCopy: { flex: 1 },
  statusLabel: { color: '#8292A9', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  statusTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginTop: 2 },
  statusMeta: { color: '#A9B6C8', fontSize: 12, marginTop: 3 },
  promiseRow: { marginVertical: 20, gap: 9 },
  promise: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  promiseText: { color: '#C0CBDA', fontSize: 13 },
  planCard: { borderRadius: 24, padding: 19, marginBottom: 15, backgroundColor: 'rgba(15,31,53,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
  featuredCard: { borderColor: 'rgba(111,231,255,0.58)', backgroundColor: 'rgba(13,39,63,0.98)' },
  featuredPill: { position: 'absolute', right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6FE7FF', paddingHorizontal: 12, paddingVertical: 7, borderBottomLeftRadius: 14 },
  featuredText: { color: '#06111D', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  planTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 },
  planIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  planIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  planName: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  planAudience: { color: '#91A1B6', fontSize: 12, marginTop: 2, maxWidth: 150 },
  priceBox: { alignItems: 'flex-end' },
  price: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  interval: { color: '#8393A9', fontSize: 11 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.09)', marginVertical: 16 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#6FE7FF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  featureText: { color: '#D7E0EB', fontSize: 13, flex: 1 },
  purchaseButton: { minHeight: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 11, borderWidth: 1, borderColor: '#6FE7FF' },
  featuredButton: { backgroundColor: '#6FE7FF' },
  selectedButton: { backgroundColor: '#42E8A7', borderColor: '#42E8A7' },
  purchaseText: { color: '#07111F', fontSize: 15, fontWeight: '900' },
  secondaryPurchaseText: { color: '#A8F1FF' },
  restoreButton: { minHeight: 50, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  restoreText: { color: '#A8F1FF', fontSize: 14, fontWeight: '800' },
  legal: { color: '#718198', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 8, paddingHorizontal: 10 },
});
