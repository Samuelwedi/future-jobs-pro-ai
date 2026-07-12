import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  ScrollView, Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as RNIap from 'react-native-iap';
import { api } from '../services/api';

const productIds = {
  basic: 'com.samuel33.futurejobspro.basic_monthly',
  professional: 'com.samuel33.futurejobspro.professional_monthly',
  enterprise: 'com.samuel33.futurejobspro.enterprise_monthly',
};

interface ProductInfo {
  productId: string;
  title: string;
  description: string;
  price: string;
  localizedPrice?: string;
}

export default function SubscriptionScreen() {
  const navigation = useNavigation<any>();
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  // ─── Check current subscription status ───
  const checkSubscriptionStatus = async () => {
    try {
      const res: any = await api.get('/subscriptions/status');
      if (res.success && res.subscribed) {
        setIsSubscribed(true);
      }
    } catch (e) {
      console.error('Subscription status error:', e);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await RNIap.initConnection();

        // 1. Fetch products
        const productList = (await RNIap.fetchProducts({
          skus: Object.values(productIds),
        })) as any[];
        const normalized = (productList || [])
          .filter(p => p !== null)
          .map(p => ({
            productId: p.productId,
            title: p.title,
            description: p.description,
            price: p.price,
            localizedPrice: p.localizedPrice,
          }));
        setProducts(normalized);

        // 2. Check existing purchases locally
        const purchases = await RNIap.getAvailablePurchases();
        const hasSubscription = purchases.some(p =>
          Object.values(productIds).includes(p.productId)
        );
        if (hasSubscription) {
          setIsSubscribed(true);
          Alert.alert('Active Subscription', 'You are already subscribed!');
        }

        // 3. Check backend status
        await checkSubscriptionStatus();

      } catch (err) {
        console.error('IAP init error:', err);
        Alert.alert('Error', 'Failed to load subscription plans.');
      } finally {
        setLoading(false);
      }
    };
    init();

    // ─── Purchase updated listener ───
    const purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(async (purchase) => {
      console.log('Purchase updated:', purchase);
      const receipt = (purchase as any).transactionReceipt || (purchase as any).purchaseToken;
      if (receipt) {
        try {
          await api.post('/subscriptions/verify', {
            receipt,
            platform: Platform.OS === 'ios' ? 'apple' : 'google',
            productId: purchase.productId,
          });
          Alert.alert('Success', 'Thank you for your purchase!');
          setIsSubscribed(true);
        } catch (e) {
          console.error('Receipt validation failed:', e);
          Alert.alert('Error', 'Could not verify your purchase. Please contact support.');
        }
        await RNIap.finishTransaction({ purchase, isConsumable: false });
      }
      setPurchasing(false);
    });

    // ─── Purchase error listener ───
    const purchaseErrorSubscription = RNIap.purchaseErrorListener((error) => {
      console.error('Purchase error:', error);
      const code = String(error.code);

      if (code === 'E_USER_CANCELLED') {
        Alert.alert('Purchase Cancelled', 'You cancelled the purchase.');
      } else if (code === 'E_ALREADY_OWNED') {
        Alert.alert('Already Owned', 'You already own this subscription.');
      } else if (code === 'E_ITEM_UNAVAILABLE') {
        Alert.alert('Not Available', 'This product is not available in your country.');
      } else if (code === 'E_DEVELOPER_ERROR') {
        Alert.alert('Configuration Error', 'The product is not configured correctly in App Store Connect.');
      } else {
        Alert.alert('Purchase Failed', error.message || 'An error occurred during purchase.');
      }
      setPurchasing(false);
    });

    return () => {
      purchaseUpdateSubscription.remove();
      purchaseErrorSubscription.remove();
      RNIap.endConnection();
    };
  }, []);

  // ─── Purchase handler ───
  const handlePurchase = async (sku: string) => {
    if (purchasing) return;
    setPurchasing(true);
    try {
      // Use `as any` to bypass type issues; the library accepts both `sku` and `productId`
      await RNIap.requestPurchase({ sku, productId: sku } as any);
    } catch (err) {
      console.error('Purchase request error:', err);
      Alert.alert('Purchase Failed', 'Could not complete purchase.');
      setPurchasing(false);
    }
  };

  // ─── Restore purchases ───
  const restorePurchases = async () => {
    setPurchasing(true);
    try {
      const purchases = await RNIap.getAvailablePurchases();
      if (purchases.length > 0) {
        Alert.alert('Restored', 'Your previous purchases have been restored.');
        for (const p of purchases) {
          const receipt = (p as any).transactionReceipt || (p as any).purchaseToken;
          if (receipt) {
            try {
              await api.post('/subscriptions/verify', {
                receipt,
                platform: Platform.OS === 'ios' ? 'apple' : 'google',
                productId: p.productId,
              });
            } catch (e) { /* ignore */ }
          }
        }
        setIsSubscribed(true);
      } else {
        Alert.alert('No Purchases', 'No previous purchases found.');
      }
    } catch (err) {
      console.error('Restore error:', err);
      Alert.alert('Restore Failed', 'Could not restore purchases.');
    } finally {
      setPurchasing(false);
    }
  };

  const getProduct = (id: string) => products.find(p => p.productId === id);

  const basic = getProduct(productIds.basic);
  const professional = getProduct(productIds.professional);
  const enterprise = getProduct(productIds.enterprise);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4FF" />
      </View>
    );
  }

  if (isSubscribed) {
    return (
      <View style={styles.center}>
        <MaterialIcons name="check-circle" size={64} color="#4CAF50" />
        <Text style={styles.subscribedText}>You are subscribed!</Text>
        <TouchableOpacity style={styles.manageBtn} onPress={restorePurchases}>
          <Text style={styles.manageBtnText}>Manage Subscription</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Choose a Plan</Text>
        <View style={{ width: 40 }} />
      </View>

      <TouchableOpacity
        style={styles.planCard}
        onPress={() => handlePurchase(productIds.basic)}
        disabled={purchasing}
      >
        <Text style={styles.planName}>Basic</Text>
        <Text style={styles.planPrice}>
          {basic?.localizedPrice || basic?.price || '$49'}
          <Text style={styles.planPeriod}>/month</Text>
        </Text>
        <Text style={styles.planDesc}>
          • Up to 5 employees{'\n'}
          • Time tracking{'\n'}
          • GPS location{'\n'}
          • Basic reports
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.planCard, styles.planCardFeatured]}
        onPress={() => handlePurchase(productIds.professional)}
        disabled={purchasing}
      >
        <View style={styles.popularBadge}>
          <Text style={styles.popularText}>Most Popular</Text>
        </View>
        <Text style={styles.planName}>Professional</Text>
        <Text style={styles.planPrice}>
          {professional?.localizedPrice || professional?.price || '$99'}
          <Text style={styles.planPeriod}>/month</Text>
        </Text>
        <Text style={styles.planDesc}>
          • Up to 20 employees{'\n'}
          • AI photo compliance{'\n'}
          • Voice notes{'\n'}
          • Advanced reports
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.planCard}
        onPress={() => handlePurchase(productIds.enterprise)}
        disabled={purchasing}
      >
        <Text style={styles.planName}>Enterprise</Text>
        <Text style={styles.planPrice}>
          {enterprise?.localizedPrice || enterprise?.price || '$199'}
          <Text style={styles.planPeriod}>/month</Text>
        </Text>
        <Text style={styles.planDesc}>
          • Unlimited employees{'\n'}
          • Dispute evidence reports{'\n'}
          • Priority support{'\n'}
          • Custom integrations
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.restoreBtn} onPress={restorePurchases} disabled={purchasing}>
        <Text style={styles.restoreText}>Restore Purchases</Text>
      </TouchableOpacity>

      <View style={styles.legalContainer}>
        <TouchableOpacity
          style={styles.legalLink}
          onPress={() => navigation.navigate('WebView', { url: 'https://futurejobsproai.com/privacy', title: 'Privacy Policy' })}
        >
          <Text style={styles.legalText}>Privacy Policy</Text>
        </TouchableOpacity>
        <View style={styles.legalDivider} />
        <TouchableOpacity
          style={styles.legalLink}
          onPress={() => navigation.navigate('WebView', { url: 'https://futurejobsproai.com/terms', title: 'Terms of Use' })}
        >
          <Text style={styles.legalText}>Terms of Use</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>
        By subscribing, you agree to our Terms of Use and Privacy Policy.
      </Text>

      {purchasing && (
        <View style={styles.purchasingOverlay}>
          <ActivityIndicator size="large" color="#00D4FF" />
          <Text style={styles.purchasingText}>Processing...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: { padding: 8, marginLeft: 4 },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  planCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  planCardFeatured: { borderColor: '#00D4FF', borderWidth: 2 },
  planName: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  planPrice: { color: '#00D4FF', fontSize: 28, fontWeight: 'bold', marginBottom: 12 },
  planPeriod: { fontSize: 16, fontWeight: 'normal' },
  planDesc: { color: '#AAA', fontSize: 14, lineHeight: 20 },
  popularBadge: {
    position: 'absolute',
    top: 12,
    right: 16,
    backgroundColor: '#FF9800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularText: { color: '#0A0A0A', fontSize: 12, fontWeight: 'bold' },
  restoreBtn: { alignItems: 'center', marginTop: 10, marginBottom: 20 },
  restoreText: { color: '#888', fontSize: 14 },
  legalContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20, marginBottom: 10 },
  legalLink: { paddingHorizontal: 12 },
  legalText: { color: '#00D4FF', fontSize: 14, fontWeight: '500' },
  legalDivider: { width: 1, backgroundColor: '#333' },
  footer: { color: '#666', fontSize: 12, textAlign: 'center', marginHorizontal: 20 },
  purchasingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  purchasingText: { color: '#FFF', marginTop: 12, fontSize: 16 },
  subscribedText: { color: '#FFF', fontSize: 24, fontWeight: 'bold', marginTop: 16 },
  manageBtn: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#00D4FF', borderRadius: 8 },
  manageBtnText: { color: '#0A0A0A', fontWeight: 'bold', fontSize: 16 },
});