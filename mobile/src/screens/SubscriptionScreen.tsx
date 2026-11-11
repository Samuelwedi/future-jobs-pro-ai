import { useLang } from '../context/LanguageContext';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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

type BillingCapabilities = {
  success: boolean;
  google: boolean;
  apple: boolean;
  canPurchase: boolean;
  canManageBilling: boolean;
  complimentary: boolean;
  googleAccountId: string;
};

const KNOWN_STATUSES = new Set(['active', 'trialing', 'in_trial', 'grace_period', 'inactive', 'expired',
  'revoked', 'billing_retry', 'canceled', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']);

function validStatus(response: StatusResponse | undefined): boolean {
  const value = response?.subscription;
  return response?.success === true && !!value && !Array.isArray(value)
    && typeof value.status === 'string' && KNOWN_STATUSES.has(value.status.toLowerCase())
    && typeof (value.tier || value.plan) === 'string' && !!(value.tier || value.plan)!.trim()
    && [value.tier, value.plan].every(item => item == null || typeof item === 'string')
    && (value.provider === null || (typeof value.provider === 'string'
      && ['apple', 'google', 'stripe', 'internal', 'complimentary'].includes(value.provider)))
    && [value.expiresAt, value.currentPeriodEnd].every(item => item == null
      || (typeof item === 'string' && Number.isFinite(new Date(item).getTime())))
    && (value.cancelAtPeriodEnd == null || typeof value.cancelAtPeriodEnd === 'boolean');
}

function validCapabilities(value: BillingCapabilities | undefined): boolean {
  return value?.success === true
    && [value.google, value.apple, value.canPurchase, value.canManageBilling, value.complimentary]
      .every(item => typeof item === 'boolean')
    && typeof value.googleAccountId === 'string' && !!value.googleAccountId;
}

type VerificationResponse = {
  success: boolean;
  message?: string;
  subscription?: SubscriptionState;
};

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'in_trial', 'grace_period']);

export default function SubscriptionScreen() {
  const { user } = useAuth();
  return <SubscriptionWorkspace key={`${user?.id || ''}:${user?.companyId || ''}:${user?.role || ''}`} />;
}

