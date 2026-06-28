import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

export default function ProjectMediaScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { projectId, projectName } = route.params;
  const [months, setMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMonths();
  }, []);

  const fetchMonths = async () => {
    try {
      const res: any = await api.get(`/media/project/${projectId}/months`);
      setMonths(res.months || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#00D4FF" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{projectName}</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={months}
        keyExtractor={item => item}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.monthCard}
            onPress={() => navigation.navigate('MonthMedia', { projectId, yearMonth: item, projectName })}
          >
            <MaterialIcons name="folder-open" size={28} color="#FF9800" />
            <Text style={styles.monthText}>{item}</Text>
            <MaterialIcons name="chevron-right" size={24} color="#888" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No months with media</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', flex: 1, marginLeft: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  monthCard: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#1A1A1A', marginHorizontal: 16, marginVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  monthText: { flex: 1, color: '#FFF', fontSize: 16, marginLeft: 12 },
  emptyText: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
});