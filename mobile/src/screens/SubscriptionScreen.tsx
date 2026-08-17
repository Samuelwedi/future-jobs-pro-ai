import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
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
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  FALLBACK_PLAN_COPY,
  STORE_PRODUCT_IDS,
  type PlanKey,
  planKeyForProduct,
} from '../config/subscriptionProducts';

type SubscriptionState = {
  tier?: string;
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

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'in_trial', 'grace_period', 'billing_retry']);

function friendlyError(error: unknown): string {
  const candidate = error as { response?: { data?: { message?: string } }; message?: string };
  return candidate?.response?.data?.message || candidate?.message || 'The store could not complete this request.';
}

function planLabel(tier?: string): string {
  if (!tier) return 'No active plan';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export default function SubscriptionScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionState>({});
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingProductId, setProcessingProductId] = useState<string | null>(null);

  const verifyAndFinish = useCallback(async (purchase: Purchase) => {
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
      if (response.subscription) setStatus(response.subscription);
      Alert.alert('Subscription activated', 'Your purchase was verified and your workspace is ready.');
    } catch (error) {
      // Never finish an unverified transaction. The store can safely deliver it again.
      Alert.alert('Verification pending', friendlyError(error));
    } finally {
      setProcessingProductId(null);
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
      setProcessingProductId(null);
      if (error.code !== ErrorCode.UserCancelled) {
        Alert.alert('Purchase not completed', error.message);
      }
    },
    onError: (error) => Alert.alert('Store unavailable', error.message),
  });

  const loadStatus = useCallback(async () => {
    try {
      const response = await api.get<StatusResponse>('/subscriptions/status');
      if (response.success) setStatus(response.subscription || {});
    } catch (error) {
      Alert.alert('Could not load subscription', friendlyError(error));
    } finally {
      setLoadingStatus(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (connected) {
      void fetchProducts({ skus: Object.values(STORE_PRODUCT_IDS), type: 'subs' });
    }
  }, [connected, fetchProducts]);

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
    const product = productsByPlan.get(plan);
    if (!connected || !product) {
      Alert.alert(
        'Plan not available yet',
        'This product must be active in App Store Connect or Google Play Console before it can be purchased.',
      );
      return;
    }

    setProcessingProductId(product.id);
    const androidOffer = product.platform === 'android'
      ? product.subscriptionOffers?.find((offer) => Boolean(offer.offerTokenAndroid))
      : undefined;

    try {
      await requestPurchase({
        request: {
          apple: { sku: product.id, appAccountToken: user?.id },
          google: {
            skus: [product.id],
            ...(androidOffer?.offerTokenAndroid
              ? { subscriptionOffers: [{ sku: product.id, offerToken: androidOffer.offerTokenAndroid }] }
              : {}),
          },
        },
        type: 'subs',
      });
    } catch (error) {
      setProcessingProductId(null);
      Alert.alert('Purchase not started', friendlyError(error));
    }
  };

  const restore = async () => {
    setProcessingProductId('restore');
    try {
      await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
      Alert.alert('Restore started', 'Any active store purchase will be verified automatically.');
    } catch (error) {
      setProcessingProductId(null);
      Alert.alert('Restore failed', friendlyError(error));
    }
  };

  const active = ACTIVE_STATUSES.has((status.status || '').toLowerCase());
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
          <TouchableOpacity accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.iconButton}>
            <MaterialIcons name="arrow-back" size={23} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>FUTURE JOBS PRO AI</Text>
            <Text style={styles.title}>Choose your workspace plan</Text>
          </View>
          <View style={styles.secureBadge}>
            <Ionicons name="shield-checkmark" size={15} color="#6FE7FF" />
            <Text style={styles.secureText}>Store secured</Text>
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={[styles.statusDot, active ? styles.statusActive : styles.statusInactive]} />
          <View style={styles.statusCopy}>
            <Text style={styles.statusLabel}>CURRENT WORKSPACE</Text>
            <Text style={styles.statusTitle}>{loadingStatus ? 'Checking entitlement…' : planLabel(status.tier)}</Text>
            <Text style={styles.statusMeta}>
              {active ? `Status: ${status.status}` : 'Select a plan to unlock premium tools'}
              {renewalDate ? ` · ${status.cancelAtPeriodEnd ? 'Ends' : 'Renews'} ${new Date(renewalDate).toLocaleDateString()}` : ''}
            </Text>
          </View>
          {loadingStatus && <ActivityIndicator color="#6FE7FF" />}
        </View>

        <View style={styles.promiseRow}>
          <Promise icon="sparkles" text="14-day trial when eligible" />
          <Promise icon="lock-closed" text="Verified by your app store" />
          <Promise icon="refresh" text="Restore on any signed-in device" />
        </View>

        {(Object.keys(FALLBACK_PLAN_COPY) as PlanKey[]).map((plan, index) => {
          const copy = FALLBACK_PLAN_COPY[plan];
          const product = productsByPlan.get(plan);
          const selected = status.tier?.toLowerCase() === plan ||
            (plan === 'professional' && status.tier?.toLowerCase() === 'pro');
          const busy = processingProductId === product?.id;

          return (
            <View key={plan} style={[styles.planCard, copy.featured && styles.featuredCard]}>
              {copy.featured && (
                <View style={styles.featuredPill}>
                  <Ionicons name="flash" size={13} color="#06111D" />
                  <Text style={styles.featuredText}>MOST POPULAR</Text>
                </View>
              )}
              <View style={styles.planTopRow}>
                <View style={styles.planIdentity}>
                  <View style={[styles.planIcon, { backgroundColor: copy.tint }]}>
                    <Ionicons name={copy.icon} size={22} color="#FFFFFF" />
                  </View>
                  <View>
                    <Text style={styles.planName}>{copy.name}</Text>
                    <Text style={styles.planAudience}>{copy.audience}</Text>
                  </View>
                </View>
                <View style={styles.priceBox}>
                  <Text style={styles.price}>{product?.displayPrice || copy.fallbackPrice}</Text>
                  <Text style={styles.interval}>/ month</Text>
                </View>
              </View>

              <View style={styles.divider} />
              {copy.features.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={13} color="#07111F" />
                  </View>
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}

              <TouchableOpacity
                disabled={selected || busy}
                onPress={() => void startPurchase(plan)}
                style={[styles.purchaseButton, copy.featured && styles.featuredButton, selected && styles.selectedButton]}
              >
                {busy ? (
                  <ActivityIndicator color="#07111F" />
                ) : (
                  <Text style={[styles.purchaseText, !copy.featured && !selected && styles.secondaryPurchaseText]}>
                    {selected ? 'Current plan' : index === 0 ? 'Start with Basic' : `Choose ${copy.name}`}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity disabled={processingProductId === 'restore'} onPress={() => void restore()} style={styles.restoreButton}>
          {processingProductId === 'restore' ? (
            <ActivityIndicator color="#6FE7FF" />
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={19} color="#6FE7FF" />
              <Text style={styles.restoreText}>Restore previous purchase</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.legal}>
          Payment is charged by {Platform.OS === 'ios' ? 'Apple' : Platform.OS === 'android' ? 'Google Play' : 'your app store'}.
          Subscriptions renew automatically unless cancelled in your store account. Purchases are activated only after secure server verification.
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
  content: { paddingHorizontal: 18, paddingTop: 56, paddingBottom: 48 },
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
