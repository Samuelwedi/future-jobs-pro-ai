import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { MaterialIcons } from '@expo/vector-icons';

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface TeamMembersResponse {
  data: TeamMembersResponse;
  success: boolean;
  members: Employee[];
}

export default function SelectEmployeesScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>(route.params?.selectedIds || []);
  const [searchText, setSearchText] = useState('');
  const [filtered, setFiltered] = useState<Employee[]>([]);

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (searchText.trim()) {
      const lower = searchText.toLowerCase();
      setFiltered(employees.filter(emp =>
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(lower)
      ));
    } else {
      setFiltered(employees);
    }
  }, [searchText, employees]);

  const fetchEmployees = async () => {
    try {
      const companyId = user?.companyId;
      if (!companyId) {
        Alert.alert('Error', 'Company ID not found');
        return;
      }
      const res = await api.get<TeamMembersResponse>(`/team/members/${companyId}`);
      const data = res.data || res;
      const members = data.members || [];
      setEmployees(members);
      setFiltered(members);
    } catch (e: any) {
      Alert.alert('Error', 'Failed to load employees: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const done = () => {
    // Navigate back to CreateShift and pass selected IDs
    navigation.navigate('CreateShift', { selectedEmployeeIds: selectedIds });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00D4FF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Employees</Text>
        <TouchableOpacity onPress={done}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search employees..."
        placeholderTextColor="#888"
        value={searchText}
        onChangeText={setSearchText}
      />

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, selectedIds.includes(item.id) && styles.rowActive]}
            onPress={() => toggleSelect(item.id)}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowName}>{item.first_name} {item.last_name}</Text>
              <Text style={styles.rowRole}>{item.role}</Text>
            </View>
            {selectedIds.includes(item.id) && (
              <MaterialIcons name="check-circle" size={22} color="#00D4FF" />
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No employees found</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  doneText: { color: '#00D4FF', fontSize: 16, fontWeight: '600' },
  searchInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 16,
    margin: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  rowActive: { backgroundColor: '#1A3A4A' },
  rowLeft: { flex: 1 },
  rowName: { color: '#FFF', fontSize: 16 },
  rowRole: { color: '#888', fontSize: 13, marginTop: 2 },
  empty: { color: '#888', textAlign: 'center', marginTop: 40, fontSize: 16 },
});