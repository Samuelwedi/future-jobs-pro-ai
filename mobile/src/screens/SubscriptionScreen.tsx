import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as RNIap from 'react-native-iap';

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
  const navigation = useNavigation();
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await RNIap.initConnection();
        // Cast to any[] to avoid type conflicts
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
      } catch (err) {
        console.error('IAP init error:', err);
        Alert.alert('Error', 'Failed to load subscription plans.');
      } finally {
        setLoading(false);
      }
    };
    init();

    const purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(async (purchase) => {
      console.log('Purchase updated:', purchase);
      const receipt = (purchase as any).transactionReceipt || (purchase as any).purchaseToken;
      if (receipt) {
        Alert.alert('Success', 'Thank you for your purchase!');
        await RNIap.finishTransaction({ purchase, isConsumable: false });
      }
      setPurchasing(false);
    });

    const purchaseErrorSubscription = RNIap.purchaseErrorListener((error) => {
      console.error('Purchase error:', error);
      Alert.alert('Purchase Failed', error.message);
      setPurchasing(false);
    });

    return () => {
      purchaseUpdateSubscription.remove();
      purchaseErrorSubscription.remove();
      RNIap.endConnection();
    };
  }, []);

  const handlePurchase = async (sku: string) => {
    if (purchasing) return;
    setPurchasing(true);
    try {
      await (RNIap.requestPurchase as any)({ sku });
    } catch (err) {
      console.error('Purchase request error:', err);
      Alert.alert('Purchase Failed', 'Could not complete purchase.');
      setPurchasing(false);
    }
  };

  const restorePurchases = async () => {
    setPurchasing(true);
    try {
      const purchases = await RNIap.getAvailablePurchases();
      if (purchases.length > 0) {
        Alert.alert('Restored', 'Your previous purchases have been restored.');
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
});