function SubscriptionWorkspace() {
 const { t, lang } = useLang();
function friendlyError(error: unknown): string {
  const candidate = error as { response?: { data?: { message?: string } }; message?: string };
  return candidate?.response?.data?.message || candidate?.message || t("The store could not complete this request.");
}

function planLabel(tier?: string): string {
  if (!tier) return t("Plan status unavailable");
  if (tier==='trial') return t("Free trial");
  if (FALLBACK_PLAN_COPY[tier]) return t('Team {count}', {count: tier.replace('team_', '')});
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}


  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionState>({});
  const [storeError,setStoreError] = useState('');
  const [loadingProducts,setLoadingProducts] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusKnown, setStatusKnown] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [billingError, setBillingError] = useState('');
  const screenAlive = useRef(true);
  const workspaceSession = useRef(api.captureSessionGuard());
  const screenFocused = useRef(false);
  const statusRead = useRef(0);
  const statusReady = useRef(false);
  const checkedStatus = useRef<() => boolean>(() => false);
  const purchaseLock = useRef(false);
  const [processingProductId, setProcessingProductId] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingCapabilities | null>(null);
  const statusAvailable = statusKnown && checkedStatus.current();
  const renderedStatusRead = statusRead.current;
  const storeReady = Boolean(billing?.canPurchase && (Platform.OS === 'android' ? billing.google : billing.apple));

  const loadStatus = useCallback(async () => {
    if (!screenAlive.current || !screenFocused.current) return;
    const request = ++statusRead.current;
    const sessionCurrent = api.captureSessionGuard();
    const current = () => screenAlive.current && screenFocused.current
      && request === statusRead.current && workspaceSession.current() && sessionCurrent();
    checkedStatus.current = () => false;
    statusReady.current = false;
    setLoadingStatus(true);
    setStatusKnown(false);
    setStatus({});
    setBilling(null);
    setStatusError('');
    setBillingError('');
    if (!workspaceSession.current() || !sessionCurrent() || !user) {
      setStatusError(t("Subscription status could not be confirmed. Check your connection and retry before choosing a plan."));
      setLoadingStatus(false);
      setRefreshing(false);
      return;
    }
    const results = await globalThis.Promise.allSettled([
      api.readSubscription<StatusResponse>('status', user, current),
      api.readSubscription<BillingCapabilities>('capabilities', user, current),
    ]);
    if (!current()) return;
    checkedStatus.current = current;
    const statusResult = results[0];
    if (statusResult.status === 'fulfilled' && validStatus(statusResult.value)) {
      const next = statusResult.value.subscription;
      setStatus({...next, tier: next.tier || next.plan});
      statusReady.current = true;
      setStatusKnown(true);
    } else {
      setStatusError(t("Subscription status could not be confirmed. Check your connection and retry before choosing a plan."));
    }
    const billingResult = results[1];
    if (billingResult.status === 'fulfilled' && validCapabilities(billingResult.value)) {
      setBilling(billingResult.value);
    } else {
      setBillingError(t("Billing permissions could not be confirmed. Retry subscription status or contact support."));
    }
    setLoadingStatus(false);
    setRefreshing(false);
  }, [t, user?.id, user?.companyId, user?.role]);

  useEffect(() => {
    screenAlive.current = true;
    return () => { screenAlive.current = false; statusRead.current += 1; };
  }, []);
  useFocusEffect(useCallback(() => {
    screenFocused.current = true;
    void loadStatus();
    return () => { screenFocused.current = false; statusRead.current += 1; };
  }, [loadStatus]));

  const verifyAndFinish = useCallback(async (purchase: Purchase) => {
    const sessionCurrent = api.captureSessionGuard();
    const current = () => screenAlive.current && workspaceSession.current() && sessionCurrent();
    if (!current()) return;
    try {
      const response = await api.post<VerificationResponse>('/subscriptions/verify', {
        platform: Platform.OS,
        productId: purchase.productId,
        purchaseToken: purchase.purchaseToken,
        transactionId: purchase.transactionId || purchase.id,
        transactionDate: purchase.transactionDate,
      });

      if (!response.success) {
        throw new Error(response.message || t("The purchase could not be verified."));
      }

      await finishTransaction({ purchase, isConsumable: false });
      if (!current()) return;
      // Recheck both reads together; an older pre-purchase read cannot replace them.
      void loadStatus();
      Alert.alert(t("Subscription activated"), t("Your purchase was verified and your workspace is ready."));
    } catch (error) {
      // Never finish an unverified transaction. The store can safely deliver it again.
      if (current()) Alert.alert(t("Verification pending"), friendlyError(error));
    } finally {
      if (current()) { purchaseLock.current = false; setProcessingProductId(null); }
    }
  }, [t, loadStatus]);

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
      purchaseLock.current = false; setProcessingProductId(null);
      if (error.code !== ErrorCode.UserCancelled) {
        Alert.alert(t("Purchase not completed"), error.message);
      }
    },
    onError: (error) => setStoreError(error.message || t("Store products could not be loaded.")),
  });

  const loadProducts = useCallback(async()=>{
    if(!connected)return;
    setLoadingProducts(true);setStoreError('');
    let failed=false;
    for(const key of Object.keys(FALLBACK_PLAN_COPY)){
      try{await fetchProducts({skus:[(Platform.OS==='android'?ANDROID_STORE_PRODUCT_IDS:STORE_PRODUCT_IDS)[key]],type:'subs'});}catch{failed=true;}
    }
    if(failed)setStoreError(t("Some plans could not be loaded from the store. Retry, or contact support. Purchases require a store-installed build and an available plan."));
    setLoadingProducts(false);
  },[connected,fetchProducts,t]);
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
    if (purchaseLock.current) return;
    if (!statusReady.current || !statusAvailable || renderedStatusRead !== statusRead.current || !checkedStatus.current()) {
      Alert.alert(t("Plan status unavailable"), t("Subscription status could not be confirmed. Check your connection and retry before choosing a plan."));
      return;
    }
    if (!storeReady) {
      Alert.alert(t("Purchases unavailable"), !billing?.canPurchase ? t("Company billing requires the boss or a manager explicitly authorized by the boss.") : t("Store billing is not available yet. Contact billing support. You can remain signed in."));
      return;
    }
    if (ACTIVE_STATUSES.has((status.status || '').toLowerCase()) && status.provider && (!(status.currentPeriodEnd || status.expiresAt) || new Date((status.currentPeriodEnd || status.expiresAt)!).getTime()>Date.now())) {
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

    purchaseLock.current = true;
    setProcessingProductId(product.id);
    const androidOffer = product.platform === 'android'
      ? product.subscriptionOffers?.find((offer) => Boolean(offer.offerTokenAndroid))
      : undefined;

    if (Platform.OS==='android' && !androidOffer?.offerTokenAndroid) {purchaseLock.current = false; setProcessingProductId(null);Alert.alert(t("Plan unavailable"),t("No eligible monthly offer was returned by Google Play. Retry the store plans or contact support."));return;}
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
      purchaseLock.current = false; setProcessingProductId(null);
      Alert.alert(t("Purchase not started"), friendlyError(error));
    }
  };

  const restore = async () => {
    if (purchaseLock.current || renderedStatusRead !== statusRead.current || !checkedStatus.current() || !billing?.canPurchase || !connected) return;
    purchaseLock.current = true;
    setProcessingProductId('restore');
    try {
      await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
      Alert.alert(t("Restore checked"), t("Any available active store purchases will be verified. If none appear, confirm you are signed into the store account used to purchase."));
    } catch (error) {
      purchaseLock.current = false; setProcessingProductId(null);
      Alert.alert(t("Restore failed"), friendlyError(error));
    } finally {
      purchaseLock.current = false; setProcessingProductId(null);
    }
  };

  const manageSubscription = async () => {
    if (renderedStatusRead !== statusRead.current || !checkedStatus.current()) return;
    const url = status.provider === 'apple' ? 'https://apps.apple.com/account/subscriptions'
      : status.provider === 'google' ? 'https://play.google.com/store/account/subscriptions?package=com.samuel33.futurejobspro' : null;
    if (!url) return Alert.alert(t("Web subscription"), t("Manage your existing subscription from Billing in the web workspace."));
    try { await Linking.openURL(url); } catch { Alert.alert(t("Unable to open store"), t("Open your app store subscription settings.")); }
  };
  const periodEnd = status.currentPeriodEnd || status.expiresAt;
  const expired = Boolean(periodEnd && new Date(periodEnd).getTime() <= Date.now());
  const active = statusAvailable && ACTIVE_STATUSES.has((status.status || '').toLowerCase()) && !expired;
  const renewalDate = status.currentPeriodEnd || status.expiresAt;

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
            <Text style={styles.eyebrow}>FUTURE JOBS PRO AI</Text>
            <Text style={styles.title}>{billing?.canPurchase ? t("Choose your workspace plan") : t("Company subscription")}</Text>
            {billing?.canManageBilling && ['apple','google','stripe'].includes(status.provider||'') && !billing.complimentary && <TouchableOpacity onPress={manageSubscription} accessibilityRole="button"><Text style={styles.restoreText}>{t("Manage existing subscription")}</Text></TouchableOpacity>}
          </View>
          <View style={styles.secureBadge}>
            <Ionicons name="shield-checkmark" size={15} color="#6FE7FF" />
            <Text style={styles.secureText}>{t("Store secured")}</Text>
          </View>
        </View>

        {!!storeError&&<View style={{padding:16}}><Text accessibilityRole="alert" style={{color:'#FDA4AF'}}>{storeError}</Text><TouchableOpacity onPress={()=>void loadProducts()} disabled={loadingProducts} style={{padding:12}}><Text style={{color:'#67E8F9'}}>{loadingProducts?t("Loading plans…"):t("Retry store plans")}</Text></TouchableOpacity><TouchableOpacity onPress={()=>navigation.navigate('Support')} style={{padding:12}}><Text style={{color:'#67E8F9'}}>{t("Contact billing support")}</Text></TouchableOpacity></View>}
        {!!(statusError || billingError) && <View style={{padding:16}}>
          {!!statusError && <Text accessibilityRole="alert" style={{color:'#FDA4AF'}}>{statusError}</Text>}
          {!!billingError && <Text accessibilityRole="alert" style={{color:'#FDA4AF'}}>{billingError}</Text>}
          <TouchableOpacity accessibilityRole="button" disabled={loadingStatus} onPress={() => void loadStatus()} style={{padding:12}}>
            <Text style={{color:'#67E8F9'}}>{t("Retry subscription status")}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Support')} style={{padding:12}}>
            <Text style={{color:'#67E8F9'}}>{t("Contact billing support")}</Text>
          </TouchableOpacity>
        </View>}
        {statusAvailable&&!active&&!loadingStatus&&<View style={{padding:16}}><Text style={{color:'#FFF'}}>{t("Your trial or subscription has ended. You can still choose a plan, restore a purchase, or contact support here.")}</Text></View>}
        <View style={styles.statusCard}>
          <View style={[styles.statusDot, active ? styles.statusActive : styles.statusInactive]} />
          <View style={styles.statusCopy}>
            <Text style={styles.statusLabel}>{t("CURRENT WORKSPACE")}</Text>
            <Text style={styles.statusTitle}>{loadingStatus ? t("Checking entitlement…") : statusAvailable ? planLabel(status.tier) : t("Plan status unavailable")}</Text>
            {statusAvailable && <Text style={styles.statusMeta}>
              {active ? `${t('Status')}: ${t(({active:'Active',trialing:'Free trial',in_trial:'Free trial',grace_period:'Grace period'} as Record<string,string>)[status.status || ''] || status.status || '')}` : billing?.canPurchase ? t("Select a company plan") : billing ? t("Contact your boss about company access; no individual payment is required") : ''}
              {renewalDate ? ` · ${status.status==='trialing' ? (expired?t("Trial ended"):t("Trial ends")) : expired?t("Ended"):status.cancelAtPeriodEnd ? t("Ends") : t("Renews")} ${new Date(renewalDate).toLocaleDateString(lang)}` : ''}
            </Text>}
          </View>
          {loadingStatus && <ActivityIndicator color="#6FE7FF" />}
        </View>

        <View style={styles.promiseRow}>
          <Promise icon="sparkles" text={t("Store offers shown at checkout")} />
          <Promise icon="lock-closed" text={t("Verified by your app store")} />
          <Promise icon="refresh" text={t("Restore on any signed-in device")} />
        </View>

        {billing?.canPurchase && (Object.keys(FALLBACK_PLAN_COPY) as PlanKey[]).map((plan, index) => {
          const copy = FALLBACK_PLAN_COPY[plan];
          const size = Number(plan.replace('team_', ''));
          const name = t('Team {count}', {count: String(size)});
          const features = [t('Up to {count} active accounts (owners and workers)', {count:String(size)}), t('Time tracking, GPS and Worker Tools'), t('Scheduling, expenses and reports'), t('{count} operations AI requests/month', {count:String(size*10)}), t('{count} MB knowledge document allowance', {count:String(size*100)})];
          const product = productsByPlan.get(plan);
          const selected = active && (status.tier?.toLowerCase() === plan ||
            (plan === 'professional' && status.tier?.toLowerCase() === 'pro'));
          const busy = processingProductId === product?.id;

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
                    <Text style={styles.planName}>{name}</Text>
                    <Text style={styles.planAudience}>{t(copy.audience)}</Text>
                  </View>
                </View>
                <View style={styles.priceBox}>
                  <Text style={styles.price}>{product?.displayPrice || t("Unavailable")}</Text>
                  <Text style={styles.interval}>{t("/ month")}</Text>
                </View>
              </View>

              <View style={styles.divider} />
              {features.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={13} color="#07111F" />
                  </View>
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}

              <TouchableOpacity
                disabled={!statusAvailable || loadingStatus || selected || !!processingProductId || loadingProducts || !connected || !storeReady || !product?.displayPrice}
                onPress={() => void startPurchase(plan)}
                style={[styles.purchaseButton, copy.featured && styles.featuredButton, selected && styles.selectedButton]}
              >
                {busy ? (
                  <ActivityIndicator color="#07111F" />
                ) : (
                  <Text style={[styles.purchaseText, !copy.featured && !selected && styles.secondaryPurchaseText]}>
                    {selected ? t("Current plan") : loadingProducts ? t("Loading plans…") : !statusAvailable || !storeReady || !connected || !product?.displayPrice ? t("Purchases unavailable") : t('Choose {plan}', {plan:name})}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity disabled={!billing?.canPurchase || !connected || !!processingProductId} onPress={() => void restore()} style={styles.restoreButton}>
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
          {['privacy','terms'].map(page=><TouchableOpacity key={page} accessibilityRole="link" onPress={()=>Linking.openURL(API_URL.replace(/\/api\/?$/,'')+'/'+page).catch(()=>Alert.alert(t("Unable to open page"),t('Open {page} from the website.', {page:t(page === 'privacy' ? 'Privacy policy' : 'Terms of use')})))}><Text style={styles.restoreText}>{page==='privacy'?t("Privacy policy"):t("Terms of use")}</Text></TouchableOpacity>)}
        </View>
        <Text style={styles.legal}>
          {t("More than 110 active accounts? Contact support for a company plan.")}{'\n'}
          {t('Payment is charged by {store}. Subscriptions renew automatically unless cancelled in your store account. Purchases are activated only after secure server verification.', {store:Platform.OS === 'ios' ? 'Apple' : Platform.OS === 'android' ? 'Google Play' : t('your app store')})}
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}

function Promise({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.promise}>
      <Ionicons name={icon} size={16} color="#6FE7FF" />
      <Text style={styles.promiseText}>{text}</Text>
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
